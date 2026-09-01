<?php

namespace App\Services;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;

/**
 * Audits the things/links/classes tables for structural data problems.
 *
 * Reports only — this class never writes to the database. It is meant to be
 * invoked manually (Tools UI / artisan command), from tests, and after data
 * imports to surface problems that imports or hand edits may have introduced.
 *
 * Soft-deleted rows (things.deleted = true / links.deleted = true) are treated
 * as logically removed and are excluded from every check.
 */
class DatabaseConsistencyChecker
{
    /**
     * Thing types that represent concrete objects rather than structural nodes
     * (classes, link types). These are expected to have a LINK_TO_CLASS link.
     */
    private const OBJECT_TYPES = [UUID::G_THING, UUID::G_EXTERNAL, UUID::G_SERVER];

    /**
     * The link taxonomy lives under the "Link" node; system-internal link types
     * (read access, user-group membership, …) hang under "System" instead.
     * "Link" itself is the taxonomy root and is exempt.
     */
    private const LINK_TYPE_ROOTS = [UUID::LINK, UUID::SYSTEM];

    /**
     * Run all consistency checks and return a report.
     *
     * @return array{
     *     checked_at: string,
     *     clean: bool,
     *     summary: array<string, int>,
     *     issues: array<string, array>,
     * }
     */
    public function check(): array
    {
        $issues = [
            'links_to_missing_objects'    => $this->linksToMissingObjects(),
            'self_referencing_links'      => $this->selfReferencingLinks(),
            'objects_without_classes'     => $this->objectsWithoutClasses(),
            'classes_without_parent'      => $this->classesWithoutParent(),
            'links_not_below_link_parent' => $this->linksNotBelowLinkParent(),
            'class_links_to_non_classes'  => $this->classLinksToNonClasses(),
        ];

        $summary = array_map('count', $issues);

        return [
            'checked_at' => now()->toIso8601String(),
            'clean'      => array_sum($summary) === 0,
            'summary'    => $summary,
            'issues'     => $issues,
        ];
    }

    /**
     * 1. Links referencing things that no longer exist — a missing endpoint or
     *    a missing link type. Normally prevented by FK constraints, so this
     *    survives only hand-edited / legacy / sloppily imported databases.
     */
    private function linksToMissingObjects(): array
    {
        return DB::table('links as l')
            ->leftJoin('things as one', 'one.thing_id', '=', 'l.one_thing_id')
            ->leftJoin('things as type', 'type.thing_id', '=', 'l.link_type_id')
            ->leftJoin('things as other', 'other.thing_id', '=', 'l.other_thing_id')
            ->where('l.deleted', false)
            ->where(function ($q) {
                $q->whereNull('one.thing_id')
                    ->orWhereNull('type.thing_id')
                    ->orWhereNull('other.thing_id');
            })
            ->select(
                'l.link_id',
                'l.one_thing_id',
                'l.link_type_id',
                'l.other_thing_id',
                'one.thing_id as one_exists',
                'type.thing_id as type_exists',
                'other.thing_id as other_exists',
            )
            ->orderBy('l.link_id')
            ->get()
            ->map(function ($row) {
                $missing = [];
                if ($row->one_exists === null) {
                    $missing[] = 'one_thing_id';
                }
                if ($row->type_exists === null) {
                    $missing[] = 'link_type_id';
                }
                if ($row->other_exists === null) {
                    $missing[] = 'other_thing_id';
                }
                return [
                    'link_id'        => (int) $row->link_id,
                    'one_thing_id'   => (string) $row->one_thing_id,
                    'link_type_id'   => (string) $row->link_type_id,
                    'other_thing_id' => (string) $row->other_thing_id,
                    'missing'        => $missing,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * 2. Links where an object refers to itself (one_thing_id == other_thing_id).
     */
    private function selfReferencingLinks(): array
    {
        return DB::table('links')
            ->where('deleted', false)
            ->whereColumn('one_thing_id', 'other_thing_id')
            ->orderBy('link_id')
            ->get(['link_id', 'one_thing_id', 'link_type_id', 'other_thing_id'])
            ->map(fn ($row) => [
                'link_id'        => (int) $row->link_id,
                'one_thing_id'   => (string) $row->one_thing_id,
                'link_type_id'   => (string) $row->link_type_id,
                'other_thing_id' => (string) $row->other_thing_id,
            ])
            ->values()
            ->all();
    }

    /**
     * 3. Concrete objects (things, servers, externals) that have no
     *    non-deleted LINK_TO_CLASS link.
     */
    private function objectsWithoutClasses(): array
    {
        return DB::table('things as t')
            ->whereIn('t.type', self::OBJECT_TYPES)
            ->where('t.deleted', false)
            ->whereNotExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('links as l')
                    ->whereColumn('l.one_thing_id', 't.thing_id')
                    ->where('l.link_type_id', UUID::LINK_TO_CLASS)
                    ->where('l.deleted', false);
            })
            ->orderBy('t.name')
            ->get(['t.thing_id', 't.name', 't.type'])
            ->map(fn ($row) => [
                'thing_id' => (string) $row->thing_id,
                'name'     => $row->name,
                'type'     => (int) $row->type,
            ])
            ->values()
            ->all();
    }

    /**
     * 4. Classes (G_CLASS) that have no non-deleted LINK_TO_PARENT link — they
     *    are detached from the class hierarchy. The structural root "Everything"
     *    is type GENERAL, so it never matches here.
     */
    private function classesWithoutParent(): array
    {
        return DB::table('things as t')
            ->where('t.type', UUID::G_CLASS)
            ->where('t.deleted', false)
            ->whereNotExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('links as l')
                    ->whereColumn('l.other_thing_id', 't.thing_id')
                    ->where('l.link_type_id', UUID::LINK_TO_PARENT)
                    ->where('l.deleted', false);
            })
            ->orderBy('t.name')
            ->get(['t.thing_id', 't.name'])
            ->map(fn ($row) => [
                'thing_id' => (string) $row->thing_id,
                'name'     => $row->name,
            ])
            ->values()
            ->all();
    }

