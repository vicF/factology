// resources/js/utils/graphAgeBias.js
//
// Pure helper used by the Graph tab AFTER relation-graph has auto-laid the
// graph out (layoutName 'center'). The library arranges purely by link
// structure, so a father and his child can end up at any height. This module
// nudges the resulting node positions so that:
//
//   - older objects (smaller `start` date) sit higher than younger ones;
//   - for explicit parent/child links (FATHER/MOTHER) the older endpoint is
//     guaranteed to end up above the younger one (they are swapped when not).
//
// It mutates `node.x/y` on the passed nodes and is fully deterministic, so the
// math is unit-testable without a live relation-graph instance.

import { UUID } from '@/constants/uuid'

/** Canonical start value of a node payload (''/null = unknown). */
export function dateKeyOf(node) {
    const data = (node && node.data) || {}
    const v = data.start ?? data.link_start ?? null
    return v == null || v === '' ? null : String(v)
}

/**
 * @param {Array}  nodes  auto-laid-out graph nodes, each {id, data, x, y}
 * @param {Array}  lines  graph lines, each {from, to, linkType?}
 * @param {Object} [opts]
 *   step         vertical shift per date rank (default 60)
 *   maxShift     clamp so the auto layout is not distorted (default 200)
 *   minGap       min wanted vertical distance parent→child (default 40)
 *   parentChildTypes  link types treated as parent→child relations
 */
export function applyAgeBias(nodes, lines, opts = {}) {
    const step = opts.step ?? 60
    const maxShift = opts.maxShift ?? 200
    const minGap = opts.minGap ?? 40
    const typeSet = new Set(opts.parentChildTypes || [UUID.FATHER, UUID.MOTHER])
    if (!nodes.length) return

    // 1) Date-rank bias: older objects get a proportional upward shift so they
    //    tend to sit above younger ones, without destroying the library layout.
    const dated = nodes.filter((n) => dateKeyOf(n) != null)
    dated.sort((a, b) =>
        dateKeyOf(a).localeCompare(dateKeyOf(b)) || String(a.id).localeCompare(String(b.id)))
    const median = (dated.length - 1) / 2
    dated.forEach((node, i) => {
        let shift = (i - median) * step
        shift = Math.max(-maxShift, Math.min(maxShift, shift))
        node.y = (node.y ?? 0) + shift
    })

    // 2) Guarantee the parent of every parent/child link is above the child.
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const relevant = (lines || []).filter((l) => l && typeSet.has(l.linkType))
    for (let round = 0; round < 4 && relevant.length; round++) {
        let changed = false
        for (const line of relevant) {
            const a = byId.get(line.from)
            const b = byId.get(line.to)
            if (!a || !b) continue
            const ka = dateKeyOf(a)
            const kb = dateKeyOf(b)
            if (ka == null || kb == null || ka === kb) continue
            const [parent, child] = ka < kb ? [a, b] : [b, a]
            if (child.y >= parent.y + minGap) continue
            // Swap whole positions: keeps the parent above its child.
            ;[parent.x, child.x] = [child.x, parent.x]
            ;[parent.y, child.y] = [child.y, parent.y]
            changed = true
        }
        if (!changed) break
    }
}
