import { useState } from 'react'
import { ArrowLeft, FileDown, Play, Settings2 } from 'lucide-react'
import { Button, Empty, Input, Label, Select, Sheet, StatusPill, Textarea } from '../components/ui'
import { Capture } from '../components/Capture'
import { EntryRow } from '../components/EntryRow'
import { StartSessionSheet } from '../components/TimerBar'
import { useToast } from '../components/Toast'
import { actions, useDB } from '../lib/store'
import { minutesOf } from '../lib/stats'
import { projectFileName, projectNote } from '../lib/report'
import { copyToClipboard, vaultSupported, writeToVault } from '../lib/vault'
import { daysSince, formatMinutes, plural } from '../lib/time'
import { KINDS, KIND_LABEL, STATUSES, STATUS_LABEL, type EntryKind, type ProjectStatus } from '../lib/types'

export function ProjectScreen({ id, go }: { id: string; go: (route: string) => void }) {
  const db = useDB()
  const toast = useToast()
  const [filter, setFilter] = useState<EntryKind | 'todo'>('todo')
  const [editing, setEditing] = useState(false)
  const [session, setSession] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const project = db.projects.find((p) => p.id === id)

  if (!project) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Empty icon={<ArrowLeft className="size-5" />} title="Este proyecto ya no existe">
          <button onClick={() => go('#/')} className="underline">
            Volver al inicio
          </button>
        </Empty>
      </div>
    )
  }

  const mine = db.entries.filter((e) => e.projectId === project.id)
  const shown = filter === 'todo' ? mine : mine.filter((e) => e.kind === filter)
  const last = mine[0]?.at ?? null
  const pendientes = mine.filter((e) => e.kind === 'pendiente' && !e.done).length

  const exportNote = async () => {
    const md = projectNote(db, project)
    const file = projectFileName(project.name)
    if (vaultSupported() && db.settings.vaultName) {
      try {
        await writeToVault('Proyectos', file, md)
        toast(`Escrito en ${db.settings.vaultName}/Proyectos/${file}`)
        return
      } catch (e) {
        toast(e instanceof Error ? e.message : 'No se pudo escribir en el vault.', 'error')
      }
    }
    await copyToClipboard(md)
    toast('Nota del proyecto copiada como Markdown.')
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-4 pb-28">
      <button
        onClick={() => go('#/')}
        className="flex w-fit items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Proyectos
      </button>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{project.name}</h1>
            {project.description && (
              <p className="mt-1 max-w-[65ch] text-[14px] leading-relaxed text-muted text-pretty">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={exportNote} aria-label="Exportar nota del proyecto">
              <FileDown className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Editar proyecto">
              <Settings2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="tnum flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <StatusPill status={project.status} />
          <span>·</span>
          <span>
            <strong className="font-semibold text-ink">{formatMinutes(minutesOf(mine))}</strong> invertidos
          </span>
          <span>·</span>
          <span>{plural(mine.filter((e) => e.kind === 'sesion').length, 'sesión', 'sesiones')}</span>
          {pendientes > 0 && (
            <>
              <span>·</span>
              <span className="text-pendiente">{plural(pendientes, 'pendiente', 'pendientes')}</span>
            </>
          )}
          {last && (
            <>
              <span>·</span>
              <span>
                {daysSince(last) === 0 ? 'tocado hoy' : `hace ${plural(daysSince(last), 'día', 'días')}`}
              </span>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => setSession(true)}>
            <Play className="size-3.5" />
            Empezar sesión
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCapturing((c) => !c)}>
            {capturing ? 'Cerrar dictado' : 'Dictar aquí'}
          </Button>
        </div>
      </header>

      {capturing && (
        <section className="animate-fade-in rounded-xl border border-line bg-surface py-6">
          <Capture presetProjectId={project.id} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar entradas">
          {(['todo', ...KINDS] as const).map((k) => {
            const active = filter === k
            const count = k === 'todo' ? mine.length : mine.filter((e) => e.kind === k).length
            return (
              <button
                key={k}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(k)}
                className={`h-7 rounded-full border px-2.5 text-[12px] font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-ink'
                    : 'border-line text-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {k === 'todo' ? 'Todo' : KIND_LABEL[k]}
                <span className="tnum ml-1 opacity-60">{count}</span>
              </button>
            )
          })}
        </div>

        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line">
            <Empty icon={<Play className="size-5" />} title="Nada aquí todavía">
              Empieza una sesión o dicta lo que acabas de hacer. Cada entrada alimenta la memoria del domingo.
            </Empty>
          </div>
        ) : (
          <ul className="rounded-xl border border-line bg-surface px-4">
            {shown.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </section>

      <EditSheet open={editing} onClose={() => setEditing(false)} id={project.id} go={go} />
      <StartSessionSheet open={session} onClose={() => setSession(false)} presetProjectId={project.id} />
    </div>
  )
}

function EditSheet({
  open,
  onClose,
  id,
  go,
}: {
  open: boolean
  onClose: () => void
  id: string
  go: (r: string) => void
}) {
  const db = useDB()
  const toast = useToast()
  const project = db.projects.find((p) => p.id === id)!
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!project) return null

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    actions.deleteProject(id)
    toast('Proyecto borrado. Sus entradas quedan sin asignar.')
    onClose()
    go('#/')
  }

  return (
    <Sheet open={open} onClose={onClose} title="Editar proyecto">
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="e-name">Nombre</Label>
          <Input
            id="e-name"
            value={project.name}
            onChange={(e) => actions.updateProject(id, { name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="e-alias">Cómo suena al dictarlo</Label>
          <Input
            id="e-alias"
            value={project.aliases.join(', ')}
            onChange={(e) =>
              actions.updateProject(id, {
                aliases: e.target.value
                  .split(',')
                  .map((a) => a.trim())
                  .filter(Boolean),
              })
            }
            placeholder="has back, hash back"
          />
        </div>
        <div>
          <Label htmlFor="e-desc">Descripción</Label>
          <Textarea
            id="e-desc"
            rows={2}
            value={project.description}
            onChange={(e) => actions.updateProject(id, { description: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="e-status">Estado</Label>
          <Select
            id="e-status"
            value={project.status}
            onChange={(e) => actions.updateProject(id, { status: e.target.value as ProjectStatus })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Un proyecto personal nunca se termina del todo: por eso «lanzada», no «terminada».
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <Button variant="danger" size="sm" onClick={remove}>
            {confirmDelete ? '¿Seguro? Pulsa otra vez' : 'Borrar proyecto'}
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Listo
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
