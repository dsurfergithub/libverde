import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { sfx } from '../lib/sound'

interface Toast {
  id: number
  message: string
  tone: 'ok' | 'error'
}

const Ctx = createContext<(message: string, tone?: 'ok' | 'error') => void>(() => {})

export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    // Sonido y visual en el mismo frame: la causalidad se pierde si se separan.
    if (tone === 'error') sfx.error()
    else sfx.save()
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 5200 : 3000)
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-60 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in flex max-w-md items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[14px] shadow-lg ${
              t.tone === 'error'
                ? 'border-pendiente/40 bg-pendiente-soft text-pendiente'
                : 'border-line bg-surface text-ink'
            }`}
          >
            {t.tone === 'error' ? (
              <AlertTriangle className="mt-px size-4 shrink-0" />
            ) : (
              <Check className="mt-px size-4 shrink-0 text-primary" />
            )}
            <span className="leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
