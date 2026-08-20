import { useEffect, useRef, useState } from 'react'
import jsMind, { event_type } from 'jsmind'
import { DraggableNode } from 'jsmind/draggable-node'
import 'jsmind/style/jsmind.css'
import type { JsMindData, MindMapNodeData } from '../types'

type DraggableNodeInstance = InstanceType<typeof DraggableNode>
type TextSelection = { start: number; end: number; direction?: 'forward' | 'backward' | 'none' }

const draggableNodeInstances = new WeakMap<jsMind, DraggableNodeInstance>()
const originalDraggableNodeInit = DraggableNode.prototype.init
const originalDraggableNodeDrag = DraggableNode.prototype.drag

DraggableNode.prototype.init = function patchedInit() {
  draggableNodeInstances.set(this.jm, this)
  originalDraggableNodeInit.call(this)
}

DraggableNode.prototype.drag = function patchedDrag(event: MouseEvent | TouchEvent) {
  const panel = this.view_panel
  const scrollLeft = panel.scrollLeft
  const scrollTop = panel.scrollTop

  originalDraggableNodeDrag.call(this, event)

  if (this.capture) {
    panel.scrollLeft = scrollLeft
    panel.scrollTop = scrollTop
  }
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
  onMindViewChange: (mind: JsMindData) => void
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
  const expanded = node.expanded === true ? true : state.get(node.id)

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
    e_editor?: HTMLInputElement
    edit_node_begin: (node: NonNullable<ReturnType<jsMind['get_node']>>) => void
    edit_node_end: () => void
  }
}

function getZoomPercent(instance: jsMind) {
  return Math.round(((instance as ZoomableJsMind).view.zoom_current ?? 1) * 100)
}

function getInlineEditor(container: HTMLElement) {
  return container.querySelector<HTMLInputElement | HTMLTextAreaElement>('.jsmind-editor')
}

function applyInlineEditorSelection(editor: HTMLInputElement | HTMLTextAreaElement, selection: TextSelection) {
  const start = Math.min(selection.start, editor.value.length)
  const end = Math.min(selection.end, editor.value.length)

  editor.focus()
  editor.setSelectionRange(start, end, selection.direction)
}

function restoreInlineEditorSelection(container: HTMLElement, selection: TextSelection | undefined, onRestoreStart: () => void, onRestoreEnd: () => void, attempt = 0) {
  if (!selection) {
    return
  }

  const editor = getInlineEditor(container)

  if (editor) {
    onRestoreStart()
    applyInlineEditorSelection(editor, selection)
    window.setTimeout(onRestoreEnd, 0)
  }

  if (attempt >= 8) {
    return
  }

  window.setTimeout(() => restoreInlineEditorSelection(container, selection, onRestoreStart, onRestoreEnd, attempt + 1), attempt < 3 ? 0 : 25)
}

function rememberInlineEditorSelection(instance: jsMind, container: HTMLElement, selections: Map<string, TextSelection>) {
  const editor = getInlineEditor(container)
  const editingNodeId = instance.view.get_editing_node()?.id
    ?? editor?.closest('jmnode')?.getAttribute('nodeid')

  if (!editingNodeId || !editor || document.activeElement !== editor) {
    return
  }

  selections.set(editingNodeId, {
    start: editor.selectionStart ?? editor.value.length,
    end: editor.selectionEnd ?? editor.value.length,
    direction: editor.selectionDirection ?? 'none',
  })
}

