export interface MindMapNodeData {
  id: string
  topic: string
  memo?: string
  childMindMapId?: string
  'background-color'?: string
  'foreground-color'?: string
  children?: MindMapNodeData[]
}

export interface JsMindData {
  meta: {
    name: string
  }
  format: 'node_tree'
  data: MindMapNodeData
}

export interface MindMapDocument {
  id: string
  name: string
  data: JsMindData
  createdAt: number
  updatedAt: number
}
