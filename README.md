# MindNest

MindNest is a browser-based mind map app for organizing ideas, notes, WBS, and schedules.

## Features

- MindMap editing with draggable nodes
- Markdown memo per node
- Preserves MindMap pan and expanded/collapsed state while editing memos
- Child MindMap navigation
- Node color customization
- Gantt mode for WBS scheduling
- Task fields: From, To, Assignee, %, Depends on
- Parent task dates/progress are calculated from child tasks
- Local persistence with IndexedDB
- JSON export/import
- Responsive split layout for narrow windows

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
