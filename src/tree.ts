import type { MindMapNodeData } from './types'

export function generateId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function findNode(root: MindMapNodeData, nodeId: string): MindMapNodeData | null {
  if (root.id === nodeId) {
    return root
  }

  for (const child of root.children ?? []) {
    const found = findNode(child, nodeId)

    if (found) {
      return found
    }
  }

  return null
}

export function updateNode(
  root: MindMapNodeData,
  nodeId: string,
  updater: (node: MindMapNodeData) => MindMapNodeData,
): MindMapNodeData {
  if (root.id === nodeId) {
    return updater(root)
  }

  return {
    ...root,
    children: root.children?.map((child) => updateNode(child, nodeId, updater)) ?? [],
  }
}

export function createNode(id = generateId('node')): MindMapNodeData {
  return {
    id,
    topic: 'New Node',
    memo: '',
    children: [],
  }
}

export function addChildNode(root: MindMapNodeData, parentId: string, newNode = createNode()): MindMapNodeData {
  return updateNode(root, parentId, (node) => ({
    ...node,
    children: [...(node.children ?? []), newNode],
  }))
}

export function cloneNodeWithNewIds(node: MindMapNodeData): MindMapNodeData {
  const { children, ...copyableNode } = node
  delete copyableNode.childMindMapId
  delete copyableNode.dependsOn

  return {
    ...copyableNode,
    id: generateId('node'),
    topic: `${node.topic} Copy`,
    children: children?.map(cloneNodeWithNewIds) ?? [],
  }
}

export function addSiblingNode(root: MindMapNodeData, nodeId: string, newNode = createNode()): MindMapNodeData {
  if (root.id === nodeId) {
    return addChildNode(root, nodeId, newNode)
  }

  return {
    ...root,
    children: root.children?.flatMap((child) => {
      if (child.id === nodeId) {
        return [child, newNode]
      }

      return [addSiblingNode(child, nodeId, newNode)]
    }) ?? [],
  }
}

export function deleteNode(root: MindMapNodeData, nodeId: string): MindMapNodeData {
  return {
    ...root,
    children: root.children
      ?.filter((child) => child.id !== nodeId)
      .map((child) => deleteNode(child, nodeId)) ?? [],
  }
}

export function replaceNode(root: MindMapNodeData, nodeId: string, replacementNode: MindMapNodeData): MindMapNodeData {
  if (root.id === nodeId) {
    return replacementNode
  }

  return {
    ...root,
    children: root.children?.map((child) => replaceNode(child, nodeId, replacementNode)) ?? [],
  }
}

export function isDescendantNode(root: MindMapNodeData, ancestorId: string, nodeId: string): boolean {
  const ancestor = findNode(root, ancestorId)

  if (!ancestor) {
    return false
  }

  return ancestor.children?.some((child) => child.id === nodeId || isDescendantNode(child, child.id, nodeId)) ?? false
}

export function moveNodeAsChild(root: MindMapNodeData, nodeId: string, parentId: string): MindMapNodeData {
  const node = findNode(root, nodeId)

  if (!node || node.id === root.id || node.id === parentId || isDescendantNode(root, nodeId, parentId)) {
    return root
  }

  return addChildNode(deleteNode(root, nodeId), parentId, node)
}

export function findParentNode(root: MindMapNodeData, nodeId: string): MindMapNodeData | null {
  for (const child of root.children ?? []) {
    if (child.id === nodeId) {
      return root
    }

    const found = findParentNode(child, nodeId)

    if (found) {
      return found
    }
  }

  return null
}

export function collectAncestorNodeIds(root: MindMapNodeData, nodeId: string): string[] {
  if (root.id === nodeId) {
    return []
  }

  for (const child of root.children ?? []) {
    if (child.id === nodeId) {
      return [root.id]
    }

    const childAncestors = collectAncestorNodeIds(child, nodeId)

    if (childAncestors.length > 0) {
      return [root.id, ...childAncestors]
    }
  }

  return []
}

export function expandAncestors(root: MindMapNodeData, nodeId: string): MindMapNodeData {
  const ancestorIds = new Set(collectAncestorNodeIds(root, nodeId))

  if (ancestorIds.size === 0) {
    return root
  }

  return updateNode(root, root.id, function expandNode(node): MindMapNodeData {
    return {
      ...node,
      expanded: ancestorIds.has(node.id) ? true : node.expanded,
      children: node.children?.map(expandNode) ?? [],
    }
  })
}

export function flattenNodes(root: MindMapNodeData): MindMapNodeData[] {
  return [root, ...(root.children ?? []).flatMap(flattenNodes)]
}

export function collectChildMindMapIds(node: MindMapNodeData): string[] {
  return [
    ...(node.childMindMapId ? [node.childMindMapId] : []),
    ...(node.children ?? []).flatMap(collectChildMindMapIds),
  ]
}
