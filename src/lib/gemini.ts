import type { EntryKind, Project, ReportStats } from './types'
import { isoDate } from './time'

const MODEL = 'gemini-2.5-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const UNKNOWN = 'desconocido'

export class GeminiError extends Error {}

async function call(apiKey: string, body: unknown): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 400 && detail.includes('API_KEY')) throw new GeminiError('La API key no es válida.')
    if (res.status === 429) throw new GeminiError('Límite de la API alcanzado. Prueba en un minuto.')
    throw new GeminiError(`Gemini respondió ${res.status}. ${detail.slice(0, 160)}`)
  }

  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== 'string') throw new GeminiError('Gemini devolvió una respuesta vacía.')
  return text
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// ---------------------------------------------------------------------------
// 1. Captura: audio (o texto) → entrada estructurada
// ---------------------------------------------------------------------------

export interface CaptureResult {
  projectId: string | null
  kind: EntryKind
  text: string
  minutes: number | null
  pendientes: string[]
  transcript: string
}

/**
 * El vocabulario cerrado de proyectos es lo que evita que "Hashback" acabe
 * clasificado como "has back". Se le pasa la lista entera y solo puede
 * devolver un id de esa lista o `desconocido`.
 */
function vocabulary(projects: Project[]): string {
  if (!projects.length) return '(no hay proyectos registrados todavía)'
  return projects
    .map((p) => {
      const alias = p.aliases.length ? ` · se puede oír como: ${p.aliases.join(', ')}` : ''
      return `- id: ${p.id} · nombre: "${p.name}"${alias}`
    })
    .join('\n')
}

const CAPTURE_PROMPT = (projects: Project[]) => `Eres el clasificador de una libreta de proyectos personales. Recibes una nota dictada en español y la conviertes en UNA entrada estructurada.

PROYECTOS REGISTRADOS (vocabulario cerrado):
${vocabulary(projects)}

REGLAS
1. projectId: devuelve EXACTAMENTE uno de los id de la lista, o "${UNKNOWN}" si no estás razonablemente seguro. Los nombres de proyecto son nombres propios y el reconocimiento de voz los deforma: "has back" es "Hashback", "random bloquer" es "Randomblocker". Corrígelos contra la lista. Nunca inventes un id.
2. kind, elige uno:
   - "sesion": dice cuánto tiempo ha trabajado ("he estado 25 minutos en X").
   - "avance": algo que ya está hecho o corregido.
   - "idea": algo que se podría hacer, una propuesta nueva.
   - "pendiente": algo que falta por hacer, una tarea abierta.
   - "nota": cualquier otra observación.
   Si menciona tiempo trabajado, gana "sesion" aunque también cuente avances.
3. minutes: solo si menciona una duración explícita. Si no, null. Nunca la estimes.
4. text: la nota limpia, en primera persona, sin muletillas ni titubeos, conservando TODOS los detalles técnicos y nombres propios. No resumas de más ni añadas nada que no haya dicho.
5. pendientes: SOLO tareas ADICIONALES que menciona de pasada, DISTINTAS del contenido principal de la nota. NUNCA repitas ni parafrasees aquí lo que ya está en text: si la nota entera es una sola tarea (kind "pendiente"), pendientes es []. Si la nota es una idea o un avance sin tareas extra, pendientes es []. Cada elemento corto y accionable. En caso de duda, array vacío: es mil veces peor duplicar una nota que omitir un pendiente.
6. transcript: la transcripción literal de lo que ha dicho.

No inventes contenido. Si la nota es confusa, transcríbela tal cual y usa kind "nota".`

