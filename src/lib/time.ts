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

/** Valor para un <input type="time">: "09:35". */
export const timeInputValue = (d: Date | string) =>
  format(typeof d === 'string' ? new Date(d) : d, 'HH:mm')

/**
 * Combina el día de `base` con la hora "HH:MM" del input.
 * Si el resultado cae antes de `base`, se asume que cruzó la medianoche.
 */
export function applyTime(base: Date, hhmm: string, allowNextDay = false): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const d = new Date(base)
  d.setHours(h, min, 0, 0)
  if (allowNextDay && d.getTime() < base.getTime()) d.setDate(d.getDate() + 1)
  return d
}

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

/** mm:ss hasta la hora; a partir de ahí h:mm:ss. Las sesiones pueden ser largas. */
export function clock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
