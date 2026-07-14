import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button, Input, Label, Textarea } from '../components/ui'
import { actions } from '../lib/store'

/**
 * Primer arranque. Una libreta vacía se cierra y no se vuelve a abrir, así que
 * lo primero es la lista de proyectos: sin ella la IA no tiene vocabulario y
 * no puede saber de qué app estás hablando cuando dictas.
 */
export function Onboarding({ done }: { done: () => void }) {
  const [list, setList] = useState('')
  const [key, setKey] = useState('')

  const start = () => {
    const names = list
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    for (const line of names) {
      // "Hashback — acortador de enlaces" o "Hashback: acortador"
      const [name, ...rest] = line.split(/\s[—–:-]\s/)
      actions.addProject({
        name: name.trim(),
        aliases: [],
        description: rest.join(' ').trim(),
        status: 'activo',
      })
    }
    if (key.trim()) actions.setSettings({ apiKey: key.trim() })
    actions.setSettings({ onboarded: true })
    done()
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-8 px-5 py-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">LibVerde</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted text-pretty">
          Dictas lo que has hecho. Ella lo ordena, mide tus sesiones y el domingo te escribe la memoria de la
          semana en Markdown.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <Label htmlFor="o-list">¿En qué estás trabajando?</Label>
        <Textarea
          id="o-list"
          rows={7}
          value={list}
          onChange={(e) => setList(e.target.value)}
          placeholder={'Hashback — acortador de enlaces\nRandomblocker\nBuscador Pro'}
          className="font-mono text-[13px]"
          autoFocus
        />
        <p className="text-[12px] leading-relaxed text-muted text-pretty">
          Uno por línea. Puedes añadir la descripción tras un guion. Esta lista es el vocabulario que la IA usa
          para asignar cada nota a su proyecto — sin ella, todo cae en «sin asignar».
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="o-key">API key de Gemini (opcional)</Label>
        <Input
          id="o-key"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIza…"
          autoComplete="off"
        />
        <p className="text-[12px] leading-relaxed text-muted text-pretty">
          Sin ella la app funciona entera, pero escribiendo a mano. Puedes añadirla luego en Ajustes.
        </p>
      </div>

      <Button variant="primary" onClick={start} disabled={!list.trim()}>
        Empezar
        <ArrowRight className="size-4" />
      </Button>
    </div>
  )
}
