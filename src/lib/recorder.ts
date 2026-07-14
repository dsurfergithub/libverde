import { useCallback, useEffect, useRef, useState } from 'react'

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
}

export const recordingSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

export interface Recording {
  recording: boolean
  seconds: number
  /** 0–1, para el anillo del micro. */
  level: number
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
  cancel: () => void
}

export function useRecorder(): Recording {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const raf = useRef<number | null>(null)
  const tick = useRef<number | null>(null)

  const teardown = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    if (tick.current) clearInterval(tick.current)
    raf.current = null
    tick.current = null
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    void audioCtx.current?.close().catch(() => {})
    audioCtx.current = null
    rec.current = null
    setRecording(false)
    setLevel(0)
  }, [])

  useEffect(() => () => teardown(), [teardown])

  const start = useCallback(async () => {
    setError(null)
    if (!recordingSupported()) {
      setError('Este navegador no permite grabar audio.')
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      stream.current = s
      chunks.current = []

      const mime = pickMime()
      const mr = new MediaRecorder(s, mime ? { mimeType: mime } : undefined)
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      mr.start()
      rec.current = mr

      // Anillo reactivo a la voz: feedback de que te está oyendo de verdad.
      const ctx = new AudioContext()
      audioCtx.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(s).connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const loop = () => {
        analyser.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128)
        setLevel((prev) => prev * 0.7 + Math.min(1, peak * 2.2) * 0.3)
        raf.current = requestAnimationFrame(loop)
      }
      loop()

      setSeconds(0)
      tick.current = window.setInterval(() => setSeconds((s2) => s2 + 1), 1000)
      setRecording(true)
    } catch (e) {
      const err = e as DOMException
      setError(
        err?.name === 'NotAllowedError'
          ? 'No has dado permiso al micrófono.'
          : 'No se pudo acceder al micrófono.',
      )
      teardown()
    }
  }, [teardown])

  const stop = useCallback(async (): Promise<Blob | null> => {
    const mr = rec.current
    if (!mr || mr.state === 'inactive') {
      teardown()
      return null
    }
    const blob = await new Promise<Blob>((resolve) => {
      mr.onstop = () => resolve(new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' }))
      mr.stop()
    })
    teardown()
    return blob.size > 0 ? blob : null
  }, [teardown])

  const cancel = useCallback(() => {
    rec.current?.state !== 'inactive' && rec.current?.stop()
    teardown()
  }, [teardown])

  return { recording, seconds, level, error, start, stop, cancel }
}
