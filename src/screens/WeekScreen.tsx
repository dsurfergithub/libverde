import { useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  FolderCheck,
  Lock,
  RefreshCw,
  Sparkles,
  Trash2,
  Unlock,
} from 'lucide-react'
import { Button, Empty, Textarea } from '../components/ui'
import { useToast } from '../components/Toast'
import { actions, useDB } from '../lib/store'
import { computeStats } from '../lib/stats'
import { buildReport, groupForDraft, projectFileName, projectNote, weekFileName } from '../lib/report'
import { draftWeekly, GeminiError, type WeeklyDraft } from '../lib/gemini'
import { copyToClipboard, downloadFile, vaultSupported, writeToVault } from '../lib/vault'
import { formatMinutes, weekKeyOf, weekLabel, weekRange } from '../lib/time'

export function WeekScreen() {
  const db = useDB()
  const toast = useToast()
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [writing, setWriting] = useState(false)

  const ref = useMemo(() => new Date(Date.now() - offset * 7 * 86400000), [offset])
  const { from, to } = weekRange(ref)
  const weekKey = weekKeyOf(ref)
  const stats = useMemo(() => computeStats(db, from, to), [db, from, to])
  const report = db.reports.find((r) => r.weekKey === weekKey) ?? null

  const ideas = db.entries.filter((e) => e.kind === 'idea' && !e.reviewed)
  const isThisWeek = offset === 0

  const generate = async () => {
    setBusy(true)
    try {
      let draft: WeeklyDraft | null = null
      if (db.settings.apiKey) {
        const groups = groupForDraft(db, from, to)
        draft = await draftWeekly(db.settings.apiKey, weekKey, from.toISOString(), to.toISOString(), stats, groups)
      }
      const next = buildReport(db, ref, draft, report?.id)
      actions.saveReport(next)
      toast(
        db.settings.apiKey
          ? 'Memoria generada. Revísala y edita lo que haga falta.'
          : 'Memoria generada sin IA (entradas literales). Añade tu API key para que la redacte.',
      )
    } catch (e) {
      toast(e instanceof GeminiError ? e.message : 'No se pudo generar la memoria.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const toVault = async () => {
    if (!report) return
    setWriting(true)
    try {
      await writeToVault('Semanas', weekFileName(weekKey), report.body)
      // La nota viva de cada proyecto tocado se actualiza a la vez.
      for (const p of stats.porProyecto) {
        const project = db.projects.find((x) => x.id === p.projectId)
        if (project) await writeToVault('Proyectos', projectFileName(project.name), projectNote(db, project))
      }
      actions.saveReport({ ...report, writtenToVault: true })
      toast(`Escrito en ${db.settings.vaultName}: Semanas/ y Proyectos/`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo escribir en el vault.', 'error')
    } finally {
      setWriting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6 pb-28">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Cierre de semana</h1>
          <p className="tnum mt-0.5 text-[13px] text-muted">
            {weekKey} · {weekLabel(from, to)}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOffset((o) => o + 1)}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={isThisWeek}
            aria-label="Semana siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>

      <section className="tnum grid grid-cols-4 divide-x divide-line rounded-xl border border-line bg-surface">
        <Cell value={formatMinutes(stats.minutosTotales)} label="tiempo" />
        <Cell value={String(stats.sesiones)} label="sesiones" />
        <Cell value={String(stats.porProyecto.length)} label="proyectos" />
        <Cell value={String(stats.ideasNuevas)} label="ideas" />
      </section>

      {/* Paso 1: el repaso de ideas. Sin este bucle de salida, «ideas pendientes» es un cementerio. */}
      {ideas.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">1 · Repasa tus ideas</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              {ideas.length} sin revisar. Mátalas o conviértelas en pendientes: una idea que nunca se decide es
              solo un número que crece.
            </p>
          </div>
          <ul className="rounded-xl border border-line bg-surface">
            {ideas.slice(0, 6).map((e) => {
              const project = db.projects.find((p) => p.id === e.projectId)
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-snug">{e.text}</p>
                    <p className="mt-0.5 text-[12px] text-muted">{project?.name ?? 'Sin proyecto'}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        actions.updateEntry(e.id, { kind: 'pendiente', done: false, reviewed: true })
                        toast('Promovida a pendiente.')
                      }}
                    >
                      Hacerla
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => actions.updateEntry(e.id, { reviewed: true })}
                      aria-label="Descartar idea"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Paso 2: la memoria */}
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">{ideas.length > 0 ? '2 · ' : ''}La memoria</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              Markdown con frontmatter y wikilinks. Escrito para Obsidian y para Claude, no para lucir.
            </p>
          </div>
          {report && !report.closed && (
            <Button size="sm" variant="ghost" onClick={generate} loading={busy}>
              <RefreshCw className="size-3.5" />
              Regenerar
            </Button>
          )}
        </div>

        {report?.stale && (
          <p className="rounded-lg border border-idea/40 bg-idea-soft px-3 py-2 text-[13px] leading-snug text-idea">
            Han entrado datos nuevos de esta semana después de generarla. Regenera si quieres incluirlos — la
            memoria no se reescribe sola.
          </p>
        )}

        {!report ? (
          stats.porProyecto.length === 0 && !stats.minutosTotales ? (
            <div className="rounded-xl border border-dashed border-line">
              <Empty icon={<Sparkles className="size-5" />} title="Semana sin actividad">
                No hay nada que resumir. Un parte vacío también es un dato.
              </Empty>
            </div>
          ) : (
            <Button variant="primary" onClick={generate} loading={busy}>
              <Sparkles className="size-4" />
              Generar memoria de {weekKey}
            </Button>
          )
        ) : (
          <>
            <Textarea
              value={report.body}
              readOnly={report.closed}
              onChange={(e) => actions.saveReport({ ...report, body: e.target.value })}
              rows={20}
              spellCheck={false}
              aria-label="Memoria semanal en Markdown"
              className="font-mono text-[12.5px] leading-relaxed"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await copyToClipboard(report.body)
                  toast('Markdown copiado.')
                }}
              >
                <Clipboard className="size-3.5" />
                Copiar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadFile(weekFileName(weekKey), report.body)}
              >
                <Download className="size-3.5" />
                Descargar .md
              </Button>
              {vaultSupported() && db.settings.vaultName && (
                <Button variant="outline" size="sm" onClick={toVault} loading={writing}>
                  <FolderCheck className="size-3.5" />
                  Escribir en {db.settings.vaultName}
                </Button>
              )}
              <Button
                variant={report.closed ? 'ghost' : 'primary'}
                size="sm"
                className="ml-auto"
                onClick={() => actions.saveReport({ ...report, closed: !report.closed })}
              >
                {report.closed ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                {report.closed ? 'Reabrir' : 'Cerrar semana'}
              </Button>
            </div>

            {report.closed && (
              <p className="text-[12px] leading-relaxed text-muted">
                Cerrada y congelada. Lo que ya entregaste no se reescribe solo.
              </p>
            )}
          </>
        )}
      </section>

      {stats.sinActividad.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Sin actividad</h2>
          <ul className="tnum rounded-xl border border-line bg-surface px-4">
            {stats.sinActividad.slice(0, 6).map((s) => {
              const p = db.projects.find((x) => x.id === s.projectId)
              return (
                <li
                  key={s.projectId}
                  className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13px] last:border-0"
                >
                  <span className="truncate">{p?.name}</span>
                  <span className="shrink-0 text-muted">
                    {s.diasSinTocar === null
                      ? 'nunca'
                      : `${s.diasSinTocar} ${s.diasSinTocar === 1 ? 'día' : 'días'}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function Cell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1 py-3">
      <span className="text-[15px] font-semibold">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  )
}