function beginInlineEdit(instance: jsMind, container: HTMLElement, nodeId: string, selection: TextSelection | undefined, onRestoreStart: () => void, onRestoreEnd: () => void, attempt = 0) {
  const node = instance.get_node(nodeId)

  if (node) {
    instance.select_node(nodeId)
    instance.begin_edit(nodeId)
  }

  const editingNode = instance.view.get_editing_node()

  if (editingNode?.id === nodeId || attempt >= 8) {
    restoreInlineEditorSelection(container, selection, onRestoreStart, onRestoreEnd)
    return
  }

  window.setTimeout(() => beginInlineEdit(instance, container, nodeId, selection, onRestoreStart, onRestoreEnd, attempt + 1), 50)
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
  onMindViewChange,
  onSelectNode,
  onNodeContextMenu,
}: MindMapTreeProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const jsMindRef = useRef<jsMind | null>(null)
  const scrollPositionRef = useRef<{ left: number; top: number } | null>(null)
  const expandedStateRef = useRef<Map<string, boolean> | null>(null)
  const editorSelectionRef = useRef(new Map<string, TextSelection>())
  const onSelectNodeRef = useRef(onSelectNode)
  const onMindChangeRef = useRef(onMindChange)
  const onMindViewChangeRef = useRef(onMindViewChange)
  const onNodeContextMenuRef = useRef(onNodeContextMenu)
  const [zoomPercent, setZoomPercent] = useState(100)

  useEffect(() => {
    onMindChangeRef.current = onMindChange
    onMindViewChangeRef.current = onMindViewChange
    onSelectNodeRef.current = onSelectNode
    onNodeContextMenuRef.current = onNodeContextMenu
  }, [onMindChange, onMindViewChange, onSelectNode, onNodeContextMenu])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current

    if (!canvas || !container) {
      return
    }

    container.innerHTML = ''

    const editorSelections = editorSelectionRef.current
    let isRestoringInlineEditorSelection = false
    const startInlineEditorSelectionRestore = () => {
      isRestoringInlineEditorSelection = true
    }
    const endInlineEditorSelectionRestore = () => {
      isRestoringInlineEditorSelection = false
    }

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
          scrolling_trigger_width: 0,
          scrolling_step_length: 0,
        },
      },
    })

    const instanceWithInternalView = instance as JsMindWithInternalView
    const originalViewEditNodeBegin = instanceWithInternalView.view.edit_node_begin.bind(instanceWithInternalView.view)
    const originalEditNodeEnd = instanceWithInternalView.view.edit_node_end.bind(instanceWithInternalView.view)

    instanceWithInternalView.view.edit_node_begin = (node) => {
      const originalInputSelect = HTMLInputElement.prototype.select

      HTMLInputElement.prototype.select = function patchedSelect() {
        if (this.classList.contains('jsmind-editor')) {
          return
        }

        originalInputSelect.call(this)
      }

      try {
        originalViewEditNodeBegin(node)
      } finally {
        HTMLInputElement.prototype.select = originalInputSelect
      }

      const editor = instanceWithInternalView.view.e_editor

      const selection = editorSelections.get(node.id)

      if (editor && selection) {
        startInlineEditorSelectionRestore()
        applyInlineEditorSelection(editor, selection)
        window.setTimeout(endInlineEditorSelectionRestore, 0)
      }

      restoreInlineEditorSelection(container, editorSelections.get(node.id), startInlineEditorSelectionRestore, endInlineEditorSelectionRestore)
    }

    instanceWithInternalView.view.edit_node_end = () => {
      const editingNode = instance.view.get_editing_node()
      const editor = instanceWithInternalView.view.e_editor

      if (editingNode && editor && !editorSelections.has(editingNode.id)) {
        editorSelections.set(editingNode.id, {
          start: editor.selectionStart ?? editor.value.length,
          end: editor.selectionEnd ?? editor.value.length,
          direction: editor.selectionDirection ?? 'none',
        })
      } else if (!editingNode) {
        rememberInlineEditorSelection(instance, container, editorSelections)
      }

      originalEditNodeEnd()
    }

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

      if (type === event_type.show && (data.evt === 'expand_node' || data.evt === 'collapse_node')) {
        onMindViewChangeRef.current(instance.get_data('node_tree') as JsMindData)
      }

      if (type === event_type.edit) {
        rememberInlineEditorSelection(instance, container, editorSelections)

        if (data.evt === 'add_node' || data.evt === 'insert_node_after' || data.evt === 'insert_node_before') {
          const nodeId = data.node

          if (nodeId) {
            window.setTimeout(() => beginInlineEdit(instance, container, nodeId, editorSelections.get(nodeId), startInlineEditorSelectionRestore, endInlineEditorSelectionRestore), 0)
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
    let lockedScrollPosition: { windowX: number; windowY: number; documentLeft: number; documentTop: number; bodyLeft: number; bodyTop: number; panelLeft: number; panelTop: number } | null = null

    const getPanel = () => (instance as JsMindWithInternalView).view.e_panel

    const lockScrollPosition = () => {
      const panel = getPanel()
      lockedScrollPosition = {
        windowX: window.scrollX,
        windowY: window.scrollY,
        documentLeft: document.documentElement.scrollLeft,
        documentTop: document.documentElement.scrollTop,
        bodyLeft: document.body.scrollLeft,
        bodyTop: document.body.scrollTop,
        panelLeft: panel?.scrollLeft ?? 0,
        panelTop: panel?.scrollTop ?? 0,
      }
    }

    const restoreLockedScrollPosition = () => {
      if (!lockedScrollPosition) {
        return
      }

      const panel = getPanel()
      window.scrollTo(lockedScrollPosition.windowX, lockedScrollPosition.windowY)
      document.documentElement.scrollLeft = lockedScrollPosition.documentLeft
      document.documentElement.scrollTop = lockedScrollPosition.documentTop
      document.body.scrollLeft = lockedScrollPosition.bodyLeft
      document.body.scrollTop = lockedScrollPosition.bodyTop

      if (panel) {
        panel.scrollLeft = lockedScrollPosition.panelLeft
        panel.scrollTop = lockedScrollPosition.panelTop
      }
    }

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
      lockedScrollPosition = null
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
      rememberInlineEditorSelection(instance, container, editorSelections)
      focusMindMap()
      isPointerDownInMindMap = event.button === 0
      const nodeId = getNodeIdFromEventTarget(event.target)
      const node = nodeId ? instance.get_node(nodeId) : null
      isDraggingNode = Boolean(node && !node.isroot)
      dragStartMind = isDraggingNode ? instance.get_data('node_tree') as JsMindData : null
      dragStartSelectedNodeId = isDraggingNode ? nodeId ?? undefined : undefined

      if (isDraggingNode) {
        lockScrollPosition()
      }
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

    const preventScrollWhileDragging = (event: Event) => {
      const dragger = draggableNodeInstances.get(instance)

      if (isDraggingNode || dragger?.capture) {
        event.preventDefault()
        event.stopPropagation()
        restoreLockedScrollPosition()
        window.requestAnimationFrame(restoreLockedScrollPosition)
      }
    }

    const restoreScrollWhileDragging = () => {
      const dragger = draggableNodeInstances.get(instance)

      if (isDraggingNode || dragger?.capture) {
        restoreLockedScrollPosition()
        window.requestAnimationFrame(restoreLockedScrollPosition)
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
      lockedScrollPosition = null
    }

    const handleWindowMouseOut = (event: MouseEvent) => {
      if (!event.relatedTarget) {
        cancelActiveDrag(event)
      }
    }

    const handleWindowBlur = () => {
      cancelActiveDrag()
    }

    const handleInlineEditorKeyDown = () => {
      if (!isRestoringInlineEditorSelection) {
        rememberInlineEditorSelection(instance, container, editorSelections)
      }
    }

    const handleInlineEditorSelectionChange = () => {
      if (!isRestoringInlineEditorSelection) {
        rememberInlineEditorSelection(instance, container, editorSelections)
      }
    }

    const handleDoubleClick = (event: MouseEvent) => {
      const nodeId = getNodeIdFromEventTarget(event.target)

      if (!nodeId) {
        return
      }

      event.preventDefault()
      instance.select_node(nodeId)
      onSelectNodeRef.current(nodeId, getNodePopoverPosition(container, mind.data, nodeId))
      beginInlineEdit(instance, container, nodeId, editorSelections.get(nodeId), startInlineEditorSelectionRestore, endInlineEditorSelectionRestore)
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
    window.document.addEventListener('mousemove', restoreScrollWhileDragging)
    window.document.addEventListener('mouseup', handleMouseUp, true)
    window.document.addEventListener('mouseout', handleWindowMouseOut, true)
    window.addEventListener('scroll', restoreScrollWhileDragging, true)
    window.addEventListener('wheel', preventScrollWhileDragging, { capture: true, passive: false })
    window.addEventListener('touchmove', preventScrollWhileDragging, { capture: true, passive: false })
    window.addEventListener('mouseup', handleMouseUp, true)
    window.addEventListener('blur', handleWindowBlur)
    container.addEventListener('keydown', handleInlineEditorKeyDown, true)
    container.addEventListener('keyup', handleInlineEditorSelectionChange, true)
    container.addEventListener('input', handleInlineEditorSelectionChange, true)
    window.document.addEventListener('selectionchange', handleInlineEditorSelectionChange)
    container.addEventListener('mouseup', handleInlineEditorSelectionChange, true)
    container.addEventListener('blur', handleInlineEditorSelectionChange, true)
    container.addEventListener('dblclick', handleDoubleClick)
    container.addEventListener('contextmenu', handleContextMenu)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown, true)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      window.document.removeEventListener('mousemove', handleMouseMove, true)
      window.document.removeEventListener('mousemove', restoreScrollWhileDragging)
      window.document.removeEventListener('mouseup', handleMouseUp, true)
      window.document.removeEventListener('mouseout', handleWindowMouseOut, true)
      window.removeEventListener('scroll', restoreScrollWhileDragging, true)
      window.removeEventListener('wheel', preventScrollWhileDragging, true)
      window.removeEventListener('touchmove', preventScrollWhileDragging, true)
      window.removeEventListener('mouseup', handleMouseUp, true)
      window.removeEventListener('blur', handleWindowBlur)
      container.removeEventListener('keydown', handleInlineEditorKeyDown, true)
      container.removeEventListener('keyup', handleInlineEditorSelectionChange, true)
      container.removeEventListener('input', handleInlineEditorSelectionChange, true)
      window.document.removeEventListener('selectionchange', handleInlineEditorSelectionChange)
      container.removeEventListener('mouseup', handleInlineEditorSelectionChange, true)
      container.removeEventListener('blur', handleInlineEditorSelectionChange, true)
      container.removeEventListener('dblclick', handleDoubleClick)
      container.removeEventListener('contextmenu', handleContextMenu)
      rememberInlineEditorSelection(instance, container, editorSelections)
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
        const container = containerRef.current

        if (container) {
          const editorSelections = editorSelectionRef.current
          window.setTimeout(() => beginInlineEdit(instance, container, pendingEditNodeId, editorSelections.get(pendingEditNodeId), () => undefined, () => undefined), 0)
        }
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
