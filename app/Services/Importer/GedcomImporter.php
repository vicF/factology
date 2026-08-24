<?php

namespace App\Services\Importer;

use Fokin\Facts\Data\FlexibleDate;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Import GEDCOM 5.5.1 data into factology things/links.
 *
 * Each import creates a GEDCOM source thing (instance of the GEDCOM class).
 * Imported things are linked to this source via the IMPORTED_FROM link type,
 * with `data: { "source_external_id": "@I1@" }` on the link.
 *
 * Dedup: on reimport, existing IMPORTED_FROM links for this source are
 * matched by data.source_external_id → existing records are updated.
 */
class GedcomImporter
{
    private string $ownerId;
    private string $fileKey;
    private int $imported = 0;
    private int $updated = 0;
    private int $skipped = 0;
    private int $errors = 0;
    private array $errorDetails = [];
    private array $personIdMap = []; // GEDCOM @id → factology thing_id
    private array $placeCache = []; // place name → factology thing_id
    private ?string $sourceThingId = null;
    private ?string $sourceGuid = null;
    private array $existingSourceLinks = []; // source_external_id → thing_id (preloaded)

    public function __construct(
        string $ownerId,
        ?string $fileKey = null,
        ?string $fileContent = null
    ) {
        $this->ownerId = $ownerId;
        $this->fileKey = $fileKey ?? self::computeFileKey($fileContent ?? '');
    }

    public static function computeFileKey(string $content): string
    {
        return substr(hash('sha256', $content), 0, 16);
    }

    private function externalId(string $localId): string
    {
        return $this->fileKey . '/' . $localId;
    }

