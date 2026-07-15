import { useCallback, useEffect, useState } from 'react'
import { BarChart3, CalendarCheck, Home as HomeIcon, Settings as SettingsIcon } from 'lucide-react'
import { ToastProvider } from './components/Toast'
import { TimerBar } from './components/TimerBar'
import { sfx } from './lib/sound'
import { Home } from './screens/Home'
import { ProjectScreen } from './screens/ProjectScreen'
import { Insights } from './screens/Insights'
import { WeekScreen } from './screens/WeekScreen'
import { Settings } from './screens/Settings'
import { Onboarding } from './screens/Onboarding'
import { actions, useDB } from './lib/store'

const TABS = [
  { route: '#/', label: 'Inicio', icon: HomeIcon },
  { route: '#/semana', label: 'Semana', icon: CalendarCheck },
  { route: '#/insights', label: 'Insights', icon: BarChart3 },
  { route: '#/ajustes', label: 'Ajustes', icon: SettingsIcon },
]

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')

  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((route: string) => {
    window.location.hash = route
    window.scrollTo({ top: 0 })
  }, [])

  return { hash, go }
}

function useTheme(theme: 'system' | 'light' | 'dark') {
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])
}

export default function App() {
  const db = useDB()
  const { hash, go } = useHashRoute()
  useTheme(db.settings.theme)

  if (!db.settings.onboarded && !db.projects.length) {
    return (
      <ToastProvider>
        <Onboarding done={() => go('#/')} />
      </ToastProvider>
    )
  }

  const projectId = hash.startsWith('#/p/') ? hash.slice(4) : null

  const screen = projectId ? (
    <ProjectScreen id={projectId} go={go} />
  ) : hash.startsWith('#/semana') ? (
    <WeekScreen />
  ) : hash.startsWith('#/insights') ? (
    <Insights />
  ) : hash.startsWith('#/ajustes') ? (
    <Settings />
  ) : (
    <Home go={go} />
  )

  const activeTab = projectId ? '#/' : (TABS.find((t) => hash.startsWith(t.route) && t.route !== '#/')?.route ?? '#/')

  return (
    <ToastProvider>
      {/* Velo del notch: en PWA a pantalla completa el contenido pasa por
          detrás del reloj de iOS; este velo lo difumina como una barra nativa. */}
      <div
        aria-hidden
        className="fixed inset-x-0 top-0 z-30 h-[env(safe-area-inset-top)] bg-bg/80 backdrop-blur-md"
      />
      <div className="safe-top flex min-h-full flex-col">
        <TimerBar />
        <main className="flex-1">{screen}</main>

        <nav
          aria-label="Navegación principal"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        >
          <ul className="mx-auto flex max-w-2xl">
            {TABS.map(({ route, label, icon: Icon }) => {
              const active = activeTab === route
              return (
                <li key={route} className="flex-1">
                  <button
                    onClick={() => {
                      if (!active) sfx.tap()
                      go(route)
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={`pressable flex w-full flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium ${
                      active ? 'text-primary' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                    {label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </ToastProvider>
  )
}

// Migración perezosa: si alguien ya tenía proyectos pero no la marca de onboarding.
if (typeof window !== 'undefined') {
  const db = JSON.parse(localStorage.getItem('libverde_v1') ?? '{}')
  if (db?.projects?.length && db?.settings && !db.settings.onboarded) actions.setSettings({ onboarded: true })
}
