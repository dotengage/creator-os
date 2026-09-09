import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3, BookMarked, CalendarRange, FileText, Home, Lightbulb, MoreHorizontal,
  Palette, Settings as SettingsIcon, Sparkles, Target, Users, Wallet, X,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { THEMES } from '../lib/types'
import { cx } from '../lib/utils'
import { dealsAwaitingInvoice, dueFollowUps, overdueInvoices } from '../lib/selectors'
import { IconButton } from './ui'
import { SyncBadge } from './SyncPanel'

export interface NavEntry {
  to: string
  label: string
  icon: ReactNode
  group: 'work' | 'money' | 'library'
}

export const NAV: NavEntry[] = [
  { to: '/', label: 'Home', icon: <Home size={17} />, group: 'work' },
  { to: '/planner', label: 'Content Planner', icon: <CalendarRange size={17} />, group: 'work' },
  { to: '/ideas', label: 'Ideas', icon: <Lightbulb size={17} />, group: 'work' },
  { to: '/outreach', label: 'Outreach', icon: <Users size={17} />, group: 'money' },
  { to: '/invoices', label: 'Invoices', icon: <FileText size={17} />, group: 'money' },
  { to: '/earnings', label: 'Earnings', icon: <Wallet size={17} />, group: 'money' },
  { to: '/goals', label: 'Goals', icon: <Target size={17} />, group: 'money' },
  { to: '/templates', label: 'Templates', icon: <BookMarked size={17} />, group: 'library' },
  { to: '/inspiration', label: 'Inspiration', icon: <Sparkles size={17} />, group: 'library' },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon size={17} />, group: 'library' },
]

const GROUP_LABEL: Record<NavEntry['group'], string> = {
  work: 'Create',
  money: 'Business',
  library: 'Library',
}

const MOBILE_PRIMARY = ['/', '/planner', '/outreach', '/earnings']

/* --------------------------------------------------------------- badges */
function useAttention() {
  const { state } = useStore()
  return {
    '/outreach': dueFollowUps(state).length,
    '/invoices': overdueInvoices(state).length + dealsAwaitingInvoice(state).length,
  } as Record<string, number>
}

