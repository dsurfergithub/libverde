import { getState } from './store'

/**
 * Sonido de interfaz sintetizado con WebAudio: cero assets, cero peso.
 * Regla (Designing Audio-Haptic Experiences): solo momentos con significado
 * — grabar, guardar, error, completar — nunca decoración. Volúmenes mínimos.
 *
 * iOS solo permite crear/reanudar el AudioContext dentro de un gesto del
 * usuario: todos los sonidos se disparan desde taps, así que se crea perezoso.
 */

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

const enabled = () => getState().settings.sounds !== false

interface Note {
  /** Hz de inicio. */
  freq: number
  /** Hz de destino (glide); si falta, tono plano. */
  to?: number
  /** Duración en segundos. */
  dur: number
  /** Retardo desde el disparo, en segundos. */
  at?: number
  type?: OscillatorType
  gain?: number
}

function play(notes: Note[]) {
  if (!enabled()) return
  const ac = audio()
  if (!ac) return
  const now = ac.currentTime
  for (const n of notes) {
    const t0 = now + (n.at ?? 0)
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = n.type ?? 'sine'
    osc.frequency.setValueAtTime(n.freq, t0)
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.dur)
    const peak = n.gain ?? 0.045
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur)
    osc.connect(g).connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + n.dur + 0.02)
  }
}

export const sfx = {
  /** Toque neutro: switches, checks, tabs. Casi subliminal. */
  tap() {
    play([{ freq: 1250, dur: 0.045, gain: 0.02, type: 'triangle' }])
  },
  /** Empieza la grabación: dos notas ascendentes, "te escucho". */
  recStart() {
    play([
      { freq: 660, dur: 0.09, gain: 0.04 },
      { freq: 880, dur: 0.12, at: 0.09, gain: 0.045 },
    ])
  },
  /** Fin de grabación: el mismo camino de vuelta (consistencia espacial). */
  recStop() {
    play([
      { freq: 880, dur: 0.09, gain: 0.04 },
      { freq: 660, dur: 0.12, at: 0.09, gain: 0.04 },
    ])
  },
  /** Guardado: tercera mayor resuelta, breve y satisfecha. */
  save() {
    play([
      { freq: 659, dur: 0.1, gain: 0.045 },
      { freq: 988, dur: 0.22, at: 0.08, gain: 0.05 },
    ])
  },
  /** Error: zumbido grave y seco, sin drama. */
  error() {
    play([{ freq: 196, to: 165, dur: 0.16, type: 'triangle', gain: 0.05 }])
  },
  /** Sesión iniciada: barrido corto hacia arriba. */
  sessionStart() {
    play([{ freq: 440, to: 700, dur: 0.16, gain: 0.045 }])
  },
  /** Pendiente completado: tick con cuerpo. */
  done() {
    play([
      { freq: 523, dur: 0.06, gain: 0.035, type: 'triangle' },
      { freq: 784, dur: 0.14, at: 0.05, gain: 0.045, type: 'triangle' },
    ])
  },
}
