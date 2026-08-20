# MindNest

MindNest is a browser-based mind map app for organizing ideas, notes, WBS, and schedules.

## Features

- MindMap editing with draggable nodes
- Copy, cut, and paste MindMap node subtrees
- Markdown memo per node
- Memo editor cursor position is restored when toggling preview/edit with Ctrl/Cmd+M
- Split, Map-only, and Memo-only workspace layouts
- Prevents map scrolling while dragging nodes
- Preserves MindMap pan and expanded/collapsed state while editing memos
- Browser tab title follows the currently open MindMap topic
- PNG favicon served from `public/favicon.png`
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

## E2E Tests

```bash
npm run test:e2e
```

Focused cursor restoration regression test:

```bash
npx playwright test tests/e2e/edit-cursor.spec.ts --project=chromium
```

## Build

```bash
npm run build
```
