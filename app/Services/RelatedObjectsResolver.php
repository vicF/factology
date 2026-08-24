<?php

namespace App\Services;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Resolves multilevel "related objects" for a thing (or a batch of things),
 * walking the undirected `links` table level by level up to a depth cap.
 *
 * Shared by the search endpoint (one level, breadth-capped, per result) and
 * the object detail endpoint (nested tree to N levels). Every level is
 * resolved with batched queries (never N+1 per node), targets are visibility
 * filtered, cycles are cut via a per-root visited set, and links are ranked
 * by "richness" (has description/data) → recency → name before the breadth
 * cap is applied.
 */
class RelatedObjectsResolver
{
    public const DEFAULT_SEARCH_DEPTH = 1;
    public const SEARCH_DEPTH_CAP = 6;
    public const DETAIL_DEPTH_CAP = 6;
    public const SEARCH_BREADTH = 5;
    public const BREADTH_CAP = 8;
    public const MAX_FRONTIER = 1000;
    public const TARGET_DESCRIPTION_PREVIEW = 160;

    /**
     * Resolve the nested related-link tree for a single root thing (detail path).
     *
     * @param string $rootId
     * @param int    $depth   1 = direct only (shallow `target`, no `target.links`)
     * @param int    $breadth max links per node at each level
     * @return array list of links; each link = flat fields + `target` + optional nested `target.links`
     */
    public function forObject(string $rootId, int $depth, int $breadth): array
    {
        // The top level is unlimited so every direct link gets a `target`
        // (the detail page's flat list is the source of truth for what is
        // shown); only the top `breadth` links recurse into deeper levels.
        $linksByParent = $this->resolveLevels([$rootId], $depth, $breadth, seedVisited: [$rootId], topLevelBreadth: null);

        return $this->assembleTree($rootId, $linksByParent, $depth);
    }

    /**
     * Resolve direct related links for MANY roots at once (search path, depth 1).
     *
     * @param array $rootIds
     * @param int   $breadth max links per root
     * @return array [rootId => [links]]; each link = flat fields + shallow `target`
     */
    public function forMany(array $rootIds, int $breadth): array
    {
        $rootIds = array_values(array_unique(array_filter($rootIds)));
        $result = [];
        if (empty($rootIds)) {
            return $result;
        }

        // Level 1 only; roots are not deduped against each other so a link
        // between two search results is still shown from both sides. The top
        // level is capped at `breadth` for search results.
        $linksByParent = $this->resolveLevels($rootIds, 1, $breadth, seedVisited: [], topLevelBreadth: $breadth);

        foreach ($rootIds as $rootId) {
            $result[$rootId] = $this->assembleTree($rootId, $linksByParent, 1);
        }

        return $result;
    }

