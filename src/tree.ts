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

export function flattenNodes(root: MindMapNodeData): MindMapNodeData[] {
  return [root, ...(root.children ?? []).flatMap(flattenNodes)]
}

export function collectChildMindMapIds(node: MindMapNodeData): string[] {
  return [
    ...(node.childMindMapId ? [node.childMindMapId] : []),
    ...(node.children ?? []).flatMap(collectChildMindMapIds),
  ]
}
