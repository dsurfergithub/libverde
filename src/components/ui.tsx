import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { EntryKind, ProjectStatus } from '../lib/types'
import { KIND_LABEL, STATUS_LABEL } from '../lib/types'

// --- Button ---------------------------------------------------------------

type Variant = 'primary' | 'ghost' | 'outline' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-ink hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed',
  outline:
    'border border-line bg-transparent text-ink hover:bg-surface-2 active:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-40',
  danger: 'border border-pendiente/40 text-pendiente hover:bg-pendiente-soft disabled:opacity-40',
}

export function Button({
  variant = 'outline',
  size = 'md',
  className = '',
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md'
  loading?: boolean
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[opacity,background-color,color] duration-150 ${
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm'
      } ${VARIANTS[variant]} ${className}`}
    >
      {loading && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}

// --- Sheet (bottom sheet, no modal centrado) ------------------------------

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="animate-fade-in absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-in relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-bg outline-none sm:max-w-lg sm:rounded-2xl"
        style={{ boxShadow: 'var(--shadow-sheet)' }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}

// --- Badges ---------------------------------------------------------------

const KIND_STYLE: Record<EntryKind, string> = {
  nota: 'bg-surface-2 text-muted',
  idea: 'bg-idea-soft text-idea',
  avance: 'bg-primary-soft text-primary',
  pendiente: 'bg-pendiente-soft text-pendiente',
  sesion: 'bg-sesion-soft text-sesion',
}

export const KindBadge = ({ kind, className = '' }: { kind: EntryKind; className?: string }) => (
  <span
    className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] font-medium ${KIND_STYLE[kind]} ${className}`}
  >
    {KIND_LABEL[kind]}
  </span>
)

const STATUS_STYLE: Record<ProjectStatus, string> = {
  idea: 'text-muted',
  activo: 'text-primary',
  lanzada: 'text-sesion',
  pausa: 'text-muted',
}

export const StatusPill = ({ status }: { status: ProjectStatus }) => (
  <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${STATUS_STYLE[status]}`}>
    <span className="size-1.5 rounded-full bg-current" />
    {STATUS_LABEL[status]}
  </span>
)

// --- Form controls --------------------------------------------------------

const CONTROL =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors placeholder:text-muted focus:border-primary focus:outline-none'

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`${CONTROL} h-10 ${props.className ?? ''}`} />
)

export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={`${CONTROL} resize-y ${props.className ?? ''}`} />
)

export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={`${CONTROL} h-10 ${props.className ?? ''}`} />
)

export const Label = ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-muted">
    {children}
  </label>
)

// --- Category select (con creación en línea) ------------------------------

const NEW = '__new__'

export function CategorySelect({
  id,
  value,
  categories,
  onChange,
  onCreate,
}: {
  id: string
  value: string | null
  categories: string[]
  onChange: (value: string | null) => void
  onCreate: (name: string) => void
}) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const clean = draft.trim()
    if (clean) {
      onCreate(clean)
      onChange(clean)
    }
    setDraft('')
    setCreating(false)
  }

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') setCreating(false)
          }}
          placeholder="Trabajo, Ocio, Cliente…"
          autoFocus
        />
        <Button variant="outline" onClick={commit} disabled={!draft.trim()}>
          Crear
        </Button>
      </div>
    )
  }

  return (
    <Select
      id={id}
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === NEW) setCreating(true)
        else onChange(e.target.value || null)
      }}
    >
      <option value="">— Sin categoría —</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={NEW}>+ Nueva categoría…</option>
    </Select>
  )
}

export const CategoryTag = ({ name }: { name: string }) => (
  <span className="inline-flex h-5 shrink-0 items-center rounded border border-line px-1.5 text-[11px] font-medium text-muted">
    {name}
  </span>
)

// --- Empty state ----------------------------------------------------------

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 text-muted">{icon}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="max-w-[42ch] text-[13px] leading-relaxed text-muted">{children}</p>}
    </div>
  )
}
