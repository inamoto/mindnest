import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import type { MindMapNodeData } from '../types'
import { MarkdownEditor } from './MarkdownEditor'
import { MemoToolbar, type MemoMode } from './MemoToolbar'

const MarkdownPreview = lazy(() =>
  import('./MarkdownPreview').then((module) => ({ default: module.MarkdownPreview })),
)

interface NodeMemoProps {
  node: MindMapNodeData | null
  focusRequest: number
  previewRequest: number
  onMemoChange: (memo: string) => void
  onEscapeEditor: () => void
  onHideMemo: () => void
}

export function NodeMemo({ node, focusRequest, previewRequest, onMemoChange, onEscapeEditor, onHideMemo }: NodeMemoProps) {
  const [mode, setMode] = useState<MemoMode>('preview')
  const [isMarkdownHelpVisible, setIsMarkdownHelpVisible] = useState(false)
  const [pendingFocusRequest, setPendingFocusRequest] = useState(0)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)

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

    const timeoutId = window.setTimeout(() => {
      editorRef.current?.focus()
      editorRef.current?.setSelectionRange(editorRef.current.value.length, editorRef.current.value.length)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [mode, pendingFocusRequest])

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

  return (
    <aside className="memo-panel">
      <header className="memo-header">
        <div>
          <h2>{node.topic}</h2>
        </div>
        <div className="memo-header-actions">
          <MemoToolbar
            mode={mode}
            onModeChange={(nextMode) => {
              setMode(nextMode)

              if (nextMode === 'edit') {
                setPendingFocusRequest((request) => request + 1)
              }
            }}
          />
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
          <button type="button" onClick={onHideMemo} aria-label="Hide memo" title="Hide memo">▸</button>
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
          onChange={onMemoChange}
          onBlur={() => setMode('preview')}
          onEscape={onEscapeEditor}
        />
      ) : (
        <Suspense fallback={<p className="empty-preview markdown-preview-loading">Loading preview...</p>}>
          <MarkdownPreview value={memo} onDoubleClick={startEditing} />
        </Suspense>
      )}
    </aside>
  )
}