    /**
     * BFS over `links`. Returns parentId => [item...] where each item is
     * ['link' => flat link stdClass with `target` set, 'child_id' => string,
     *  'sort' => [richness, has_link_start, link_start, record_updated, name]].
     *
     * @param array     $frontier        ids to expand from
     * @param int       $depth           max levels
     * @param int       $breadth         max links per parent at deeper levels
     * @param array     $seedVisited     ids treated as already visited BEFORE level 1
     * @param int|null  $topLevelBreadth max links at level 1; null = unlimited
     *                                   (every direct link keeps a `target`, but
     *                                   only the top `breadth` recurse deeper)
     */
    protected function resolveLevels(array $frontier, int $depth, int $breadth, array $seedVisited, ?int $topLevelBreadth = null): array
    {
        $linksByParent = [];
        $visited = [];
        foreach ($seedVisited as $id) {
            $visited[$id] = true;
        }

        for ($level = 1; $level <= $depth; $level++) {
            if (empty($frontier) || count($frontier) > self::MAX_FRONTIER) {
                break;
            }

            $rawLinks = $this->fetchLinks($frontier);
            if (empty($rawLinks)) {
                break;
            }

            $frontierSet = [];
            foreach ($frontier as $id) {
                $frontierSet[$id] = true;
            }

            // Group raw links by their parent (the endpoint that is in the frontier).
            $levelItems = [];
            $childIds = [];
            foreach ($rawLinks as $link) {
                $parent = $this->parentEndpoint($link, $frontierSet);
                if ($parent === null) {
                    continue;
                }
                $child = $this->otherEndpoint($link, $parent);
                if ($child === $parent) {
                    continue; // self-link
                }
                if ($level > 1 && isset($visited[$child])) {
                    continue; // dedupe to lowest level
                }
                $levelItems[$parent][] = ['link' => $link, 'child_id' => $child];
                $childIds[$child] = true;
            }

            if (empty($levelItems)) {
                break;
            }

            // Batched target metadata + class resolution for every child id.
            $metadata = $this->fetchMetadata(array_keys($childIds));
            $classes = $this->fetchClasses(array_keys($childIds));
            $linkTypeNames = $this->fetchLinkTypeNames(array_map(fn ($l) => $l->link_type_id, $rawLinks));

            // Attach target + sort key, rank, breadth-cap per parent.
            $nextFrontier = [];
            foreach ($levelItems as $parent => $items) {
                foreach ($items as $i => $item) {
                    $childId = $item['child_id'];
                    $row = $metadata[$childId] ?? null;
                    if ($row === null) {
                        unset($levelItems[$parent][$i]); // invisible target → drop the link
                        continue;
                    }
                    $link = $item['link'];
                    $linkType = $linkTypeNames[$link->link_type_id] ?? null;
                    $link->link_name = $linkType['name'] ?? null;
                    $link->link_name_translations = $linkType['name_translations'] ?? null;
                    $item['link'] = $link;
                    $item['target'] = $this->buildTarget($row, $classes[$childId] ?? null);
                    $item['sort'] = $this->sortKey($link, $row);
                    $levelItems[$parent][$i] = $item;
                }
                $levelItems[$parent] = array_values($levelItems[$parent]);
                $levelItems[$parent] = $this->rank($levelItems[$parent]);

                // Level 1 may keep every direct link (with a `target`); at
                // deeper levels, cap per parent. Only the top `breadth` links
                // of each parent advance the frontier (recurse deeper).
                $cap = ($level === 1 && $topLevelBreadth === null) ? null : $breadth;

                // Mark the top `breadth` links as recursed so the assembler
                // emits `target.links` (possibly empty) for them — this lets
                // the frontend tell "resolved but empty" from "never loaded".
                foreach ($levelItems[$parent] as $idx => $item) {
                    if ($idx < $breadth) {
                        $levelItems[$parent][$idx]['recurse'] = true;
                        $nextFrontier[] = $item['child_id'];
                    }
                }

                $kept = $cap === null ? $levelItems[$parent] : array_slice($levelItems[$parent], 0, $cap);

                foreach ($kept as $item) {
                    $visited[$item['child_id']] = true; // dedupe to lowest level
                    $linksByParent[$parent][] = $item;
                }
            }

            $frontier = $nextFrontier;
        }

        return $linksByParent;
    }

    /**
     * Recursively build the nested JSON tree from the BFS result.
     */
    protected function assembleTree(string $parentId, array $linksByParent, int $remainingDepth): array
    {
        $result = [];
        foreach ($linksByParent[$parentId] ?? [] as $item) {
            $link = $item['link'];
            $target = $item['target'];

            $node = [
                'link_id'        => $link->link_id,
                'one_thing_id'   => $link->one_thing_id,
                'other_thing_id' => $link->other_thing_id,
                'link_type_id'   => $link->link_type_id,
                'description'    => $link->description ?? null,
                'public'         => $link->public !== null ? (bool) $link->public : null,
                'link_start'     => $link->link_start ?? null,
                'link_end'       => $link->link_end ?? null,
                'name'                    => $target['name'] ?? null,
                'name_translations'        => $target['name_translations'] ?? null,
                'link_name'               => $link->link_name ?? null,
                'link_name_translations'  => $link->link_name_translations ?? null,
                'target'                  => $target,
            ];

            if ($remainingDepth > 1) {
                $childId = $item['child_id'];
                // Recursed links always carry `target.links` (an empty array
                // when the child has no kept links); links beyond the breadth
                // cap are never recursed, so they have no `target.links` key.
                if (!empty($item['recurse'])) {
                    $node['target']['links'] = $this->assembleTree($childId, $linksByParent, $remainingDepth - 1);
                }
            }

            $result[] = $node;
        }

        return $result;
    }

