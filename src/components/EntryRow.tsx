import { useState } from 'react'
import { Check, Play, Trash2 } from 'lucide-react'
import { KindBadge } from './ui'
import { actions, useDB } from '../lib/store'
import { getAudio } from '../lib/idb'
import { formatMinutes, isoDate, timeLabel } from '../lib/time'
import type { Entry } from '../lib/types'

export function EntryRow({ entry, showProject = false }: { entry: Entry; showProject?: boolean }) {
  const db = useDB()
  const [playing, setPlaying] = useState(false)
  const project = db.projects.find((p) => p.id === entry.projectId)

  const play = async () => {
    if (!entry.audioId) return
    const blob = await getAudio(entry.audioId)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    setPlaying(true)
    audio.onended = () => {
      setPlaying(false)
      URL.revokeObjectURL(url)
    }
    void audio.play()
  }

  const done = entry.kind === 'pendiente' && entry.done

  return (
    <li className="group flex gap-3 border-b border-line py-3 last:border-0">
      <div className="flex flex-col items-start gap-1.5 pt-0.5">
        <KindBadge kind={entry.kind} />
      </div>

      <div className="min-w-0 flex-1">
        <p className={`text-[14px] leading-snug ${done ? 'text-muted line-through' : 'text-ink'}`}>
          {entry.text}
        </p>
        <p className="tnum mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
          <span>
            {isoDate(entry.at)} · {timeLabel(entry.at)}
          </span>
          {entry.kind === 'sesion' && entry.minutes ? (
            <span className="font-medium text-sesion">{formatMinutes(entry.minutes)}</span>
          ) : null}
          {showProject && project && <span className="truncate">{project.name}</span>}
          {showProject && !project && <span className="text-pendiente">sin proyecto</span>}
          {!entry.confirmed && <span className="text-pendiente">sin confirmar</span>}
        </p>
      </div>

      <div className="flex shrink-0 items-start gap-0.5">
        {entry.audioId && (
          <button
            onClick={play}
            aria-label="Reproducir audio original"
            className={`rounded-md p-1.5 transition-colors hover:bg-surface-2 ${
              playing ? 'text-primary' : 'text-muted'
            }`}
          >
            <Play className="size-3.5" />
          </button>
        )}
        {entry.kind === 'pendiente' && (
          <button
            onClick={() => actions.updateEntry(entry.id, { done: !entry.done })}
            aria-label={entry.done ? 'Reabrir pendiente' : 'Marcar como hecho'}
            className={`rounded-md p-1.5 transition-colors hover:bg-surface-2 ${
              entry.done ? 'text-primary' : 'text-muted'
            }`}
          >
            <Check className="size-3.5" />
          </button>
        )}
        <button
          onClick={() => actions.deleteEntry(entry.id)}
          aria-label="Borrar entrada"
          className="rounded-md p-1.5 text-muted opacity-0 transition-[color,opacity] group-hover:opacity-100 focus-visible:opacity-100 hover:text-pendiente"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  )
}