/* ------------------------------------------------------------ theme picker */
export function ThemePicker({ compact }: { compact?: boolean }) {
  const { settings, setTheme } = useStore()
  return (
    <div className={cx('flex flex-wrap gap-1.5', compact && 'gap-1')}>
      {THEMES.map((t) => {
        const active = settings.theme === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            title={t.label}
            aria-label={`${t.label} theme`}
            aria-pressed={active}
            className={cx(
              'relative grid place-items-center rounded-full transition-transform duration-200 active:scale-90',
              compact ? 'h-6 w-6' : 'h-7 w-7',
            )}
          >
            <span
              className="h-full w-full rounded-full border border-line shadow-soft"
              style={{ background: t.swatch }}
            />
            <span className="absolute h-2 w-2 rounded-full" style={{ background: t.ring }} />
            {active && (
              <motion.span
                layoutId="theme-ring"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="absolute inset-[-3px] rounded-full border-2 border-accent"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------------------- brand */
const Brand = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { settings } = useStore()
  const navigate = useNavigate()
  const name = settings.appName || 'Creator OS'

  return (
    <button
      onClick={() => { onNavigate?.(); navigate('/settings') }}
      title="Edit your name and picture"
      className="group flex w-full items-center gap-2.5 rounded-xl p-1 text-left transition-colors hover:bg-elevated"
    >
      {settings.avatar ? (
        <img
          src={settings.avatar}
          alt=""
          className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-soft"
        />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-soft">
          <Palette size={17} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold leading-tight tracking-[-0.01em] text-ink">{name}</span>
        <span className="block truncate text-[11.5px] leading-tight text-muted">
          {settings.creatorName || 'Your command centre'}
        </span>
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ item */
const NavItem = ({ entry, count, onNavigate }: { entry: NavEntry; count?: number; onNavigate?: () => void }) => (
  <NavLink
    to={entry.to}
    end={entry.to === '/'}
    onClick={onNavigate}
    className={({ isActive }) =>
      cx(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-200',
        isActive ? 'text-accent' : 'text-muted hover:bg-elevated hover:text-ink',
      )
    }
  >
    {({ isActive }) => (
      <>
        {isActive && (
          <motion.span
            layoutId="nav-active"
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            className="absolute inset-0 rounded-xl bg-accent-soft"
          />
        )}
        <span className="relative z-10 shrink-0">{entry.icon}</span>
        <span className="relative z-10 flex-1 truncate">{entry.label}</span>
        {!!count && (
          <span className="relative z-10 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10.5px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </>
    )}
  </NavLink>
)

/* --------------------------------------------------------------- sidebar */
function Sidebar() {
  const attention = useAttention()
  const navigate = useNavigate()
  const groups: NavEntry['group'][] = ['work', 'money', 'library']
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] flex-col border-r border-line bg-surface md:flex">
      <div className="px-3 py-5"><Brand /></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">
              {GROUP_LABEL[g]}
            </p>
            <div className="space-y-0.5">
              {NAV.filter((n) => n.group === g).map((n) => (
                <NavItem key={n.to} entry={n} count={attention[n.to]} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line px-3 py-2">
        <SyncBadge onOpen={() => navigate('/settings')} />
      </div>
      <div className="border-t border-line px-4 py-4">
        <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Appearance</p>
        <ThemePicker />
      </div>
    </aside>
  )
}

/* ---------------------------------------------------------------- mobile */
function MobileNav() {
  const [more, setMore] = useState(false)
  const attention = useAttention()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => setMore(false), [location.pathname])

  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.to))
  const rest = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.to))
  const restCount = rest.reduce((s, n) => s + (attention[n.to] ?? 0), 0)

  return (
    <>
      <AnimatePresence>
        {more && (
          <div className="fixed inset-0 z-40 md:hidden">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMore(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-surface pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line" />
              <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-4">
                <Brand onNavigate={() => setMore(false)} />
                <IconButton label="Close" onClick={() => setMore(false)}><X size={18} /></IconButton>
              </div>
              <div className="grid grid-cols-2 gap-1.5 px-4 py-3">
                {rest.map((n) => (
                  <NavItem key={n.to} entry={n} count={attention[n.to]} onNavigate={() => setMore(false)} />
                ))}
              </div>
              <div className="border-t border-line px-4 py-2">
                <SyncBadge onOpen={() => { setMore(false); navigate('/settings') }} />
              </div>
              <div className="border-t border-line px-5 py-4">
                <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-faint">Appearance</p>
                <ThemePicker />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden">
        <div className="grid grid-cols-5">
          {primary.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cx('relative flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold transition-colors',
                  isActive ? 'text-accent' : 'text-muted')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span layoutId="mnav" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent" />
                  )}
                  <span className="relative">
                    {n.icon}
                    {!!attention[n.to] && (
                      <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
                    )}
                  </span>
                  {n.label.split(' ')[0]}
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMore(true)}
            className={cx('relative flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold transition-colors',
              more ? 'text-accent' : 'text-muted')}
          >
            <span className="relative">
              <MoreHorizontal size={17} />
              {!!restCount && <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />}
            </span>
            More
          </button>
        </div>
      </nav>
    </>
  )
}

/* ---------------------------------------------------------------- layout */
export default function Layout({ children }: { children: ReactNode }) {
  const { storageError } = useStore()
  const location = useLocation()

  useEffect(() => {
    document.getElementById('scroll-root')?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="min-h-full bg-bg">
      <Sidebar />
      <MobileNav />

      <div className="md:pl-[244px]">
        {storageError && (
          <div className="border-b border-danger/25 bg-danger/10 px-4 py-2 text-center text-[12.5px] font-medium text-danger">
            {storageError}
          </div>
        )}
        <main id="scroll-root" className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-5 sm:px-6 md:pb-12 md:pt-8">
          {/*
            Deliberately NOT wrapped in <AnimatePresence mode="wait">. That mode
            withholds the incoming page until the outgoing one reports its exit
            animation finished — and requestAnimationFrame is paused while a tab
            sits in the background, so that report can simply never arrive and
            the page stays blank until a reload. A keyed element that only
            animates in cannot get stuck: React has already mounted the content
            whether or not the animation ever runs. The fade is a plain CSS
            keyframe for the same reason: it runs off the document timeline
            rather than requestAnimationFrame. It moves the element only, never
            its opacity, so even a completely stalled animation shows readable
            content rather than an empty screen.
          */}
          <div key={location.pathname.split('/')[1] || 'home'} className="animate-rise">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export { BarChart3 }
