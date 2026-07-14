import { useEffect, useState } from 'react'
import { Square, Timer as TimerIcon } from 'lucide-react'
import { Button, Select, Sheet } from './ui'
import { useToast } from './Toast'
import { actions, useDB } from '../lib/store'
import { clock, elapsedMinutes, elapsedSeconds } from '../lib/time'

/** Campana al terminar el pomodoro. Sin ficheros de audio: Web Audio y ya. */
function bell() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 1.7)
    setTimeout(() => void ctx.close(), 2000)
  } catch {
    /* el navegador puede bloquear el audio: da igual, no es crítico */
  }
}

export function StartSessionSheet({
  open,
  onClose,
  presetProjectId,
}: {
  open: boolean
  onClose: () => void
  presetProjectId?: string
}) {
  const db = useDB()
  const [projectId, setProjectId] = useState(presetProjectId ?? '')

  useEffect(() => {
    if (open) setProjectId(presetProjectId ?? db.projects.find((p) => !p.archived)?.id ?? '')
  }, [open, presetProjectId, db.projects])

  const start = () => {
    actions.startTimer({
      projectId: projectId || null,
      startedAt: new Date().toISOString(),
      target: db.settings.pomodoroWork,
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Empezar sesión">
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="t-proj" className="mb-1.5 block text-[13px] font-medium text-muted">
            ¿En qué proyecto?
          </label>
          <Select id="t-proj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— Sin asignar —</option>
            {db.projects
              .filter((p) => !p.archived)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </div>
        <p className="text-[13px] leading-relaxed text-muted">
          El pomodoro dura {db.settings.pomodoroWork} min. El tiempo se cuenta desde el reloj, así que puedes
          bloquear el móvil o cerrar la pestaña sin perderlo.
        </p>
        <Button variant="primary" onClick={start}>
          <TimerIcon className="size-4" />
          Empezar
        </Button>
      </div>
    </Sheet>
  )
}

export function TimerBar() {
  const db = useDB()
  const toast = useToast()
  const [, force] = useState(0)
  const [rang, setRang] = useState(false)

  const timer = db.timer

  useEffect(() => {
    if (!timer) return
    const i = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(i)
  }, [timer])

  useEffect(() => {
    if (!timer) {
      setRang(false)
      return
    }
    if (!rang && elapsedSeconds(timer.startedAt) >= timer.target * 60) {
      bell()
      setRang(true)
      toast(`Pomodoro de ${timer.target} min completado. Puedes seguir o parar.`)
    }
  })

  if (!timer) return null

  const project = db.projects.find((p) => p.id === timer.projectId)
  const secs = elapsedSeconds(timer.startedAt)
  const targetSecs = timer.target * 60
  const progress = Math.min(1, secs / targetSecs)
  const over = secs > targetSecs

  const stop = () => {
    const minutes = elapsedMinutes(timer.startedAt)
    if (minutes < 1) {
      actions.stopTimer()
      toast('Sesión descartada: menos de un minuto.')
      return
    }
    actions.addEntry({
      at: new Date().toISOString(),
      projectId: timer.projectId,
      kind: 'sesion',
      text: project ? `Sesión de trabajo en ${project.name}` : 'Sesión de trabajo',
      minutes,
      source: 'timer',
      confirmed: true,
    })
    actions.stopTimer()
    toast(`Sesión guardada: ${minutes} min${project ? ` en ${project.name}` : ''}. Cuenta qué has hecho.`)
  }

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div
        className="h-0.5 bg-primary transition-[width] duration-1000 ease-linear"
        style={{ width: `${progress * 100}%` }}
      />
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        <span className={`tnum text-[15px] font-semibold ${over ? 'text-primary' : ''}`}>{clock(secs)}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
          {project?.name ?? 'Sin proyecto'}
          {over && ' · objetivo cumplido'}
        </span>
        <Button size="sm" variant="outline" onClick={stop}>
          <Square className="size-3.5" />
          Parar
        </Button>
      </div>
    </div>
  )
}
