type MemoMode = 'preview' | 'edit'

interface MemoToolbarProps {
  mode: MemoMode
  onModeChange: (mode: MemoMode) => void
}

export function MemoToolbar({ mode, onModeChange }: MemoToolbarProps) {
  return (
    <div className="memo-tabs" role="tablist" aria-label="Memo mode">
      <button type="button" className={mode === 'edit' ? 'active' : ''} onClick={() => onModeChange('edit')} aria-label="Edit memo" title="Edit memo">
        ✎
      </button>
    </div>
  )
}

export type { MemoMode }
