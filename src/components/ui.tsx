import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
} from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { cx } from '../lib/utils'

/* ----------------------------------------------------------------- button */
type Variant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95 shadow-soft',
  secondary: 'bg-surface text-ink border border-line hover:bg-elevated',
  ghost: 'text-muted hover:text-ink hover:bg-elevated',
  soft: 'bg-accent-soft text-accent hover:brightness-[0.97]',
  danger: 'bg-danger text-white hover:brightness-110',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12.5px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[13.5px] gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, block, className, children, disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center font-semibold transition-all duration-200',
        'disabled:pointer-events-none disabled:opacity-45 active:scale-[.98]',
        VARIANTS[variant], SIZES[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" />}
      {children}
    </button>
  )
})

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'default' | 'danger' }>(
  function IconButton({ label, tone = 'default', className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cx(
          'inline-grid h-8 w-8 place-items-center rounded-lg transition-all duration-200 active:scale-90',
          tone === 'danger' ? 'text-muted hover:bg-danger/10 hover:text-danger' : 'text-muted hover:bg-elevated hover:text-ink',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

/* ------------------------------------------------------------------- card */
export const Card = ({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('card', className)} {...rest}>{children}</div>
)

/* ------------------------------------------------------------------ badge */
export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad' | 'accent'

const TONES: Record<Tone, string> = {
  neutral: 'bg-elevated text-muted',
  info: 'bg-accent-soft text-accent',
  accent: 'bg-accent text-accent-ink',
  good: 'bg-positive/10 text-positive',
  warn: 'bg-warning/20 text-warning',
  bad: 'bg-danger/10 text-danger',
}

export const Badge = ({ tone = 'neutral', children, className, title }: {
  tone?: Tone; children: ReactNode; className?: string; title?: string
}) => (
  <span title={title} className={cx('chip', TONES[tone], className)}>{children}</span>
)

export const Dot = ({ tone = 'neutral' }: { tone?: Tone }) => {
  const c: Record<Tone, string> = {
    neutral: 'bg-faint', info: 'bg-accent', accent: 'bg-accent',
    good: 'bg-positive', warn: 'bg-warning', bad: 'bg-danger',
  }
  return <span className={cx('inline-block h-1.5 w-1.5 shrink-0 rounded-full', c[tone])} />
}

/* ------------------------------------------------------------------ input */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx('field', className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx('field resize-y leading-relaxed', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cx('field appearance-none pr-9', className)} {...rest}>{children}</select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
      </div>
    )
  },
)

export const Field = ({ label, hint, error, children, className }: {
  label?: string; hint?: string; error?: string; children: ReactNode; className?: string
}) => (
  <div className={className}>
    {label && <span className="label">{label}</span>}
    {children}
    {error ? <p className="mt-1 text-[11.5px] font-medium text-danger">{error}</p>
      : hint ? <p className="mt-1 text-[11.5px] text-faint">{hint}</p> : null}
  </div>
)

/* ----------------------------------------------------------------- search */
export const SearchInput = ({ value, onChange, placeholder = 'Search…', className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) => (
  <div className={cx('relative', className)}>
    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="field pl-9 pr-9"
    />
    <AnimatePresence>
      {value && (
        <motion.button
          initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-elevated text-muted hover:text-ink"
        >
          <X size={12} />
        </motion.button>
      )}
    </AnimatePresence>
  </div>
)

/* -------------------------------------------------------------- segmented */
export function Segmented<T extends string>({ options, value, onChange, size = 'md', className }: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  const gid = useId()
  return (
    <div className={cx('inline-flex rounded-xl border border-line bg-elevated p-1', className)} role="tablist">
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cx(
              'relative whitespace-nowrap rounded-lg font-semibold transition-colors duration-200',
              size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
              active ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${gid}`}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg bg-surface shadow-soft"
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ modal */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', headerRight }: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  headerRight?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-4xl', xl: 'sm:max-w-6xl' }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 24, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className={cx(
              'relative flex max-h-[92vh] w-full flex-col overflow-hidden border border-line bg-surface shadow-lift',
              'rounded-t-3xl sm:rounded-2xl', widths[size],
            )}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line sm:hidden" />
            {(title || headerRight) && (
              <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  {title && <h2 className="truncate text-[16px] font-bold tracking-[-0.01em] text-ink">{title}</h2>}
                  {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-muted">{subtitle}</p>}
                </div>
                {headerRight}
                <IconButton label="Close" onClick={onClose}><X size={17} /></IconButton>
              </header>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            {footer && (
              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-elevated/50 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ---------------------------------------------------------------- confirm */
interface ConfirmSpec {
  title: string
  message?: string
  confirmLabel?: string
  tone?: 'danger' | 'primary'
}

const ConfirmCtx = createContext<(spec: ConfirmSpec) => Promise<boolean>>(async () => false)

export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [spec, setSpec] = useState<ConfirmSpec | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((s: ConfirmSpec) => {
    setSpec(s)
    return new Promise<boolean>((res) => { resolver.current = res })
  }, [])

  const settle = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setSpec(null)
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!spec} onClose={() => settle(false)} size="sm">
        <div className="flex gap-3.5">
          <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full',
            spec?.tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-accent-soft text-accent')}>
            <AlertTriangle size={19} />
          </div>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-[15px] font-bold text-ink">{spec?.title}</h3>
            {spec?.message && <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{spec.message}</p>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => settle(false)}>Cancel</Button>
          <Button variant={spec?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)}>
            {spec?.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  )
}

/* ------------------------------------------------------------------ toast */
interface ToastItem { id: number; message: string; tone: 'good' | 'bad' | 'info' }

const ToastCtx = createContext<(message: string, tone?: ToastItem['tone']) => void>(() => {})

export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const push = useCallback((message: string, tone: ToastItem['tone'] = 'good') => {
    const id = ++seq.current
    setItems((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3200)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end sm:px-0">
          <AnimatePresence initial={false}>
            {items.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-lift"
              >
                <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full',
                  t.tone === 'bad' ? 'bg-danger/10 text-danger' : t.tone === 'info' ? 'bg-accent-soft text-accent' : 'bg-positive/10 text-positive')}>
                  {t.tone === 'bad' ? <AlertTriangle size={12} /> : <Check size={12} />}
                </span>
                <span className="text-[13px] font-medium text-ink">{t.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}

/* ------------------------------------------------------------- empty state */
export const EmptyState = ({ icon, title, description, action, compact }: {
  icon?: ReactNode; title: string; description?: string; action?: ReactNode; compact?: boolean
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
    className={cx('flex flex-col items-center justify-center rounded-2xl border border-dashed border-line text-center',
      compact ? 'px-5 py-8' : 'px-6 py-16')}
  >
    {icon && <div className="mb-3.5 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
    <h3 className="text-[15px] font-bold text-ink">{title}</h3>
    {description && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </motion.div>
)

/* ---------------------------------------------------------------- popover */
export function Menu({ trigger, children, align = 'right' }: {
  trigger: (props: { onClick: (e: React.MouseEvent) => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative inline-flex">
      {trigger({ onClick: (e) => { e.stopPropagation(); setOpen((o) => !o) }, ref: btnRef })}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popRef}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14 }}
            className={cx(
              'absolute top-full z-40 mt-1.5 min-w-[188px] overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lift',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const MenuItem = ({ icon, children, onClick, tone }: {
  icon?: ReactNode; children: ReactNode; onClick: () => void; tone?: 'danger'
}) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick() }}
    className={cx(
      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
      tone === 'danger' ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-elevated',
    )}
  >
    {icon}
    {children}
  </button>
)

/* --------------------------------------------------------------- progress */
export const Progress = ({ value, tone = 'accent', height = 6, marker }: {
  value: number; tone?: 'accent' | 'good' | 'warn' | 'bad'; height?: number; marker?: number
}) => {
  const bar = { accent: 'bg-accent', good: 'bg-positive', warn: 'bg-warning', bad: 'bg-danger' }[tone]
  return (
    <div className="relative w-full overflow-hidden rounded-full bg-elevated" style={{ height }}>
      <motion.div
        className={cx('h-full rounded-full', bar)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 22 }}
      />
      {marker !== undefined && marker > 0 && marker < 100 && (
        <span
          className="absolute top-0 h-full w-px bg-ink/40"
          style={{ left: `${marker}%` }}
          title="Where you should be today"
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------ page header */
export const PageHeader = ({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children?: ReactNode
}) => (
  <div className="mb-5 flex flex-col gap-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {children}
  </div>
)

/* ------------------------------------------------------------ export menu */
export const ExportMenu = ({ onCSV, onXLSX, onPDF, label = 'Export', disabled }: {
  onCSV?: () => void; onXLSX?: () => void; onPDF?: () => void; label?: string; disabled?: boolean
}) => (
  <Menu
    trigger={({ onClick, ref }) => (
      <Button ref={ref} onClick={onClick} disabled={disabled} size="md">
        {label}
        <ChevronDown size={14} />
      </Button>
    )}
  >
    {(close) => (
      <>
        {onXLSX && <MenuItem onClick={() => { onXLSX(); close() }}>Excel (.xlsx)</MenuItem>}
        {onCSV && <MenuItem onClick={() => { onCSV(); close() }}>CSV (.csv)</MenuItem>}
        {onPDF && <MenuItem onClick={() => { onPDF(); close() }}>PDF (.pdf)</MenuItem>}
      </>
    )}
  </Menu>
)

/* ------------------------------------------------------------- animations */
export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
}

export const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const } },
}

export const List = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div variants={stagger} initial="hidden" animate="show" className={className}>{children}</motion.div>
)

export const Item = ({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) => (
  <motion.div variants={fadeUp} className={className} {...(rest as object)}>{children}</motion.div>
)

/* ------------------------------------------------------------ misc helpers */
export const useLocalState = <T,>(key: string, initial: T): [T, (v: T) => void] => {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch { return initial }
  })
  const set = useCallback((next: T) => {
    setV(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ }
  }, [key])
  return [v, set]
}

export const useMediaQuery = (query: string): boolean => {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)')

export const KeyHint = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-line bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>
)

export const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
    <p className={cx('mt-1 text-[20px] font-bold tracking-[-0.02em]',
      tone === 'good' ? 'text-positive' : tone === 'bad' ? 'text-danger' : tone === 'warn' ? 'text-warning' : 'text-ink')}>
      {value}
    </p>
    {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
  </div>
)

export const useDebounced = <T,>(value: T, ms = 220): T => {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export const memoFilter = useMemo
