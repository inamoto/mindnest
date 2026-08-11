import ReactMarkdown from 'react-markdown'
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

export function MarkdownPreview({ value, onDoubleClick }: MarkdownPreviewProps) {
  const normalizedValue = normalizeDisplayMath(value)

  return (
    <div className="markdown-preview" onDoubleClick={onDoubleClick}>
      {value.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeSelectedHighlight]}>{normalizedValue}</ReactMarkdown>
      ) : (
        <p className="empty-preview">No memo yet.</p>
      )}
    </div>
  )
}
