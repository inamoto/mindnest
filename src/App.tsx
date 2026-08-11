import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'
import { createMindMapDocument, db, ensureRootMindMap, ROOT_MAP_ID, saveMindMap } from './db'
import { MindMapTree } from './components/MindMapTree'
import { NodeMemo } from './components/NodeMemo'
import type { MindMapDocument, MindMapNodeData } from './types'
import {
  addChildNode,
  addSiblingNode,
  collectChildMindMapIds,
  createNode,
  deleteNode,
  findNode,
  generateId,
  updateNode,
} from './tree'

type AppTheme = 'system' | 'light' | 'dark'

interface AppSettings {
  theme: AppTheme
  fontFamily: string
  mindMapFontSize: number
  memoFontSize: number
}

interface MindMapExportBundle {
  type: 'mindmap-bundle'
  version: 1
  exportedAt: number
  rootNode: MindMapNodeData
  maps: MindMapDocument[]
}

const SETTINGS_STORAGE_KEY = 'hierarchicalMindMap.settings'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  fontFamily: 'system-ui, \'Segoe UI\', Roboto, sans-serif',
  mindMapFontSize: 11,
  memoFontSize: 16,
}

const fontOptions = [
  { label: 'System', value: DEFAULT_SETTINGS.fontFamily },
  { label: 'Serif', value: 'Georgia, \'Times New Roman\', serif' },
  { label: 'Sans Serif', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Monospace', value: 'ui-monospace, Consolas, monospace' },
]

const nodeColorPalette = [
  { label: 'Blue', value: '#3d98d8' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Pink', value: '#db2777' },
  { label: 'Slate', value: '#475569' },
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#111827' },
]

function loadSettings(): AppSettings {
  try {
    const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY)

    if (!saved) {
      return DEFAULT_SETTINGS
    }

    const parsed = JSON.parse(saved) as Partial<AppSettings>

    return {
      theme: parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : DEFAULT_SETTINGS.theme,
      fontFamily: typeof parsed.fontFamily === 'string' && parsed.fontFamily ? parsed.fontFamily : DEFAULT_SETTINGS.fontFamily,
      mindMapFontSize: typeof parsed.mindMapFontSize === 'number' ? Math.min(24, Math.max(8, parsed.mindMapFontSize)) : DEFAULT_SETTINGS.mindMapFontSize,
      memoFontSize: typeof parsed.memoFontSize === 'number' ? Math.min(24, Math.max(12, parsed.memoFontSize)) : DEFAULT_SETTINGS.memoFontSize,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function App() {
  const [currentMapId, setCurrentMapId] = useState(ROOT_MAP_ID)
  const [document, setDocument] = useState<MindMapDocument | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<MindMapDocument[]>([])
  const [status, setStatus] = useState('Loading...')
  const [memoFocusRequest, setMemoFocusRequest] = useState(0)
  const [memoPreviewRequest, setMemoPreviewRequest] = useState(0)
  const [mindMapFocusRequest, setMindMapFocusRequest] = useState(0)
  const [pendingEditNodeId, setPendingEditNodeId] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<MindMapDocument[]>([])
  const [redoStack, setRedoStack] = useState<MindMapDocument[]>([])
  const [isMemoVisible, setIsMemoVisible] = useState(true)
  const [memoPanelWidth, setMemoPanelWidth] = useState(36)
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const appShellRef = useRef<HTMLElement | null>(null)
  const workspaceRef = useRef<HTMLElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('Loading...')
      const root = await ensureRootMindMap()
      const nextDocument = currentMapId === ROOT_MAP_ID ? root : await db.mindMaps.get(currentMapId)

      if (!cancelled && nextDocument) {
        setDocument(nextDocument)
        setSelectedNodeId(nextDocument.data.data.id)
        setUndoStack([])
        setRedoStack([])
        setPendingEditNodeId(null)
        setStatus('Saved')
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [currentMapId])

  useEffect(() => {
    if (!document) {
      return
    }

    const timeoutId = window.setTimeout(async () => {
      await saveMindMap(document)
      setStatus('Saved')
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [document])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      appShellRef.current?.focus()
      setMindMapFocusRequest((request) => request + 1)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [currentMapId])

  const selectedNode = useMemo(() => {
    if (!document || !selectedNodeId) {
      return null
    }

    return findNode(document.data.data, selectedNodeId)
  }, [document, selectedNodeId])

  const contextMenuNode = useMemo(() => {
    if (!document || !contextMenu) {
      return null
    }

    return findNode(document.data.data, contextMenu.nodeId)
  }, [contextMenu, document])

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const appStyle = useMemo(() => ({
    '--app-font': settings.fontFamily,
    '--mindmap-font-size': `${settings.mindMapFontSize}px`,
    '--memo-font-size': `${settings.memoFontSize}px`,
  }) as CSSProperties, [settings])

  function updateSettings(nextSettings: Partial<AppSettings>) {
    setSettings((current) => ({ ...current, ...nextSettings }))
  }

  function resetSettings() {
    setSettings(DEFAULT_SETTINGS)
  }

  function updateCurrentRoot(updater: (root: MindMapNodeData) => MindMapNodeData) {
    setDocument((current) => {
      if (!current) {
        return current
      }

      setUndoStack((items) => [...items, current])
      setRedoStack([])

      return {
        ...current,
        data: {
          ...current.data,
          data: updater(current.data.data),
        },
      }
    })
  }

  function handleUndo() {
    if (!document) {
      return
    }

    const previous = undoStack.at(-1)

    if (!previous) {
      return
    }

    setRedoStack((items) => [...items, document])
    setUndoStack((items) => items.slice(0, -1))
    setSelectedNodeId((selectedId) => findNode(previous.data.data, selectedId ?? '')?.id ?? previous.data.data.id)
    setDocument(previous)
  }

  function handleRedo() {
    if (!document) {
      return
    }

    const next = redoStack.at(-1)

    if (!next) {
      return
    }

    setUndoStack((items) => [...items, document])
    setRedoStack((items) => items.slice(0, -1))
    setSelectedNodeId((selectedId) => findNode(next.data.data, selectedId ?? '')?.id ?? next.data.data.id)
    setDocument(next)
  }

  function handleAddChildNode(nodeId = selectedNodeId) {
    if (!nodeId) {
      return
    }

    const newNode = createNode()
    updateCurrentRoot((root) => addChildNode(root, nodeId, newNode))
    setSelectedNodeId(newNode.id)
    setPendingEditNodeId(newNode.id)
  }

  function handleAddSiblingNode(nodeId = selectedNodeId) {
    if (!nodeId) {
      return
    }

    const newNode = createNode()
    updateCurrentRoot((root) => addSiblingNode(root, nodeId, newNode))
    setSelectedNodeId(newNode.id)
    setPendingEditNodeId(newNode.id)
  }

  function handleMindMapChange(nextData: MindMapDocument['data'], nextSelectedNodeId?: string) {
    setDocument((current) => {
      if (!current) {
        return current
      }

      setUndoStack((items) => [...items, current])
      setRedoStack([])

      return {
        ...current,
        data: nextData,
      }
    })

    if (nextSelectedNodeId && findNode(nextData.data, nextSelectedNodeId)) {
      setSelectedNodeId(nextSelectedNodeId)
    }

    setPendingEditNodeId(null)
  }

  function handleDeleteNode(node = selectedNode) {
    if (!document || !node || node.id === document.data.data.id) {
      return
    }

    if (node.childMindMapId && !window.confirm(`Delete "${node.topic}"? This node has a child MindMap.`)) {
      return
    }

    updateCurrentRoot((root) => deleteNode(root, node.id))
    setSelectedNodeId(document.data.data.id)
  }

  async function handleCreateChildMindMap(node = selectedNode) {
    if (!node || node.childMindMapId) {
      return
    }

    const childMapId = generateId('map')
    const childDocument = createMindMapDocument(childMapId, node.topic)
    await db.mindMaps.put(childDocument)

    updateCurrentRoot((root) =>
      updateNode(root, node.id, (currentNode) => ({
        ...currentNode,
        childMindMapId: childMapId,
      })),
    )
  }

  async function handleDeleteChildMindMap(node = selectedNode) {
    if (!node?.childMindMapId) {
      return
    }

    if (!window.confirm(`Delete child MindMap for "${node.topic}"?`)) {
      return
    }

    const childDocument = await db.mindMaps.get(node.childMindMapId)
    const descendantIds = childDocument ? collectChildMindMapIds(childDocument.data.data) : []
    await db.mindMaps.bulkDelete([node.childMindMapId, ...descendantIds])

    updateCurrentRoot((root) =>
      updateNode(root, node.id, (currentNode) => ({
        ...currentNode,
        childMindMapId: undefined,
      })),
    )
  }

  async function handleOpenChildMindMap(node = selectedNode) {
    if (!node?.childMindMapId || !document) {
      return
    }

    const childDocument = await db.mindMaps.get(node.childMindMapId)

    if (!childDocument) {
      window.alert('Child MindMap was not found.')
      return
    }

    setBreadcrumb((items) => [...items, document])
    setCurrentMapId(childDocument.id)
  }

  function handleBack(index?: number) {
    setBreadcrumb((items) => {
      const targetIndex = index ?? items.length - 1
      const target = items[targetIndex]

      if (target) {
        setCurrentMapId(target.id)
      }

      return items.slice(0, targetIndex)
    })
  }

  function handleMemoChange(memo: string) {
    if (!selectedNodeId) {
      return
    }

    updateCurrentRoot((root) => updateNode(root, selectedNodeId, (node) => ({ ...node, memo })))
  }

  function handleNodeColorChange(nodeId: string, colors: Pick<MindMapNodeData, 'background-color' | 'foreground-color'>) {
    updateCurrentRoot((root) => updateNode(root, nodeId, (node) => ({ ...node, ...colors })))
  }

  function handleResetNodeColors(nodeId: string) {
    updateCurrentRoot((root) => updateNode(root, nodeId, (node) => ({
      ...node,
      'background-color': undefined,
      'foreground-color': undefined,
    })))
  }

  function handleMemoResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    const workspace = workspaceRef.current

    if (!workspace) {
      return
    }

    event.preventDefault()

    const workspaceRect = workspace.getBoundingClientRect()

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextWidth = ((workspaceRect.right - moveEvent.clientX) / workspaceRect.width) * 100
      setMemoPanelWidth(Math.min(70, Math.max(24, nextWidth)))
    }

    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  function cloneImportedNode(node: MindMapNodeData): MindMapNodeData {
    return {
      id: generateId('node'),
      topic: typeof node.topic === 'string' && node.topic.trim() ? node.topic : 'Imported Node',
      memo: typeof node.memo === 'string' ? node.memo : '',
      childMindMapId: typeof node.childMindMapId === 'string' ? node.childMindMapId : undefined,
      'background-color': typeof node['background-color'] === 'string' ? node['background-color'] : undefined,
      'foreground-color': typeof node['foreground-color'] === 'string' ? node['foreground-color'] : undefined,
      children: node.children?.map(cloneImportedNode) ?? [],
    }
  }

  function isMindMapExportBundle(value: unknown): value is MindMapExportBundle {
    if (!value || typeof value !== 'object') {
      return false
    }

    const bundle = value as Partial<MindMapExportBundle>

    return (
      bundle.type === 'mindmap-bundle' &&
      bundle.version === 1 &&
      !!bundle.rootNode &&
      typeof bundle.rootNode === 'object' &&
      typeof bundle.rootNode.topic === 'string' &&
      Array.isArray(bundle.maps)
    )
  }

  async function collectBundleMaps(rootNode: MindMapNodeData) {
    const maps = new Map<string, MindMapDocument>()
    const pendingIds = collectChildMindMapIds(rootNode)

    while (pendingIds.length > 0) {
      const mapId = pendingIds.pop()

      if (!mapId || maps.has(mapId)) {
        continue
      }

      const childDocument = await db.mindMaps.get(mapId)

      if (!childDocument) {
        continue
      }

      maps.set(childDocument.id, childDocument)
      pendingIds.push(...collectChildMindMapIds(childDocument.data.data))
    }

    return [...maps.values()]
  }

  async function handleExportJson(node = selectedNode) {
    if (!node) {
      return
    }

    const bundle: MindMapExportBundle = {
      type: 'mindmap-bundle',
      version: 1,
      exportedAt: Date.now(),
      rootNode: node,
      maps: await collectBundleMaps(node),
    }
    const json = JSON.stringify(bundle, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${node.topic}.bundle.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportJsonFile(file: File, parentNodeId = selectedNodeId) {
    if (!parentNodeId) {
      return
    }

    try {
      const json = JSON.parse(await file.text())

      if (!isMindMapExportBundle(json)) {
        window.alert('Import JSON must contain a MindMap bundle.')
        return
      }

      const existingMaps = (await Promise.all(json.maps.map((map) => db.mindMaps.get(map.id)))).filter(Boolean)

      if (
        existingMaps.length > 0 &&
        !window.confirm(`${existingMaps.length} MindMap(s) with the same ID already exist. Overwrite them?`)
      ) {
        return
      }

      if (json.maps.length > 0) {
        await db.mindMaps.bulkPut(json.maps)
      }

      const importedNode = cloneImportedNode(json.rootNode)
      updateCurrentRoot((root) => addChildNode(root, parentNodeId, importedNode))
      setSelectedNodeId(importedNode.id)
    } catch {
      window.alert('Failed to import JSON.')
    }
  }

  function handleImportJsonChange(event: ReactChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const parentNodeId = importInputRef.current?.dataset.parentNodeId ?? selectedNodeId
    event.target.value = ''

    if (file) {
      void handleImportJsonFile(file, parentNodeId)
    }
  }

  function handleOpenImportPicker(parentNodeId = selectedNodeId) {
    if (importInputRef.current && parentNodeId) {
      importInputRef.current.dataset.parentNodeId = parentNodeId
      importInputRef.current.click()
    }
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  function runContextMenuAction(action: () => void | Promise<void>) {
    closeContextMenu()
    void action()
  }

  function isEditableElement(element: HTMLElement) {
    return Boolean(element.closest('input, textarea, select, [contenteditable="true"]'))
  }

  function isEditableEvent(event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) {
    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event
    const eventPath = nativeEvent.composedPath?.() ?? []

    if (eventPath.some((target) => target instanceof HTMLElement && isEditableElement(target))) {
      return true
    }

    const activeElement = window.document.activeElement

    if (activeElement instanceof HTMLElement && isEditableElement(activeElement)) {
      return true
    }

    return event.target instanceof HTMLElement && isEditableElement(event.target)
  }

  function isEditableTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && isEditableElement(target)
  }

  function getShortcutKey(event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) {
    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event
    const key = event.key.toLowerCase()

    if (key === 'enter' || nativeEvent.code === 'Enter' || nativeEvent.keyCode === 13) {
      return 'enter'
    }

    if (key === 'insert' || nativeEvent.code === 'Insert' || nativeEvent.keyCode === 45) {
      return 'insert'
    }

    if (key === 'delete' || nativeEvent.code === 'Delete' || nativeEvent.keyCode === 46) {
      return 'delete'
    }

    if (key === 'tab' || nativeEvent.code === 'Tab' || nativeEvent.keyCode === 9) {
      return 'tab'
    }

    if (key === 'm' || nativeEvent.code === 'KeyM' || nativeEvent.keyCode === 77) {
      return 'm'
    }

    if (key === 'z' || nativeEvent.code === 'KeyZ' || nativeEvent.keyCode === 90) {
      return 'z'
    }

    if (key === 'y' || nativeEvent.code === 'KeyY' || nativeEvent.keyCode === 89) {
      return 'y'
    }

    return key
  }

  function handleShortcutKeyDown(event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) {
    const shortcutKey = getShortcutKey(event)
    const editingText = isEditableEvent(event)
    const withModifier = event.ctrlKey || event.metaKey

    if (withModifier && shortcutKey === 'm') {
      event.preventDefault()
      event.stopPropagation()

      if (isEditableEvent(event)) {
        if (window.document.activeElement instanceof HTMLElement) {
          window.document.activeElement.blur()
        }

        setMemoPreviewRequest((request) => request + 1)
        setMindMapFocusRequest((request) => request + 1)
      } else {
        setMemoFocusRequest((request) => request + 1)
      }

      return
    }

    if (editingText) {
      return
    }

    if (withModifier && shortcutKey === 'z' && event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      handleRedo()
      return
    }

    if (withModifier && shortcutKey === 'z') {
      event.preventDefault()
      event.stopPropagation()
      handleUndo()
      return
    }

    if (withModifier && shortcutKey === 'y') {
      event.preventDefault()
      event.stopPropagation()
      handleRedo()
      return
    }

    if (shortcutKey === 'enter' && withModifier) {
      event.preventDefault()
      event.stopPropagation()
      handleOpenChildMindMap()
      return
    }

    if (shortcutKey === 'enter') {
      event.preventDefault()
      event.stopPropagation()
      handleAddSiblingNode()
      return
    }

    if (shortcutKey === 'delete') {
      event.preventDefault()
      event.stopPropagation()
      handleDeleteNode()
      return
    }

    if (shortcutKey === 'insert' || shortcutKey === 'tab') {
      event.preventDefault()
      event.stopPropagation()
      handleAddChildNode()
    }
  }


  if (!document || !selectedNodeId) {
    return <main className="app-shell loading" data-theme={settings.theme === 'system' ? undefined : settings.theme} style={appStyle}>{status}</main>
  }

  return (
    <main
      ref={appShellRef}
      className="app-shell"
      data-theme={settings.theme === 'system' ? undefined : settings.theme}
      style={appStyle}
      tabIndex={0}
      onMouseDown={(event) => {
        if (!isEditableTarget(event.target)) {
          event.currentTarget.focus()
        }
      }}
      onClick={closeContextMenu}
      onKeyDownCapture={handleShortcutKeyDown}
    >
      <header className="topbar">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          {breadcrumb.length > 0 && (
            <button type="button" onClick={() => handleBack(0)}>
              {breadcrumb[0].name}
            </button>
          )}
          {breadcrumb.slice(1).map((item, index) => (
            <button key={item.id} type="button" onClick={() => handleBack(index + 1)}>
              / {item.name}
            </button>
          ))}
          <span>{breadcrumb.length > 0 ? `/ ${document.name}` : document.name}</span>
        </nav>
        <span className="status">{status}</span>
        <button type="button" className="settings-button" onClick={() => setIsSettingsOpen(true)} aria-label="Open settings" title="Settings">
          ⚙
        </button>
      </header>

      <section
        ref={workspaceRef}
        className={`workspace${isMemoVisible ? '' : ' memo-hidden'}`}
        style={isMemoVisible ? { gridTemplateColumns: `minmax(0, 1fr) 6px minmax(320px, ${memoPanelWidth}%)` } : undefined}
      >
        <section className="mindmap-panel">
          <MindMapTree
            mind={document.data}
            selectedNodeId={selectedNodeId}
            focusRequest={mindMapFocusRequest}
            pendingEditNodeId={pendingEditNodeId}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onMindChange={handleMindMapChange}
            onSelectNode={setSelectedNodeId}
            onOpenChildMindMap={handleOpenChildMindMap}
            onNodeContextMenu={(nodeId, position) => setContextMenu({ nodeId, x: position.x, y: position.y })}
          />
        </section>
        {isMemoVisible && (
          <>
            <div
              className="memo-resizer"
              role="separator"
              aria-label="Resize memo panel"
              aria-orientation="vertical"
              onPointerDown={handleMemoResizeStart}
            />
            <NodeMemo
              key={selectedNode?.id ?? 'empty-memo'}
              node={selectedNode}
              focusRequest={memoFocusRequest}
              previewRequest={memoPreviewRequest}
              onMemoChange={handleMemoChange}
              onEscapeEditor={() => {
                setMemoPreviewRequest((request) => request + 1)
                setMindMapFocusRequest((request) => request + 1)
              }}
              onHideMemo={() => setIsMemoVisible(false)}
            />
          </>
        )}
      </section>

      {!isMemoVisible && (
        <button type="button" className="show-memo-button" onClick={() => setIsMemoVisible(true)} aria-label="Show memo" title="Show memo">
          ◂
        </button>
      )}

      {contextMenu && contextMenuNode && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <p className="context-menu-title">{contextMenuNode.topic}</p>
          <button type="button" role="menuitem" onClick={() => runContextMenuAction(() => handleAddSiblingNode(contextMenuNode.id))}>
            + Sibling Node
          </button>
          <button type="button" role="menuitem" onClick={() => runContextMenuAction(() => handleAddChildNode(contextMenuNode.id))}>
            + Child Node
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runContextMenuAction(() => handleDeleteNode(contextMenuNode))}
            disabled={contextMenuNode.id === document.data.data.id}
          >
            Delete
          </button>
          <div className="context-menu-color-group" role="group" aria-label="Node colors" onClick={(event) => event.stopPropagation()}>
            <div className="context-menu-color-row">
              <span>Background</span>
              <div className="color-swatch-grid" role="group" aria-label="Background color">
                {nodeColorPalette.map((color) => (
                  <button
                    key={`background-${color.value}`}
                    type="button"
                    className={contextMenuNode['background-color'] === color.value ? 'active' : ''}
                    style={{ backgroundColor: color.value }}
                    aria-label={`Background ${color.label}`}
                    title={color.label}
                    onClick={() => handleNodeColorChange(contextMenuNode.id, { 'background-color': color.value })}
                  />
                ))}
              </div>
            </div>
            <div className="context-menu-color-row">
              <span>Text</span>
              <div className="color-swatch-grid" role="group" aria-label="Text color">
                {nodeColorPalette.map((color) => (
                  <button
                    key={`text-${color.value}`}
                    type="button"
                    className={contextMenuNode['foreground-color'] === color.value ? 'active' : ''}
                    style={{ backgroundColor: color.value }}
                    aria-label={`Text ${color.label}`}
                    title={color.label}
                    onClick={() => handleNodeColorChange(contextMenuNode.id, { 'foreground-color': color.value })}
                  />
                ))}
              </div>
            </div>
            <button type="button" role="menuitem" onClick={() => runContextMenuAction(() => handleResetNodeColors(contextMenuNode.id))}>
              Reset colors
            </button>
          </div>
          {contextMenuNode.childMindMapId ? (
            <>
              <button type="button" role="menuitem" onClick={() => runContextMenuAction(() => handleOpenChildMindMap(contextMenuNode))}>
                Open MindMap
              </button>
              <button type="button" role="menuitem" onClick={() => runContextMenuAction(() => handleDeleteChildMindMap(contextMenuNode))}>
                Delete Child MindMap
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" onClick={() => runContextMenuAction(() => handleCreateChildMindMap(contextMenuNode))}>
              Create MindMap
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => runContextMenuAction(() => handleExportJson(contextMenuNode))}>
            Export JSON
          </button>
          <button type="button" role="menuitem" onClick={() => runContextMenuAction(() => handleOpenImportPicker(contextMenuNode.id))}>
            Import JSON
          </button>
        </div>
      )}

      {isSettingsOpen && (
        <div className="settings-backdrop" role="presentation" onMouseDown={() => setIsSettingsOpen(false)}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="settings-dialog-header">
              <h2 id="settings-title">Settings</h2>
              <button type="button" aria-label="Close settings" onClick={() => setIsSettingsOpen(false)}>×</button>
            </header>

            <label className="settings-field">
              <span>Theme</span>
              <select value={settings.theme} onChange={(event) => updateSettings({ theme: event.target.value as AppTheme })}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>

            <label className="settings-field">
              <span>Font</span>
              <select value={settings.fontFamily} onChange={(event) => updateSettings({ fontFamily: event.target.value })}>
                {fontOptions.map((option) => (
                  <option key={option.label} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>MindMap font size</span>
              <div className="settings-range-row">
                <input type="range" min="8" max="24" value={settings.mindMapFontSize} onChange={(event) => updateSettings({ mindMapFontSize: Number(event.target.value) })} />
                <output>{settings.mindMapFontSize}px</output>
              </div>
            </label>

            <label className="settings-field">
              <span>Memo font size</span>
              <div className="settings-range-row">
                <input type="range" min="12" max="24" value={settings.memoFontSize} onChange={(event) => updateSettings({ memoFontSize: Number(event.target.value) })} />
                <output>{settings.memoFontSize}px</output>
              </div>
            </label>

            <footer className="settings-dialog-footer">
              <button type="button" onClick={resetSettings}>Reset</button>
              <button type="button" onClick={() => setIsSettingsOpen(false)}>Done</button>
            </footer>
          </section>
        </div>
      )}

      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={handleImportJsonChange}
      />
    </main>
  )
}

export default App
