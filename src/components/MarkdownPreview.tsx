import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { rehypeSelectedHighlight } from '../markdown/rehypeSelectedHighlight'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'

interface MarkdownPreviewProps {
  value: string
  onDoubleClick?: () => void
}


function normalizeDisplayMath(value: string) {
  return value.replace(/(^|\n)\$\$([^\n$][^\n]*?)\$\$(?=\n|$)/g, (_match, prefix: string, math: string) => `${prefix}$$\n${math.trim()}\n$$`)
}

const markdownComponents: Components = {
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}

export function MarkdownPreview({ value, onDoubleClick }: MarkdownPreviewProps) {
  const normalizedValue = normalizeDisplayMath(value)

  return (
    <div className="markdown-preview" onDoubleClick={onDoubleClick}>
      {value.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeSelectedHighlight]} components={markdownComponents}>{normalizedValue}</ReactMarkdown>
      ) : (
        <p className="empty-preview">No memo yet.</p>
      )}
    </div>
  )
}