    /**
     * One batched link query for the current frontier. Undirected: a link is
     * returned if EITHER endpoint is in the frontier.
     */
    protected function fetchLinks(array $frontier): array
    {
        return DB::table('links')
            ->select('links.*')
            ->where(function ($q) use ($frontier) {
                $q->whereIn('links.one_thing_id', $frontier)
                    ->orWhereIn('links.other_thing_id', $frontier);
            })
            ->where('links.deleted', false)
            ->whereNot('links.link_type_id', UUID::LINK_TO_CLASS) // class membership is not a relation
            ->get()
            ->toArray();
    }

    /**
     * Batched target thing metadata for a level, visibility-filtered.
     *
     * @return array [thing_id => row]
     */
    protected function fetchMetadata(array $childIds): array
    {
        if (empty($childIds)) {
            return [];
        }

        $rows = DB::table('things as t')
            ->select(
                't.thing_id',
                't.name',
                't.name_translations',
                't.type',
                't.public',
                't.description',
                't.data',
                't.record_updated'
            )
            ->whereIn('t.thing_id', $childIds)
            ->where('t.deleted', false)
            ->where($this->visibleScope('t'))
            ->get();

        $byId = [];
        foreach ($rows as $row) {
            // Decode jsonb once so buildTarget/sortKey reuse the array instead
            // of each decoding the raw string again.
            if (is_string($row->data)) {
                $row->data = json_decode($row->data, true);
            }
            $byId[$row->thing_id] = $row;
        }

        return $byId;
    }

    /**
     * Batched class resolution for a set of things via LINK_TO_CLASS links.
     *
     * @return array [thing_id => ['thing_id' => classId, 'name' => className]]
     */
    protected function fetchClasses(array $childIds): array
    {
        if (empty($childIds)) {
            return [];
        }

        $rows = DB::table('links as l')
            ->select('l.one_thing_id', 'c.thing_id as class_id', 'c.name as class_name', 'c.name_translations as class_name_translations')
            ->join('things as c', 'c.thing_id', '=', 'l.other_thing_id')
            ->where('l.link_type_id', UUID::LINK_TO_CLASS)
            ->whereIn('l.one_thing_id', $childIds)
            ->where('l.deleted', false)
            ->where('c.deleted', false)
            ->get();

        $classes = [];
        foreach ($rows as $row) {
            $translations = $row->class_name_translations ?? null;
            if (is_string($translations)) {
                $translations = json_decode($translations, true) ?: null;
            }
            $classes[$row->one_thing_id] = [
                'thing_id'          => $row->class_id,
                'name'              => $row->class_name,
                'name_translations' => $translations,
            ];
        }

        return $classes;
    }

    /**
     * @return array [link_type_id => ['name' => string|null, 'name_translations' => array|null]]
     */
    protected function fetchLinkTypeNames(array $linkTypeIds): array
    {
        $linkTypeIds = array_values(array_unique(array_filter($linkTypeIds)));
        if (empty($linkTypeIds)) {
            return [];
        }

        $rows = DB::table('things')
            ->select('thing_id', 'name', 'name_translations')
            ->whereIn('thing_id', $linkTypeIds)
            ->where('deleted', false)
            ->get();

        $result = [];
        foreach ($rows as $row) {
            $translations = $row->name_translations ?? null;
            if (is_string($translations)) {
                $translations = json_decode($translations, true) ?: null;
            }
            $result[$row->thing_id] = [
                'name'              => $row->name ?? null,
                'name_translations' => $translations,
            ];
        }

        return $result;
    }

