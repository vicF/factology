// resources/js/utils/relatedFilters.js
//
// Pure helpers for the object-page "related objects" filter (the panel that
// replaces the search classes tree while viewing an object). The panel lists
// the classes of related objects and the link types that connect them; checking
// a node restricts the Details list and the Graph to the matching objects and
// relations. All functions here are pure so they can be unit-tested and shared
// between the sidebar, Object.vue and Graph.vue (online and offline).

// The Everything root wraps the class/link-type taxonomy in tree responses.
// The frontend renders its children directly (same convention as ClassTree).
export const EVERYTHING_ID = '939cd822-9e23-450c-8c5e-c23f67cca792';
export const EVERYTHING_NAME = 'Everything';

/**
 * Class ids an object node belongs to. Accepts either shape the API returns:
 * a plural `classes` array [{thing_id}] (nested `target`s) or a singular
 * `class` object {thing_id} (the root object). Falls back to null when the
 * node carries no class info (rare, e.g. structural targets).
 *
 * @param {object|null} node
 * @returns {string[]}
 */
export function nodeClassIds(node) {
    if (!node) return [];
    if (Array.isArray(node.classes)) {
        const ids = node.classes
            .map((c) => (c && c.thing_id) || null)
            .filter(Boolean);
        if (ids.length) return ids;
    }
    if (node.class && node.class.thing_id) return [node.class.thing_id];
    return [];
}

/**
 * Whether one link row passes the active filters (inclusion semantics — the
 * checked ids are exactly what is shown):
 *  - link types: when `linkTypeIds` is provided (non-null) the link's type
 *    must be one of them (an empty array = no link type is allowed);
 *  - classes: when `classIds` is provided (non-null) the link's target must
 *    belong to one of those classes (an empty array = no object class is
 *    allowed).
 * Passing `null`/`undefined` for a dimension means "no restriction" — used
 * before the filter panel has published its first (all-checked) selection.
 *
 * @param {object} link  link row with `link_type_id` and (usually) `target`
 * @param {string[]|null} classIds
 * @param {string[]|null} linkTypeIds
 * @returns {boolean}
 */
export function linkPassesFilter(link, classIds, linkTypeIds) {
    if (!link) return false;
    if (linkTypeIds != null && !linkTypeIds.includes(link.link_type_id)) {
        return false;
    }
    if (classIds != null) {
        const ids = nodeClassIds(link.target);
        if (!ids.some((id) => classIds.includes(id))) return false;
    }
    return true;
}

/**
 * Filter an array of link rows at ONE level (does not descend into
 * `target.links` — callers recurse separately when they need deep filtering).
 * Returns the original array reference when no filter is active (both
 * dimensions null) so downstream code can cheaply detect "nothing changed".
 *
 * @param {Array|undefined} links
 * @param {string[]|null} classIds
 * @param {string[]|null} linkTypeIds
 * @returns {Array}
 */
export function filterLinks(links, classIds, linkTypeIds) {
    if (!Array.isArray(links)) return [];
    if (classIds == null && linkTypeIds == null) {
        return links;
    }
    return links.filter((l) => linkPassesFilter(l, classIds, linkTypeIds));
}

/**
 * Recursive variant of filterLinks: prunes a whole nested related-objects
 * subtree to the rows that pass the filter. A dropped row takes its nested
 * children with it. Rows that survive keep their original object references;
 * only `target.links` arrays may be replaced (shallow copies of the row and
 * its target) so the source object is never mutated.
 *
 * @param {Array|undefined} links
 * @param {string[]|null} classIds
 * @param {string[]|null} linkTypeIds
 * @returns {Array}
 */
export function filterLinksDeep(links, classIds, linkTypeIds) {
    if (!Array.isArray(links)) return [];
    if (classIds == null && linkTypeIds == null) {
        return links;
    }
    const out = [];
    for (const link of links) {
        if (!linkPassesFilter(link, classIds, linkTypeIds)) continue;
        let kept = link;
        const nested = link.target && Array.isArray(link.target.links)
            ? filterLinksDeep(link.target.links, classIds, linkTypeIds)
            : null;
        if (nested && nested !== link.target.links) {
            kept = { ...link, target: { ...link.target, links: nested } };
        }
        out.push(kept);
    }
    return out;
}

/**
 * Walk a nested object payload (as returned by GET /object/{id}?depth=N) and
 * collect everything the filter panel needs:
 *   - the class ids used by the object and all its related targets,
 *   - the link type ids used between them,
 *   - per-class object counts and per-link-type link counts.
 *
 * Counts follow the filter semantics: an object counts once for EACH of its
 * classes, because checking one of those classes alone keeps the object.
 *
 * @param {object|null} root
 * @returns {{classIds:Set<string>, linkTypeIds:Set<string>,
 *           classCounts:Map<string,number>, linkTypeCounts:Map<string,number>}}
 */
export function collectNeighborhoodStats(root) {
    const classIds = new Set();
    const linkTypeIds = new Set();
    const classCounts = new Map();
    const linkTypeCounts = new Map();

    const bump = (map, id) => map.set(id, (map.get(id) || 0) + 1);
    const addObject = (node) => {
        for (const id of nodeClassIds(node)) {
            classIds.add(id);
            bump(classCounts, id);
        }
    };
    if (root) addObject(root);

    const walk = (links) => {
        if (!Array.isArray(links)) return;
        for (const link of links) {
            if (link && link.link_type_id) {
                linkTypeIds.add(link.link_type_id);
                bump(linkTypeCounts, link.link_type_id);
            }
            if (link && link.target) {
                addObject(link.target);
                if (Array.isArray(link.target.links)) {
                    walk(link.target.links);
                }
            }
        }
    };
    if (root) walk(root.links);

    return { classIds, linkTypeIds, classCounts, linkTypeCounts };
}

/**
 * Reduce the taxonomy tree (objectsStore.rootNodes) to the branch paths that
 * lead to `usedIds`. A node is kept when its own id is used OR when at least
 * one descendant is kept; nodes are shallow copies with `nodes` replaced, so
 * the store tree is not mutated.
 *
 * @param {Array} roots      taxonomy roots from the objects store
 * @param {Set<string>} usedIds
 * @returns {Array}
 */
export function pruneTaxonomy(roots, usedIds) {
    const used = (id) => !!usedIds && usedIds.has(id);
    const pruneNode = (node) => {
        if (!node) return null;
        const children = (node.nodes || []).map(pruneNode).filter(Boolean);
        if (!used(node.id) && children.length === 0) return null;
        return { ...node, nodes: children };
    };
    return (roots || []).map(pruneNode).filter(Boolean);
}

/**
 * Tree responses wrap everything under an "Everything" root; the UI renders
 * that node's children as the top level (same convention as ClassTree.vue).
 * Returns the roots unchanged when no Everything wrapper is present.
 *
 * @param {Array} roots
 * @returns {Array}
 */
export function topLevelTaxonomyNodes(roots) {
    const list = roots || [];
    if (list.length === 1) {
        const only = list[0];
        if (only && (only.id === EVERYTHING_ID || only.name === EVERYTHING_NAME)) {
            return only.nodes || [];
        }
    }
    return list;
}
