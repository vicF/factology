<?php

namespace App\Services\Importer;

use App\Services\MediaLink\UrlMediaClassifier;
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
 *
 * Event types are mapped to specific factology classes (not the generic EVENT):
 *   BIRT → Birth, DEAT → Death, RESI → Residence In, OCCU → Occupation,
 *   MARR → Marriage, BURI → Burial, EDUC → Education, CHR → Christening.
 * Place addresses with street-level specificity create Address-class things;
 * settlements and localities create Place-class things.
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
    private array $pendingCitations = []; // ['citingExternalId' => ..., 'sourceRef' => '@S1@', ...]
    private array $urlOnlySources = []; // '@S1@' => ['urls' => [...]] sources that must not become objects
    private array $archiveChainCache = []; // archival reference key → deepest chain thing_id

    /**
     * Map GEDCOM event tag → factology class UUID.
     * Keeps generic EVENT as fallback for unmapped tags.
     */
    private const EVENT_CLASS_MAP = [
        'BIRT' => UUID::BIRTH_CLASS,
        'DEAT' => UUID::DEATH_CLASS,
        'RESI' => UUID::RESIDENCE_CLASS,
        'OCCU' => UUID::OCCUPATION_CLASS,
        'MARR' => UUID::MARRIAGE_CLASS,
        'BURI' => UUID::BURIAL_CLASS,
        'EDUC' => UUID::EDUCATION_CLASS,
        'CHR'  => UUID::CHRISTENING_CLASS,
    ];

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
        $this->pendingCitations = [];
        $this->urlOnlySources = [];
        $this->archiveChainCache = [];

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

            // Sources run last, so citations collected during person/event/family
            // import are only resolvable now that every source thing exists.
            $this->wireCitations();
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
        // Idempotent: a deduped thing (e.g. two SOUR @ids with the same title)
        // may already be linked to this file's GEDCOM source thing.
        DB::table('links')->insertOrIgnore([
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

        // If SURN tag is missing, extract surname from NAME value (between //)
        if ($surname === null && preg_match('#/([^/]+)/#u', $rawName, $m)) {
            $surname = trim($m[1]);
        }

        $cleanName = self::cleanGedcomName($rawName);
        if ($givenName !== null && $surname !== null) {
            // Format: <given patronymic> <surname> (<birth surname>)
            // For women with a married name, the married name is the primary surname,
            // and the birth surname (SURN) goes in parentheses.
            $sex = GedcomParser::childValue($record, 'SEX');
            if ($sex === 'F' && $marriedName !== null && $marriedName !== $surname) {
                $cleanName = trim($givenName . ' ' . $marriedName . ' (' . $surname . ')');
            } else {
                $cleanName = trim($givenName . ' ' . $surname);
            }
        } elseif ($givenName !== null) {
            $cleanName = $givenName;
        }

        $sex = $sex ?? GedcomParser::childValue($record, 'SEX');

        $sourceExternalId = $this->externalId($gedcomId);
        $existingThingId = $this->findExisting($sourceExternalId);

        // Person-level citations (SOUR @S#@ directly under the INDI record).
        $this->collectCitations($record, $sourceExternalId);

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
        // Only store married_name for women when it differs from birth surname
        if ($sex === 'F' && $marriedName !== null && $marriedName !== $surname) {
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
        $this->existingSourceLinks[$sourceExternalId] = $thingId;

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
        foreach (GedcomParser::findChildren($record, 'BURI') as $eventNode) {
            $this->importPersonEvent($eventNode, $thingId, $cleanName, 'BURI', 'burial');
        }
        foreach (GedcomParser::findChildren($record, 'EDUC') as $eventNode) {
            $this->importPersonEvent($eventNode, $thingId, $cleanName, 'EDUC', 'education');
        }
        foreach (GedcomParser::findChildren($record, 'CHR') as $eventNode) {
            $this->importPersonEvent($eventNode, $thingId, $cleanName, 'CHR', 'christening');
        }
        foreach (GedcomParser::findChildren($record, 'EVEN') as $eventNode) {
            $this->importPersonEvent($eventNode, $thingId, $cleanName, 'EVEN', 'event');
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
        foreach (GedcomParser::findChildren($record, 'BURI') as $eventNode) {
            $this->importPersonEvent($eventNode, $personId, $cleanName, 'BURI', 'burial');
        }
        foreach (GedcomParser::findChildren($record, 'EDUC') as $eventNode) {
            $this->importPersonEvent($eventNode, $personId, $cleanName, 'EDUC', 'education');
        }
        foreach (GedcomParser::findChildren($record, 'CHR') as $eventNode) {
            $this->importPersonEvent($eventNode, $personId, $cleanName, 'CHR', 'christening');
        }
        foreach (GedcomParser::findChildren($record, 'EVEN') as $eventNode) {
            $this->importPersonEvent($eventNode, $personId, $cleanName, 'EVEN', 'event');
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

        // Event-level citations (SOUR @S#@ under BIRT/DEAT/OCCU/RESI/...).
        $this->collectCitations($eventNode, $eventExternalId);

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

        $eventTypeLabels = [
            'birth' => ['en' => 'Birth', 'ru' => 'Рождение'],
            'death' => ['en' => 'Death', 'ru' => 'Смерть'],
            'occupation' => ['en' => 'Occupation', 'ru' => 'Работа'],
            'residence' => ['en' => 'Residence In', 'ru' => 'Проживание в'],
            'burial' => ['en' => 'Burial', 'ru' => 'Похороны'],
            'education' => ['en' => 'Education', 'ru' => 'Образование'],
            'christening' => ['en' => 'Christening', 'ru' => 'Крещение'],
        ];
        $label = $eventTypeLabels[$eventType] ?? ['en' => $eventTypeLabel, 'ru' => $eventTypeLabel];

        if ($eventType === 'residence' && $placeName !== null) {
            // Residence In is named after the place, not the person:
            // "Проживание в Приморский пр. 151"
            $eventName = sprintf('%s %s', $label['ru'], $placeName);
            $nameTranslations = [
                'lang' => 'ru',
                'en'   => sprintf('%s %s', $label['en'], $placeName),
                'ru'   => $eventName,
            ];
        } else {
            $eventName = sprintf('%s: %s', $eventTypeLabel, $personName);
            $nameTranslations = [
                'lang' => 'en',
                'en'   => sprintf('%s: %s', $label['en'], $personName),
                'ru'   => sprintf('%s: %s', $label['ru'], $personName),
            ];
        }

        $description = $note;
        if ($placeName !== null) {
            $description = $description ? $description . "\nPlace: " . $placeName : 'Place: ' . $placeName;
        }

        $eventProperties = [
            'event_type' => $eventType,
        ];

        $classId = self::EVENT_CLASS_MAP[$gedcomTag] ?? UUID::EVENT;

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
            'other_thing_id' => $classId,
        ]);

        // PRESENT (участвует в): person → PRESENT → event, with dates
        $presentLink = [
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $personId,
            'link_type_id'  => UUID::PRESENT,
            'other_thing_id' => $thingId,
        ];
        if ($start !== null) {
            $presentLink['link_start'] = $start;
            $presentLink['link_start_meta'] = $startMeta;
        }
        if ($end !== null) {
            $presentLink['link_end'] = $end;
            $presentLink['link_end_meta'] = $endMeta;
        }
        DB::table('links')->insert($presentLink);

        $this->linkToSource($thingId, $eventExternalId);
        $this->existingSourceLinks[$eventExternalId] = $thingId;

        if ($placeName !== null) {
            $placeId = $this->findOrCreatePlace($placeName, $placeNode);
            if ($placeId !== null) {
                $linkType = UUID::INSIDE;
                DB::table('links')->insert([
                    'link_uuid'     => (string) Str::uuid(),
                    'one_thing_id'  => $thingId,
                    'link_type_id'  => $linkType,
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

        // Marriage-event citations.
        $this->collectCitations($marrNode, $eventExternalId);

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
            'other_thing_id' => UUID::MARRIAGE_CLASS,
        ]);

        // PRESENT: spouse → PRESENT → marriage event, with dates
        foreach ([$husbandId, $wifeId] as $spouseId) {
            $presentLink = [
                'link_uuid'     => (string) Str::uuid(),
                'one_thing_id'  => $spouseId,
                'link_type_id'  => UUID::PRESENT,
                'other_thing_id' => $thingId,
            ];
            if ($start !== null) {
                $presentLink['link_start'] = $start;
                $presentLink['link_start_meta'] = $startMeta;
            }
            if ($end !== null) {
                $presentLink['link_end'] = $end;
                $presentLink['link_end_meta'] = $endMeta;
            }
            DB::table('links')->insert($presentLink);
        }

        $this->linkToSource($thingId, $eventExternalId);
        $this->existingSourceLinks[$eventExternalId] = $thingId;

        if ($placeName !== null) {
            $placeId = $this->findOrCreatePlace($placeName, $placeNode);
            if ($placeId !== null) {
                DB::table('links')->insert([
                    'link_uuid'     => (string) Str::uuid(),
                    'one_thing_id'  => $thingId,
                    'link_type_id'  => UUID::INSIDE,
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

        $noteNode = GedcomParser::findChild($record, 'NOTE');
        $note = $noteNode ? GedcomParser::getFullValue($noteNode) : null;

        $title = GedcomParser::childValue($record, 'TITL');
        $author = GedcomParser::childValue($record, 'AUTH');
        $publisher = GedcomParser::childValue($record, 'PUBL');

        // Collect web URLs: WWW sub-records, a TITL that is itself a URL
        // (exports often put the bare URL in the title for online sources),
        // and links embedded in the NOTE (<a href="…">Ссылка (URL)</a>).
        $urls = [];
        foreach (GedcomParser::findChildren($record, 'WWW') as $www) {
            $url = trim((string) ($www['value'] ?? ''));
            if ($url !== '' && filter_var($url, FILTER_VALIDATE_URL)) {
                $urls[] = $url;
            }
        }
        if (UrlMediaClassifier::looksLikeUrl($title)) {
            $url = trim($title);
            if (filter_var($url, FILTER_VALIDATE_URL)) {
                $urls[] = $url;
            }
            $title = null; // the "title" was really the URL
        }
        foreach (self::extractHrefs($note ?? '') as $url) {
            $urls[] = $url;
        }

        // A source only becomes an object when it carries bibliographic content
        // (author/publisher or a meaningful non-URL title). A bare URL source
        // creates no object — its URL is attached to the citing objects instead.
        $hasBibliographic = ($author !== null && trim($author) !== '')
            || ($publisher !== null && trim($publisher) !== '');
        $titleMeaningful = $title !== null
            && trim($title) !== ''
            && !UrlMediaClassifier::looksLikeUrl($title);

        if (!$hasBibliographic && !$titleMeaningful) {
            if ($urls !== []) {
                $this->urlOnlySources[$gedcomId] = ['urls' => $urls];
            }
            return;
        }

        $sourceName = trim($title ?? '') !== '' ? trim($title) : 'Source';

        $description = '';
        if ($author) {
            $description .= 'Author: ' . $author . "\n";
        }
        if ($publisher) {
            $description .= 'Publisher: ' . $publisher . "\n";
        }
        $noteText = trim($note ?? '');
        if ($noteText !== '') {
            // Keep the note only when it is not purely the link placeholder.
            if (preg_match('/^<a[^>]*>.*<\/a>$/i', $noteText) !== 1) {
                $description .= $noteText . "\n";
            }
        }
        $description = trim($description) ?: null;

        $sourceExternalId = $this->externalId($gedcomId);

        // Bibliographic sources are deduped by normalized title so the same
        // book/record is one object across SOUR @ids and across import files.
        $sourceKey = $titleMeaningful ? self::titleKey($title) : null;
        $thingId = $sourceKey !== null
            ? $this->findSourceByKey($sourceKey)
            : null;

        $data = [
            'name'        => $sourceName,
            'type'        => UUID::G_THING,
            'description' => $description,
            'owner'       => $this->ownerId,
            'public'      => false,
            'deleted'     => false,
            'server_uuid' => $this->getServerUuid(),
        ];

        if ($thingId === null) {
            $existingByRef = $this->findExisting($sourceExternalId);
            if ($existingByRef !== null) {
                $thingId = $existingByRef;
            }
        }

        if ($thingId !== null) {
            DB::table('things')->where('thing_id', $thingId)->update($data);
            $this->updated++;
            $this->linkToSource($thingId, $sourceExternalId);
            $this->existingSourceLinks[$sourceExternalId] = $thingId;
            $this->attachSourceUrls($thingId, $urls);
            $this->storeSourceKey($thingId, $sourceKey);
            $this->attachArchivalLocation($thingId, $note ?? '', $sourceName);
            return;
        }

        $thingId = (string) Str::uuid();
        $data['thing_id'] = $thingId;
        DB::table('things')->insert($data);

        $this->storeSourceKey($thingId, $sourceKey);

        // Class under the real Source class (EVIDENCE is a link type, not a
        // class — classing sources against it produced bogus relations).
        DB::table('links')->insert([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $thingId,
            'link_type_id'  => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::SOURCE_CLASS,
        ]);

        $this->linkToSource($thingId, $sourceExternalId);
        $this->existingSourceLinks[$sourceExternalId] = $thingId;
        $this->attachSourceUrls($thingId, $urls);
        $this->attachArchivalLocation($thingId, $note ?? '', $sourceName);

        $this->imported++;
    }

    /**
     * Store web URLs as external links on a source object (idempotent).
     */
    private function attachSourceUrls(string $thingId, array $urls): void
    {
        foreach (array_unique($urls) as $url) {
            $exists = DB::table('external_links')
                ->where('thing_id', $thingId)
                ->where('url', $url)
                ->exists();
            if ($exists) {
                continue;
            }
            DB::table('external_links')->insert([
                'id'       => (string) Str::uuid(),
                'thing_id' => $thingId,
                'url'      => $url,
            ]);
        }
    }

    /**
     * Store a stable dedup key (normalized title) for a bibliographic source.
     */
    private function storeSourceKey(string $thingId, ?string $sourceKey): void
    {
        if ($sourceKey === null) {
            return;
        }
        $row = DB::table('things')->where('thing_id', $thingId)->value('data');
        $dataArr = $row !== null ? (is_string($row) ? json_decode($row, true) : (array) $row) : [];
        $dataArr['properties'] = $dataArr['properties'] ?? [];
        $dataArr['properties']['source_key'] = $sourceKey;
        DB::table('things')->where('thing_id', $thingId)->update(['data' => json_encode($dataArr)]);
    }

    private function findSourceByKey(string $sourceKey): ?string
    {
        return DB::table('things')
            ->where('owner', $this->ownerId)
            ->where('type', UUID::G_THING)
            ->whereRaw("cast(data as json)->'properties'->>'source_key' = ?", [$sourceKey])
            ->value('thing_id');
    }

    private static function titleKey(?string $title): string
    {
        return self::normKey(trim($title ?? ''));
    }

    private static function normKey(string $text): string
    {
        $text = mb_strtolower(trim($text));
        $text = preg_replace('/\s+/u', ' ', $text);
        return trim($text);
    }

    /**
     * Extract absolute http(s) URLs from <a href="…"> fragments.
     */
    private static function extractHrefs(string $text): array
    {
        if (!preg_match_all('#href\s*=\s*["\']([^"\']+)["\']#i', $text, $m)) {
            return [];
        }
        $urls = [];
        foreach ($m[1] as $u) {
            $u = trim($u);
            if (filter_var($u, FILTER_VALIDATE_URL)) {
                $urls[] = $u;
            }
        }
        return $urls;
    }

    // ── Archival locations ("Ф.179 оп.1 д.18" → Archive/Fonds/Series/File) ──

    /**
     * Attach a physical archival location to a source object when its own
     * NOTE/TITLE is a clean archival reference. The source is linked via
     * "is stored in" to the deepest archival unit found (the "дело"/file).
     */
    private function attachArchivalLocation(string $sourceThingId, string $note, string $title): void
    {
        // Archival references live in the source record's own NOTE (e.g.
        // "Ф.179 оп.1 д.18"). Titles are prose and cause false positives, so
        // only the note is inspected.
        unset($title);
        $ref = self::parseArchivalReference($note);
        if ($ref === null) {
            return;
        }
        $deepestId = $this->ensureArchiveChain($ref);
        if ($deepestId !== null) {
            $this->ensureLink($sourceThingId, UUID::LINK_TO_STORAGE, $deepestId);
        }
    }

    /**
     * Parse a clean archival reference like "Ф.179 оп.1 д.18" or
     * "ГАВО. Фонд № 496. Опись № 4. Дело № 453". Returns null unless the
     * whole string is (essentially) an archival reference — free-form prose
     * with extra text is ignored to avoid garbage chain objects.
     *
     * @return array{archive: ?string, fonds: ?string, series: ?string, file: ?string}|null
     */
    public static function parseArchivalReference(?string $text): ?array
    {
        $t = trim((string) preg_replace('/\s+/u', ' ', (string) $text));
        if ($t === '') {
            return null;
        }

        if (!preg_match('/\b(?:фонд(?:ы|а)?|ф\.)\s*№?\s*([0-9A-Za-zА-Яа-яЁё][\wА-Яа-яЁё\-]*)/iu', $t, $mf)) {
            return null;
        }
        $fonds = trim($mf[1], ".,;: \t");

        $series = null;
        if (preg_match('/\b(?:опись|оп\.?)\s*№?\s*([0-9][\w\-]*)/iu', $t, $ms)) {
            $series = trim($ms[1], ".,;: \t");
        }
        $file = null;
        if (preg_match('/\b(?:дело|ед\.?\s*хр\.?|д\.?)\s*№?\s*([0-9A-Za-zА-Яа-яЁё][\wА-Яа-яЁё\-]*)/iu', $t, $md)) {
            $file = trim($md[1], ".,;: \t");
        }

        $fondsPos = mb_strpos($t, $mf[0]);
        $prefix = trim(mb_substr($t, 0, $fondsPos));

        $archive = null;
        if ($prefix !== '') {
            // The prefix may only be an archive label (letters/spaces/punct, no
            // digits); otherwise the string is not a clean archival reference.
            if (preg_match('/^\d/', $prefix) || preg_match('/[0-9]/u', $prefix)) {
                return null;
            }
            if (preg_match('/\p{L}/u', $prefix) && mb_strlen($prefix) <= 80) {
                $archive = trim($prefix, " \t.,;:()«»[]–—");
            } else {
                return null;
            }
        }

        // Cleanliness: removing the parsed tokens (and the archive label, which
        // was validated as letters/punctuation above) must leave no letters.
        $leftover = $t;
        foreach ([$mf[0], $series !== null ? $ms[0] : '', $file !== null ? $md[0] : ''] as $token) {
            if ($token !== '') {
                $leftover = str_replace($token, '', $leftover);
            }
        }
        if ($archive !== null && $prefix !== '') {
            $leftover = str_replace($prefix, '', $leftover);
        }
        if (preg_match('/\p{L}/u', $leftover)) {
            return null;
        }

        return [
            'archive' => $archive,
            'fonds'   => $fonds,
            'series'  => $series,
            'file'    => $file,
        ];
    }

    /**
     * Find or create the Archive → Fonds → Series → File containment chain for
     * a parsed archival reference. Returns the deepest unit's thing_id.
     */
    private function ensureArchiveChain(array $ref): ?string
    {
        $norm = function (?string $s): string {
            return self::normKey((string) $s);
        };

        $chainKey = ($ref['archive'] !== null ? 'a|' . $norm($ref['archive']) . '|' : '')
            . 'F|' . $norm($ref['fonds'])
            . '|S|' . $norm($ref['series'])
            . '|D|' . $norm($ref['file']);

        if (isset($this->archiveChainCache[$chainKey])) {
            return $this->archiveChainCache[$chainKey];
        }

        $parentId = null;
        if ($ref['archive'] !== null && $ref['archive'] !== '') {
            $parentId = $this->findOrCreateChainThing(
                UUID::ARCHIVE_CLASS,
                trim($ref['archive']),
                $chainKey . '|L|archive'
            );
        }

        $units = [];
        if ($ref['fonds'] !== null) {
            $units[] = [UUID::FONDS_CLASS, 'Ф.' . $ref['fonds'], $chainKey . '|L|fonds'];
        }
        if ($ref['series'] !== null) {
            $units[] = [UUID::SERIES_CLASS, 'оп.' . $ref['series'], $chainKey . '|L|series'];
        }
        if ($ref['file'] !== null) {
            $units[] = [UUID::FILE_CLASS, 'д.' . $ref['file'], $chainKey . '|L|file'];
        }

        $deepest = $parentId;
        foreach ($units as [$classId, $label, $unitKey]) {
            $thingId = $this->findOrCreateChainThing($classId, $label, $unitKey);
            if ($parentId !== null) {
                $this->ensureLink($thingId, UUID::INSIDE, $parentId);
            }
            $deepest = $thingId;
            $parentId = $thingId;
        }

        $this->archiveChainCache[$chainKey] = $deepest;
        return $deepest;
    }

    private function findOrCreateChainThing(string $classId, string $label, string $archKey): string
    {
        $existing = DB::table('things')
            ->where('owner', $this->ownerId)
            ->where('type', UUID::G_THING)
            ->whereRaw("cast(data as json)->'properties'->>'arch_key' = ?", [$archKey])
            ->value('thing_id');

        if ($existing !== null) {
            DB::table('things')->where('thing_id', $existing)
                ->update(['name' => $label, 'deleted' => false]);
            $this->ensureLink($existing, UUID::LINK_TO_CLASS, $classId);
            return $existing;
        }

        $thingId = (string) Str::uuid();
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => $label,
            'type'        => UUID::G_THING,
            'owner'       => $this->ownerId,
            'public'      => false,
            'deleted'     => false,
            'server_uuid' => $this->getServerUuid(),
            'data'        => json_encode(['properties' => ['arch_key' => $archKey]]),
        ]);
        $this->ensureLink($thingId, UUID::LINK_TO_CLASS, $classId);
        $this->linkToSource($thingId, $this->externalId('arch:' . $archKey));

        return $thingId;
    }

    private function ensureLink(string $oneId, string $linkTypeId, string $otherId, array $extra = []): void
    {
        $exists = DB::table('links')
            ->where('one_thing_id', $oneId)
            ->where('link_type_id', $linkTypeId)
            ->where('other_thing_id', $otherId)
            ->where('deleted', false)
            ->first();
        if ($exists) {
            return;
        }
        $row = [
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $oneId,
            'link_type_id'  => $linkTypeId,
            'other_thing_id' => $otherId,
        ];
        DB::table('links')->insert(array_merge($row, $extra));
    }

    /**
     * Remember that a thing (event/person) cites a GEDCOM source. The actual
     * graph edge/URL is created later by wireCitations(), once all SOUR records
     * have been imported.
     */
    private function collectCitations(?array $node, string $citingExternalId): void
    {
        if ($node === null) {
            return;
        }
        foreach (GedcomParser::findChildren($node, 'SOUR') as $sour) {
            $ref = trim((string) ($sour['value'] ?? ''));
            if (!preg_match('/^@.+@$/', $ref)) {
                continue;
            }
            // Citation details live on the citation link: PAGE (page/folio or a
            // direct URL), the quoted excerpt (DATA → TEXT) and a detected URL.
            $page = GedcomParser::childValue($sour, 'PAGE');
            $page = $page !== null ? trim($page) : null;

            $text = null;
            $dataNode = GedcomParser::findChild($sour, 'DATA');
            if ($dataNode !== null) {
                $textNode = GedcomParser::findChild($dataNode, 'TEXT');
                if ($textNode !== null) {
                    $full = GedcomParser::getFullValue($textNode);
                    $text = trim($full) !== '' ? trim($full) : null;
                }
            }

            $url = null;
            if ($page !== null && filter_var($page, FILTER_VALIDATE_URL)) {
                $url = $page; // the "page" of an online source is its URL
            }

            $this->pendingCitations[] = [
                'citingExternalId' => $citingExternalId,
                'sourceRef'        => $ref,
                'page'             => $page,
                'text'             => $text,
                'url'              => $url,
            ];
        }
    }

    /**
     * Create citation edges (source → EVIDENCE → citing object) and attach URLs
     * of URL-only sources to the objects that cite them.
     */
    private function wireCitations(): void
    {
        foreach ($this->pendingCitations as $citation) {
            $citingThingId = $this->findExisting($citation['citingExternalId']);
            if ($citingThingId === null) {
                continue;
            }

            $sourceThingId = $this->findExisting($this->externalId($citation['sourceRef']));
            if ($sourceThingId !== null) {
                $this->createEvidenceLink($sourceThingId, $citingThingId, $citation);
                continue;
            }

            $urlOnly = $this->urlOnlySources[$citation['sourceRef']] ?? null;
            if ($urlOnly !== null) {
                $this->attachSourceUrls($citingThingId, $urlOnly['urls']);
            }
        }
    }

    /**
     * Create (or refresh) a citation edge source → EVIDENCE → citing object,
     * carrying PAGE / quoted text / URL as data + a readable description.
     */
    private function createEvidenceLink(string $sourceThingId, string $citingThingId, array $citation): void
    {
        $description = null;
        if (!empty($citation['page']) && !filter_var($citation['page'], FILTER_VALIDATE_URL)) {
            $description = $citation['page'];
        } elseif (!empty($citation['url'])) {
            $description = $citation['url'];
        }

        $props = [];
        foreach (['page', 'text', 'url'] as $key) {
            if (!empty($citation[$key])) {
                $props[$key] = $citation[$key];
            }
        }

        $fields = [
            'description' => $description,
            'data'        => $props !== [] ? json_encode($props, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
        ];

        $existing = DB::table('links')
            ->where('one_thing_id', $sourceThingId)
            ->where('link_type_id', UUID::EVIDENCE)
            ->where('other_thing_id', $citingThingId)
            ->where('deleted', false)
            ->first();

        if ($existing) {
            DB::table('links')->where('link_id', $existing->link_id)->update($fields);
            return;
        }

        DB::table('links')->insert(array_merge([
            'link_uuid'     => (string) Str::uuid(),
            'one_thing_id'  => $sourceThingId,
            'link_type_id'  => UUID::EVIDENCE,
            'other_thing_id' => $citingThingId,
        ], $fields));
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

        // Check if a place with this name already exists in the database
        // (any public thing with matching name, regardless of its specific class)
        $existingPlace = DB::table('things')
            ->where('name', trim($placeName))
            ->where('type', '!=', 2) // not a class definition
            ->where('public', true)
            ->first();

        if ($existingPlace) {
            $this->placeCache[$key] = $existingPlace->thing_id;
            return $existingPlace->thing_id;
        }

        $sourceExternalId = $this->externalId('place:' . $key);
        $existingThingId = $this->findExisting($sourceExternalId);

        if ($existingThingId) {
            $this->placeCache[$key] = $existingThingId;
            return $existingThingId;
        }

        $isAddress = $this->isStreetAddress($placeName);
        $classId = $isAddress ? UUID::ADDRESS_CLASS : UUID::PLACE_CLASS;

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
            'other_thing_id' => $classId,
        ]);

        $this->linkToSource($thingId, $sourceExternalId);

        $this->placeCache[$key] = $thingId;
        return $thingId;
    }

    /**
     * Detect whether a place name is a street-level address vs a settlement.
     * Street-level addresses contain indicators like пр., проспект, ул., д., дом, etc.
     */
    private function isStreetAddress(string $placeName): bool
    {
        // Take the most specific part (before the first comma)
        $specific = trim(explode(',', $placeName)[0]);

        // Street-level indicators (Russian)
        $streetIndicators = [
            'пр.', 'проспект', 'проезд', 'ул.', 'улица', 'переулок', 'пер.',
            'бульвар', 'б-р', 'шоссе', 'наб.', 'набережная', 'площадь', 'пл.',
            'д.', 'дом', 'корп.', 'корпус', 'кв.', 'квартира',
        ];

        $lower = mb_strtolower($specific);
        foreach ($streetIndicators as $indicator) {
            if (mb_strpos($lower, $indicator) !== false) {
                return true;
            }
        }

        // Contains a number (address number) — likely a street address
        if (preg_match('/\d+/', $specific)) {
            return true;
        }

        return false;
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