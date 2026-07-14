import { useState } from 'react'
import { ChevronRight, Play, Plus } from 'lucide-react'
import { Button, Empty, Input, Label, Select, Sheet, StatusPill, Textarea } from '../components/ui'
import { Capture, QueueBanner } from '../components/Capture'
import { StartSessionSheet } from '../components/TimerBar'
import { EntryRow } from '../components/EntryRow'
import { actions, useDB } from '../lib/store'
import { homeStats, lastTouch, minutesOf } from '../lib/stats'
import { daysSince, formatMinutes, plural } from '../lib/time'
import { STATUSES, STATUS_LABEL, type ProjectStatus } from '../lib/types'

function NewProjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('activo')

  const create = () => {
    if (!name.trim()) return
    actions.addProject({
      name,
      aliases: aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      description,
      status,
    })
    setName('')
    setAliases('')
    setDescription('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nuevo proyecto">
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="n-name">Nombre</Label>
          <Input
            id="n-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hashback"
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="n-alias">Cómo suena al dictarlo</Label>
          <Input
            id="n-alias"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="has back, hash back"
          />
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Separados por comas. Es lo que evita que la transcripción destroce el nombre y la nota acabe en el
            proyecto equivocado.
          </p>
        </div>
        <div>
          <Label htmlFor="n-desc">Descripción</Label>
          <Textarea
            id="n-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Acortador de enlaces con estadísticas"
          />
        </div>
        <div>
          <Label htmlFor="n-status">Estado</Label>
          <Select id="n-status" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="primary" onClick={create} disabled={!name.trim()}>
          Crear proyecto
        </Button>
      </div>
    </Sheet>
  )
}

export function Home({ go }: { go: (route: string) => void }) {
  const db = useDB()
  const stats = homeStats(db)
  const [newProject, setNewProject] = useState(false)
  const [session, setSession] = useState(false)

  const projects = db.projects
    .filter((p) => !p.archived)
    .map((p) => {
      const mine = db.entries.filter((e) => e.projectId === p.id)
      const last = lastTouch(db, p.id)
      return { p, minutos: minutesOf(mine), last, dias: last ? daysSince(last) : null }
    })
    .sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''))

  const recent = db.entries.slice(0, 5)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-8 pb-28">
      <section className="flex flex-col gap-5">
        <Capture />
        <QueueBanner />
      </section>

      <section aria-label="Resumen" className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface">
        <Stat value={String(stats.activos)} label="proyectos activos" />
        <Stat value={formatMinutes(stats.minutosSemana)} label="esta semana" />
        <Stat value={String(stats.ideasSinRevisar)} label="ideas sin revisar" tone={stats.ideasSinRevisar > 0 ? 'idea' : undefined} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Proyectos</h2>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setSession(true)}>
              <Play className="size-3.5" />
              Sesión
            </Button>
            <Button size="sm" variant="outline" onClick={() => setNewProject(true)}>
              <Plus className="size-3.5" />
              Nuevo
            </Button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line">
            <Empty icon={<Plus className="size-5" />} title="Aún no hay proyectos">
              Registra tus apps primero: sin la lista, la IA no puede saber de cuál estás hablando cuando dictas.
            </Empty>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-line bg-surface">
            {projects.map(({ p, minutos, dias }) => (
              <li key={p.id} className="border-b border-line last:border-0">
                <button
                  onClick={() => go(`#/p/${p.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{p.name}</span>
                    <span className="tnum mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                      <StatusPill status={p.status} />
                      <span>·</span>
                      <span>{formatMinutes(minutos)}</span>
                      {dias !== null && dias >= 14 && (
                        <>
                          <span>·</span>
                          <span className="text-pendiente">{plural(dias, 'día', 'días')} sin tocar</span>
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Últimas entradas</h2>
          <ul className="rounded-xl border border-line bg-surface px-4">
            {recent.map((e) => (
              <EntryRow key={e.id} entry={e} showProject />
            ))}
          </ul>
        </section>
      )}

      <NewProjectSheet open={newProject} onClose={() => setNewProject(false)} />
      <StartSessionSheet open={session} onClose={() => setSession(false)} />
    </div>
  )
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: 'idea' }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-3.5">
      <span className={`tnum text-xl font-semibold ${tone === 'idea' ? 'text-idea' : 'text-ink'}`}>{value}</span>
      <span className="text-center text-[12px] leading-tight text-muted">{label}</span>
    </div>
  )
}
