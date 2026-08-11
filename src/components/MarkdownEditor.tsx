import { useLayoutEffect, useRef } from 'react'
import type { ChangeEvent, KeyboardEvent, RefObject } from 'react'

interface MarkdownEditorProps {
  value: string
  editorRef?: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
  onBlur?: () => void
  onEscape?: () => void
}

export function MarkdownEditor({ value, editorRef, onChange, onBlur, onEscape }: MarkdownEditorProps) {
  const selectionRef = useRef<{ start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null>(null)

  function rememberSelection(textarea: HTMLTextAreaElement) {
    selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      direction: textarea.selectionDirection,
    }
  }

  useLayoutEffect(() => {
    const textarea = editorRef?.current
    const selection = selectionRef.current

    if (!textarea || document.activeElement !== textarea || !selection) {
      return
    }

    const start = Math.min(selection.start, value.length)
    const end = Math.min(selection.end, value.length)
    textarea.setSelectionRange(start, end, selection.direction)
  }, [editorRef, value])

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    rememberSelection(event.currentTarget)
    onChange(event.currentTarget.value)
  }

  function stopNativeShortcutPropagation(event: KeyboardEvent<HTMLTextAreaElement>) {
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
  }

  function handleTabKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    event.preventDefault()

    const textarea = event.currentTarget
    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    textarea.setRangeText('\t', selectionStart, selectionEnd, 'end')
    rememberSelection(textarea)
    onChange(textarea.value)
  }

  return (
    <textarea
      ref={editorRef}
      className="markdown-editor"
      value={value}
      onChange={handleChange}
      onBlur={onBlur}
      onKeyDown={(event) => {
        stopNativeShortcutPropagation(event)

        if (event.key === 'Tab') {
          handleTabKey(event)
          return
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          onEscape?.()
        }
      }}
      placeholder="Markdown memo..."
      aria-label="Markdown memo editor"
    />
  )
}
