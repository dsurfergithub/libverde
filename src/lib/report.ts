import type { DB, Entry, Project, Report, ReportStats } from './types'
import type { WeeklyDraft } from './gemini'
import { formatMinutes, isoDate, plural, weekKeyOf, weekLabel, weekRange } from './time'
import { computeStats, entriesInWeek, minutesOf } from './stats'
import { STATUS_LABEL } from './types'

/** Obsidian enlaza por el nombre de la nota, así que el wikilink usa el nombre tal cual. */
const wiki = (name: string) => `[[${name}]]`

const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const bullets = (lines: string[]) => lines.map((l) => `- ${l}`).join('\n')

/**
 * Compone el Markdown ENTERO de forma determinista.
 * La IA solo aporta `draft` (resumen + viñetas). Las cifras, las fechas y la
 * estructura las pone el código: un parte que se entrega no puede tener números
 * alucinados.
 */
export function composeMarkdown(
  db: DB,
  weekKey: string,
  from: Date,
  to: Date,
  stats: ReportStats,
  draft: WeeklyDraft | null,
): string {
  const week = entriesInWeek(db, from, to)
  const name = (id: string) => db.projects.find((p) => p.id === id)?.name ?? 'Sin proyecto'
  const project = (id: string) => db.projects.find((p) => p.id === id)

  const touched = stats.porProyecto
  const frontmatter = [
    '---',
    `semana: ${weekKey}`,
    `desde: ${isoDate(from)}`,
    `hasta: ${isoDate(to)}`,
    `generado: ${isoDate(new Date())}`,
    `minutos_totales: ${stats.minutosTotales}`,
    `sesiones: ${stats.sesiones}`,
    `ideas_nuevas: ${stats.ideasNuevas}`,
    `pendientes_abiertos: ${stats.pendientesAbiertos}`,
    `pendientes_cerrados: ${stats.pendientesCerrados}`,
    `proyectos_tocados: [${touched.map((p) => slug(name(p.projectId))).join(', ')}]`,
    ...(stats.porCategoria.length
      ? [`minutos_por_categoria: {${stats.porCategoria.map((c) => `${slug(c.categoria)}: ${c.minutos}`).join(', ')}}`]
      : []),
    'tags: [libverde/memoria-semanal]',
    '---',
  ].join('\n')

  const head = [
    `# Semana ${weekKey} (${weekLabel(from, to)})`,
    '',
    draft?.resumen || '_Generada sin IA: las entradas aparecen tal y como las dictaste._',
    '',
    `**Total:** ${formatMinutes(stats.minutosTotales)} · ${plural(stats.sesiones, 'sesión', 'sesiones')} · ${plural(
      touched.length,
      'proyecto tocado',
      'proyectos tocados',
    )}`,
    ...(stats.porCategoria.length > 1
      ? [
          '',
          `**Por categoría:** ${stats.porCategoria
            .map((c) => `${c.categoria} ${formatMinutes(c.minutos)}`)
            .join(' · ')}`,
        ]
      : []),
  ].join('\n')

  const sections = touched.map((p) => {
    const proj = project(p.projectId)
    const d = draft?.proyectos.find((x) => x.projectId === p.projectId)
    const mine = week.filter((e) => e.projectId === p.projectId)

    // Si la IA no redactó (sin API key), caemos a las entradas literales con su fecha.
    const hecho = d?.hecho.length
      ? d.hecho
      : mine
          .filter((e) => e.kind === 'avance' || e.kind === 'nota')
          .map((e) => `${e.text} (${isoDate(e.at)})`)

    const pendiente = d?.pendiente.length
      ? d.pendiente
      : mine.filter((e) => e.kind === 'pendiente' && !e.done).map((e) => e.text)

    const ideas = mine.filter((e) => e.kind === 'idea').map((e) => e.text)

    const parts = [
      `## ${wiki(name(p.projectId))} — ${formatMinutes(p.minutos)} · ${plural(
        p.sesiones,
        'sesión',
        'sesiones',
      )} · estado: ${proj ? STATUS_LABEL[proj.status].toLowerCase() : 'sin estado'}`,
    ]
    if (hecho.length) parts.push('', '**Hecho**', bullets(hecho))
    if (pendiente.length) parts.push('', '**Pendiente**', bullets(pendiente))
    if (ideas.length) parts.push('', '**Ideas**', bullets(ideas))
    if (!hecho.length && !pendiente.length && !ideas.length) parts.push('', '_Solo tiempo registrado, sin notas._')
    return parts.join('\n')
  })

  const idle = stats.sinActividad.length
    ? [
        '## Sin actividad',
        '',
        bullets(
          stats.sinActividad.map((s) =>
            s.ultimoToque
              ? `${wiki(name(s.projectId))} — último toque ${s.ultimoToque.slice(0, 10)} (${s.diasSinTocar} días)`
              : `${wiki(name(s.projectId))} — sin ninguna entrada todavía`,
          ),
        ),
      ].join('\n')
    : ''

  const orphans = week.filter((e) => !e.projectId)
  const unassigned = orphans.length
    ? ['## Sin proyecto asignado', '', bullets(orphans.map((e) => `${e.text} (${isoDate(e.at)})`))].join('\n')
    : ''

  return [frontmatter, '', head, '', ...sections, idle, unassigned]
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .concat('\n')
}

