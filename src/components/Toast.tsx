import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Check } from 'lucide-react'

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
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 5200 : 3000)
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-60 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-in flex max-w-md items-start gap-2 rounded-lg border px-3 py-2 text-[13px] shadow-lg ${
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
