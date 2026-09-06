// resources/js/utils/graphFold.js
//
// Pure helpers for packing many same-type / same-class links of one object
// into a single "folder" node that can be unfolded. Used by the Graph tab.
//
// The rule (thresholds adjustable from the UI):
//   an object's children are packed when BOTH
//     - the bucket (same link type or same class) has more than `typeAbove`
//       / `classAbove` children, AND
//     - the object has more than `clutter` children in total,
//   so small graphs keep their items visible.

/** Stable id for the folder node that packs one object's same-kind children. */
export const makeGroupKey = (parentId, kind, category) =>
    `grp:${parentId}:${kind}:${category}`

/**
 * Decide which of an object's children should be packed into folders and in
 * what order they are drawn afterwards.
 *
 * @param {Array} children related subtree nodes of one object
 * @param {Object} o
 *   ownerId          id of the object these children hang off
 *   byType/byClass   enable the respective grouping axis
 *   typeAbove        pack a same-type bucket when it has MORE than this many
 *   classAbove       same for a same-class bucket
 *   clutter          pack buckets only when the object has MORE than this many
 *                    children overall
 *   excludeClass     class ids never packed (e.g. HUMAN)
 *   typeOf(c)        link-type key of a child (null → never packed by type)
 *   classOf(c)       class key of a child (null → never packed by class)
 *   typeLabel(c)     display label for a child's link type
 *   classLabel(c)    display label for a child's class
 * @returns {Array} entries in original child order:
 *   {type:'child', child}
 *   {type:'folder', key, kind, category, label, items}
 */
export function foldChildren(children, o = {}) {
    const {
        ownerId = '',
        byType = true,
        byClass = true,
        typeAbove = 4,
        classAbove = 4,
        clutter = 8,
        excludeClass = [],
        typeOf = () => null,
        classOf = () => null,
        typeLabel = () => '',
        classLabel = () => '',
    } = o

    const list = children || []
    const total = list.length
    const canPack = total > clutter
    const exclude = new Set(excludeClass)

    // child index → folder entry
    const folderOf = new Map()
    const packed = new Set()

    // 1) Link-type buckets.
    if (byType && canPack) {
        const buckets = new Map()
        for (const [i, c] of list.entries()) {
            const t = typeOf(c)
            if (t == null || t === '') continue
            if (!buckets.has(t)) buckets.set(t, [])
            buckets.get(t).push(i)
        }
        for (const [t, indexes] of buckets) {
            if (indexes.length <= typeAbove) continue
            const items = indexes.map((i) => list[i])
            const entry = {
                type: 'folder',
                key: makeGroupKey(ownerId, 'type', t),
                kind: 'type',
                category: t,
                label: typeLabel(items[0]) || '',
                items,
            }
            for (const i of indexes) {
                folderOf.set(i, entry)
                packed.add(i)
            }
        }
    }

    // 2) Same-class buckets for what link-type packing left behind.
    if (byClass && canPack) {
        const buckets = new Map()
        for (const [i, c] of list.entries()) {
            if (packed.has(i)) continue
            const k = classOf(c)
            if (k == null || k === '' || exclude.has(k)) continue
            if (!buckets.has(k)) buckets.set(k, [])
            buckets.get(k).push(i)
        }
        for (const [k, indexes] of buckets) {
            if (indexes.length <= classAbove) continue
            const items = indexes.map((i) => list[i])
            const entry = {
                type: 'folder',
                key: makeGroupKey(ownerId, 'class', k),
                kind: 'class',
                category: k,
                label: classLabel(items[0]) || '',
                items,
            }
            for (const i of indexes) {
                folderOf.set(i, entry)
                packed.add(i)
            }
        }
    }

    // Emit entries in the original order; each folder appears where its first
    // packed child stood.
    const entries = []
    const emitted = new Set()
    for (const [i, c] of list.entries()) {
        const folder = folderOf.get(i)
        if (folder) {
            if (!emitted.has(folder.key)) {
                emitted.add(folder.key)
                entries.push(folder)
            }
        } else {
            entries.push({ type: 'child', child: c })
        }
    }
    return entries
}
