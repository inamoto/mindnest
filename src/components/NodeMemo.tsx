import { Suspense, lazy, useEffect, useRef, useState, type MouseEvent } from 'react'
import type { MindMapNodeData } from '../types'
import { MarkdownEditor } from './MarkdownEditor'
type MemoMode = 'preview' | 'edit'
type TextSelection = { start: number; end: number; direction: 'forward' | 'backward' | 'none' }

const MarkdownPreview = lazy(() =>
  import('./MarkdownPreview').then((module) => ({ default: module.MarkdownPreview })),
)

interface NodeMemoProps {
  node: MindMapNodeData | null
  focusRequest: number
  previewRequest: number
  onMemoChange: (memo: string) => void
  onEscapeEditor: () => void
}

export function NodeMemo({ node, focusRequest, previewRequest, onMemoChange, onEscapeEditor }: NodeMemoProps) {
  const [mode, setMode] = useState<MemoMode>('preview')
  const [isMarkdownHelpVisible, setIsMarkdownHelpVisible] = useState(false)
  const [pendingFocusRequest, setPendingFocusRequest] = useState(0)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const editorSelectionsRef = useRef(new Map<string, TextSelection>())

  useEffect(() => {
    if (focusRequest <= 0 || !node) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setMode('edit')
      setPendingFocusRequest((request) => request + 1)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [focusRequest, node])

  useEffect(() => {
    if (previewRequest <= 0) {
      return
    }

    if (document.activeElement === editorRef.current) {
      editorRef.current?.blur()
    }

    const timeoutId = window.setTimeout(() => setMode('preview'), 0)

    return () => window.clearTimeout(timeoutId)
  }, [previewRequest])

  useEffect(() => {
    if (mode !== 'edit' || pendingFocusRequest <= 0) {
      return
    }

    const initialValueLength = editorRef.current?.value.length
    const timeoutId = window.setTimeout(() => {
      const editor = editorRef.current

      if (!editor) {
        return
      }

      const savedSelection = node ? editorSelectionsRef.current.get(node.id) : undefined
      editor.focus()

      if (document.activeElement === editor && editor.value.length === initialValueLength) {
        const start = Math.min(savedSelection?.start ?? editor.value.length, editor.value.length)
        const end = Math.min(savedSelection?.end ?? editor.value.length, editor.value.length)
        editor.setSelectionRange(start, end, savedSelection?.direction ?? 'none')
      }
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [mode, node, pendingFocusRequest])

  if (!node) {
    return (
      <aside className="memo-panel">
        <p className="empty-preview">Select a node to view its memo.</p>
      </aside>
    )
  }

  const memo = node.memo ?? ''

  function startEditing() {
    setMode('edit')
    setPendingFocusRequest((request) => request + 1)
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('a, button, input, textarea, select, [role="button"]')) {
      return
    }

    const selection = window.getSelection()

    if (selection && !selection.isCollapsed) {
      return
    }

    startEditing()
  }

  return (
    <aside className="memo-panel">
      <header className="memo-header">
        <div>
          <h2>{node.topic}</h2>
        </div>
        <div className="memo-header-actions">
          <button
            type="button"
            aria-label="Show Markdown help"
            title="Markdown help"
            aria-expanded={isMarkdownHelpVisible}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setIsMarkdownHelpVisible((visible) => !visible)}
          >
            ?
          </button>
        </div>
      </header>

      {isMarkdownHelpVisible && (
        <section className="markdown-help" aria-label="Markdown help">
          <div>
            <h3>Supported Markdown</h3>
            <ul>
              <li><code># Heading</code>, <code>## Heading</code></li>
              <li>Paragraphs, <code>**bold**</code>, <code>*italic*</code></li>
              <li><code>- item</code>, <code>1. item</code></li>
              <li><code>&gt; quote</code></li>
              <li><code>`inline code`</code>, fenced code blocks</li>
              <li><code>[link](https://...)</code>, <code>![image](url)</code></li>
              <li><code>---</code> horizontal rules</li>
              <li>Tables</li>
              <li><code>~~strikethrough~~</code></li>
              <li><code>$x^2$</code>, <code>$$x^2$$</code> math notation</li>
              <li>Syntax highlighting for fenced code blocks</li>
            </ul>
          </div>
          <div>
            <h3>Unsupported Markdown</h3>
            <ul>
              <li>Task lists</li>
              <li>Mermaid diagrams</li>
            </ul>
          </div>
        </section>
      )}

      {mode === 'edit' ? (
        <MarkdownEditor
          editorRef={editorRef}
          value={memo}
          onSelectionChange={(selection) => editorSelectionsRef.current.set(node.id, selection)}
          onChange={onMemoChange}
          onBlur={() => setMode('preview')}
          onEscape={onEscapeEditor}
        />
      ) : (
        <Suspense fallback={<p className="empty-preview markdown-preview-loading">Loading preview...</p>}>
          <MarkdownPreview value={memo} onClick={handlePreviewClick} />
        </Suspense>
      )}
    </aside>
  )
}
