import type { DB, Entry, Project, ReportStats } from './types'
import { daysSince } from './time'

export const inRange = (e: Entry, from: string, to: string) => e.at >= from && e.at <= to

export function entriesInWeek(db: DB, from: Date, to: Date): Entry[] {
  const a = from.toISOString()
  const b = to.toISOString()
  return db.entries.filter((e) => inRange(e, a, b)).sort((x, y) => x.at.localeCompare(y.at))
}

export function lastTouch(db: DB, projectId: string): string | null {
  const touches = db.entries.filter((e) => e.projectId === projectId).map((e) => e.at)
  return touches.length ? touches.sort().at(-1)! : null
}

/** Minutos de un proyecto: solo entradas de tipo sesión con duración. */
export const minutesOf = (entries: Entry[]) =>
  entries.reduce((sum, e) => sum + (e.kind === 'sesion' ? (e.minutes ?? 0) : 0), 0)

export function computeStats(db: DB, from: Date, to: Date): ReportStats {
  const week = entriesInWeek(db, from, to)
  const active = db.projects.filter((p) => !p.archived)
  const touchedIds = new Set(week.map((e) => e.projectId).filter(Boolean) as string[])

  const porProyecto = [...touchedIds]
    .map((projectId) => {
      const mine = week.filter((e) => e.projectId === projectId)
      return {
        projectId,
        minutos: minutesOf(mine),
        sesiones: mine.filter((e) => e.kind === 'sesion').length,
        entradas: mine.length,
      }
    })
    .sort((a, b) => b.minutos - a.minutos || b.entradas - a.entradas)

  const sinActividad = active
    .filter((p) => !touchedIds.has(p.id))
    .map((p) => {
      const t = lastTouch(db, p.id)
      return { projectId: p.id, ultimoToque: t, diasSinTocar: t ? daysSince(t) : null }
    })
    .sort((a, b) => (b.diasSinTocar ?? 9999) - (a.diasSinTocar ?? 9999))

  const openNow = db.entries.filter((e) => e.kind === 'pendiente' && !e.done)

  const cats = new Map<string, number>()
  for (const p of porProyecto) {
    if (!p.minutos) continue
    const cat = db.projects.find((x) => x.id === p.projectId)?.category ?? 'Sin categoría'
    cats.set(cat, (cats.get(cat) ?? 0) + p.minutos)
  }
  const porCategoria = [...cats.entries()]
    .map(([categoria, minutos]) => ({ categoria, minutos }))
    .sort((a, b) => b.minutos - a.minutos)

  return {
    minutosTotales: minutesOf(week),
    sesiones: week.filter((e) => e.kind === 'sesion').length,
    porProyecto,
    porCategoria,
    ideasNuevas: week.filter((e) => e.kind === 'idea').length,
    pendientesAbiertos: openNow.length,
    pendientesCerrados: week.filter((e) => e.kind === 'pendiente' && e.done).length,
    sinActividad,
  }
}

/** Los números de la home. */
export function homeStats(db: DB) {
  const now = new Date()
  const monday = new Date(now)
  const day = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - day)
  monday.setHours(0, 0, 0, 0)

  const week = db.entries.filter((e) => e.at >= monday.toISOString())
  return {
    activos: db.projects.filter((p) => !p.archived && (p.status === 'activo' || p.status === 'lanzada')).length,
    minutosSemana: minutesOf(week),
    sesionesSemana: week.filter((e) => e.kind === 'sesion').length,
    ideasSinRevisar: db.entries.filter((e) => e.kind === 'idea' && !e.reviewed).length,
    pendientesAbiertos: db.entries.filter((e) => e.kind === 'pendiente' && !e.done).length,
  }
}

/** Insights: cuentas y sumas, sin IA. */
export function insights(db: DB) {
  const now = Date.now()
  const days = (n: number) => new Date(now - n * 86400000).toISOString()

  const last7 = db.entries.filter((e) => e.at >= days(7))
  const prev7 = db.entries.filter((e) => e.at >= days(14) && e.at < days(7))

  const byProject = (entries: Entry[]) => {
    const map = new Map<string, number>()
    for (const e of entries) {
      if (!e.projectId || e.kind !== 'sesion') continue
      map.set(e.projectId, (map.get(e.projectId) ?? 0) + (e.minutes ?? 0))
    }
    return map
  }

  const cur = byProject(last7)
  const prev = byProject(prev7)

  const ranking = [...cur.entries()]
    .map(([projectId, minutos]) => ({
      projectId,
      minutos,
      delta: minutos - (prev.get(projectId) ?? 0),
    }))
    .sort((a, b) => b.minutos - a.minutos)

  const stale = db.projects
    .filter((p) => !p.archived && p.status === 'activo')
    .map((p) => ({ project: p, last: lastTouch(db, p.id) }))
    .filter((x) => !x.last || daysSince(x.last) >= 14)
    .sort((a, b) => (a.last ?? '').localeCompare(b.last ?? ''))

  const ideasStacked = db.projects
    .map((p) => ({
      project: p,
      ideas: db.entries.filter((e) => e.projectId === p.id && e.kind === 'idea' && !e.reviewed).length,
    }))
    .filter((x) => x.ideas >= 3)
    .sort((a, b) => b.ideas - a.ideas)

  // Proyectos con muchas sesiones pero ninguna nota o avance: trabajo sin rastro.
  const silent = db.projects
    .map((p) => {
      const mine = db.entries.filter((e) => e.projectId === p.id && e.at >= days(14))
      return {
        project: p,
        sesiones: mine.filter((e) => e.kind === 'sesion').length,
        avances: mine.filter((e) => e.kind === 'avance' || e.kind === 'nota').length,
      }
    })
    .filter((x) => x.sesiones >= 3 && x.avances === 0)

  const totalMin = [...cur.values()].reduce((a, b) => a + b, 0)
  const prevMin = [...prev.values()].reduce((a, b) => a + b, 0)

  // Reparto por categoría de los últimos 7 días.
  const cats = new Map<string, number>()
  for (const [projectId, minutos] of cur) {
    const cat = db.projects.find((p) => p.id === projectId)?.category ?? 'Sin categoría'
    cats.set(cat, (cats.get(cat) ?? 0) + minutos)
  }
  const byCategory = [...cats.entries()]
    .map(([categoria, minutos]) => ({ categoria, minutos, pct: totalMin ? minutos / totalMin : 0 }))
    .sort((a, b) => b.minutos - a.minutos)

  return { ranking, stale, ideasStacked, silent, totalMin, prevMin, byCategory }
}

export const projectById = (projects: Project[], id: string | null) =>
  id ? (projects.find((p) => p.id === id) ?? null) : null