    /**
     * Build the public `target` object for a resolved child thing.
     */
    protected function buildTarget($row, ?array $class): array
    {
        $nameTranslations = $row->name_translations ?? null;
        if (is_string($nameTranslations)) {
            $nameTranslations = json_decode($nameTranslations, true) ?: null;
        }

        $description = $row->description ?? null;
        if (is_string($description) && mb_strlen($description) > self::TARGET_DESCRIPTION_PREVIEW) {
            $description = mb_substr($description, 0, self::TARGET_DESCRIPTION_PREVIEW) . '…';
        }

        $data = $row->data ?? null;
        if (is_string($data)) {
            $data = json_decode($data, true);
        }

        return [
            'thing_id'          => $row->thing_id,
            'name'              => $row->name ?? null,
            'name_translations' => $nameTranslations,
            'type'              => $row->type !== null ? (int) $row->type : null,
            'class'             => $class,
            'public'            => $row->public !== null ? (bool) $row->public : null,
            'description'       => $description,
            'geo'               => GeoProperties::extract(is_array($data) ? ($data['properties'] ?? null) : null),
        ];
    }

    /**
     * Sort tuple for the relevance ordering:
     * [richness desc, has link_start desc, link_start desc, record_updated desc, name asc]
     */
    protected function sortKey($link, $row): array
    {
        $data = $row->data ?? null;
        if (is_string($data)) {
            $data = json_decode($data, true);
        }
        $rich = (!empty($row->description) || !empty($data)) ? 1 : 0;

        return [
            $rich,
            $link->link_start !== null ? 1 : 0,
            $link->link_start !== null ? (float) $link->link_start : 0.0,
            (string) ($row->record_updated ?? ''),
            (string) ($row->name ?? ''),
        ];
    }

    protected function rank(array $items): array
    {
        usort($items, function ($a, $b) {
            $sa = $a['sort'];
            $sb = $b['sort'];
            if ($sa[0] !== $sb[0]) {
                return $sb[0] <=> $sa[0];
            }
            if ($sa[1] !== $sb[1]) {
                return $sb[1] <=> $sa[1];
            }
            if ($sa[2] !== $sb[2]) {
                return $sb[2] <=> $sa[2];
            }
            if ($sa[3] !== $sb[3]) {
                return $sb[3] <=> $sa[3];
            }
            return strcmp($sa[4], $sb[4]);
        });

        return $items;
    }

    /**
     * The endpoint of an undirected link that belongs to the current frontier.
     */
    protected function parentEndpoint($link, array $frontierSet): ?string
    {
        if (isset($frontierSet[$link->one_thing_id])) {
            return $link->one_thing_id;
        }
        if (isset($frontierSet[$link->other_thing_id])) {
            return $link->other_thing_id;
        }

        return null;
    }

    /**
     * The endpoint of an undirected link that is NOT the current parent.
     */
    protected function otherEndpoint($link, string $parentId): string
    {
        return $link->one_thing_id === $parentId ? $link->other_thing_id : $link->one_thing_id;
    }

    /**
     * Alias-aware visibility closure (mirrors ApiController::visibleObjectsScope):
     * public (or null), the user's own, or group-accessible. Cannot use the
     * `auth()` macro on aliased tables — it hardcodes the bare `things` alias.
     */
    protected function visibleScope(string $alias): \Closure
    {
        return function ($query) use ($alias) {
            $query->where($alias . '.public', 1)
                ->orWhereNull($alias . '.public');

            if (Auth::check()) {
                $userThingId = Auth::user()->thing_id;

                // Objects the user owns
                $query->orWhere($alias . '.owner', $userThingId);

                // Group-based access: visible via GROUP_READ_ACCESS links to
                // a group the user belongs to (BELONGS_TO_USER_GROUP)
                $query->orWhereIn($alias . '.thing_id', function ($sub) use ($userThingId) {
                    $sub->select('gl.one_thing_id')
                        ->from('links as gl')
                        ->join('links as ug', 'ug.other_thing_id', '=', 'gl.other_thing_id')
                        ->where('gl.link_type_id', UUID::GROUP_READ_ACCESS)
                        ->where('ug.link_type_id', UUID::BELONGS_TO_USER_GROUP)
                        ->where('ug.one_thing_id', $userThingId);
                });
            }
        };
    }
}
