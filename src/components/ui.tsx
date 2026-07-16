import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { EntryKind, ProjectStatus } from '../lib/types'
import { KIND_LABEL, STATUS_LABEL } from '../lib/types'
import { sfx } from '../lib/sound'

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
      className={`pressable inline-flex items-center justify-center gap-2 rounded-xl font-medium ${
        size === 'sm' ? 'h-9 px-3 text-[14px]' : 'h-11 px-4 text-[16px]'
      } ${VARIANTS[variant]} ${className}`}
    >
      {loading && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}

// --- Sheet (bottom sheet estilo iOS) ---------------------------------------
//
// Tres cosas lo hacen "de verdad" en un iPhone:
// 1. visualViewport: cuando sale el teclado, el sheet se eleva con él — antes
//    los campos opcionales quedaban enterrados bajo el teclado.
// 2. Arrastrable: sigue al dedo 1:1 desde la cabecera, con rubber-band hacia
//    arriba, y al soltar decide por VELOCIDAD proyectada (no por posición).
// 3. Muelle: entra y sale por el mismo camino, interrumpible a mitad de vuelo.

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Cuánto viajará algo soltado a esta velocidad (deceleración de scroll de iOS). */
const project = (velocity: number, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate)

/** Resistencia progresiva al pasar el límite: se nota que ahí no hay nada más. */
const rubberband = (overshoot: number, dimension: number, c = 0.55) =>
  (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot))

/** Altura del teclado en pantalla (0 con teclado oculto o en escritorio). */
function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () =>
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

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
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const kb = useKeyboardInset()

  // Estado del gesto y del muelle, fuera de React: se muta a 60fps.
  const gesture = useRef({
    active: false,
    startY: 0,
    dy: 0,
    hist: [] as { y: number; t: number }[],
    raf: 0,
    dismissing: false,
  })

  const setY = (dy: number) => {
    const el = panel.current
    if (!el) return
    el.style.transform = dy ? `translateY(${dy}px)` : ''
    if (backdrop.current)
      backdrop.current.style.opacity = String(Math.max(0.25, 1 - (dy / Math.max(1, el.offsetHeight)) * 0.9))
  }

  /** Muelle crítico con velocidad inicial: sin costura entre dedo y animación. */
  const springTo = useCallback(
    (target: number, v0: number, onDone?: () => void) => {
      const g = gesture.current
      cancelAnimationFrame(g.raf)
      const stiffness = 320
      const damping = 2 * Math.sqrt(stiffness) // crítico: llega sin rebotar
      let x = g.dy
      let v = v0
      let last = performance.now()
      const step = (now: number) => {
        const dt = Math.min(0.032, (now - last) / 1000)
        last = now
        v += (-stiffness * (x - target) - damping * v) * dt
        x += v * dt
        g.dy = x
        if (Math.abs(x - target) < 0.4 && Math.abs(v) < 10) {
          g.dy = target
          setY(target)
          onDone?.()
          return
        }
        setY(x)
        g.raf = requestAnimationFrame(step)
      }
      g.raf = requestAnimationFrame(step)
    },
    [],
  )

  /** Cierre animado: baja por donde subió y solo entonces desmonta. */
  const dismiss = useCallback(
    (v0 = 0) => {
      const g = gesture.current
      if (g.dismissing) return
      g.dismissing = true
      const el = panel.current
      // Con la página oculta el rAF se congela: cerrar en seco, no atascarse.
      if (!el || reducedMotion() || document.visibilityState === 'hidden') {
        onClose()
        return
      }
      let closed = false
      const finish = () => {
        if (closed) return
        closed = true
        onClose()
      }
      // Red de seguridad: si iOS congela los frames a mitad del muelle,
      // el sheet se cierra igualmente y no se queda bloqueado.
      window.setTimeout(finish, 600)
      springTo(el.offsetHeight + 60, Math.max(v0, 900), finish)
    },
    [onClose, springTo],
  )

  // dismiss va por ref: si el efecto dependiera de él, cualquier padre que se
  // re-renderice con un onClose inline (TimerBar late cada segundo) lo
  // re-ejecutaría y panel.focus() robaría el foco al campo que estés escribiendo.
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissRef.current()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus({ preventScroll: true })
    const g = gesture.current
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      cancelAnimationFrame(g.raf)
    }
  }, [open])

  if (!open) return null

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const g = gesture.current
    if (g.dismissing) return
    cancelAnimationFrame(g.raf) // interrumpible: se agarra en pleno vuelo
    g.active = true
    g.startY = e.clientY - g.dy // respeta el punto de agarre
    g.hist = [{ y: e.clientY, t: performance.now() }]
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    panel.current && (panel.current.style.willChange = 'transform')
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g.active) return
    const el = panel.current
    if (!el) return
    let dy = e.clientY - g.startY
    if (dy < 0) dy = rubberband(dy, el.offsetHeight) // arriba no hay más
    g.dy = dy
    g.hist.push({ y: e.clientY, t: performance.now() })
    if (g.hist.length > 6) g.hist.shift()
    setY(dy)
  }

  const onPointerUp = () => {
    const g = gesture.current
    if (!g.active) return
    g.active = false
    const el = panel.current
    if (el) el.style.willChange = ''
    const h = el?.offsetHeight ?? 400
    const a = g.hist[0]
    const b = g.hist[g.hist.length - 1]
    const v = b && a && b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0
    // Decide el destino con la proyección del momento, no con la posición.
    const restingPoint = g.dy + project(v)
    if (g.dy > 0 && (restingPoint > h * 0.45 || v > 900)) dismiss(v)
    else springTo(0, v)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ paddingBottom: kb }}
    >
      <div
        ref={backdrop}
        className="animate-fade-in absolute inset-0 bg-black/50"
        onClick={() => dismiss()}
        aria-hidden
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-in relative flex w-full flex-col overflow-hidden rounded-t-[22px] border border-line bg-bg outline-none sm:max-w-lg sm:rounded-2xl"
        style={{
          boxShadow: 'var(--shadow-sheet)',
          maxHeight: kb
            ? `calc(100dvh - ${kb}px - max(env(safe-area-inset-top), 16px))`
            : 'min(88dvh, calc(100dvh - max(env(safe-area-inset-top), 16px)))',
        }}
      >
        <header
          className="shrink-0 cursor-grab touch-none select-none border-b border-line px-4 pt-2 pb-3 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto mb-2 h-[5px] w-10 rounded-full bg-line" aria-hidden />
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">{title}</h2>
            <button
              onClick={() => dismiss()}
              aria-label="Cerrar"
              className="pressable -m-2 rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4.5" />
            </button>
          </div>
        </header>
        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
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
    className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[12px] font-medium ${KIND_STYLE[kind]} ${className}`}
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
  <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${STATUS_STYLE[status]}`}>
    <span className="size-1.5 rounded-full bg-current" />
    {STATUS_LABEL[status]}
  </span>
)

