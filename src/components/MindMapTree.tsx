import { useEffect, useRef, useState } from 'react'
import jsMind, { event_type } from 'jsmind'
import { DraggableNode } from 'jsmind/draggable-node'
import 'jsmind/style/jsmind.css'
import type { JsMindData, MindMapNodeData } from '../types'

type DraggableNodeInstance = InstanceType<typeof DraggableNode>

const draggableNodeInstances = new WeakMap<jsMind, DraggableNodeInstance>()
const originalDraggableNodeInit = DraggableNode.prototype.init

DraggableNode.prototype.init = function patchedInit() {
  draggableNodeInstances.set(this.jm, this)
  originalDraggableNodeInit.call(this)
}

function cancelDraggableNode(dragger: DraggableNodeInstance) {
  if (dragger.hlookup_delay) {
    window.clearTimeout(dragger.hlookup_delay)
    dragger.hlookup_delay = 0
  }

  if (dragger.hlookup_timer) {
    window.clearInterval(dragger.hlookup_timer)
    dragger.hlookup_timer = 0
  }

  dragger.clear_lines()
  dragger.hide_shadow()
  dragger.active_node = null
  dragger.target_node = null
  dragger.target_direct = null
  dragger.view_panel_rect = null
  dragger.moved = false
  dragger.capture = false

  if (dragger.view_draggable) {
    dragger.jm.enable_view_draggable()
  }
}

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
  onSelectNode: (nodeId: string, position?: { x: number; y: number; placement: 'bottom' | 'right' }) => void
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

function collectExpandedState(node: MindMapNodeData, state = new Map<string, boolean>()) {
  state.set(node.id, node.expanded !== false)

  for (const child of node.children ?? []) {
    collectExpandedState(child, state)
  }

  return state
}

function applyExpandedState(node: MindMapNodeData, state: Map<string, boolean>): MindMapNodeData {
  const expanded = state.get(node.id)

  return {
    ...node,
    ...(expanded === undefined ? {} : { expanded }),
    children: node.children?.map((child) => applyExpandedState(child, state)),
  }
}

function shouldFocusMindMap(container: HTMLElement) {
  const activeElement = document.activeElement

  return !activeElement || activeElement === document.body || container.contains(activeElement)
}

function getNodePopoverPosition(container: HTMLElement, root: MindMapNodeData, nodeId: string) {
  const nodeElement = container.querySelector<HTMLElement>(`jmnode[nodeid="${CSS.escape(nodeId)}"]`)

  if (!nodeElement) {
    return undefined
  }

  const node = findNode(root, nodeId)
  const isLeafNode = !node?.children?.length
  const rect = nodeElement.getBoundingClientRect()

  if (isLeafNode) {
    return {
      x: rect.right + 8,
      y: rect.top + rect.height / 2,
      placement: 'right' as const,
    }
  }

  return {
    x: rect.left + rect.width / 2,
    y: rect.bottom + 8,
    placement: 'bottom' as const,
  }
}

type ZoomableJsMind = jsMind & {
  view: jsMind['view'] & {
    zoom_current: number
    zoom_in: () => boolean
    zoom_out: () => boolean
    set_zoom: (zoom: number) => boolean
  }
}

