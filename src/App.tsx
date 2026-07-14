import { useCallback, useEffect, useState } from 'react'
import { BarChart3, CalendarCheck, Home as HomeIcon, Settings as SettingsIcon } from 'lucide-react'
import { ToastProvider } from './components/Toast'
import { TimerBar } from './components/TimerBar'
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
      <div className="flex min-h-full flex-col">
        <TimerBar />
        <main className="flex-1">{screen}</main>

        <nav
          aria-label="Navegación principal"
          className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur"
        >
          <ul className="mx-auto flex max-w-2xl">
            {TABS.map(({ route, label, icon: Icon }) => {
              const active = activeTab === route
              return (
                <li key={route} className="flex-1">
                  <button
                    onClick={() => go(route)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                      active ? 'text-primary' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
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
