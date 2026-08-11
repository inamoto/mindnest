import { useEffect, useRef, useState } from 'react'
import jsMind, { event_type } from 'jsmind'
import 'jsmind/draggable-node'
import 'jsmind/style/jsmind.css'
import type { JsMindData, MindMapNodeData } from '../types'

interface MindMapTreeProps {
  mind: JsMindData
  selectedNodeId: string
  focusRequest: number
  pendingEditNodeId: string | null
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onMindChange: (mind: JsMindData, selectedNodeId?: string) => void
  onSelectNode: (nodeId: string) => void
  onOpenChildMindMap: (node: MindMapNodeData) => void
  onNodeContextMenu: (nodeId: string, position: { x: number; y: number }) => void
}

function findNode(root: MindMapNodeData, nodeId: string): MindMapNodeData | null {
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

function getNodeIdFromEventTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null
  }

  return target.closest('jmnode')?.getAttribute('nodeid') ?? null
}

function shouldFocusMindMap(container: HTMLElement) {
  const activeElement = document.activeElement

  return !activeElement || activeElement === document.body || container.contains(activeElement)
}

type ZoomableJsMind = jsMind & {
  view: jsMind['view'] & {
    zoom_current: number
    zoom_in: () => boolean
    zoom_out: () => boolean
    set_zoom: (zoom: number) => boolean
  }
}

function getZoomPercent(instance: jsMind) {
  return Math.round(((instance as ZoomableJsMind).view.zoom_current ?? 1) * 100)
}

function beginInlineEdit(instance: jsMind, nodeId: string, attempt = 0) {
  const node = instance.get_node(nodeId)

  if (node) {
    instance.select_node(nodeId)
    instance.begin_edit(nodeId)
  }

  const editingNode = instance.view.get_editing_node()

  if (editingNode?.id === nodeId || attempt >= 8) {
    return
  }

  window.setTimeout(() => beginInlineEdit(instance, nodeId, attempt + 1), 50)
}