    /**
     * @return array{imported: int, updated: int, skipped: int, errors: int, details: array, source_thing_id: ?string}
     */
    public function import(string $gedcomContent): array
    {
        $this->imported = 0;
        $this->updated = 0;
        $this->skipped = 0;
        $this->errors = 0;
        $this->errorDetails = [];
        $this->personIdMap = [];
        $this->placeCache = [];
        $this->sourceThingId = null;
        $this->sourceGuid = null;
        $this->existingSourceLinks = [];

        $headMeta = GedcomParser::parseHeadMetadata($gedcomContent);
        $this->sourceGuid = $headMeta['dbguid'];

        $parser = new GedcomParser();
        $records = $parser->parse($gedcomContent);

        DB::transaction(function () use ($records, $headMeta) {
            // Create or update the GEDCOM source thing
            $this->sourceThingId = $this->ensureGedcomSource($headMeta);

            // Preload existing IMPORTED_FROM links for this source
            $this->preloadExistingSourceLinks();

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
            'imported'        => $this->imported,
            'updated'         => $this->updated,
            'skipped'         => $this->skipped,
            'errors'          => $this->errors,
            'details'         => $this->errorDetails,
            'source_thing_id' => $this->sourceThingId,
        ];
    }

    /**
     * Find or create a GEDCOM source thing (instance of GEDCOM class).
     * Deduped by fileKey stored in data.properties.
     */
    private function ensureGedcomSource(array $headMeta): ?string
    {
        // Find existing source by file_key in data properties
        $existing = DB::table('things')
            ->where('owner', $this->ownerId)
            ->whereExists(function ($q) {
                $q->select(DB::raw(1))
                  ->from('links')
                  ->whereColumn('links.one_thing_id', 'things.thing_id')
                  ->where('links.link_type_id', UUID::LINK_TO_CLASS)
                  ->where('links.other_thing_id', UUID::GEDCOM_CLASS);
            })
            ->whereRaw("cast(data as json)->'properties'->>'file_key' = ?", [$this->fileKey])
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
            'name'        => $sourceName,
            'type'        => UUID::G_THING,
            'owner'       => $this->ownerId,
            'public'      => false,
            'deleted'     => false,
            'server_uuid' => $this->getServerUuid(),
            'data'        => json_encode(['properties' => $properties]),
        ];

        if ($existing) {
            DB::table('things')->where('thing_id', $existing->thing_id)->update($data);
            return $existing->thing_id;
        }

        $thingId = (string) Str::uuid();
        $data['thing_id'] = $thingId;
        DB::table('things')->insert($data);

        // Link to GEDCOM class
        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::GEDCOM_CLASS,
        ]);

        return $thingId;
    }

    /**
     * Preload all existing IMPORTED_FROM links for this source.
     * Maps: data.source_external_id → thing_id
     */
    private function preloadExistingSourceLinks(): void
    {
        if ($this->sourceThingId === null) {
            return;
        }

        $links = DB::table('links')
            ->where('link_type_id', UUID::IMPORTED_FROM)
            ->where('other_thing_id', $this->sourceThingId)
            ->get();

        foreach ($links as $link) {
            if ($link->data !== null) {
                $linkData = is_string($link->data) ? json_decode($link->data, true) : (array) $link->data;
                if (isset($linkData['source_external_id'])) {
                    $this->existingSourceLinks[$linkData['source_external_id']] = $link->one_thing_id;
                }
            }
        }
    }

    /**
     * Link a thing to the GEDCOM source via IMPORTED_FROM with data.
     */
    private function linkToSource(string $thingId, string $sourceExternalId): void
    {
        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::IMPORTED_FROM,
            'other_thing_id' => $this->sourceThingId,
            'data'          => json_encode(['source_external_id' => $sourceExternalId]),
        ]);
    }

    /**
     * Check if a thing already exists for this source_external_id via preloaded links.
     */
    private function findExisting(string $sourceExternalId): ?string
    {
        return $this->existingSourceLinks[$sourceExternalId] ?? null;
    }

    // ── Person import ──

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

        $givenName = GedcomParser::childValue($nameNode, 'GIVN');
        $surname = GedcomParser::childValue($nameNode, 'SURN');
        $marriedName = GedcomParser::childValue($nameNode, '_MARNM');

        $cleanName = self::cleanGedcomName($rawName);
        if ($givenName !== null && $surname !== null) {
            $cleanName = trim($givenName . ' ' . $surname);
        } elseif ($givenName !== null) {
            $cleanName = $givenName;
        }

        $sex = GedcomParser::childValue($record, 'SEX');

        $sourceExternalId = $this->externalId($gedcomId);
        $existingThingId = $this->findExisting($sourceExternalId);

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
            'name'        => $cleanName,
            'type'        => UUID::G_THING,
            'start'       => $start,
            'end'         => $end,
            'start_meta'  => $startMeta,
            'end_meta'    => $endMeta,
            'owner'       => $this->ownerId,
            'public'      => false,
            'deleted'     => false,
            'server_uuid' => $this->getServerUuid(),
            'data'        => !empty($properties) ? json_encode(['properties' => $properties]) : null,
        ];

        if ($existingThingId) {
            DB::table('things')->where('thing_id', $existingThingId)->update($data);
            $this->personIdMap[$gedcomId] = $existingThingId;
            $this->updated++;
            $this->ensurePersonEvents($birthNode, $deathNode, $record, $existingThingId, $cleanName);
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

        $this->linkToSource($thingId, $sourceExternalId);

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

    // ── Person event import ──

    private function importPersonEvent(array $eventNode, string $personId, string $personName, string $gedcomTag, string $eventType): void
    {
        $dateNode = GedcomParser::findChild($eventNode, 'DATE');
        $placeNode = GedcomParser::findChild($eventNode, 'PLAC');
        $noteNode = GedcomParser::findChild($eventNode, 'NOTE');

        $eventDate = $dateNode ? GedcomParser::parseGedcomDate($dateNode['value']) : null;
        $placeName = $placeNode ? GedcomParser::extractPlaceName($placeNode) : null;
        $note = $noteNode ? GedcomParser::getFullValue($noteNode) : null;

        $eventExternalId = $this->findEventExternalId($personId, $eventNode, $gedcomTag);
        $existingThingId = $this->findExisting($eventExternalId);

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

        // Build event name + translations
        $eventTypeLabel = ucfirst($eventType);
        $eventName = sprintf('%s: %s', $eventTypeLabel, $personName);

        $eventTypeLabels = [
            'birth' => ['en' => 'Birth', 'ru' => 'Рождение'],
            'death' => ['en' => 'Death', 'ru' => 'Смерть'],
            'occupation' => ['en' => 'Occupation', 'ru' => 'Работа'],
            'residence' => ['en' => 'Residence', 'ru' => 'Проживание'],
        ];
        $label = $eventTypeLabels[$eventType] ?? ['en' => $eventTypeLabel, 'ru' => $eventTypeLabel];

        $nameTranslations = [
            'lang' => 'en',
            'en'   => sprintf('%s: %s', $label['en'], $personName),
            'ru'   => sprintf('%s: %s', $label['ru'], $personName),
        ];

        $description = $note;
        if ($placeName !== null) {
            $description = $description ? $description . "\nPlace: " . $placeName : 'Place: ' . $placeName;
        }

        $eventProperties = [
            'event_type' => $eventType,
        ];

        $data = [
            'name'               => $eventName,
            'name_translations'  => json_encode($nameTranslations),
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
            'data'               => json_encode(['properties' => $eventProperties]),
        ];

        if ($existingThingId) {
            DB::table('things')->where('thing_id', $existingThingId)->update($data);
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

        // PRESENT (участвует в) instead of LINK_TO_SOURCE
        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::PRESENT,
            'other_thing_id' => $personId,
            'description'   => $eventType,
        ]);

        $this->linkToSource($thingId, $eventExternalId);

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

    // ── Family import ──

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
        $existingThingId = $this->findExisting($eventExternalId);

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

        // Get spouse names for the marriage title
        $husbandName = DB::table('things')->where('thing_id', $husbandId)->value('name') ?? '';
        $wifeName = DB::table('things')->where('thing_id', $wifeId)->value('name') ?? '';
        $marriageName = sprintf('Свадьба: %s, %s', $husbandName, $wifeName);

        $nameTranslations = [
            'lang' => 'ru',
            'en'   => sprintf('Marriage: %s, %s', $husbandName, $wifeName),
            'ru'   => sprintf('Свадьба: %s, %s', $husbandName, $wifeName),
        ];

        $eventProperties = [
            'event_type' => 'marriage',
        ];

        $data = [
            'name'               => $marriageName,
            'name_translations'  => json_encode($nameTranslations),
            'type'               => UUID::G_THING,
            'start'              => $start,
            'end'                => $end,
            'start_meta'         => $startMeta,
            'end_meta'           => $endMeta,
            'owner'              => $this->ownerId,
            'public'             => false,
            'deleted'            => false,
            'server_uuid'        => $this->getServerUuid(),
            'data'               => json_encode(['properties' => $eventProperties]),
        ];

        if ($placeName !== null) {
            $data['description'] = 'Place: ' . $placeName;
        }

        if ($existingThingId) {
            DB::table('things')->where('thing_id', $existingThingId)->update($data);
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

        // PRESENT instead of LINK_TO_SOURCE for both spouses
        foreach ([$husbandId, $wifeId] as $spouseId) {
            DB::table('links')->insert([
                'link_uuid'     => (string) Str::uuid(),
                'one_thing_id'  => $thingId,
                'link_type_id'  => UUID::PRESENT,
                'other_thing_id' => $spouseId,
                'description'   => 'spouse',
            ]);
        }

        $this->linkToSource($thingId, $eventExternalId);

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

    // ── GEDCOM SOUR record import ──

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

        $sourceExternalId = $this->externalId($gedcomId);
        $existingThingId = $this->findExisting($sourceExternalId);

        $data = [
            'name'        => $title,
            'type'        => UUID::G_THING,
            'description' => trim($description) ?: null,
            'owner'       => $this->ownerId,
            'public'      => false,
            'deleted'     => false,
            'server_uuid' => $this->getServerUuid(),
        ];

        if ($existingThingId) {
            DB::table('things')->where('thing_id', $existingThingId)->update($data);
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

        $this->linkToSource($thingId, $sourceExternalId);

        $this->imported++;
    }

    // ── Place management ──

    private function findOrCreatePlace(string $placeName, ?array $placeNode): ?string
    {
        $key = mb_strtolower(trim($placeName));
        if ($key === '') {
            return null;
        }

        if (isset($this->placeCache[$key])) {
            return $this->placeCache[$key];
        }

        $sourceExternalId = $this->externalId('place:' . $key);
        $existingThingId = $this->findExisting($sourceExternalId);

        if ($existingThingId) {
            $this->placeCache[$key] = $existingThingId;
            return $existingThingId;
        }

        $thingId = (string) Str::uuid();
        $data = [
            'thing_id'    => $thingId,
            'name'        => trim($placeName),
            'type'        => UUID::G_THING,
            'owner'       => $this->ownerId,
            'public'      => false,
            'deleted'     => false,
            'server_uuid' => $this->getServerUuid(),
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

        $this->linkToSource($thingId, $sourceExternalId);

        $this->placeCache[$key] = $thingId;
        return $thingId;
    }

    // ── Helpers ──

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