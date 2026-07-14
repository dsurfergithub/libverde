export type ProjectStatus = 'idea' | 'activo' | 'lanzada' | 'pausa'
export type EntryKind = 'nota' | 'idea' | 'avance' | 'pendiente' | 'sesion'
export type EntrySource = 'voz' | 'texto' | 'timer'

export interface Project {
  id: string
  name: string
  /** Nombres alternativos: lo que el ASR probablemente oiga ("has back" → Hashback). */
  aliases: string[]
  description: string
  status: ProjectStatus
  createdAt: string
  archived?: boolean
}

export interface Entry {
  id: string
  /** ISO absoluto. Nunca fechas relativas: esto acaba en un fichero de memoria. */
  at: string
  projectId: string | null
  kind: EntryKind
  text: string
  minutes?: number | null
  audioId?: string | null
  source: EntrySource
  /** false = la IA la clasificó sola (cola offline) y aún no la has revisado. */
  confirmed: boolean
  /** Solo para kind === 'pendiente'. */
  done?: boolean
  /** Solo para kind === 'idea': revisada en el cierre de semana. */
  reviewed?: boolean
  /** Transcripción cruda antes de que la IA la limpiara. */
  raw?: string | null
}

export interface ReportStats {
  minutosTotales: number
  sesiones: number
  porProyecto: { projectId: string; minutos: number; sesiones: number; entradas: number }[]
  ideasNuevas: number
  pendientesAbiertos: number
  pendientesCerrados: number
  sinActividad: { projectId: string; ultimoToque: string | null; diasSinTocar: number | null }[]
}

export interface Report {
  id: string
  /** Clave ISO de semana: 2026-W28 */
  weekKey: string
  from: string
  to: string
  generatedAt: string
  stats: ReportStats
  /** Markdown completo, editable a mano. */
  body: string
  closed: boolean
  /** true si han llegado entradas de esa semana después de generarla. */
  stale?: boolean
  writtenToVault?: boolean
}

export interface Timer {
  projectId: string | null
  startedAt: string
  /** minutos objetivo del pomodoro */
  target: number
}

export interface Settings {
  apiKey: string
  theme: 'system' | 'light' | 'dark'
  pomodoroWork: number
  pomodoroBreak: number
  vaultName: string | null
  onboarded: boolean
}

export interface QueuedCapture {
  id: string
  createdAt: string
  audioId: string
  status: 'pendiente' | 'error'
  error?: string
}

export interface DB {
  version: 1
  projects: Project[]
  entries: Entry[]
  reports: Report[]
  timer: Timer | null
  queue: QueuedCapture[]
  settings: Settings
}

export const KIND_LABEL: Record<EntryKind, string> = {
  nota: 'Nota',
  idea: 'Idea',
  avance: 'Avance',
  pendiente: 'Pendiente',
  sesion: 'Sesión',
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  idea: 'Idea',
  activo: 'En desarrollo',
  lanzada: 'Lanzada',
  pausa: 'En pausa',
}

export const KINDS: EntryKind[] = ['nota', 'idea', 'avance', 'pendiente', 'sesion']
export const STATUSES: ProjectStatus[] = ['idea', 'activo', 'lanzada', 'pausa']