// --- Form controls --------------------------------------------------------

// 16px NO es negociable: por debajo de eso, iOS Safari hace zoom automático
// al enfocar el campo y toda la pantalla "salta". Era el baile de bordes.
const CONTROL =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[16px] text-ink transition-colors placeholder:text-muted focus:border-primary focus:outline-none'

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`${CONTROL} h-11 ${props.className ?? ''}`} />
)

export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={`${CONTROL} resize-y ${props.className ?? ''}`} />
)

export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={`${CONTROL} h-11 ${props.className ?? ''}`} />
)

export const Label = ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-[14px] font-medium text-muted">
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

// --- Toggle (interruptor estilo iOS) ---------------------------------------

export function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        sfx.tap()
        onChange(!checked)
      }}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-primary' : 'bg-surface-2 ring-1 ring-line ring-inset'
      }`}
    >
      <span
        className="absolute top-0.5 size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
        style={{
          left: checked ? 22 : 2,
          transition: 'left 320ms var(--spring-soft)',
        }}
      />
    </button>
  )
}

export const CategoryTag = ({ name }: { name: string }) => (
  <span className="inline-flex h-5 shrink-0 items-center rounded border border-line px-1.5 text-[12px] font-medium text-muted">
    {name}
  </span>
)

// --- Empty state ----------------------------------------------------------

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 text-muted">{icon}</div>
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {children && <p className="max-w-[42ch] text-[14px] leading-relaxed text-muted">{children}</p>}
    </div>
  )
}
