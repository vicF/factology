/**
 * Diffing between two rendered graph states so a toggle can update the
 * relation-graph instance incrementally (add/remove only what changed)
 * instead of tearing the whole canvas down with setJsonData.
 */

/** A stable "does this node need re-creating?" signature for a JsonNode. */
export const nodeSignature = (node) => {
    let dataSig = ''
    const d = node && node.data
    if (d != null) {
        try {
            dataSig = JSON.stringify(d)
        } catch {
            dataSig = String(d)
        }
    }
    return [
        node.id,
        node.text || '',
        node.width,
        node.height,
        node.nodeShape,
        node.color || '',
        dataSig,
    ].join('\u0001')
}

/**
 * Plan how to turn the previously rendered graph into the next one.
 *
 * @param {Map<string,string>} prevSigs   id → nodeSignature of what is shown now
 * @param {Array} nextNodes               JsonNodes to show next
 * @param {Map<string,{from,to}>} prevLines id → endpoints of lines shown now
 * @param {Array} nextLines               lines to show next
 * @returns {{removedNodeIds:string[], changedNodeIds:string[], addNodes:any[],
 *            addLines:any[], removeLineIds:string[]}}
 */
export const planGraphUpdate = (prevSigs, nextNodes, prevLines, nextLines) => {
    const nextIds = new Set(nextNodes.map((n) => n.id))
    const nextLineIds = new Set(nextLines.map((l) => l.id))

    const removedNodeIds = []
    for (const id of prevSigs.keys()) {
        if (!nextIds.has(id)) removedNodeIds.push(id)
    }

    const addNodes = []
    const changedNodeIds = []
    for (const n of nextNodes) {
        const sig = nodeSignature(n)
        const prev = prevSigs.get(n.id)
        if (prev === undefined) addNodes.push(n)
        else if (prev !== sig) changedNodeIds.push(n.id)
    }

    const touched = new Set(changedNodeIds)
    const addLineIds = new Set()
    for (const line of nextLines) {
        if (!prevLines.has(line.id)) {
            addLineIds.add(line.id)
        } else if (touched.has(line.from) || touched.has(line.to)) {
            // A changed node is removed and re-created, which takes its lines
            // with it — they must be re-added.
            addLineIds.add(line.id)
        }
    }

    const removeLineIds = []
    for (const [id, line] of prevLines) {
        if (!nextLineIds.has(id) && nextIds.has(line.from) && nextIds.has(line.to)) {
            // Endpoints stay visible but the line is gone (e.g. a child was
            // repacked into a folder) → remove the stale line explicitly.
            removeLineIds.push(id)
        }
    }

    return {
        removedNodeIds,
        changedNodeIds,
        addNodes,
        addLines: nextLines.filter((l) => addLineIds.has(l.id)),
        removeLineIds,
    }
}
