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
 * 'checked'   → node and its whole subtree are in the set
 * 'semi'      → some (but not all) of node+subtree is in the set
 * 'unchecked' → nothing in the subtree is selected
 *
 * @param {string} id
 * @param {Array} childrenNodes - the node's children
 * @param {Array} checkedItems - flat set of selected class ids
 * @returns {'checked'|'semi'|'unchecked'}
 */
export function nodeSelectionState(id, childrenNodes, checkedItems) {
  const subtree = [id, ...collectSubtreeIds(childrenNodes)];
  const checked = subtree.reduce((n, i) => n + (checkedItems.includes(i) ? 1 : 0), 0);
  if (checked === 0) return 'unchecked';
  if (checked === subtree.length) return 'checked';
  return 'semi';
}
