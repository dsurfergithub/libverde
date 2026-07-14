import { useSyncExternalStore } from 'react'
import type { DB, Entry, Project, QueuedCapture, Report, Settings, Timer } from './types'

const KEY = 'libverde_v1'

const EMPTY: DB = {
  version: 1,
  projects: [],
  entries: [],
  reports: [],
  timer: null,
  queue: [],
  settings: {
    apiKey: '',
    theme: 'system',
    categories: ['Trabajo', 'Ocio'],
    vaultName: null,
    onboarded: false,
  },
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<DB>
    return {
      ...EMPTY,
      ...parsed,
      settings: { ...EMPTY.settings, ...(parsed.settings ?? {}) },
    }
  } catch {
    return EMPTY
  }
}

let state: DB = load()
const listeners = new Set<() => void>()

function commit(next: DB) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch (err) {
    console.error('No se pudo guardar en localStorage', err)
  }
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getState = () => state

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getState, getState)
}

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

/** Marca como desactualizadas las memorias cuya semana ha recibido entradas nuevas. */
function markStaleReports(db: DB, at: string): Report[] {
  return db.reports.map((r) =>
    !r.stale && at >= r.from && at <= r.to && at > r.generatedAt ? { ...r, stale: true } : r,
  )
}

export const actions = {
  // ---- proyectos ----
  addProject(
    p: Omit<Project, 'id' | 'createdAt' | 'category'> & Partial<Pick<Project, 'id' | 'createdAt' | 'category'>>,
  ): Project {
    const project: Project = {
      id: p.id ?? uid(),
      createdAt: p.createdAt ?? new Date().toISOString(),
      name: p.name.trim(),
      aliases: p.aliases ?? [],
      description: p.description ?? '',
      status: p.status ?? 'idea',
      category: p.category ?? null,
    }
    commit({ ...state, projects: [...state.projects, project] })
    return project
  },

  updateProject(id: string, patch: Partial<Project>) {
    commit({
      ...state,
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  },

  deleteProject(id: string) {
    commit({
      ...state,
      projects: state.projects.filter((p) => p.id !== id),
      entries: state.entries.map((e) => (e.projectId === id ? { ...e, projectId: null } : e)),
    })
  },

  // ---- entradas ----
  addEntry(e: Omit<Entry, 'id'> & Partial<Pick<Entry, 'id'>>): Entry {
    const entry: Entry = { ...e, id: e.id ?? uid() }
    commit({
      ...state,
      entries: [entry, ...state.entries],
      reports: markStaleReports(state, entry.at),
    })
    return entry
  },

  addEntries(list: (Omit<Entry, 'id'> & Partial<Pick<Entry, 'id'>>)[]) {
    const created: Entry[] = list.map((e) => ({ ...e, id: e.id ?? uid() }))
    let reports = state.reports
    for (const e of created) reports = markStaleReports({ ...state, reports }, e.at)
    commit({ ...state, entries: [...created, ...state.entries], reports })
    return created
  },

  updateEntry(id: string, patch: Partial<Entry>) {
    commit({ ...state, entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  },

  deleteEntry(id: string) {
    commit({ ...state, entries: state.entries.filter((e) => e.id !== id) })
  },

  // ---- temporizador ----
  startTimer(t: Timer) {
    commit({ ...state, timer: t })
  },
  stopTimer() {
    commit({ ...state, timer: null })
  },

  // ---- cola offline ----
  enqueue(q: QueuedCapture) {
    commit({ ...state, queue: [...state.queue, q] })
  },
  updateQueued(id: string, patch: Partial<QueuedCapture>) {
    commit({ ...state, queue: state.queue.map((q) => (q.id === id ? { ...q, ...patch } : q)) })
  },
  dequeue(id: string) {
    commit({ ...state, queue: state.queue.filter((q) => q.id !== id) })
  },

  // ---- memorias ----
  saveReport(r: Report) {
    const exists = state.reports.some((x) => x.id === r.id)
    commit({
      ...state,
      reports: exists ? state.reports.map((x) => (x.id === r.id ? r : x)) : [r, ...state.reports],
    })
  },
  deleteReport(id: string) {
    commit({ ...state, reports: state.reports.filter((r) => r.id !== id) })
  },

  // ---- ajustes ----
  setSettings(patch: Partial<Settings>) {
    commit({ ...state, settings: { ...state.settings, ...patch } })
  },

  // ---- categorías ----
  addCategory(name: string) {
    const clean = name.trim()
    if (!clean || state.settings.categories.some((c) => c.toLowerCase() === clean.toLowerCase())) return
    commit({ ...state, settings: { ...state.settings, categories: [...state.settings.categories, clean] } })
  },

  renameCategory(from: string, to: string) {
    const clean = to.trim()
    if (!clean) return
    commit({
      ...state,
      settings: {
        ...state.settings,
        categories: state.settings.categories.map((c) => (c === from ? clean : c)),
      },
      projects: state.projects.map((p) => (p.category === from ? { ...p, category: clean } : p)),
    })
  },

  /** Borrar una categoría no borra proyectos: los deja sin categoría. */
  deleteCategory(name: string) {
    commit({
      ...state,
      settings: { ...state.settings, categories: state.settings.categories.filter((c) => c !== name) },
      projects: state.projects.map((p) => (p.category === name ? { ...p, category: null } : p)),
    })
  },

  // ---- copia de seguridad ----
  replaceAll(db: DB) {
    commit({ ...EMPTY, ...db, settings: { ...EMPTY.settings, ...db.settings } })
  },
}

export function exportJSON(): string {
  // La API key no viaja en la copia de seguridad.
  const { settings, ...rest } = state
  return JSON.stringify({ ...rest, settings: { ...settings, apiKey: '' } }, null, 2)
}
