<?php

namespace App\Services\Importer;

use Fokin\Facts\Data\FlexibleDate;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Import GEDCOM 5.5.1 data into factology things/links.
 *
 * Mapping:
 *   INDI  → HUMAN thing (name, sex, birth/death as flexible dates)
 *   FAM   → links (FATHER/MOTHER → MARRIED_TO between parents, CHIL → child_of)
 *   BIRT/DEAT/MARR → EVENT things linked to the relevant HUMAN
 *   PLAC  → PLACE_CLASS things linked to events
 *
 * Idempotent: uses (owner, source_service='gedcom', source_external_id) for dedup.
 * Each import is namespaced by a $fileKey so the same person from different
 * files becomes a separate thing (see DUPLICATE_OF linking for cross-file
 * identity resolution).
 */
class GedcomImporter
{
    private const SOURCE_SERVICE = 'gedcom';

    private string $ownerId;
    private string $fileKey;
    private int $imported = 0;
    private int $updated = 0;
    private int $skipped = 0;
    private int $errors = 0;
    private array $errorDetails = [];
    private array $personIdMap = []; // GEDCOM @id → factology thing_id
    private array $placeCache = []; // place name → factology thing_id
    private ?string $sourceThingId = null; // thing_id of the source object
    private ?string $sourceGuid = null; // _DBGUID from HEAD

    /**
     * @param string $ownerId  UUID of the owning person thing
     * @param string|null $fileKey  Unique identifier for this import file.
     *     Auto-generated from content hash if omitted. Use the same key to
     *     re-import the same file idempotently; use different keys for
     *     different files so each creates separate things.
     * @param string|null $fileContent  Raw file content (used to compute
     *     fileKey when not provided, or for the hash).
     */
    public function __construct(
        string $ownerId,
        ?string $fileKey = null,
        ?string $fileContent = null
    ) {
        $this->ownerId = $ownerId;
        $this->fileKey = $fileKey ?? self::computeFileKey($fileContent ?? '');
    }

    /**
     * Derive a deterministic file key from content.
     * First 16 hex chars of SHA-256.
     */
    public static function computeFileKey(string $content): string
    {
        return substr(hash('sha256', $content), 0, 16);
    }

    /**
     * Build a namespaced external ID unique per-file-per-record.
     */
    private function externalId(string $localId): string
    {
        return $this->fileKey . '/' . $localId;
    }

    /**
     * Parse a GEDCOM string and import all records.
     *
     * @return array{imported: int, updated: int, skipped: int, errors: int, details: array, source_thing_id: ?string}
     */
    public function import(string $gedcomContent): array
    {
        // Reset counters for each import call (same instance may be reused)
        $this->imported = 0;
        $this->updated = 0;
        $this->skipped = 0;
        $this->errors = 0;
        $this->errorDetails = [];
        $this->personIdMap = [];
        $this->placeCache = [];
        $this->sourceThingId = null;
        $this->sourceGuid = null;

        // Parse HEAD metadata for source tracking
        $headMeta = GedcomParser::parseHeadMetadata($gedcomContent);
        $this->sourceGuid = $headMeta['dbguid'];

        $parser = new GedcomParser();
        $records = $parser->parse($gedcomContent);

        DB::transaction(function () use ($records, $headMeta) {
            // Create (or update) the source thing representing this import file
            $this->sourceThingId = $this->ensureSourceThing($headMeta);

            foreach ($records as $record) {
                if ($record['tag'] === 'INDI') {
                    $this->importPerson($record);
                }
            }
            foreach ($records as $record) {
                if ($record['tag'] === 'FAM') {
                    $this->importFamily($record);
                }
            }
            foreach ($records as $record) {
                if ($record['tag'] === 'SOUR') {
                    $this->importSource($record);
                }
            }
        });

        return [
            'imported'       => $this->imported,
            'updated'        => $this->updated,
            'skipped'        => $this->skipped,
            'errors'         => $this->errors,
            'details'        => $this->errorDetails,
            'source_thing_id' => $this->sourceThingId,
        ];
    }

