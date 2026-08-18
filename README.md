# MindNest

MindNest is a browser-based mind map app for organizing ideas, notes, WBS, and schedules.

## Features

- MindMap editing with draggable nodes
- Copy and paste MindMap node subtrees
- Markdown memo per node
- Split, Map-only, and Memo-only workspace layouts
- Preserves MindMap pan and expanded/collapsed state while editing memos
- Child MindMap navigation
- Node color customization
- Gantt mode for WBS scheduling
- Task fields: From, To, Assignee, %, Depends on
- Parent task dates/progress are calculated from child tasks
- Local persistence with IndexedDB
- JSON export/import with replace-or-append import flow
- Responsive split layout for narrow windows with stacked MindMap and memo panes

## Tech Stack

- React
- TypeScript
- Vite
- jsMind
- gantt-task-react
- Dexie

## Getting Started

```bash
npm install
npm run dev
```

## Check

```bash
npm run check
```

## Build

```bash
npm run build
```
