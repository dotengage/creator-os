import { useState } from 'react'
import {
  AlertTriangle, Cloud, CloudOff, Copy, ExternalLink, Loader2,
  RefreshCw, ShieldCheck, Smartphone, Unplug,
} from 'lucide-react'
import { useSync } from '../lib/sync'
import type { SyncPhase } from '../lib/sync'
import { cx, relativeDays } from '../lib/utils'
import { Badge, Button, Card, Field, Input, Modal, useConfirm, useToast } from './ui'

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Creator%20OS'

const PHASE_META: Record<SyncPhase, { label: string; tone: 'good' | 'bad' | 'warn' | 'info' | 'neutral' }> = {
  off: { label: 'Not connected', tone: 'neutral' },
  connecting: { label: 'Connecting…', tone: 'info' },
  pulling: { label: 'Syncing…', tone: 'info' },
  pushing: { label: 'Saving…', tone: 'info' },
  idle: { label: 'Synced', tone: 'good' },
  offline: { label: 'Offline', tone: 'warn' },
  error: { label: 'Sync problem', tone: 'bad' },
  conflict: { label: 'Needs a choice', tone: 'bad' },
}

const sinceLabel = (iso: string | null) => {
  if (!iso) return ''
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return relativeDays(iso.slice(0, 10))
}

/* ------------------------------------------------------------ status pill */
export function SyncBadge({ onOpen }: { onOpen: () => void }) {
  const { phase, connected, lastSyncedAt } = useSync()
  const meta = PHASE_META[phase]
  const spinning = phase === 'pulling' || phase === 'pushing' || phase === 'connecting'

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-elevated"
      title={connected ? 'Cloud sync settings' : 'Set up cloud sync'}
    >
      <span
        className={cx(
          'grid h-6 w-6 shrink-0 place-items-center rounded-lg',
          meta.tone === 'good' ? 'bg-positive/10 text-positive'
            : meta.tone === 'bad' ? 'bg-danger/10 text-danger'
            : meta.tone === 'warn' ? 'bg-warning/20 text-warning'
            : meta.tone === 'info' ? 'bg-accent-soft text-accent'
            : 'bg-elevated text-muted',
        )}
      >
        {spinning ? <Loader2 size={12} className="animate-spin" />
          : connected ? <Cloud size={12} /> : <CloudOff size={12} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-semibold text-ink">{meta.label}</span>
        {phase === 'idle' && lastSyncedAt && (
          <span className="block truncate text-[10.5px] text-faint">{sinceLabel(lastSyncedAt)}</span>
        )}
        {!connected && <span className="block truncate text-[10.5px] text-faint">This device only</span>}
      </span>
    </button>
  )
}

/* --------------------------------------------------------- conflict modal */
export function SyncConflictDialog() {
  const { phase, message, keepCloud, keepThisDevice } = useSync()
  const [working, setWorking] = useState<'cloud' | 'local' | null>(null)

  const run = async (which: 'cloud' | 'local') => {
    setWorking(which)
    try {
      if (which === 'cloud') await keepCloud()
      else await keepThisDevice()
    } finally {
      setWorking(null)
    }
  }

  return (
    <Modal
      open={phase === 'conflict'}
      onClose={() => { /* resolved by choosing a side, never by dismissing */ }}
      dismissible={false}
      size="sm"
      title="Two versions of your data"
    >
      <div className="space-y-4">
        <div className="flex gap-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warning/20 text-warning">
            <AlertTriangle size={19} />
          </div>
          <p className="pt-1 text-[13.5px] leading-relaxed text-muted">
            {message || 'This was changed on another device.'} Nothing has been merged or overwritten —
            pick which copy to keep and the other is replaced.
          </p>
        </div>

        <div className="space-y-2">
          <Button
            block
            variant="primary"
            loading={working === 'cloud'}
            disabled={!!working}
            onClick={() => void run('cloud')}
          >
            Use the cloud version
          </Button>
          <p className="px-1 text-[11.5px] text-faint">
            Takes whatever the other device saved. Unsent edits made here are discarded.
          </p>

          <Button block loading={working === 'local'} disabled={!!working} onClick={() => void run('local')}>
            Keep this device&rsquo;s version
          </Button>
          <p className="px-1 text-[11.5px] text-faint">
            Pushes what is on this screen and replaces the cloud copy.
          </p>
        </div>
      </div>
    </Modal>
  )
}

