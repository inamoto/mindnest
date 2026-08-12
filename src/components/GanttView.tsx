import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Gantt, ViewMode, type Task } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import type { MindMapNodeData } from '../types'

interface FlatGanttNode {
  node: MindMapNodeData
  depth: number
}

interface GanttViewProps {
  root: MindMapNodeData
  selectedNodeId: string
  onSelectNode: (nodeId: string) => void
  onUpdateNode: (nodeId: string, updates: Partial<MindMapNodeData>) => void
}

const viewModes = [
  { label: 'Day', value: ViewMode.Day },
  { label: 'Week', value: ViewMode.Week },
  { label: 'Month', value: ViewMode.Month },
]

const columnWidthByViewMode: Record<ViewMode, number> = {
  [ViewMode.Day]: 38,
  [ViewMode.Week]: 120,
  [ViewMode.Month]: 160,
  [ViewMode.Year]: 240,
  [ViewMode.QuarterDay]: 38,
  [ViewMode.HalfDay]: 38,
  [ViewMode.Hour]: 38,
}

const ganttViewModeStorageKey = 'mindnest:gantt:view-mode'
const ganttFieldsCollapsedStorageKey = 'mindnest:gantt:fields-collapsed'

function loadGanttViewMode() {
  if (typeof window === 'undefined') {
    return ViewMode.Week
  }

  const savedViewMode = window.localStorage.getItem(ganttViewModeStorageKey)
  const availableViewModes = viewModes.map((mode) => mode.value)

  return availableViewModes.includes(savedViewMode as ViewMode) ? savedViewMode as ViewMode : ViewMode.Week
}

function loadGanttFieldsCollapsed() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(ganttFieldsCollapsedStorageKey) === 'true'
}

