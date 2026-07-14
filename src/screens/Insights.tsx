import { Empty } from '../components/ui'
import { useDB } from '../lib/store'
import { insights } from '../lib/stats'
import { daysSince, formatMinutes, plural } from '../lib/time'

/**
 * Insights sin IA: son sumas y cuentas. La IA se reserva para redactar la
 * memoria semanal, donde sí aporta.
 */
export function Insights() {
  const db = useDB()
  const { ranking, stale, ideasStacked, silent, totalMin, prevMin, byCategory } = insights(db)

  const top = ranking[0]
  const project = (id: string) => db.projects.find((p) => p.id === id)?.name ?? 'Sin proyecto'
  const max = ranking[0]?.minutos ?? 1
  const delta = totalMin - prevMin

  const nothing = !ranking.length && !stale.length && !ideasStacked.length && !silent.length

  if (nothing) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Empty icon={<span className="text-2xl">·</span>} title="Todavía no hay suficiente historia">
          Los insights salen de tus datos, no de un modelo. Dicta unas cuantas sesiones y vuelve: en dos semanas
          esto empieza a decirte cosas que no sabías.
        </Empty>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-6 pb-28">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Insights</h1>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
          Últimos 7 días. Números, no adivinación.
        </p>
      </header>

      {byCategory.length > 1 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">En qué se te va la semana</h2>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
            {byCategory.map((c, i) => (
              <div
                key={c.categoria}
                title={`${c.categoria}: ${formatMinutes(c.minutos)}`}
                className={i === 0 ? 'bg-primary' : i === 1 ? 'bg-sesion' : i === 2 ? 'bg-idea' : 'bg-muted'}
                style={{ width: `${c.pct * 100}%` }}
              />
            ))}
          </div>
          <ul className="tnum flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {byCategory.map((c, i) => (
              <li key={c.categoria} className="flex items-center gap-1.5">
                <span
                  className={`size-2 rounded-full ${
                    i === 0 ? 'bg-primary' : i === 1 ? 'bg-sesion' : i === 2 ? 'bg-idea' : 'bg-muted'
                  }`}
                />
                <span>{c.categoria}</span>
                <span className="text-muted">
                  {formatMinutes(c.minutos)} · {Math.round(c.pct * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ranking.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Dónde va tu tiempo</h2>
            <span className="tnum text-[13px] text-muted">
              {formatMinutes(totalMin)}
              {prevMin > 0 && (
                <span className={delta >= 0 ? 'text-primary' : 'text-pendiente'}>
                  {' '}
                  {delta >= 0 ? '+' : ''}
                  {formatMinutes(Math.abs(delta))} vs. semana anterior
                </span>
              )}
            </span>
          </div>

          <ul className="flex flex-col gap-2.5">
            {ranking.map((r) => (
              <li key={r.projectId} className="flex flex-col gap-1.5">
                <div className="tnum flex items-baseline justify-between text-[13px]">
                  <span className="truncate font-medium">{project(r.projectId)}</span>
                  <span className="shrink-0 text-muted">{formatMinutes(r.minutos)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${Math.max(3, (r.minutos / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>

          {top && (
            <p className="text-[13px] leading-relaxed text-muted text-pretty">
              Esta semana <strong className="font-medium text-ink">{project(top.projectId)}</strong> concentra la
              mayor parte de tu tiempo: {formatMinutes(top.minutos)}.
            </p>
          )}
        </section>
      )}

      {stale.length > 0 && (
        <Insight
          title="Dices que están activos, pero no los tocas"
          tone="pendiente"
          note="El estado lo pusiste tú. Los días los cuenta la app."
        >
          {stale.map((s) => (
            <Row
              key={s.project.id}
              left={s.project.name}
              right={s.last ? plural(daysSince(s.last), 'día', 'días') : 'sin ninguna entrada'}
            />
          ))}
        </Insight>
      )}

      {ideasStacked.length > 0 && (
        <Insight
          title="Ideas apiladas sin revisar"
          tone="idea"
          note="Ciérralas en el cierre de semana o se convierten en ruido."
        >
          {ideasStacked.map((i) => (
            <Row key={i.project.id} left={i.project.name} right={`${i.ideas} ideas`} />
          ))}
        </Insight>
      )}

      {silent.length > 0 && (
        <Insight
          title="Trabajo sin rastro"
          tone="muted"
          note="Muchas sesiones, ninguna nota. Dentro de un mes no sabrás qué hiciste aquí."
        >
          {silent.map((s) => (
            <Row
              key={s.project.id}
              left={s.project.name}
              right={`${plural(s.sesiones, 'sesión', 'sesiones')} · 0 notas`}
            />
          ))}
        </Insight>
      )}
    </div>
  )
}

function Insight({
  title,
  note,
  tone,
  children,
}: {
  title: string
  note: string
  tone: 'pendiente' | 'idea' | 'muted'
  children: React.ReactNode
}) {
  const color = tone === 'pendiente' ? 'text-pendiente' : tone === 'idea' ? 'text-idea' : 'text-muted'
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className={`text-[15px] font-semibold ${color}`}>{title}</h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted text-pretty">{note}</p>
      </div>
      <ul className="tnum rounded-xl border border-line bg-surface px-4">{children}</ul>
    </section>
  )
}

const Row = ({ left, right }: { left: string; right: string }) => (
  <li className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13px] last:border-0">
    <span className="truncate">{left}</span>
    <span className="shrink-0 text-muted">{right}</span>
  </li>
)
