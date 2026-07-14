# LibVerde

Libreta inteligente de proyectos personales. Dictas lo que has hecho, ella lo ordena, mide tus sesiones y el domingo te escribe la **memoria de la semana en Markdown** — lista para tu vault de Obsidian y para que Claude Code la lea como contexto.

## La idea

Una sola corriente de entradas. Nota, idea, avance, pendiente y sesión son el mismo objeto con un campo `kind`. Las fichas de proyecto, los insights y el tiempo invertido son *vistas* sobre ese stream.

La IA hace tres cosas concretas, y ninguna más:

1. **Transcribe** el audio (Gemini 2.5 Flash, una sola llamada).
2. **Clasifica** la nota y la asigna a un proyecto — con la lista de proyectos como **vocabulario cerrado**, que es lo que evita que «Hashback» acabe transcrito como «has back» y la nota caiga en el proyecto equivocado.
3. **Redacta** la memoria semanal. Nunca calcula: las cifras se agregan en local y se le pasan ya hechas. Un parte que se entrega no puede tener números alucinados.

Los insights **no usan IA**: son sumas y cuentas.

## La memoria semanal

Markdown determinista, escrito para máquinas (Obsidian + Claude), no para lucir:

```markdown
---
semana: 2026-W29
desde: 2026-07-13
hasta: 2026-07-19
minutos_totales: 95
proyectos_tocados: [bibliothek]
---

# Semana 2026-W29 (13–19 jul 2026)

**Total:** 1h 35m · 1 sesión · 1 proyecto tocado

## [[Bibliothek]] — 1h 35m · 1 sesión · estado: en desarrollo

**Hecho**
- Implementado el enlace #sync= que funde las fichas sin borrar (2026-07-13)

**Pendiente**
- Probar el traspaso en un móvil real

## Sin actividad
- [[Randomblocker]] — sin ninguna entrada todavía
```

Reglas duras del generador: fechas **siempre absolutas** (un fichero de memoria con «ayer» envenena el contexto tres meses después), cero relleno corporativo, y prohibido inventar progreso — una semana floja se describe como floja.

Con **File System Access API** eliges la carpeta del vault una vez y LibVerde escribe `Semanas/` y `Proyectos/` directamente (Chrome/Edge de escritorio). En móvil: copiar o descargar `.md`.

## Decisiones

- **Confirmación de un toque.** La IA se equivoca. Tras dictar sale una tarjeta editable; nunca se guarda en silencio. Datos mal clasificados envenenan los insights, que son justo el producto.
- **Sesiones sin cuenta atrás.** Le das a *Empezar* y, al terminar, **eliges la hora de fin** (y corriges la de inicio si hace falta). Es el caso real: te acuerdas a las 23:40 de que paraste a las 22:15. El tiempo se calcula contra el reloj, así que puedes bloquear el móvil o cerrar la pestaña.
- **La sesión retroactiva por voz también vale** («he trabajado 25 minutos en X»).
- **Categorías que tú defines** (Trabajo, Ocio, Cliente X…). Agrupan la portada, reparten el tiempo en los insights y entran en el frontmatter de la memoria (`minutos_por_categoria`), así que Dataview las puede consultar.
- **Las memorias se congelan al cerrarlas.** Si luego añades entradas viejas, te avisa de que está desactualizada; no se reescribe sola.
- **Las ideas tienen bucle de salida.** El cierre de semana te obliga a matarlas o promoverlas. Sin eso, «ideas pendientes» solo es un número que crece.
- **Funciona sin API key.** Escribes a mano, los audios se encolan y la memoria sale con tus entradas literales.

## Stack

React 19 · Vite · TypeScript · Tailwind v4 · Gemini 2.5 Flash (key propia, en `localStorage`) · localStorage + IndexedDB · PWA.

Todo vive en tu dispositivo. No hay backend, no hay cuentas. La API key nunca sale del navegador ni viaja en las copias de seguridad.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5179
npm run build
```

La API key se pide en el onboarding o en Ajustes → [Google AI Studio](https://aistudio.google.com/apikey).