type JsMindWithInternalView = jsMind & {
  view: jsMind['view'] & {
    container?: HTMLElement
    e_panel?: HTMLElement
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
  onNodeContextMenu,
}: MindMapTreeProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const jsMindRef = useRef<jsMind | null>(null)
  const scrollPositionRef = useRef<{ left: number; top: number } | null>(null)
  const expandedStateRef = useRef<Map<string, boolean> | null>(null)
  const onSelectNodeRef = useRef(onSelectNode)
  const onMindChangeRef = useRef(onMindChange)
  const onNodeContextMenuRef = useRef(onNodeContextMenu)
  const [zoomPercent, setZoomPercent] = useState(100)

  useEffect(() => {
    onMindChangeRef.current = onMindChange
    onSelectNodeRef.current = onSelectNode
    onNodeContextMenuRef.current = onNodeContextMenu
  }, [onMindChange, onSelectNode, onNodeContextMenu])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current

    if (!canvas || !container) {
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

    const mindWithPreservedExpandedState = expandedStateRef.current
      ? {
        ...mind,
        data: applyExpandedState(mind.data, expandedStateRef.current),
      }
      : mind

    instance.show(mindWithPreservedExpandedState, true)

    const savedScrollPosition = scrollPositionRef.current
    const panel = (instance as JsMindWithInternalView).view.e_panel

    if (savedScrollPosition && panel) {
      panel.scrollLeft = savedScrollPosition.left
      panel.scrollTop = savedScrollPosition.top
      window.requestAnimationFrame(() => {
        panel.scrollLeft = savedScrollPosition.left
        panel.scrollTop = savedScrollPosition.top
      })
    }

    setZoomPercent(getZoomPercent(instance))

    window.setTimeout(() => {
      if (shouldFocusMindMap(container)) {
        container.querySelector<HTMLElement>('.jsmind-inner')?.focus()
      }
    }, 0)

    instance.add_event_listener((type, data) => {
      if (type === event_type.select && data.node) {
        onSelectNodeRef.current(data.node, getNodePopoverPosition(container, mind.data, data.node))
      }

      if (type === event_type.edit) {
        if (data.evt === 'add_node' || data.evt === 'insert_node_after' || data.evt === 'insert_node_before') {
          const nodeId = data.node

          if (nodeId) {
            window.setTimeout(() => beginInlineEdit(instance, nodeId), 0)
            onSelectNodeRef.current(nodeId, getNodePopoverPosition(container, mind.data, nodeId))
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

    let isPointerDownInMindMap = false
    let isDraggingNode = false
    let dragStartMind: JsMindData | null = null
    let dragStartSelectedNodeId: string | undefined

    const stopViewDrag = (event?: MouseEvent) => {
      isPointerDownInMindMap = false
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        clientX: event?.clientX ?? 0,
        clientY: event?.clientY ?? 0,
        screenX: event?.screenX ?? 0,
        screenY: event?.screenY ?? 0,
      })
      const internalView = (instance as JsMindWithInternalView).view
      const mouseUpTargets = [container, internalView.container, internalView.e_panel].filter(
        (target): target is HTMLElement => target instanceof HTMLElement,
      )

      for (const target of mouseUpTargets) {
        target.dispatchEvent(new MouseEvent('mouseup', mouseUpEvent))
      }

      window.document.dispatchEvent(new MouseEvent('mouseup', mouseUpEvent))
      window.dispatchEvent(new MouseEvent('mouseup', mouseUpEvent))
      instance.enable_view_draggable()
    }

    const cancelActiveDrag = (event?: MouseEvent) => {
      const dragger = draggableNodeInstances.get(instance)
      const isNodeDragActive = isDraggingNode || Boolean(dragger?.capture)
      const mindBeforeCancel = dragStartMind
      const selectedNodeIdBeforeCancel = dragStartSelectedNodeId

      if (!isNodeDragActive && !isPointerDownInMindMap) {
        return
      }

      isDraggingNode = false
      dragStartMind = null
      dragStartSelectedNodeId = undefined

      stopViewDrag(event)

      if (dragger?.capture || isNodeDragActive) {
        cancelDraggableNode(dragger)
      }

      if (mindBeforeCancel) {
        instance.show(mindBeforeCancel, true)
        onMindChangeRef.current(mindBeforeCancel, selectedNodeIdBeforeCancel)
      }
    }

    const isInsideMindMapArea = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()

      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    }

    const handleMouseDown = (event: MouseEvent) => {
      focusMindMap()
      isPointerDownInMindMap = event.button === 0
      const nodeId = getNodeIdFromEventTarget(event.target)
      const node = nodeId ? instance.get_node(nodeId) : null
      isDraggingNode = Boolean(node && !node.isroot)
      dragStartMind = isDraggingNode ? instance.get_data('node_tree') as JsMindData : null
      dragStartSelectedNodeId = isDraggingNode ? nodeId ?? undefined : undefined
    }

    const handleMouseLeave = (event: MouseEvent) => {
      cancelActiveDrag(event)
    }

    const handleMouseMove = (event: MouseEvent) => {
      const dragger = draggableNodeInstances.get(instance)

      if (!isInsideMindMapArea(event)) {
        if (isDraggingNode || dragger?.capture) {
          cancelActiveDrag(event)
        } else if (isPointerDownInMindMap) {
          stopViewDrag(event)
        }
      }
    }

    const handleMouseUp = (event: MouseEvent) => {
      const dragger = draggableNodeInstances.get(instance)

      if (!isInsideMindMapArea(event)) {
        if (isDraggingNode || dragger?.capture) {
          cancelActiveDrag(event)
          return
        }

        if (isPointerDownInMindMap) {
          stopViewDrag(event)
        }
      }

      isPointerDownInMindMap = false
      isDraggingNode = false
      dragStartMind = null
      dragStartSelectedNodeId = undefined
    }

    const handleWindowMouseOut = (event: MouseEvent) => {
      if (!event.relatedTarget) {
        cancelActiveDrag(event)
      }
    }

    const handleWindowBlur = () => {
      cancelActiveDrag()
    }

    const handleDoubleClick = (event: MouseEvent) => {
      const nodeId = getNodeIdFromEventTarget(event.target)

      if (!nodeId) {
        return
      }

      event.preventDefault()
      instance.select_node(nodeId)
      onSelectNodeRef.current(nodeId, getNodePopoverPosition(container, mind.data, nodeId))
      beginInlineEdit(instance, nodeId)
    }

    const handleContextMenu = (event: MouseEvent) => {
      const nodeId = getNodeIdFromEventTarget(event.target)

      if (!nodeId) {
        return
      }

      event.preventDefault()
      instance.select_node(nodeId)
      onSelectNodeRef.current(nodeId, getNodePopoverPosition(container, mind.data, nodeId))
      onNodeContextMenuRef.current(nodeId, { x: event.clientX, y: event.clientY })
    }

    container.addEventListener('mousedown', handleMouseDown, true)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    window.document.addEventListener('mousemove', handleMouseMove, true)
    window.document.addEventListener('mouseup', handleMouseUp, true)
    window.document.addEventListener('mouseout', handleWindowMouseOut, true)
    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('blur', handleWindowBlur)
    container.addEventListener('dblclick', handleDoubleClick)
    container.addEventListener('contextmenu', handleContextMenu)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown, true)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      window.document.removeEventListener('mousemove', handleMouseMove, true)
      window.document.removeEventListener('mouseup', handleMouseUp, true)
      window.document.removeEventListener('mouseout', handleWindowMouseOut, true)
      window.removeEventListener('mouseup', handleMouseUp, true)
      window.removeEventListener('blur', handleWindowBlur)
      container.removeEventListener('dblclick', handleDoubleClick)
      container.removeEventListener('contextmenu', handleContextMenu)
      expandedStateRef.current = collectExpandedState((instance.get_data('node_tree') as JsMindData).data)

      const panel = (instance as JsMindWithInternalView).view.e_panel

      if (panel) {
        scrollPositionRef.current = {
          left: panel.scrollLeft,
          top: panel.scrollTop,
        }
      }

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
    <div ref={canvasRef} className="mindmap-canvas">
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
