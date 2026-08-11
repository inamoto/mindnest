import Dexie, { type Table } from 'dexie'
import type { MindMapDocument } from './types'

class MindMapDatabase extends Dexie {
  mindMaps!: Table<MindMapDocument, string>

  constructor() {
    super('hierarchicalMindMap')

    this.version(1).stores({
      mindMaps: 'id, name, updatedAt',
    })
  }
}

export const db = new MindMapDatabase()

export const ROOT_MAP_ID = 'root-map'

export function createMindMapDocument(id: string, name: string): MindMapDocument {
  const now = Date.now()

  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    data: {
      meta: { name },
      format: 'node_tree',
      data: {
        id: `${id}-root`,
        topic: name,
        memo: '',
        children: [],
      },
    },
  }
}

export async function ensureRootMindMap() {
  const existing = await db.mindMaps.get(ROOT_MAP_ID)

  if (existing) {
    if (existing.name === 'My MindMap') {
      const updatedRoot = {
        ...existing,
        name: 'MindNest',
        data: {
          ...existing.data,
          meta: {
            ...existing.data.meta,
            name: 'MindNest',
          },
        },
      }

      await db.mindMaps.put(updatedRoot)
      return updatedRoot
    }

    return existing
  }

  const root = createMindMapDocument(ROOT_MAP_ID, 'MindNest')
  await db.mindMaps.put(root)
  return root
}

export async function saveMindMap(document: MindMapDocument) {
  await db.mindMaps.put({
    ...document,
    updatedAt: Date.now(),
  })
}
