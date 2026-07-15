import { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, FolderOpen, Plus, Trash2, Upload } from 'lucide-react'
import { Button, Input, Label, Select, Toggle } from '../components/ui'
import { useToast } from '../components/Toast'
import { actions, exportJSON, useDB } from '../lib/store'
import { downloadFile, forgetVault, pickVault, vaultSupported } from '../lib/vault'
import { isoDate, plural } from '../lib/time'
import type { DB } from '../lib/types'

export function Settings() {
  const db = useDB()
  const toast = useToast()
  const [key, setKey] = useState(db.settings.apiKey)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => setKey(db.settings.apiKey), [db.settings.apiKey])

  const connect = async () => {
    try {
      const name = await pickVault()
      if (name) {
        actions.setSettings({ vaultName: name })
        toast(`Vault conectado: ${name}. Las memorias se escribirán ahí.`)
      }
    } catch {
      toast('No se seleccionó ninguna carpeta.', 'error')
    }
  }

  const disconnect = async () => {
    await forgetVault()
    actions.setSettings({ vaultName: null })
    toast('Vault desconectado.')
  }

  const importJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const parsed = JSON.parse(await f.text()) as DB
      if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.entries)) throw new Error('formato')
      actions.replaceAll({ ...parsed, settings: { ...parsed.settings, apiKey: db.settings.apiKey } })
      toast(`Importado: ${parsed.projects.length} proyectos, ${parsed.entries.length} entradas.`)
    } catch {
      toast('Ese fichero no es una copia de LibVerde.', 'error')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-6 pb-28">
      <h1 className="text-xl font-semibold tracking-tight">Ajustes</h1>

      <Section title="Gemini" note="La key se queda en este dispositivo. Nunca sale de aquí ni viaja en las copias de seguridad.">
        <div>
          <Label htmlFor="s-key">API key</Label>
          <div className="flex gap-2">
            <Input
              id="s-key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              variant="primary"
              onClick={() => {
                actions.setSettings({ apiKey: key.trim() })
                toast(key.trim() ? 'API key guardada.' : 'API key borrada.')
              }}
            >
              Guardar
            </Button>
          </div>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[13px] text-muted underline transition-colors hover:text-ink"
          >
            Consíguela en Google AI Studio <ExternalLink className="size-3" />
          </a>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Sin key la app funciona entera: escribes las notas a mano, los audios se encolan y la memoria se
            genera con tus entradas literales en vez de redactada.
          </p>
        </div>
      </Section>

      <Section
        title="Vault de Obsidian"
        note="Eliges la carpeta una vez y LibVerde escribe ahí Semanas/ y Proyectos/. Solo Chrome y Edge de escritorio."
      >
        {!vaultSupported() ? (
          <p className="text-[14px] leading-relaxed text-muted">
            Este navegador no permite escribir en carpetas. En el móvil usa «Copiar» o «Descargar .md» desde el
            cierre de semana; conecta el vault desde el escritorio.
          </p>
        ) : db.settings.vaultName ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
            <span className="truncate text-[14px]">
              Conectado a <strong className="font-medium">{db.settings.vaultName}</strong>
            </span>
            <Button size="sm" variant="ghost" onClick={disconnect}>
              Desconectar
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={connect}>
            <FolderOpen className="size-4" />
            Elegir carpeta del vault
          </Button>
        )}
      </Section>

      <Section
        title="Categorías"
        note="Agrupan tus proyectos en la portada y separan el tiempo en los insights y en la memoria semanal. Borrar una no borra proyectos: los deja sin categoría."
      >
        <Categories />
      </Section>

      <Section title="Apariencia" note="Por defecto sigue al sistema: oscuro de noche, claro de día.">
        <div>
          <Label htmlFor="s-theme">Tema</Label>
          <Select
            id="s-theme"
            value={db.settings.theme}
            onChange={(e) => actions.setSettings({ theme: e.target.value as 'system' | 'light' | 'dark' })}
          >
            <option value="system">Seguir al sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[15px] font-medium">Sonidos</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">
              Toques sutiles al grabar, guardar y completar.
            </p>
          </div>
          <Toggle
            label="Sonidos de interfaz"
            checked={db.settings.sounds !== false}
            onChange={(v) => actions.setSettings({ sounds: v })}
          />
        </div>
      </Section>

      <Section title="Copia de seguridad" note="Todo vive en este dispositivo. Si borras el navegador, se va. Exporta de vez en cuando.">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => downloadFile(`libverde-${isoDate(new Date())}.json`, exportJSON(), 'application/json')}
          >
            <Download className="size-4" />
            Exportar JSON
          </Button>
          <Button variant="outline" onClick={() => file.current?.click()}>
            <Upload className="size-4" />
            Importar JSON
          </Button>
          <input ref={file} type="file" accept="application/json" onChange={importJSON} className="hidden" />
        </div>
        <p className="tnum mt-2 text-[13px] text-muted">
          {db.projects.length} proyectos · {db.entries.length} entradas · {db.reports.length} memorias
        </p>
      </Section>
    </div>
  )
}

function Categories() {
  const db = useDB()
  const toast = useToast()
  const [draft, setDraft] = useState('')

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = draft.trim()
    if (!clean) return
    actions.addCategory(clean)
    setDraft('')
  }

  const count = (name: string) => db.projects.filter((p) => p.category === name).length

  return (
    <div className="flex flex-col gap-3">
      {db.settings.categories.length > 0 && (
        <ul className="rounded-xl border border-line bg-surface">
          {db.settings.categories.map((c) => (
            <li key={c} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0">
              <input
                value={c}
                onChange={(e) => actions.renameCategory(c, e.target.value)}
                aria-label={`Nombre de la categoría ${c}`}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-medium text-ink focus:outline-none"
              />
              <span className="tnum shrink-0 text-[13px] text-muted">
                {plural(count(c), 'proyecto', 'proyectos')}
              </span>
              <button
                onClick={() => {
                  actions.deleteCategory(c)
                  toast(`Categoría «${c}» borrada.`)
                }}
                aria-label={`Borrar categoría ${c}`}
                className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-pendiente"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Trabajo, Ocio, Cliente X…"
          aria-label="Nueva categoría"
        />
        <Button variant="outline" type="submit" disabled={!draft.trim()}>
          <Plus className="size-4" />
          Añadir
        </Button>
      </form>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <p className="mt-0.5 max-w-[65ch] text-[14px] leading-relaxed text-muted text-pretty">{note}</p>
      </div>
      {children}
    </section>
  )
}