const CAPTURE_SCHEMA = (projects: Project[]) => ({
  type: 'OBJECT',
  properties: {
    projectId: { type: 'STRING', enum: [...projects.map((p) => p.id), UNKNOWN] },
    kind: { type: 'STRING', enum: ['nota', 'idea', 'avance', 'pendiente', 'sesion'] },
    text: { type: 'STRING' },
    minutes: { type: 'INTEGER', nullable: true },
    pendientes: { type: 'ARRAY', items: { type: 'STRING' } },
    transcript: { type: 'STRING' },
  },
  required: ['projectId', 'kind', 'text', 'pendientes', 'transcript'],
  propertyOrdering: ['transcript', 'projectId', 'kind', 'text', 'minutes', 'pendientes'],
})

/** Para comparar frases: minúsculas, sin acentos, sin puntuación, espacios colapsados. */
const canon = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * El modelo tiende a repetir la nota principal dentro de `pendientes` aunque
 * el prompt se lo prohíba. Cada pendiente que duplica (o casi) el text
 * principal se descarta aquí: era la causa de que una nota se guardara doble.
 */
function dedupePendientes(pendientes: string[], text: string, kind: EntryKind): string[] {
  const main = canon(text)
  const seen = new Set<string>()
  return pendientes.filter((p) => {
    const c = canon(p)
    if (!c || seen.has(c)) return false
    if (c === main) return false
    // Una contiene a la otra y son de tamaño parecido → es la misma frase.
    if (
      (main.includes(c) || c.includes(main)) &&
      Math.min(c.length, main.length) / Math.max(c.length, main.length) >= 0.5
    )
      return false
    // Si la nota principal YA es un pendiente, cualquier solape la duplica.
    if (kind === 'pendiente' && (main.includes(c) || c.includes(main))) return false
    seen.add(c)
    return true
  })
}

function normalize(parsed: Record<string, unknown>, projects: Project[]): CaptureResult {
  const rawId = typeof parsed.projectId === 'string' ? parsed.projectId : UNKNOWN
  const projectId = projects.some((p) => p.id === rawId) ? rawId : null
  const minutes = typeof parsed.minutes === 'number' && parsed.minutes > 0 ? Math.round(parsed.minutes) : null
  const kind = (['nota', 'idea', 'avance', 'pendiente', 'sesion'] as EntryKind[]).includes(
    parsed.kind as EntryKind,
  )
    ? (parsed.kind as EntryKind)
    : 'nota'
  const text = String(parsed.text ?? '').trim()
  const rawPendientes = Array.isArray(parsed.pendientes)
    ? parsed.pendientes.map(String).map((s) => s.trim()).filter(Boolean)
    : []
  return {
    projectId,
    kind,
    text,
    minutes,
    pendientes: dedupePendientes(rawPendientes, text, kind),
    transcript: String(parsed.transcript ?? '').trim(),
  }
}

export async function captureFromAudio(
  apiKey: string,
  audio: Blob,
  projects: Project[],
): Promise<CaptureResult> {
  const data = await blobToBase64(audio)
  const text = await call(apiKey, {
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: audio.type || 'audio/webm', data } },
          { text: 'Transcribe y clasifica esta nota dictada.' },
        ],
      },
    ],
    systemInstruction: { parts: [{ text: CAPTURE_PROMPT(projects) }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CAPTURE_SCHEMA(projects),
      temperature: 0.1,
    },
  })
  return normalize(JSON.parse(text), projects)
}

