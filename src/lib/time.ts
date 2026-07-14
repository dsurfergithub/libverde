import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'

const WEEK_OPTS = { weekStartsOn: 1 as const }

export function weekKeyOf(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
}

export function weekRange(date: Date | string): { from: Date; to: Date } {
  const d = typeof date === 'string' ? new Date(date) : date
  return { from: startOfWeek(d, WEEK_OPTS), to: endOfWeek(d, WEEK_OPTS) }
}

/** "6–12 jul 2026" — para cabeceras humanas. */
export function weekLabel(from: Date, to: Date): string {
  const sameMonth = from.getMonth() === to.getMonth()
  const left = sameMonth ? format(from, 'd', { locale: es }) : format(from, 'd MMM', { locale: es })
  const right = format(to, 'd MMM yyyy', { locale: es })
  return `${left}–${right}`
}

/** Fecha absoluta corta para los ficheros de memoria: 2026-07-09 */
export const isoDate = (d: Date | string) => format(typeof d === 'string' ? new Date(d) : d, 'yyyy-MM-dd')

export const dayLabel = (d: Date | string) =>
  format(typeof d === 'string' ? new Date(d) : d, "EEEE d 'de' MMMM", { locale: es })

export const timeLabel = (d: Date | string) => format(typeof d === 'string' ? new Date(d) : d, 'HH:mm')

export const daysSince = (iso: string) => differenceInCalendarDays(new Date(), new Date(iso))

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function formatMinutes(min: number): string {
  if (!min) return '0m'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (!h) return `${m}m`
  if (!m) return `${h}h`
  return `${h}h ${m}m`
}

export function elapsedMinutes(startedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000))
}

export function elapsedSeconds(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
}

export function clock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