/** La nota viva de cada proyecto en el vault: Proyectos/<Nombre>.md */
export function projectNote(db: DB, project: Project): string {
  const mine = db.entries.filter((e) => e.projectId === project.id).sort((a, b) => b.at.localeCompare(a.at))
  const last = mine[0]?.at ?? null
  const pendientes = mine.filter((e) => e.kind === 'pendiente' && !e.done)
  const ideas = mine.filter((e) => e.kind === 'idea' && !e.reviewed)
  const semanas = [...new Set(mine.map((e) => weekKeyOf(e.at)))].sort().reverse()

  const timeline = mine
    .filter((e) => e.kind === 'avance' || e.kind === 'nota')
    .slice(0, 40)
    .map((e) => `- ${isoDate(e.at)} — ${e.text}`)

  return [
    '---',
    `proyecto: ${project.name}`,
    `estado: ${project.status}`,
    `categoria: ${project.category ?? 'null'}`,
    `minutos_totales: ${minutesOf(mine)}`,
    `sesiones: ${mine.filter((e) => e.kind === 'sesion').length}`,
    `ultimo_toque: ${last ? last.slice(0, 10) : 'null'}`,
    `actualizado: ${isoDate(new Date())}`,
    `tags: [libverde/proyecto${project.category ? `, libverde/${slug(project.category)}` : ''}]`,
    '---',
    '',
    `# ${project.name}`,
    '',
    project.description || '_Sin descripción._',
    '',
    `**Estado:** ${STATUS_LABEL[project.status]} · **${formatMinutes(minutesOf(mine))}** invertidos · ${plural(
      mine.filter((e) => e.kind === 'sesion').length,
      'sesión',
      'sesiones',
    )}`,
    '',
    ...(pendientes.length ? ['## Pendiente', '', bullets(pendientes.map((e) => e.text)), ''] : []),
    ...(ideas.length ? ['## Ideas sin revisar', '', bullets(ideas.map((e) => e.text)), ''] : []),
    ...(timeline.length ? ['## Registro', '', timeline.join('\n'), ''] : []),
    ...(semanas.length ? ['## Semanas', '', bullets(semanas.map((w) => `[[Semana ${w}]]`)), ''] : []),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .concat('\n')
}

export function buildReport(db: DB, ref: Date, draft: WeeklyDraft | null, existingId?: string): Report {
  const { from, to } = weekRange(ref)
  const weekKey = weekKeyOf(ref)
  const stats = computeStats(db, from, to)
  return {
    id: existingId ?? `report-${weekKey}`,
    weekKey,
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: new Date().toISOString(),
    stats,
    body: composeMarkdown(db, weekKey, from, to, stats, draft),
    closed: false,
    stale: false,
  }
}

/** Entradas agrupadas por proyecto, listas para pasarle a la IA. */
export function groupForDraft(db: DB, from: Date, to: Date) {
  const week = entriesInWeek(db, from, to)
  const ids = [...new Set(week.map((e) => e.projectId).filter(Boolean) as string[])]
  return ids
    .map((projectId) => ({
      projectId,
      name: db.projects.find((p) => p.id === projectId)?.name ?? 'Sin nombre',
      entries: week
        .filter((e: Entry) => e.projectId === projectId)
        .map((e) => ({ at: e.at, kind: e.kind, text: e.text })),
    }))
    .filter((p) => p.entries.length > 0)
}

export const weekFileName = (weekKey: string) => `Semana ${weekKey}.md`
export const projectFileName = (name: string) => `${name.replace(/[\\/:*?"<>|]/g, '-')}.md`
