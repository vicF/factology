// resources/js/utils/classTree.js
//
// Pure helpers for the recursive class tree selection.
// `checkedItems` (search store) is a flat set of selected class UUIDs.
// Checking a node adds the node + its whole subtree to the set; the
// tri-state of any node is derived from how much of its subtree is in the set.

/**
 * Collect descendant ids (node itself excluded) depth-first from child nodes.
 *
 * @param {Array} nodes - children of the node in question (each { id, nodes })
 * @param {Array} acc - accumulator (internal)
 * @returns {Array<string>} flat list of descendant ids
 */
export function collectSubtreeIds(nodes, acc = []) {
  for (const n of nodes || []) {
    acc.push(n.id);
    collectSubtreeIds(n.nodes, acc);
  }
  return acc;
}

/**
 * Tri-state for one node given the checkedItems flat set.
 * For a node WITH children the state is driven by its children:
 *   'checked'   → all descendants are selected (the node itself may or may
 *                 not be in the set — a fully-covered parent shows checked)
 *   'semi'      → some (but not all) descendants are selected
 *   'unchecked' → no descendant is selected
 * A leaf node falls back to its own membership.
 *
 * @param {string} id
 * @param {Array} childrenNodes - the node's children
 * @param {Array} checkedItems - flat set of selected class ids
 * @returns {'checked'|'semi'|'unchecked'}
 */
export function nodeSelectionState(id, childrenNodes, checkedItems) {
  const descendants = collectSubtreeIds(childrenNodes);
  const descCount = descendants.reduce((n, i) => n + (checkedItems.includes(i) ? 1 : 0), 0);
  if (descendants.length === 0) {
    return checkedItems.includes(id) ? 'checked' : 'unchecked';
  }
  if (descCount === descendants.length) return 'checked';
  if (descCount === 0) return 'unchecked';
  return 'semi';
}

/**
 * Remove internal nodes that no longer have any selected descendant, walking
 * bottom-up so the pruning propagates all the way to the tree root.
 *
 * Invariant: an internal node may stay in the set only while at least one of
 * its (recursively) kept descendants is selected — otherwise the user sees it
 * as unchecked but its own objects would still be filtered in.
 *
 * Leaves are never pruned here; they are only removed by an explicit uncheck.
 *
 * @param {Array} treeNodes - the whole tree (root nodes), e.g. objectsStore.rootNodes
 * @param {Array} checkedItems - flat set of selected class ids
 * @returns {Array} pruned flat set
 */
export function pruneEmptyNodes(treeNodes, checkedItems) {
  const remove = new Set();
  // Returns true when this subtree contains a node that stays selected after pruning.
  const subtreeHasKept = (node) => {
    const children = node.nodes || [];
    if (children.length === 0) {
      return checkedItems.includes(node.id);
    }
    const anyDescKept = children.some(subtreeHasKept);
    if (checkedItems.includes(node.id) && !anyDescKept) {
      remove.add(node.id);
    }
    return anyDescKept;
  };
  (treeNodes || []).forEach(subtreeHasKept);
  return checkedItems.filter(id => !remove.has(id));
}