    /**
     * Create or update the source thing representing this import file.
     * Links to EVIDENCE class.
     */
    private function ensureSourceThing(array $headMeta): ?string
    {
        $sourceExternalId = $this->externalId('source');

        $existing = DB::table('things')
            ->where('owner', $this->ownerId)
            ->where('source_service', self::SOURCE_SERVICE)
            ->where('source_external_id', $sourceExternalId)
            ->first();

        $sourceName = $headMeta['source_fullname']
            ?? $headMeta['source_name']
            ?? 'GEDCOM Import';

        $properties = [];
        if ($headMeta['dbguid'] !== null) {
            $properties['source_guid'] = $headMeta['dbguid'];
        }
        if ($headMeta['source_name'] !== null) {
            $properties['source_app'] = $headMeta['source_name'];
        }
        if ($headMeta['export_date'] !== null) {
            $properties['export_date'] = $headMeta['export_date'];
        }
        $properties['file_key'] = $this->fileKey;

        $data = [
            'name'               => $sourceName,
            'type'               => UUID::G_THING,
            'owner'              => $this->ownerId,
            'public'             => false,
            'deleted'            => false,
            'server_uuid'        => $this->getServerUuid(),
            'source_service'     => self::SOURCE_SERVICE,
            'source_external_id' => $sourceExternalId,
            'data'               => json_encode(['properties' => $properties]),
        ];

        if ($existing) {
            DB::table('things')->where('thing_id', $existing->thing_id)->update($data);
            $this->updated++;
            return $existing->thing_id;
        }

        $thingId = (string) Str::uuid();
        $data['thing_id'] = $thingId;
        DB::table('things')->insert($data);

        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::EVIDENCE,
        ]);

        return $thingId;
    }

    private function importPerson(array $record): void
    {
        $gedcomId = $record['id'];
        if ($gedcomId === null) {
            $this->errors++;
            $this->errorDetails[] = 'INDI record without ID';
            return;
        }

        $nameNode = GedcomParser::findChild($record, 'NAME');
        $rawName = $nameNode ? trim($nameNode['value']) : 'Unknown';

        // Parse GEDCOM sub-fields: GIVN, SURN, _MARNM (Древо Жизни extension)
        $givenName = GedcomParser::childValue($nameNode, 'GIVN');
        $surname = GedcomParser::childValue($nameNode, 'SURN');
        $marriedName = GedcomParser::childValue($nameNode, '_MARNM');

        // Build a clean display name: strip // delimiters, collapse spaces
        $cleanName = self::cleanGedcomName($rawName);

        // If GIVN+SURN are available, use them for a cleaner name
        if ($givenName !== null && $surname !== null) {
            $cleanName = trim($givenName . ' ' . $surname);
        } elseif ($givenName !== null) {
            $cleanName = $givenName;
        }

        $sex = GedcomParser::childValue($record, 'SEX');

        $externalId = $this->externalId($gedcomId);

        $existing = DB::table('things')
            ->where('owner', $this->ownerId)
            ->where('source_service', self::SOURCE_SERVICE)
            ->where('source_external_id', $externalId)
            ->first();

        // Parse birth/death dates as FlexibleDate → start/end columns
        $birthNode = GedcomParser::findChild($record, 'BIRT');
        $deathNode = GedcomParser::findChild($record, 'DEAT');

        $start = null;
        $end = null;
        $startMeta = null;
        $endMeta = null;

        if ($birthNode) {
            $dateNode = GedcomParser::findChild($birthNode, 'DATE');
            if ($dateNode) {
                $eventDate = GedcomParser::parseGedcomDate($dateNode['value']);
                if ($eventDate !== null) {
                    $flexibleDate = FlexibleDate::parse($eventDate);
                    if ($flexibleDate !== null) {
                        $db = $flexibleDate->toDb('start');
                        $start = $db['start'];
                        $end = $db['end'];
                        $startMeta = !empty($db['meta']) ? json_encode($db['meta']) : null;
                    }
                }
            }
        }

        if ($deathNode) {
            $dateNode = GedcomParser::findChild($deathNode, 'DATE');
            if ($dateNode) {
                $eventDate = GedcomParser::parseGedcomDate($dateNode['value']);
                if ($eventDate !== null) {
                    $flexibleDate = FlexibleDate::parse($eventDate);
                    if ($flexibleDate !== null) {
                        $db = $flexibleDate->toDb('start');
                        // Death date goes into the end column
                        $end = $db['start'];
                        $endMeta = !empty($db['meta']) ? json_encode($db['meta']) : null;
                    }
                }
            }
        }

        $properties = [];
        if ($sex !== null) {
            $properties['sex'] = $sex;
        }
        if ($givenName !== null) {
            $properties['given_name'] = $givenName;
        }
        if ($surname !== null) {
            $properties['surname'] = $surname;
        }
        if ($marriedName !== null) {
            $properties['married_name'] = $marriedName;
        }
        if ($this->sourceGuid !== null) {
            $properties['source_guid'] = $this->sourceGuid;
        }

        $data = [
            'name'               => $cleanName,
            'type'               => UUID::G_THING,
            'start'              => $start,
            'end'                => $end,
            'start_meta'         => $startMeta,
            'end_meta'           => $endMeta,
            'owner'              => $this->ownerId,
            'public'             => false,
            'deleted'            => false,
            'server_uuid'        => $this->getServerUuid(),
            'source_service'     => self::SOURCE_SERVICE,
            'source_external_id' => $externalId,
            'data'               => !empty($properties) ? json_encode(['properties' => $properties]) : null,
        ];

        if ($existing) {
            // Update existing record with new data
            DB::table('things')->where('thing_id', $existing->thing_id)->update($data);
            $this->personIdMap[$gedcomId] = $existing->thing_id;
            $this->updated++;

            // Still ensure events are created/updated for existing persons
            // (skipping events for brevity — they'll be handled by the event loop below)
            // But we do need to re-create events if they don't exist
            $this->ensurePersonEvents($birthNode, $deathNode, $record, $existing->thing_id, $cleanName);
            return;
        }

        $thingId = (string) Str::uuid();
        $data['thing_id'] = $thingId;
        DB::table('things')->insert($data);
        $this->personIdMap[$gedcomId] = $thingId;

        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::HUMAN,
        ]);

        if ($birthNode) {
            $this->importPersonEvent($birthNode, $thingId, $cleanName, 'BIRT', 'birth');
        }
        if ($deathNode) {
            $this->importPersonEvent($deathNode, $thingId, $cleanName, 'DEAT', 'death');
        }
        foreach (GedcomParser::findChildren($record, 'OCCU') as $eventNode) {
            $this->importPersonEvent($eventNode, $thingId, $cleanName, 'OCCU', 'occupation');
        }
        foreach (GedcomParser::findChildren($record, 'RESI') as $eventNode) {
            $this->importPersonEvent($eventNode, $thingId, $cleanName, 'RESI', 'residence');
        }

        $this->imported++;
    }

    /**
     * Ensure BIRT/DEAT/OCCU/RESI events exist for an existing person.
     * Called on reimport when the person already exists — creates missing events.
     */
    private function ensurePersonEvents(?array $birthNode, ?array $deathNode, array $record, string $personId, string $cleanName): void
    {
        if ($birthNode) {
            $this->importPersonEvent($birthNode, $personId, $cleanName, 'BIRT', 'birth');
        }
        if ($deathNode) {
            $this->importPersonEvent($deathNode, $personId, $cleanName, 'DEAT', 'death');
        }
        foreach (GedcomParser::findChildren($record, 'OCCU') as $eventNode) {
            $this->importPersonEvent($eventNode, $personId, $cleanName, 'OCCU', 'occupation');
        }
        foreach (GedcomParser::findChildren($record, 'RESI') as $eventNode) {
            $this->importPersonEvent($eventNode, $personId, $cleanName, 'RESI', 'residence');
        }
    }

    private function importPersonEvent(array $eventNode, string $personId, string $personName, string $gedcomTag, string $eventType): void
    {
        $dateNode = GedcomParser::findChild($eventNode, 'DATE');
        $placeNode = GedcomParser::findChild($eventNode, 'PLAC');
        $noteNode = GedcomParser::findChild($eventNode, 'NOTE');

        $eventDate = $dateNode ? GedcomParser::parseGedcomDate($dateNode['value']) : null;
        $placeName = $placeNode ? GedcomParser::extractPlaceName($placeNode) : null;
        $note = $noteNode ? GedcomParser::getFullValue($noteNode) : null;

        $eventExternalId = $this->findEventExternalId($personId, $eventNode, $gedcomTag);

        $existing = DB::table('things')
            ->where('owner', $this->ownerId)
            ->where('source_service', self::SOURCE_SERVICE)
            ->where('source_external_id', $eventExternalId)
            ->first();

        $start = null;
        $end = null;
        $startMeta = null;
        $endMeta = null;

        if ($eventDate !== null) {
            $flexibleDate = FlexibleDate::parse($eventDate);
            if ($flexibleDate !== null) {
                $db = $flexibleDate->toDb('start');
                $start = $db['start'];
                $end = $db['end'];
                $startMeta = !empty($db['meta']) ? json_encode($db['meta']) : null;
            }
        }

        $eventName = sprintf('%s: %s', ucfirst($eventType), $personName);
        $description = $note;
        if ($placeName !== null) {
            $description = $description ? $description . "\nPlace: " . $placeName : 'Place: ' . $placeName;
        }

        $data = [
            'name'               => $eventName,
            'type'               => UUID::G_THING,
            'description'        => $description,
            'start'              => $start,
            'end'                => $end,
            'start_meta'         => $startMeta,
            'end_meta'           => $endMeta,
            'owner'              => $this->ownerId,
            'public'             => false,
            'deleted'            => false,
            'server_uuid'        => $this->getServerUuid(),
            'source_service'     => self::SOURCE_SERVICE,
            'source_external_id' => $eventExternalId,
        ];

        if ($existing) {
            DB::table('things')->where('thing_id', $existing->thing_id)->update($data);
            $this->updated++;
            return;
        }

        $thingId = (string) Str::uuid();
        $data['thing_id'] = $thingId;
        DB::table('things')->insert($data);
        $this->imported++;

        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::EVENT,
        ]);

        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::LINK_TO_SOURCE,
            'other_thing_id' => $personId,
            'description'   => $eventType,
        ]);

        if ($placeName !== null) {
            $placeId = $this->findOrCreatePlace($placeName, $placeNode);
            if ($placeId !== null) {
                DB::table('links')->insert([
                    'link_uuid'     => (string) Str::uuid(),
                    'one_thing_id'  => $thingId,
                    'link_type_id'  => UUID::LINK_TO_CLASS,
                    'other_thing_id' => $placeId,
                ]);
            }
        }
    }

    private function importFamily(array $record): void
    {
        $gedcomId = $record['id'];
        if ($gedcomId === null) {
            return;
        }

        $husbandId = $this->resolvePersonRef(GedcomParser::childValue($record, 'HUSB'));
        $wifeId = $this->resolvePersonRef(GedcomParser::childValue($record, 'WIFE'));
        $children = GedcomParser::findChildren($record, 'CHIL');

        if ($husbandId !== null && $wifeId !== null) {
            $existingLink = DB::table('links')
                ->where('link_type_id', UUID::MARRIED_TO)
                ->where(function ($q) use ($husbandId, $wifeId) {
                    $q->where('one_thing_id', $husbandId)
                      ->where('other_thing_id', $wifeId)
                      ->orWhere(function ($q) use ($husbandId, $wifeId) {
                          $q->where('one_thing_id', $wifeId)
                            ->where('other_thing_id', $husbandId);
                      });
                })
                ->first();

            if (!$existingLink) {
                DB::table('links')->insert([
                    'link_uuid'     => (string) Str::uuid(),
                    'one_thing_id'  => $husbandId,
                    'link_type_id'  => UUID::MARRIED_TO,
                    'other_thing_id' => $wifeId,
                ]);
                $this->imported++;
            }

            $marrNode = GedcomParser::findChild($record, 'MARR');
            if ($marrNode) {
                $this->importMarriageEvent($marrNode, $husbandId, $wifeId, $gedcomId);
            }
        }

        foreach ($children as $childNode) {
            $childId = $this->resolvePersonRef($childNode['value']);
            if ($childId === null) {
                continue;
            }
            if ($husbandId !== null) {
                $this->ensureParentLink($husbandId, $childId, UUID::FATHER);
            }
            if ($wifeId !== null) {
                $this->ensureParentLink($wifeId, $childId, UUID::MOTHER);
            }
        }
    }

    private function importMarriageEvent(array $marrNode, string $husbandId, string $wifeId, string $familyGedcomId): void
    {
        $dateNode = GedcomParser::findChild($marrNode, 'DATE');
        $placeNode = GedcomParser::findChild($marrNode, 'PLAC');
        $eventDate = $dateNode ? GedcomParser::parseGedcomDate($dateNode['value']) : null;

        $eventExternalId = $this->externalId($familyGedcomId . '-marriage');

        $existing = DB::table('things')
            ->where('owner', $this->ownerId)
            ->where('source_service', self::SOURCE_SERVICE)
            ->where('source_external_id', $eventExternalId)
            ->first();

        $start = null;
        $end = null;
        $startMeta = null;
        $endMeta = null;

        if ($eventDate !== null) {
            $flexibleDate = FlexibleDate::parse($eventDate);
            if ($flexibleDate !== null) {
                $db = $flexibleDate->toDb('start');
                $start = $db['start'];
                $end = $db['end'];
                $startMeta = !empty($db['meta']) ? json_encode($db['meta']) : null;
            }
        }

        $placeName = $placeNode ? GedcomParser::extractPlaceName($placeNode) : null;

        $data = [
            'name'               => 'Marriage',
            'type'               => UUID::G_THING,
            'start'              => $start,
            'end'                => $end,
            'start_meta'         => $startMeta,
            'end_meta'           => $endMeta,
            'owner'              => $this->ownerId,
            'public'             => false,
            'deleted'            => false,
            'server_uuid'        => $this->getServerUuid(),
            'source_service'     => self::SOURCE_SERVICE,
            'source_external_id' => $eventExternalId,
        ];

        if ($placeName !== null) {
            $data['description'] = 'Place: ' . $placeName;
        }

        if ($existing) {
            DB::table('things')->where('thing_id', $existing->thing_id)->update($data);
            $this->updated++;
            return;
        }

        $thingId = (string) Str::uuid();
        $data['thing_id'] = $thingId;
        DB::table('things')->insert($data);
        $this->imported++;

        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::EVENT,
        ]);

        foreach ([$husbandId, $wifeId] as $spouseId) {
            DB::table('links')->insert([
                'link_uuid'     => (string) Str::uuid(),
                'one_thing_id'  => $thingId,
                'link_type_id'  => UUID::LINK_TO_SOURCE,
                'other_thing_id' => $spouseId,
                'description'   => 'spouse',
            ]);
        }

        if ($placeName !== null) {
            $placeId = $this->findOrCreatePlace($placeName, $placeNode);
            if ($placeId !== null) {
                DB::table('links')->insert([
                    'link_uuid'     => (string) Str::uuid(),
                    'one_thing_id'  => $thingId,
                    'link_type_id'  => UUID::LINK_TO_CLASS,
                    'other_thing_id' => $placeId,
                ]);
            }
        }
    }

    private function importSource(array $record): void
    {
        $gedcomId = $record['id'];
        if ($gedcomId === null) {
            return;
        }

        $title = GedcomParser::childValue($record, 'TITL') ?? 'Source';
        $author = GedcomParser::childValue($record, 'AUTH');
        $publisher = GedcomParser::childValue($record, 'PUBL');

        $description = '';
        if ($author) {
            $description .= 'Author: ' . $author . "\n";
        }
        if ($publisher) {
            $description .= 'Publisher: ' . $publisher . "\n";
        }

        $externalId = $this->externalId($gedcomId);

        $existing = DB::table('things')
            ->where('owner', $this->ownerId)
            ->where('source_service', self::SOURCE_SERVICE)
            ->where('source_external_id', $externalId)
            ->first();

        $data = [
            'name'               => $title,
            'type'               => UUID::G_THING,
            'description'        => trim($description) ?: null,
            'owner'              => $this->ownerId,
            'public'             => false,
            'deleted'            => false,
            'server_uuid'        => $this->getServerUuid(),
            'source_service'     => self::SOURCE_SERVICE,
            'source_external_id' => $externalId,
        ];

        if ($existing) {
            DB::table('things')->where('thing_id', $existing->thing_id)->update($data);
            $this->updated++;
            return;
        }

        $thingId = (string) Str::uuid();
        $data['thing_id'] = $thingId;
        DB::table('things')->insert($data);

        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::EVIDENCE,
        ]);

        $this->imported++;
    }

    private function findOrCreatePlace(string $placeName, ?array $placeNode): ?string
    {
        $key = mb_strtolower(trim($placeName));
        if ($key === '') {
            return null;
        }

        if (isset($this->placeCache[$key])) {
            return $this->placeCache[$key];
        }

        $existing = DB::table('things')
            ->where('owner', $this->ownerId)
            ->where('source_service', self::SOURCE_SERVICE)
            ->where('source_external_id', $this->externalId('place:' . $key))
            ->first();

        if ($existing) {
            $this->placeCache[$key] = $existing->thing_id;
            return $existing->thing_id;
        }

        $thingId = (string) Str::uuid();
        $data = [
            'thing_id'           => $thingId,
            'name'               => trim($placeName),
            'type'               => UUID::G_THING,
            'owner'              => $this->ownerId,
            'public'             => false,
            'deleted'            => false,
            'server_uuid'        => $this->getServerUuid(),
            'source_service'     => self::SOURCE_SERVICE,
            'source_external_id' => $this->externalId('place:' . $key),
        ];

        if ($placeNode !== null) {
            $coords = GedcomParser::extractPlaceCoordinates($placeNode);
            if ($coords !== null) {
                $data['data'] = json_encode([
                    'properties' => [
                        UUID::COORDINATES_PROPERTY => [
                            'type' => 'Point',
                            'coordinates' => [$coords['lng'], $coords['lat']],
                        ],
                    ],
                ]);
            }
        }

        DB::table('things')->insert($data);
        $this->imported++;

        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::PLACE_CLASS,
        ]);

        $this->placeCache[$key] = $thingId;
        return $thingId;
    }

    private function resolvePersonRef(?string $gedcomRef): ?string
    {
        if ($gedcomRef === null) {
            return null;
        }
        return $this->personIdMap[trim($gedcomRef)] ?? null;
    }

    private function ensureParentLink(string $parentId, string $childId, string $linkTypeId): void
    {
        $existing = DB::table('links')
            ->where('one_thing_id', $parentId)
            ->where('link_type_id', $linkTypeId)
            ->where('other_thing_id', $childId)
            ->first();

        if (!$existing) {
            DB::table('links')->insert([
                'link_uuid'     => (string) Str::uuid(),
                'one_thing_id'  => $parentId,
                'link_type_id'  => $linkTypeId,
                'other_thing_id' => $childId,
            ]);
        }
    }

    private function findEventExternalId(string $personId, array $eventNode, string $gedcomTag): string
    {
        $dateNode = GedcomParser::findChild($eventNode, 'DATE');
        $dateVal = $dateNode ? trim($dateNode['value']) : '';

        $gedcomPersonId = array_search($personId, $this->personIdMap, true);

        if ($dateVal !== '') {
            return $this->externalId(($gedcomPersonId ?: 'person') . '-' . $gedcomTag . '-' . $dateVal);
        }

        static $counters = [];
        $key = ($gedcomPersonId ?: 'person') . '-' . $gedcomTag;
        $counters[$key] = ($counters[$key] ?? 0) + 1;
        return $this->externalId($key . '-' . $counters[$key]);
    }

    /**
     * Strip GEDCOM surname delimiters (//) from a name.
     * "John /Smith/" → "John Smith"
     * "Зоя Владимировна /Дмитревская/" → "Зоя Владимировна Дмитревская"
     */
    private static function cleanGedcomName(string $name): string
    {
        $name = preg_replace('#/#u', '', $name);
        $name = preg_replace('/\s+/u', ' ', $name);
        return trim($name);
    }

    private function getServerUuid(): ?string
    {
        static $uuid = null;
        if ($uuid === null) {
            $uuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        }
        return $uuid;
    }
}