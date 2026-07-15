import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Square } from 'lucide-react'
import { Button, Input, Label, Select, Sheet } from './ui'
import { sfx } from '../lib/sound'
import { useToast } from './Toast'
import { actions, useDB } from '../lib/store'
import { applyTime, clock, dayLabel, elapsedSeconds, formatMinutes, timeInputValue } from '../lib/time'

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
    sfx.sessionStart()
    actions.startTimer({ projectId: projectId || null, startedAt: new Date().toISOString() })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Empezar sesión">
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="t-proj">¿En qué proyecto?</Label>
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
        <p className="text-[14px] leading-relaxed text-muted text-pretty">
          Sin cuenta atrás. Empiezas ahora y, cuando termines, eliges la hora de fin — así puedes cerrarla más
          tarde aunque se te haya olvidado darle a parar.
        </p>
        <Button variant="primary" onClick={start}>
          <Play className="size-4" />
          Empezar ahora
        </Button>
      </div>
    </Sheet>
  )
}

/**
 * El cierre de la sesión. Aquí está el valor real: la hora de fin la eliges tú.
 * Si te acuerdas a las 23:40 de que paraste a las 22:15, lo corriges y ya está.
 */
function EndSessionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDB()
  const toast = useToast()
  const timer = db.timer

  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [projectId, setProjectId] = useState('')
  const [note, setNote] = useState('')
  const saved = useRef(false)

  useEffect(() => {
    if (!open || !timer) return
    saved.current = false
    setStartTime(timeInputValue(timer.startedAt))
    setEndTime(timeInputValue(new Date()))
    setProjectId(timer.projectId ?? '')
    setNote('')
  }, [open, timer])

  const base = timer ? new Date(timer.startedAt) : new Date()

  const { start, end, minutes, error } = useMemo(() => {
    const s = applyTime(base, startTime)
    if (!s) return { start: null, end: null, minutes: 0, error: 'Hora de inicio no válida.' }
    const e = applyTime(s, endTime, true)
    if (!e) return { start: s, end: null, minutes: 0, error: 'Hora de fin no válida.' }
    const min = Math.round((e.getTime() - s.getTime()) / 60000)
    if (min < 1) return { start: s, end: e, minutes: min, error: 'La sesión dura menos de un minuto.' }
    if (min > 16 * 60) return { start: s, end: e, minutes: min, error: 'Más de 16 horas: revisa las horas.' }
    return { start: s, end: e, minutes: min, error: null as string | null }
  }, [base, startTime, endTime])

  if (!timer) return null

  const project = db.projects.find((p) => p.id === projectId)

  const save = () => {
    if (saved.current) return
    if (error || !start || !end) return
    saved.current = true
    actions.addEntry({
      at: end.toISOString(),
      projectId: projectId || null,
      kind: 'sesion',
      text: note.trim() || (project ? `Sesión de trabajo en ${project.name}` : 'Sesión de trabajo'),
      minutes,
      source: 'timer',
      confirmed: true,
    })
    actions.stopTimer()
    toast(`Sesión guardada: ${formatMinutes(minutes)}${project ? ` en ${project.name}` : ''}.`)
    onClose()
  }

  const discard = () => {
    actions.stopTimer()
    toast('Sesión descartada.')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Terminar sesión">
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-muted">{dayLabel(timer.startedAt)}</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="e-start">Empezó a las</Label>
            <Input id="e-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="e-end">Terminó a las</Label>
            <Input id="e-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div
          className={`rounded-lg border px-3 py-2.5 text-center ${
            error ? 'border-pendiente/40 bg-pendiente-soft' : 'border-line bg-surface'
          }`}
        >
          {error ? (
            <p className="text-[14px] font-medium text-pendiente">{error}</p>
          ) : (
            <p className="tnum text-[16px] font-semibold">
              {formatMinutes(minutes)}
              {end && end.getDate() !== base.getDate() && (
                <span className="ml-1.5 text-[13px] font-normal text-muted">(cruza medianoche)</span>
              )}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="e-proj">Proyecto</Label>
            <Select id="e-proj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
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
          <div>
            <Label htmlFor="e-note">Qué has hecho</Label>
            <Input
              id="e-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="opcional"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="primary" className="flex-1" onClick={save} disabled={!!error}>
            Guardar sesión
          </Button>
          <Button variant="ghost" onClick={discard}>
            Descartar
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

export function TimerBar() {
  const db = useDB()
  const [, force] = useState(0)
  const [ending, setEnding] = useState(false)

  const timer = db.timer

  useEffect(() => {
    if (!timer) return
    const i = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(i)
  }, [timer])

  if (!timer) return null

  const project = db.projects.find((p) => p.id === timer.projectId)

  return (
    <>
      <div className="sticky top-[env(safe-area-inset-top)] z-20 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span className="tnum text-[16px] font-semibold">{clock(elapsedSeconds(timer.startedAt))}</span>
          <span className="min-w-0 flex-1 truncate text-[14px] text-muted">
            {project?.name ?? 'Sin proyecto'} · desde las {timeInputValue(timer.startedAt)}
          </span>
          <Button size="sm" variant="outline" onClick={() => setEnding(true)}>
            <Square className="size-3.5" />
            Terminar
          </Button>
        </div>
      </div>
      <EndSessionSheet open={ending} onClose={() => setEnding(false)} />
    </>
  )
}