/* --------------------------------------------------------- settings card */
export function SyncSettings() {
  const sync = useSync()
  const toast = useToast()
  const confirm = useConfirm()

  const [token, setToken] = useState('')
  const [gistId, setGistId] = useState('')
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [working, setWorking] = useState(false)

  const meta = PHASE_META[sync.phase]

  const connect = async () => {
    if (!token.trim()) return
    setWorking(true)
    try {
      if (mode === 'create') {
        const id = await sync.createStore(token.trim())
        toast('Cloud sync on — copy the store ID onto your other devices')
        setGistId(id)
      } else {
        await sync.connectStore(token.trim(), gistId)
        toast('Connected — this device now matches the cloud copy')
      }
      setToken('')
    } catch {
      /* the provider surfaces the message in its own status line */
    } finally {
      setWorking(false)
    }
  }

  const disconnect = async () => {
    const ok = await confirm({
      title: 'Turn off cloud sync?',
      message: 'Your data stays on this device and in the cloud store — they just stop talking to each other.',
      confirmLabel: 'Disconnect',
      tone: 'danger',
    })
    if (ok) {
      sync.disconnect()
      toast('Cloud sync off', 'info')
    }
  }

  const copyId = async () => {
    if (!sync.gistId) return
    try {
      await navigator.clipboard.writeText(sync.gistId)
      toast('Store ID copied')
    } catch {
      toast('Clipboard blocked — select and copy it by hand', 'bad')
    }
  }

  return (
    <Card className="p-4 sm:p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-[-0.01em] text-ink">
          <span className="text-accent">{sync.connected ? <Cloud size={15} /> : <CloudOff size={15} />}</span>
          Cloud sync
        </h2>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {sync.phase === 'idle' && sync.lastSyncedAt && (
          <span className="text-[11.5px] text-faint">{sinceLabel(sync.lastSyncedAt)}</span>
        )}
      </div>

      {!!sync.message && (
        <p className={cx('mb-4 rounded-xl px-3 py-2.5 text-[12.5px]',
          sync.phase === 'offline' ? 'bg-warning/20 text-warning' : 'bg-danger/10 text-danger')}>
          {sync.message}
        </p>
      )}

      {sync.connected ? (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-muted">
            Your data lives in a private GitHub Gist and the cloud copy wins on every device.
            Changes go up a couple of seconds after you stop typing, and this device checks for
            edits from elsewhere every 45 seconds.
          </p>

          <Field label="Store ID" hint="Paste this on your phone or laptop to connect it to the same data.">
            <div className="flex gap-2">
              <Input readOnly value={sync.gistId ?? ''} className="font-mono text-[12.5px]" onFocus={(e) => e.currentTarget.select()} />
              <Button onClick={copyId} className="shrink-0"><Copy size={14} /> Copy</Button>
            </div>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void sync.syncNow()} disabled={sync.phase === 'pulling' || sync.phase === 'pushing'}>
              <RefreshCw size={14} /> Sync now
            </Button>
            <Button variant="ghost" className="text-danger" onClick={() => void disconnect()}>
              <Unplug size={14} /> Disconnect this device
            </Button>
          </div>

          <div className="rounded-xl border border-line p-3.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
              <Smartphone size={13} /> Adding another device
            </p>
            <ol className="ml-4 list-decimal space-y-1 text-[12.5px] leading-relaxed text-muted">
              <li>Open the app on that device and go to Settings.</li>
              <li>Choose <strong className="font-semibold text-ink">Connect to an existing store</strong>.</li>
              <li>Paste the same token and the Store ID above.</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-muted">
            Without this, each device keeps its own separate copy. Connect a GitHub token and your
            deals, invoices and plans follow you between your laptop and your phone.
          </p>

          <div className="rounded-xl border border-line p-3.5">
            <p className="mb-2 text-[12.5px] font-semibold text-ink">First, make a token</p>
            <ol className="ml-4 list-decimal space-y-1 text-[12.5px] leading-relaxed text-muted">
              <li>Open the link below — the <code className="font-mono text-[11.5px]">gist</code> scope is pre-ticked.</li>
              <li>Set an expiry you are comfortable with, then generate it.</li>
              <li>Copy the token and paste it here. It is shown only once.</li>
            </ol>
            <Button size="sm" className="mt-3" onClick={() => window.open(TOKEN_URL, '_blank', 'noopener')}>
              <ExternalLink size={13} /> Create a GitHub token
            </Button>
          </div>

          <Field label="GitHub token">
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_…"
              className="font-mono text-[12.5px]"
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setMode('create')}
              className={cx('flex-1 rounded-xl border p-3 text-left transition-all duration-200',
                mode === 'create' ? 'border-accent bg-accent-soft' : 'border-line hover:border-faint')}
            >
              <p className="text-[13px] font-bold text-ink">Start a new cloud store</p>
              <p className="text-[11.5px] leading-snug text-muted">
                Use this on your first device. Creates a fresh private gist from what is on this device now.
              </p>
            </button>
            <button
              onClick={() => setMode('join')}
              className={cx('flex-1 rounded-xl border p-3 text-left transition-all duration-200',
                mode === 'join' ? 'border-accent bg-accent-soft' : 'border-line hover:border-faint')}
            >
              <p className="text-[13px] font-bold text-ink">Connect to an existing store</p>
              <p className="text-[11.5px] leading-snug text-muted">
                Use this on every device after the first. Replaces this device&rsquo;s data with the cloud copy.
              </p>
            </button>
          </div>

          {mode === 'join' && (
            <Field label="Store ID" hint="From Settings on the device you set up first.">
              <Input
                value={gistId}
                onChange={(e) => setGistId(e.target.value)}
                placeholder="e.g. 3f9a1c7e2b8d4f60a1c5e7d9b3a2f108"
                className="font-mono text-[12.5px]"
              />
            </Field>
          )}

          <Button
            variant="primary"
            block
            loading={working}
            disabled={!token.trim() || (mode === 'join' && !gistId.trim())}
            onClick={() => void connect()}
          >
            {mode === 'create' ? 'Turn on cloud sync' : 'Connect this device'}
          </Button>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <p className="flex items-start gap-2 rounded-xl bg-elevated px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-positive" />
          <span>
            The token is kept in this browser only. It never goes into the gist, a JSON backup or a
            spreadsheet export. Creator OS writes to <em>one</em> gist that it created and tagged as its
            own — it refuses to read or write any other gist, so nothing else in your account can be
            touched or merged into this.
          </span>
        </p>
        <p className="flex items-start gap-2 rounded-xl bg-elevated px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          <span>
            Worth knowing: a secret gist is unlisted, not access-controlled — anyone who gets hold of the
            Store ID could read it. Keep the ID to yourself, and revoke the token from GitHub any time to
            cut every device off at once.
          </span>
        </p>
      </div>
    </Card>
  )
}