export async function captureFromText(
  apiKey: string,
  input: string,
  projects: Project[],
): Promise<CaptureResult> {
  const text = await call(apiKey, {
    contents: [{ role: 'user', parts: [{ text: `Nota escrita:\n"""${input}"""` }] }],
    systemInstruction: { parts: [{ text: CAPTURE_PROMPT(projects) }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CAPTURE_SCHEMA(projects),
      temperature: 0.1,
    },
  })
  return normalize(JSON.parse(text), projects)
}

// ---------------------------------------------------------------------------
// 2. Memoria semanal: la IA REDACTA, no calcula.
//    Las cifras se agregan en local y se le pasan ya hechas.
// ---------------------------------------------------------------------------

export interface DraftedProject {
  projectId: string
  hecho: string[]
  pendiente: string[]
}

export interface WeeklyDraft {
  resumen: string
  proyectos: DraftedProject[]
}

const REPORT_PROMPT = `Eres un generador de ficheros de memoria. Tu salida NO la lee una persona en una reunión: la leen un asistente de código (que la carga como contexto) y un grafo de notas Markdown (Obsidian). Escribe para una máquina que necesita hechos.

REGLAS DURAS
1. Frases cortas, en pasado, con el verbo delante. Hechos, no valoraciones.
2. Cero relleno corporativo. Prohibido: "significativamente", "se avanzó en la consolidación", "se continuó trabajando", "productivo", "exitoso". Si una frase se puede borrar sin perder información, bórrala.
3. Cero adjetivos de valor. Cero resumen ejecutivo. Cero emojis.
4. NO INVENTES progreso. Si de un proyecto solo hay "he tocado un poco X", la memoria dice exactamente eso. Una semana floja se describe como floja.
5. Fechas SIEMPRE absolutas y completas (2026-07-09). Nunca "esta semana", "ayer", "el lunes", "hace poco". Este fichero se leerá dentro de seis meses.
6. Nunca calcules ni menciones cifras de tiempo: las pone el sistema, no tú.
7. Conserva los nombres propios, rutas, ficheros y términos técnicos exactamente como aparecen.
8. Cada elemento de "hecho" y "pendiente" es una línea suelta, sin viñeta ni guion inicial, sin punto final.
9. resumen: 2 o 3 frases como máximo, factuales. Si la semana tuvo poca actividad, dilo en una frase y punto.

Recibes las entradas ya agrupadas por proyecto. Devuelve JSON.`

const REPORT_SCHEMA = (ids: string[]) => ({
  type: 'OBJECT',
  properties: {
    resumen: { type: 'STRING' },
    proyectos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          projectId: { type: 'STRING', enum: ids },
          hecho: { type: 'ARRAY', items: { type: 'STRING' } },
          pendiente: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['projectId', 'hecho', 'pendiente'],
      },
    },
  },
  required: ['resumen', 'proyectos'],
})

export interface ReportInputProject {
  projectId: string
  name: string
  entries: { at: string; kind: EntryKind; text: string }[]
}

export async function draftWeekly(
  apiKey: string,
  weekKey: string,
  from: string,
  to: string,
  stats: ReportStats,
  perProject: ReportInputProject[],
): Promise<WeeklyDraft> {
  const ids = perProject.map((p) => p.projectId)
  if (!ids.length) return { resumen: 'Sin actividad registrada en esta semana.', proyectos: [] }

  const payload = {
    semana: weekKey,
    desde: from,
    hasta: to,
    cifras_ya_calculadas_no_las_toques: {
      minutos_totales: stats.minutosTotales,
      sesiones: stats.sesiones,
      ideas_nuevas: stats.ideasNuevas,
    },
    proyectos: perProject.map((p) => ({
      projectId: p.projectId,
      nombre: p.name,
      entradas: p.entries.map((e) => ({ fecha: isoDate(e.at), tipo: e.kind, texto: e.text })),
    })),
  }

  const text = await call(apiKey, {
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload, null, 2) }] }],
    systemInstruction: { parts: [{ text: REPORT_PROMPT }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: REPORT_SCHEMA(ids),
      temperature: 0.2,
    },
  })

  const parsed = JSON.parse(text) as WeeklyDraft
  return {
    resumen: String(parsed.resumen ?? '').trim(),
    proyectos: (parsed.proyectos ?? []).map((p) => ({
      projectId: p.projectId,
      hecho: (p.hecho ?? []).map((s) => String(s).replace(/^[-·*]\s*/, '').trim()).filter(Boolean),
      pendiente: (p.pendiente ?? []).map((s) => String(s).replace(/^[-·*]\s*/, '').trim()).filter(Boolean),
    })),
  }
}