export function MindMapTree({
  mind,
  selectedNodeId,
  focusRequest,
  pendingEditNodeId,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onMindChange,
  onSelectNode,
  onOpenChildMindMap,
  onNodeContextMenu,
}: MindMapTreeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const jsMindRef = useRef<jsMind | null>(null)
  const onSelectNodeRef = useRef(onSelectNode)
  const onMindChangeRef = useRef(onMindChange)
  const onOpenChildMindMapRef = useRef(onOpenChildMindMap)
  const onNodeContextMenuRef = useRef(onNodeContextMenu)
  const [zoomPercent, setZoomPercent] = useState(100)

  useEffect(() => {
    onMindChangeRef.current = onMindChange
    onSelectNodeRef.current = onSelectNode
    onOpenChildMindMapRef.current = onOpenChildMindMap
    onNodeContextMenuRef.current = onNodeContextMenu
  }, [onMindChange, onSelectNode, onOpenChildMindMap, onNodeContextMenu])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    container.innerHTML = ''

    const instance = new jsMind({
      container,
      editable: true,
      mode: 'full',
      support_html: false,
      theme: 'primary',
      log_level: 'warn',
      view: {
        engine: 'svg',
        draggable: true,
        hide_scrollbars_when_draggable: true,
        line_color: '#8b8f98',
        line_width: 2,
        line_style: 'curved',
        node_overflow: 'wrap',
        custom_node_render: (_jm, element, node) => {
          element.textContent = ''
          element.style.setProperty('--node-bg', typeof node.data['background-color'] === 'string' ? node.data['background-color'] : '')
          element.style.setProperty('--node-fg', typeof node.data['foreground-color'] === 'string' ? node.data['foreground-color'] : '')

          const title = document.createElement('span')
          title.textContent = node.topic
          element.appendChild(title)

          if (typeof node.data.memo === 'string' && node.data.memo.trim()) {
            const memo = document.createElement('span')
            memo.className = 'node-indicator'
            memo.textContent = '📝'
            memo.setAttribute('aria-label', 'Has memo')
            element.appendChild(memo)
          }

          if (typeof node.data.childMindMapId === 'string' && node.data.childMindMapId) {
            const child = document.createElement('span')
            child.className = 'node-indicator'
            child.textContent = '↗'
            child.setAttribute('aria-label', 'Has child MindMap')
            element.appendChild(child)
          }
        },
      },
      layout: {
        hspace: 48,
        vspace: 16,
        pspace: 12,
      },
      default_event_handle: {
        enable_mousedown_handle: true,
        enable_click_handle: true,
        enable_dblclick_handle: false,
        enable_mousewheel_handle: true,
      },
      shortcut: {
        enable: true,
      },
      plugin: {
        draggable_node: {
          line_width: 7,
          line_color: 'rgba(37, 99, 235, 0.85)',
          line_color_invalid: 'rgba(220, 38, 38, 0.85)',
        },
      },
    })

    instance.show(mind)
    setZoomPercent(getZoomPercent(instance))

    window.setTimeout(() => {
      if (shouldFocusMindMap(container)) {
        container.querySelector<HTMLElement>('.jsmind-inner')?.focus()
      }
    }, 0)

    instance.add_event_listener((type, data) => {
      if (type === event_type.select && data.node) {
        onSelectNodeRef.current(data.node)
      }

      if (type === event_type.edit) {
        if (data.evt === 'add_node' || data.evt === 'insert_node_after' || data.evt === 'insert_node_before') {
          const nodeId = data.node

          if (nodeId) {
            window.setTimeout(() => beginInlineEdit(instance, nodeId), 0)
            onSelectNodeRef.current(nodeId)
          }

          return
        }

        onMindChangeRef.current(instance.get_data('node_tree') as JsMindData, data.node)
      }
    })
    jsMindRef.current = instance

    const focusMindMap = () => {
      container.querySelector<HTMLElement>('.jsmind-inner')?.focus()
    }

    const handleMouseDown = () => {
      focusMindMap()
    }

    const handleDoubleClick = (event: MouseEvent) => {
      const nodeId = getNodeIdFromEventTarget(event.target)

      if (!nodeId) {
        return
      }

      const node = findNode(mind.data, nodeId)

      if (node?.childMindMapId) {
        onOpenChildMindMapRef.current(node)
      }
    }

    const handleContextMenu = (event: MouseEvent) => {
      const nodeId = getNodeIdFromEventTarget(event.target)

      if (!nodeId) {
        return
      }

      event.preventDefault()
      instance.select_node(nodeId)
      onSelectNodeRef.current(nodeId)
      onNodeContextMenuRef.current(nodeId, { x: event.clientX, y: event.clientY })
    }

    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('dblclick', handleDoubleClick)
    container.addEventListener('contextmenu', handleContextMenu)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('dblclick', handleDoubleClick)
      container.removeEventListener('contextmenu', handleContextMenu)
      instance.clear_event_listener()
      container.innerHTML = ''
      jsMindRef.current = null
    }
  }, [mind])

  useEffect(() => {
    const instance = jsMindRef.current

    if (!instance || !selectedNodeId) {
      return
    }

    const selected = instance.get_selected_node()

    if (selected?.id !== selectedNodeId) {
      instance.select_node(selectedNodeId)
    }

    window.setTimeout(() => {
      const container = containerRef.current

      if (container && shouldFocusMindMap(container)) {
        container.querySelector<HTMLElement>('.jsmind-inner')?.focus()
      }
    }, 0)
  }, [selectedNodeId, mind])

  useEffect(() => {
    if (pendingEditNodeId) {
      const instance = jsMindRef.current

      if (instance) {
        window.setTimeout(() => beginInlineEdit(instance, pendingEditNodeId), 0)
      }
    }
  }, [pendingEditNodeId, mind])

  useEffect(() => {
    if (focusRequest <= 0) {
      return
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    const panel = containerRef.current?.querySelector<HTMLElement>('.jsmind-inner')
    panel?.focus()
  }, [focusRequest])

  function updateZoom(action: (instance: ZoomableJsMind) => boolean) {
    const instance = jsMindRef.current as ZoomableJsMind | null

    if (!instance) {
      return
    }

    action(instance)
    setZoomPercent(getZoomPercent(instance))
  }

  function resetZoom() {
    updateZoom((instance) => {
      const changed = instance.view.set_zoom(1)
      const selected = instance.get_selected_node()

      if (selected) {
        instance.scroll_node_to_center(selected)
      }

      return changed
    })
  }

  return (
    <div className="mindmap-canvas">
      <div ref={containerRef} className="mindmap-canvas-stage" aria-label="MindMap" />
      <div className="canvas-controls" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <div className="history-controls" aria-label="History controls">
          <button type="button" aria-label="Undo" onClick={onUndo} disabled={!canUndo}>↶</button>
          <button type="button" aria-label="Redo" onClick={onRedo} disabled={!canRedo}>↷</button>
        </div>
        <div className="zoom-controls" aria-label="Zoom controls">
          <button type="button" aria-label="Zoom out" onClick={() => updateZoom((instance) => instance.view.zoom_out())}>−</button>
          <span aria-live="polite">{zoomPercent}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => updateZoom((instance) => instance.view.zoom_in())}>＋</button>
          <button type="button" aria-label="Reset zoom" className="zoom-reset" onClick={resetZoom}>⌾</button>
        </div>
      </div>
    </div>
  )
}