    /**
     * 5. Link types (G_LINK) that are not located inside the link taxonomy.
     *
     * A link type is well-placed when walking its LINK_TO_PARENT chain upward
     * passes through "Link" (the taxonomy root) or "System" (which hosts
     * system-internal link types). A link type with no parent at all, or whose
     * ancestors never include Link/System (e.g. it hangs under a class), is
     * reported.
     */
    private function linksNotBelowLinkParent(): array
    {
        // Load the whole hierarchy once: child thing_id => parent thing_ids.
        $parents = [];
        DB::table('links')
            ->where('link_type_id', UUID::LINK_TO_PARENT)
            ->where('deleted', false)
            ->select('one_thing_id', 'other_thing_id')
            ->orderBy('link_id')
            ->get()
            ->each(function ($l) use (&$parents) {
                $parents[(string) $l->other_thing_id][] = (string) $l->one_thing_id;
            });

        $linkTypes = DB::table('things')
            ->where('type', UUID::G_LINK)
            ->where('deleted', false)
            ->orderBy('name')
            ->get(['thing_id', 'name']);

        $violations = [];
        foreach ($linkTypes as $linkType) {
            $id = (string) $linkType->thing_id;
            if ($id === UUID::LINK) {
                continue; // the taxonomy root itself
            }

            $ancestors = $this->allAncestors($id, $parents);
            $wellPlaced = array_intersect($ancestors, self::LINK_TYPE_ROOTS) !== [];

            if (!$wellPlaced) {
                $violations[] = [
                    'thing_id' => $id,
                    'name'     => $linkType->name,
                    'problem'  => $ancestors === []
                        ? 'no parent'
                        : 'not under the Link or System parent',
                ];
            }
        }

        return $violations;
    }

    /**
     * 6. LINK_TO_CLASS must point to a class (type G_CLASS), never to another
     *    object. Events or persons linked to a place used as their "class" is a
     *    classic mistake (the place is a G_THING instance, not a class).
     *    Targets that are soft-deleted are reported too — a dead class is not a
     *    usable class. Missing targets are already covered by the dangling-link
     *    check.
     */
    private function classLinksToNonClasses(): array
    {
        return DB::table('links as l')
            ->leftJoin('things as t', 'l.other_thing_id', '=', 't.thing_id')
            ->where('l.link_type_id', UUID::LINK_TO_CLASS)
            ->where('l.deleted', false)
            ->where(function ($q) {
                $q->where('t.deleted', true)
                    ->orWhere('t.type', '!=', UUID::G_CLASS);
            })
            ->select(
                'l.link_id',
                'l.one_thing_id',
                'l.other_thing_id',
                't.name as target_name',
                't.type as target_type',
                't.deleted as target_deleted',
            )
            ->orderBy('l.link_id')
            ->get()
            ->map(function ($row) {
                return [
                    'link_id'        => (int) $row->link_id,
                    'one_thing_id'   => (string) $row->one_thing_id,
                    'other_thing_id' => (string) $row->other_thing_id,
                    'target_name'    => $row->target_name,
                    'problem'        => (bool) $row->target_deleted
                        ? 'target class is deleted'
                        : 'target is not a class',
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Every thing_id reachable from $id by following LINK_TO_PARENT edges
     * upward (cycle-safe). The set includes the intermediate parents.
     */
    private function allAncestors(string $id, array $parents): array
    {
        $ancestors = [];
        $queue = $parents[$id] ?? [];
        $seen = [$id => true];

        while ($queue !== []) {
            $current = array_pop($queue);
            if (isset($seen[$current])) {
                continue; // cycle guard
            }
            $seen[$current] = true;
            $ancestors[] = $current;
            foreach ($parents[$current] ?? [] as $parent) {
                if (!isset($seen[$parent])) {
                    $queue[] = $parent;
                }
            }
        }

        return $ancestors;
    }
}
