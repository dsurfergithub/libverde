import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, Mic, Square, Trash2, WifiOff } from 'lucide-react'
import { Button, Input, KindBadge, Label, Select, Sheet, Textarea } from './ui'
import { useToast } from './Toast'
import { actions, uid, useDB } from '../lib/store'
import { useRecorder } from '../lib/recorder'
import { putAudio, getAudio, deleteAudio } from '../lib/idb'
import { captureFromAudio, captureFromText, GeminiError, type CaptureResult } from '../lib/gemini'
import { clock } from '../lib/time'
import { KINDS, KIND_LABEL, type EntryKind } from '../lib/types'

interface Draft extends CaptureResult {
  audioId: string | null
  source: 'voz' | 'texto'
}

/**
 * Tarjeta de confirmación: la IA se equivoca, así que nunca se guarda en
 * silencio. Un toque para corregir proyecto/tipo, un toque para guardar.
 */
function ConfirmSheet({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft
  onClose: () => void
  onSaved: () => void
}) {
  const db = useDB()
  const toast = useToast()
  const [projectId, setProjectId] = useState(draft.projectId ?? '')
  const [kind, setKind] = useState<EntryKind>(draft.kind)
  const [text, setText] = useState(draft.text)
  const [minutes, setMinutes] = useState(draft.minutes?.toString() ?? '')
  const [pendientes, setPendientes] = useState(draft.pendientes)

  const save = () => {
    if (!text.trim()) {
      toast('La nota está vacía.', 'error')
      return
    }
    const at = new Date().toISOString()
    const pid = projectId || null

    actions.addEntry({
      at,
      projectId: pid,
      kind,
      text: text.trim(),
      minutes: kind === 'sesion' ? Number(minutes) || null : null,
      audioId: draft.audioId,
      source: draft.source,
      raw: draft.transcript || null,
      confirmed: true,
      ...(kind === 'pendiente' ? { done: false } : {}),
      ...(kind === 'idea' ? { reviewed: false } : {}),
    })

    // Los pendientes sueltos que la IA detectó de pasada se guardan aparte.
    if (pendientes.length) {
      actions.addEntries(
        pendientes.map((p, i) => ({
          at: new Date(Date.now() + i + 1).toISOString(),
          projectId: pid,
          kind: 'pendiente' as const,
          text: p,
          source: draft.source,
          done: false,
          confirmed: true,
        })),
      )
    }

    toast(pendientes.length ? `Guardado · ${pendientes.length} pendiente(s) más` : 'Guardado')
    onSaved()
  }

  const discard = () => {
    if (draft.audioId) void deleteAudio(draft.audioId)
    onClose()
  }

  const guessed = draft.projectId && draft.projectId === projectId

  return (
    <Sheet open onClose={discard} title="¿Lo he entendido bien?">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <KindBadge kind={kind} />
          {!draft.projectId && (
            <span className="rounded bg-pendiente-soft px-1.5 py-0.5 text-[11px] font-medium text-pendiente">
              No sé de qué proyecto es
            </span>
          )}
          {guessed && (
            <span className="text-[11px] text-muted">
              Lo he asignado yo — corrígeme si me he equivocado
            </span>
          )}
        </div>

        <div>
          <Label htmlFor="c-text">Nota</Label>
          <Textarea id="c-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="c-proj">Proyecto</Label>
            <Select id="c-proj" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
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
            <Label htmlFor="c-kind">Tipo</Label>
            <Select id="c-kind" value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {kind === 'sesion' && (
          <div>
            <Label htmlFor="c-min">Minutos</Label>
            <Input
              id="c-min"
              type="number"
              inputMode="numeric"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="25"
            />
          </div>
        )}

        {pendientes.length > 0 && (
          <div>
            <Label>También he oído pendientes</Label>
            <ul className="flex flex-col gap-1.5">
              {pendientes.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]"
                >
                  <span className="flex-1 leading-snug">{p}</span>
                  <button
                    onClick={() => setPendientes((list) => list.filter((_, j) => j !== i))}
                    aria-label={`Descartar pendiente: ${p}`}
                    className="text-muted transition-colors hover:text-pendiente"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {draft.transcript && draft.transcript !== text && (
          <details className="text-[12px] text-muted">
            <summary className="cursor-pointer select-none">Ver transcripción literal</summary>
            <p className="mt-1.5 rounded-lg bg-surface-2 p-2.5 font-mono leading-relaxed">{draft.transcript}</p>
          </details>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="primary" className="flex-1" onClick={save}>
            <Check className="size-4" />
            Guardar
          </Button>
          <Button variant="ghost" onClick={discard}>
            Descartar
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

export function Capture({ presetProjectId }: { presetProjectId?: string }) {
  const db = useDB()
  const toast = useToast()
  const rec = useRecorder()
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [typed, setTyped] = useState('')
  const online = useOnline()
  const hasKey = !!db.settings.apiKey

  const process = useCallback(
    async (audio: Blob) => {
      const audioId = uid()
      await putAudio(audioId, audio)

      if (!hasKey || !navigator.onLine) {
        actions.enqueue({ id: uid(), createdAt: new Date().toISOString(), audioId, status: 'pendiente' })
        toast(
          hasKey ? 'Sin conexión: audio en cola, se procesará luego.' : 'Sin API key: audio guardado en la cola.',
          'error',
        )
        return
      }

      setBusy(true)
      try {
        const result = await captureFromAudio(db.settings.apiKey, audio, db.projects)
        setDraft({
          ...result,
          projectId: result.projectId ?? presetProjectId ?? null,
          audioId,
          source: 'voz',
        })
      } catch (e) {
        actions.enqueue({
          id: uid(),
          createdAt: new Date().toISOString(),
          audioId,
          status: 'error',
          error: e instanceof GeminiError ? e.message : 'Error al procesar el audio.',
        })
        toast(e instanceof GeminiError ? e.message : 'Error al procesar. Audio guardado en la cola.', 'error')
      } finally {
        setBusy(false)
      }
    },
    [db.settings.apiKey, db.projects, hasKey, presetProjectId, toast],
  )

  const toggle = async () => {
    if (rec.recording) {
      const blob = await rec.stop()
      if (blob) await process(blob)
      return
    }
    await rec.start()
  }

  useEffect(() => {
    if (rec.error) toast(rec.error, 'error')
  }, [rec.error, toast])

  const submitText = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = typed.trim()
    if (!value) return

    if (!hasKey || !online) {
      // Sin IA la app sigue funcionando: se guarda como nota cruda, sin clasificar.
      actions.addEntry({
        at: new Date().toISOString(),
        projectId: presetProjectId ?? null,
        kind: 'nota',
        text: value,
        source: 'texto',
        confirmed: true,
      })
      setTyped('')
      toast('Guardado como nota sin clasificar.')
      return
    }

    setBusy(true)
    try {
      const result = await captureFromText(db.settings.apiKey, value, db.projects)
      setDraft({
        ...result,
        projectId: result.projectId ?? presetProjectId ?? null,
        audioId: null,
        source: 'texto',
      })
      setTyped('')
    } catch (e) {
      toast(e instanceof GeminiError ? e.message : 'No se pudo clasificar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex size-32 items-center justify-center">
          {rec.recording && (
            <>
              <span className="animate-pulse-ring absolute inset-0 rounded-full bg-primary/25" />
              <span
                className="absolute inset-0 rounded-full bg-primary/15 transition-transform duration-100"
                style={{ transform: `scale(${1 + rec.level * 0.35})` }}
              />
            </>
          )}
          <button
            onClick={toggle}
            disabled={busy}
            aria-label={rec.recording ? 'Parar y procesar' : 'Dictar una nota'}
            className={`relative flex size-24 items-center justify-center rounded-full transition-[transform,background-color] duration-200 active:scale-95 disabled:opacity-60 ${
              rec.recording ? 'bg-pendiente text-white' : 'bg-primary text-primary-ink'
            }`}
            style={{ boxShadow: '0 8px 30px oklch(0 0 0 / 0.18)' }}
          >
            {busy ? (
              <Loader2 className="size-8 animate-spin" />
            ) : rec.recording ? (
              <Square className="size-7 fill-current" />
            ) : (
              <Mic className="size-9" />
            )}
          </button>
        </div>

        <p className="tnum h-5 text-[13px] font-medium text-muted">
          {busy
            ? 'Transcribiendo y clasificando…'
            : rec.recording
              ? clock(rec.seconds)
              : hasKey
                ? 'Pulsa y cuenta lo que has hecho'
                : 'Sin API key: se guardará en la cola'}
        </p>

        <form onSubmit={submitText} className="flex w-full max-w-md gap-2">
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="…o escríbelo aquí"
            aria-label="Escribir una nota"
            disabled={busy}
          />
          <Button variant="outline" type="submit" disabled={!typed.trim() || busy}>
            Añadir
          </Button>
        </form>

        {!online && (
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            <WifiOff className="size-3.5" /> Sin conexión — se encolará
          </p>
        )}
      </div>

      {draft && (
        <ConfirmSheet draft={draft} onClose={() => setDraft(null)} onSaved={() => setDraft(null)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Banner de la cola: audios que quedaron sin procesar (sin red o sin key). */
export function QueueBanner() {
  const db = useDB()
  const toast = useToast()
  const [running, setRunning] = useState(false)
  const guard = useRef(false)

  const flush = async () => {
    if (guard.current || !db.settings.apiKey) return
    guard.current = true
    setRunning(true)
    try {
      for (const q of db.queue) {
        const audio = await getAudio(q.audioId)
        if (!audio) {
          actions.dequeue(q.id)
          continue
        }
        try {
          const result = await captureFromAudio(db.settings.apiKey, audio, db.projects)
          // Se respeta la fecha original de la grabación, no la de ahora.
          actions.addEntry({
            at: q.createdAt,
            projectId: result.projectId,
            kind: result.kind,
            text: result.text,
            minutes: result.kind === 'sesion' ? result.minutes : null,
            audioId: q.audioId,
            source: 'voz',
            raw: result.transcript,
            confirmed: false,
            ...(result.kind === 'pendiente' ? { done: false } : {}),
            ...(result.kind === 'idea' ? { reviewed: false } : {}),
          })
          actions.dequeue(q.id)
        } catch (e) {
          actions.updateQueued(q.id, {
            status: 'error',
            error: e instanceof GeminiError ? e.message : 'Error al procesar.',
          })
        }
      }
      toast('Cola procesada. Revisa las entradas sin confirmar.')
    } finally {
      guard.current = false
      setRunning(false)
    }
  }

  if (!db.queue.length) return null

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <span className="flex-1 text-[13px] leading-snug">
        <strong className="font-semibold">{db.queue.length}</strong> audio(s) sin procesar
        {!db.settings.apiKey && <span className="text-muted"> · añade tu API key en Ajustes</span>}
      </span>
      <Button size="sm" variant="outline" onClick={flush} loading={running} disabled={!db.settings.apiKey}>
        Procesar
      </Button>
    </div>
  )
}