function flattenGanttNodes(node: MindMapNodeData, depth = 0): FlatGanttNode[] {
  return [
    { node, depth },
    ...(node.children ?? []).flatMap((child) => flattenGanttNodes(child, depth + 1)),
  ]
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(`${value}T00:00:00`)

  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getTodayDateString() {
  return formatDate(new Date())
}

function addDays(dateString: string, days: number) {
  const date = parseDate(dateString)

  if (!date) {
    return dateString
  }

  date.setDate(date.getDate() + days)

  return formatDate(date)
}

function collectNodeIds(root: MindMapNodeData) {
  return new Set(flattenGanttNodes(root).map(({ node }) => node.id))
}

function isLeafNode(node: MindMapNodeData) {
  return !node.children || node.children.length === 0
}

function getEffectiveDateRange(node: MindMapNodeData): { startDate: string; dueDate: string } {
  if (isLeafNode(node)) {
    const today = getTodayDateString()
    const startDate = node.startDate ?? today

    return {
      startDate,
      dueDate: node.dueDate ?? (startDate === today ? addDays(today, 7) : startDate),
    }
  }

  const childRanges = (node.children ?? []).map(getEffectiveDateRange)

  if (childRanges.length === 0) {
    const today = getTodayDateString()

    return {
      startDate: today,
      dueDate: today,
    }
  }

  return {
    startDate: childRanges.reduce((earliest, range) => range.startDate < earliest ? range.startDate : earliest, childRanges[0].startDate),
    dueDate: childRanges.reduce((latest, range) => range.dueDate > latest ? range.dueDate : latest, childRanges[0].dueDate),
  }
}

function normalizeProgress(value: number) {
  return Math.min(100, Math.max(0, Math.round(value / 10) * 10))
}

function getEffectiveProgress(node: MindMapNodeData): number {
  if (isLeafNode(node)) {
    return normalizeProgress(node.progress ?? 0)
  }

  const childProgressValues = (node.children ?? []).map(getEffectiveProgress)

  if (childProgressValues.length === 0) {
    return 0
  }

  return Math.round(childProgressValues.reduce((sum, progress) => sum + progress, 0) / childProgressValues.length)
}

function getEffectiveAssignee(node: MindMapNodeData): string {
  if (isLeafNode(node)) {
    return node.assignee ?? ''
  }

  const assignees = new Set<string>()

  function collectAssignees(currentNode: MindMapNodeData) {
    if (isLeafNode(currentNode)) {
      if (currentNode.assignee?.trim()) {
        assignees.add(currentNode.assignee.trim())
      }
      return
    }

    currentNode.children?.forEach(collectAssignees)
  }

  collectAssignees(node)

  return [...assignees].join(', ')
}

function hasDependencyPath(root: MindMapNodeData, fromNodeId: string, targetNodeId: string, visited = new Set<string>()): boolean {
  if (fromNodeId === targetNodeId) {
    return true
  }

  if (visited.has(fromNodeId)) {
    return false
  }

  visited.add(fromNodeId)
  const node = flattenGanttNodes(root).find((item) => item.node.id === fromNodeId)?.node

  return Boolean(node?.dependsOn?.some((dependencyId) => hasDependencyPath(root, dependencyId, targetNodeId, visited)))
}

function sanitizeDependencies(root: MindMapNodeData, nodeId: string, dependencies: string[]) {
  const validNodeIds = collectNodeIds(root)

  return [...new Set(dependencies)].filter((dependencyId) => (
    dependencyId !== nodeId &&
    validNodeIds.has(dependencyId) &&
    !hasDependencyPath(root, dependencyId, nodeId)
  ))
}

function createGanttTasks(root: MindMapNodeData): Task[] {
  const validNodeIds = collectNodeIds(root)
  const tasks: Task[] = []

  for (const { node, depth } of flattenGanttNodes(root)) {
    const dateRange = getEffectiveDateRange(node)
    const start = parseDate(dateRange.startDate)
    const end = parseDate(dateRange.dueDate)

    if (!start || !end) {
      continue
    }

    tasks.push({
      id: node.id,
      name: `${'  '.repeat(depth)}${node.topic}`,
      start,
      end,
      progress: getEffectiveProgress(node),
      type: 'task',
      dependencies: node.dependsOn?.filter((dependencyId) => validNodeIds.has(dependencyId)) ?? [],
    })
  }

  return tasks
}

export function GanttView({ root, selectedNodeId, onSelectNode, onUpdateNode }: GanttViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadGanttViewMode())
  const [areTaskFieldsCollapsed, setAreTaskFieldsCollapsed] = useState(() => loadGanttFieldsCollapsed())
  const chartPanelRef = useRef<HTMLDivElement | null>(null)
  const flatNodes = flattenGanttNodes(root)
  const tasks = createGanttTasks(root)
  const latestStateRef = useRef({ root, selectedNodeId, flatNodes, onSelectNode, onUpdateNode, areTaskFieldsCollapsed, setAreTaskFieldsCollapsed })

  useEffect(() => {
    latestStateRef.current = { root, selectedNodeId, flatNodes, onSelectNode, onUpdateNode, areTaskFieldsCollapsed, setAreTaskFieldsCollapsed }
  }, [root, selectedNodeId, flatNodes, onSelectNode, onUpdateNode, areTaskFieldsCollapsed])

  useEffect(() => {
    window.localStorage.setItem(ganttViewModeStorageKey, viewMode)
  }, [viewMode])

  useEffect(() => {
    window.localStorage.setItem(ganttFieldsCollapsedStorageKey, String(areTaskFieldsCollapsed))
  }, [areTaskFieldsCollapsed])

  useEffect(() => {
    const panel = chartPanelRef.current
    const timeoutIds: number[] = []

    if (!panel) {
      return
    }

    function applyWeekendStyles(attempt = 0) {
      const svg = panel?.querySelector<SVGSVGElement>('svg')

      if (!svg) {
        if (attempt < 10) {
          timeoutIds.push(window.setTimeout(() => applyWeekendStyles(attempt + 1), 50))
        }
        return
      }

      svg.classList.remove('gantt-day-header-ready')
      svg.querySelectorAll('.gantt-weekend-highlight-layer').forEach((element) => element.remove())
      const dayTexts: Array<{ element: SVGTextElement; dayName: string; dayNumber: string; x: number }> = []

      for (const element of svg.querySelectorAll<SVGTextElement>('text')) {
        const text = element.textContent?.trim() ?? ''

        const match = text.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat|日|月|火|水|木|金|土),\s*(\d+)$/)
        const savedDayName = element.dataset.ganttDayName
        const savedDayNumber = element.dataset.ganttDayNumber
        const x = Number(element.getAttribute('x'))

        if (Number.isNaN(x)) {
          continue
        }

        if (match) {
          element.dataset.ganttDayName = match[1]
          element.dataset.ganttDayNumber = match[2]
          dayTexts.push({ element, dayName: match[1], dayNumber: match[2], x })
          continue
        }

        if (savedDayName && savedDayNumber) {
          dayTexts.push({ element, dayName: savedDayName, dayNumber: savedDayNumber, x })
        }
      }

      if (dayTexts.length === 0) {
        if (viewMode !== ViewMode.Day) {
          svg.classList.add('gantt-day-header-ready')
        }

        if (attempt < 10) {
          timeoutIds.push(window.setTimeout(() => applyWeekendStyles(attempt + 1), 50))
        }
        return
      }

      for (const dayText of dayTexts) {
        dayText.element.textContent = dayText.dayNumber
        dayText.element.classList.remove('gantt-weekend-day', 'gantt-saturday', 'gantt-sunday')

        if (dayText.dayName === 'Sat' || dayText.dayName === '土') {
          dayText.element.classList.add('gantt-weekend-day', 'gantt-saturday')
        }

        if (dayText.dayName === 'Sun' || dayText.dayName === '日') {
          dayText.element.classList.add('gantt-weekend-day', 'gantt-sunday')
        }
      }

      svg.classList.add('gantt-day-header-ready')

      const validWeekendTexts = dayTexts
        .filter((item) => item.dayName === 'Sat' || item.dayName === 'Sun' || item.dayName === '土' || item.dayName === '日')
        .sort((a, b) => a.x - b.x)

      if (validWeekendTexts.length === 0) {
        return
      }

      const allDayTextXs = dayTexts.map((item) => item.x).sort((a, b) => a - b)
      const columnWidth = allDayTextXs.length > 1 ? Math.min(...allDayTextXs.slice(1).map((x, index) => Math.abs(x - allDayTextXs[index])).filter((width) => width > 0)) : 48
      const svgHeight = Number(svg.getAttribute('height')) || svg.getBoundingClientRect().height
      const highlightLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      highlightLayer.setAttribute('class', 'gantt-weekend-highlight-layer')

      for (const { dayName, x } of validWeekendTexts) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.setAttribute('class', `gantt-weekend-highlight ${dayName === 'Sat' || dayName === '土' ? 'gantt-saturday-column' : 'gantt-sunday-column'}`)
        rect.setAttribute('x', String(x - columnWidth / 2))
        rect.setAttribute('y', '0')
        rect.setAttribute('width', String(columnWidth))
        rect.setAttribute('height', String(svgHeight))
        highlightLayer.appendChild(rect)
      }

      svg.appendChild(highlightLayer)
    }

    for (const delay of [50, 150, 300]) {
      timeoutIds.push(window.setTimeout(() => applyWeekendStyles(), delay))
    }

    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
  }, [tasks, viewMode, areTaskFieldsCollapsed])

  function stopFieldEventPropagation(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement> | PointerEvent<HTMLInputElement | HTMLSelectElement>) {
    event.stopPropagation()

    if ('nativeEvent' in event) {
      event.nativeEvent.stopImmediatePropagation()
    }
  }

  const TaskListHeader = useMemo(() => function GanttTaskListHeader({ headerHeight }: { headerHeight: number }) {
    return (
      <div className={`gantt-inline-header${latestStateRef.current.areTaskFieldsCollapsed ? ' collapsed' : ''}`} style={{ height: headerHeight }}>
        <span className="gantt-inline-name-header">
          <span>Name</span>
          <button
            type="button"
            className="gantt-fields-toggle"
            onClick={() => latestStateRef.current.setAreTaskFieldsCollapsed((collapsed) => !collapsed)}
            aria-pressed={latestStateRef.current.areTaskFieldsCollapsed}
          >
            {latestStateRef.current.areTaskFieldsCollapsed ? 'Show' : 'Hide'}
          </button>
        </span>
        {!latestStateRef.current.areTaskFieldsCollapsed && (
          <>
            <span>From</span>
            <span>To</span>
            <span>Assignee</span>
            <span>%</span>
            <span>Depends on</span>
          </>
        )}
      </div>
    )
  }, [])

  const TaskListTable = useMemo(() => function GanttTaskListTable({ rowHeight, tasks: listTasks, setSelectedTask }: { rowHeight: number; tasks: Task[]; setSelectedTask: (taskId: string) => void }) {
    const { root, selectedNodeId, flatNodes, onSelectNode, onUpdateNode, areTaskFieldsCollapsed } = latestStateRef.current

    function updateDependencies(nodeId: string, value: string) {
      const dependencies = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      const sanitizedDependencies = sanitizeDependencies(root, nodeId, dependencies)

      onUpdateNode(nodeId, { dependsOn: sanitizedDependencies.length > 0 ? sanitizedDependencies : undefined })
    }

    return (
      <div className="gantt-inline-table" aria-label="Gantt task fields">
        {listTasks.map((task) => {
          const flatNode = flatNodes.find((item) => item.node.id === task.id)

        if (!flatNode) {
          return null
        }

        const { node, depth } = flatNode
        const leaf = isLeafNode(node)
        const dateRange = getEffectiveDateRange(node)
        const assignee = getEffectiveAssignee(node)
        const progress = getEffectiveProgress(node)

          return (
            <div
              key={node.id}
              className={`gantt-inline-row${areTaskFieldsCollapsed ? ' collapsed' : ''}${node.id === selectedNodeId ? ' selected' : ''}`}
              style={{ height: rowHeight }}
              onClick={() => {
                onSelectNode(node.id)
                setSelectedTask(node.id)
              }}
              onFocus={() => {
                onSelectNode(node.id)
                setSelectedTask(node.id)
              }}
            >
            <label className="gantt-inline-name" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
              <span className="visually-hidden">Name</span>
              <input
                aria-label={`Name ${node.topic}`}
                value={node.topic}
                onPointerDown={stopFieldEventPropagation}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={stopFieldEventPropagation}
                onChange={(event) => onUpdateNode(node.id, { topic: event.target.value })}
              />
            </label>
            {!areTaskFieldsCollapsed && (
              <>
            <label>
              <span className="visually-hidden">From</span>
              {leaf ? (
                <input
                  aria-label={`From ${node.topic}`}
                  type="date"
                  value={dateRange.startDate}
                  title="From"
                  onPointerDown={stopFieldEventPropagation}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={stopFieldEventPropagation}
                  onChange={(event) => {
                    const startDate = event.target.value || undefined
                    const updates: Partial<MindMapNodeData> = { startDate }

                    if (!node.dueDate && startDate === getTodayDateString()) {
                      updates.dueDate = addDays(startDate, 7)
                    }

                    onUpdateNode(node.id, updates)
                  }}
                />
              ) : (
                <span className="gantt-inline-readonly" title="Calculated from child tasks">{dateRange.startDate}</span>
              )}
            </label>
            <label>
              <span className="visually-hidden">To</span>
              {leaf ? (
                <input
                  aria-label={`To ${node.topic}`}
                  type="date"
                  value={dateRange.dueDate}
                  title="To"
                  onPointerDown={stopFieldEventPropagation}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={stopFieldEventPropagation}
                  onChange={(event) => onUpdateNode(node.id, { dueDate: event.target.value || undefined })}
                />
              ) : (
                <span className="gantt-inline-readonly" title="Calculated from child tasks">{dateRange.dueDate}</span>
              )}
            </label>
            <label>
              <span className="visually-hidden">Assignee</span>
              {leaf ? (
                <input
                  aria-label={`Assignee ${node.topic}`}
                  value={assignee}
                  placeholder="Assignee"
                  title="Assignee"
                  onPointerDown={stopFieldEventPropagation}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={stopFieldEventPropagation}
                  onChange={(event) => onUpdateNode(node.id, { assignee: event.target.value || undefined })}
                />
              ) : (
                <span className="gantt-inline-readonly" title="Calculated from child tasks">{assignee || '-'}</span>
              )}
            </label>
            <label>
              <span className="visually-hidden">Progress</span>
              {leaf ? (
                <input
                  aria-label={`Progress ${node.topic}`}
                  type="number"
                  min="0"
                  max="100"
                  step="10"
                  value={progress}
                  title="Progress"
                  onPointerDown={stopFieldEventPropagation}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={stopFieldEventPropagation}
                  onChange={(event) => onUpdateNode(node.id, { progress: normalizeProgress(Number(event.target.value) || 0) })}
                />
              ) : (
                <span className="gantt-inline-readonly" title="Calculated from child tasks">{progress}%</span>
              )}
            </label>
            <label>
              <span className="visually-hidden">Depends on</span>
              <select
                aria-label={`Depends on ${node.topic}`}
                value={node.dependsOn?.[0] ?? ''}
                onPointerDown={stopFieldEventPropagation}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={stopFieldEventPropagation}
                onChange={(event) => updateDependencies(node.id, event.target.value)}
              >
                <option value="">None</option>
                {flatNodes
                  .filter((item) => item.node.id !== node.id && !hasDependencyPath(root, item.node.id, node.id))
                  .map((item) => (
                    <option key={item.node.id} value={item.node.id}>{item.node.topic}</option>
                  ))}
              </select>
            </label>
              </>
            )}
            </div>
          )
        })}
      </div>
    )
  }, [])

  return (
    <section className="gantt-view" aria-label="Gantt chart mode">
      <div className="gantt-chart-toolbar" aria-label="Gantt view mode">
        {viewModes.map((mode) => (
          <button
            key={mode.label}
            type="button"
            onClick={() => setViewMode(mode.value)}
            className={mode.value === viewMode ? 'active' : ''}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <div ref={chartPanelRef} className={`gantt-chart-panel ${viewMode === ViewMode.Day ? 'day-mode' : ''}`}>
        <div className="gantt-chart-scroll-area">
          {tasks.length > 0 ? (
            <Gantt
            tasks={tasks}
            viewMode={viewMode}
            columnWidth={columnWidthByViewMode[viewMode]}
            listCellWidth={areTaskFieldsCollapsed ? '240px' : '680px'}
            rowHeight={34}
            headerHeight={42}
            key={areTaskFieldsCollapsed ? 'gantt-collapsed' : 'gantt-expanded'}
            TaskListHeader={TaskListHeader}
            TaskListTable={TaskListTable}
            onClick={(task) => onSelectNode(task.id)}
            onDateChange={(task) => {
              const node = flatNodes.find((item) => item.node.id === task.id)?.node

              if (!node || !isLeafNode(node)) {
                return
              }

              onUpdateNode(task.id, {
                startDate: formatDate(task.start),
                dueDate: formatDate(task.end),
              })
            }}
            onProgressChange={(task) => {
              const node = flatNodes.find((item) => item.node.id === task.id)?.node

              if (!node || !isLeafNode(node)) {
                return
              }

              onUpdateNode(task.id, { progress: normalizeProgress(task.progress) })
            }}
            />
          ) : (
            <p className="gantt-empty">Tasks will appear on the timeline using today's date.</p>
          )}
        </div>
      </div>
    </section>
  )
}
