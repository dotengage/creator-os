import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { cx, uniq } from '../lib/utils'
import { Button, IconButton, Input, Select } from './ui'

/**
 * A select that can mint a new category inline — the creator should never have
 * to leave what they are writing to go set up a taxonomy first.
 */
export function CategorySelect({ value, options, onChange, onCreate, placeholder = 'Uncategorised' }: {
  value: string
  options: string[]
  onChange: (v: string) => void
  onCreate?: (v: string) => void
  placeholder?: string
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const all = uniq([...options, value].filter(Boolean))

  const commit = () => {
    const v = draft.trim()
    if (!v) return setAdding(false)
    onCreate?.(v)
    onChange(v)
    setDraft('')
    setAdding(false)
  }

  if (adding) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={draft}
          placeholder="New category name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setDraft(''); setAdding(false) }
          }}
        />
        <IconButton label="Save category" onClick={commit}><Check size={16} /></IconButton>
        <IconButton label="Cancel" onClick={() => { setDraft(''); setAdding(false) }}><X size={16} /></IconButton>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="flex-1">
        <option value="">{placeholder}</option>
        {all.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Button type="button" onClick={() => setAdding(true)} className="shrink-0" title="Add a category">
        <Plus size={15} />
      </Button>
    </div>
  )
}

/** Horizontal, scrollable filter row used at the top of library pages. */
export function CategoryFilter({ value, onChange, options, counts, allLabel = 'All' }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  counts?: Record<string, number>
  allLabel?: string
}) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined
  const render = (id: string, label: string, count?: number) => {
    const active = value === id
    return (
      <button
        key={id || '__all'}
        onClick={() => onChange(id)}
        className={cx(
          'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-200 active:scale-95',
          active
            ? 'border-accent bg-accent text-accent-ink shadow-soft'
            : 'border-line bg-surface text-muted hover:border-faint hover:text-ink',
        )}
      >
        {label}
        {count !== undefined && (
          <span className={cx('ml-1.5 text-[11px]', active ? 'opacity-75' : 'text-faint')}>{count}</span>
        )}
      </button>
    )
  }

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0">
      {render('', allLabel, total)}
      {options.map((c) => render(c, c, counts?.[c]))}
    </div>
  )
}
