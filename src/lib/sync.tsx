import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppState } from './types'
import { emptyState, useStore } from './store'
import { uid } from './utils'

/*
 * Cloud sync over a private GitHub Gist.
 *
 * The cloud copy is the source of truth: on startup we pull and adopt whatever
 * is up there. Local storage is only an offline cache.
 *
 * This app gets its own dedicated gist and stamps every payload with its own
 * marker. Anything without that marker is refused outright — no reading, no
 * writing, no merging — so a gist belonging to another app can never be read
 * into this one or overwritten by it.
 */

const CONFIG_KEY = 'creator-os.sync.v1'
const FILENAME = 'creator-os-data.json'
const APP_MARKER = 'creator-os'
const ENVELOPE_VERSION = 1

const PUSH_DEBOUNCE_MS = 2500
const POLL_INTERVAL_MS = 45_000
const REQUEST_TIMEOUT_MS = 20_000

/* ----------------------------------------------------------------- config */
export interface SyncConfig {
  token: string
  gistId: string
  deviceId: string
}

/** The token lives here and *only* here — it is never part of AppState, so it
 *  cannot leak into the gist, a JSON backup or an XLSX export. */
const loadConfig = (): SyncConfig | null => {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    if (!parsed.token || !parsed.gistId) return null
    return { token: parsed.token, gistId: parsed.gistId, deviceId: parsed.deviceId || uid('dev') }
  } catch {
    return null
  }
}

const storeConfig = (config: SyncConfig | null) => {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    else localStorage.removeItem(CONFIG_KEY)
  } catch {
    /* private mode — sync just will not persist across reloads */
  }
}

/* --------------------------------------------------------------- envelope */
interface Envelope {
  app: typeof APP_MARKER
  version: number
  updatedAt: string
  device: string
  state: AppState
}

const isOurEnvelope = (value: unknown): value is Envelope =>
  !!value &&
  typeof value === 'object' &&
  (value as Envelope).app === APP_MARKER &&
  typeof (value as Envelope).state === 'object'

export class ForeignGistError extends Error {
  constructor() {
    super(
      `That gist does not belong to Creator OS. Leaving it untouched — ` +
        `use a different gist ID, or create a new cloud store.`,
    )
    this.name = 'ForeignGistError'
  }
}

/* ------------------------------------------------------------- gist client */
const api = async (path: string, token: string, init: RequestInit = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })

    if (res.status === 401) throw new Error('GitHub rejected that token. Check it has not expired or been revoked.')
    if (res.status === 403) throw new Error('GitHub refused the request — the token is likely missing the "gist" scope.')
    if (res.status === 404) throw new Error('That gist does not exist, or this token cannot see it.')
    if (!res.ok) throw new Error(`GitHub returned ${res.status}. Try again in a moment.`)
    return res.json() as Promise<GistResponse>
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('GitHub did not respond in time.')
    }
    if (err instanceof TypeError) throw new Error('offline')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

interface GistResponse {
  id: string
  updated_at: string
  files: Record<string, { content?: string; truncated?: boolean; raw_url?: string } | undefined>
}

const readEnvelope = async (gist: GistResponse): Promise<Envelope> => {
  const file = gist.files?.[FILENAME]
  // No file of ours in there — this gist belongs to something else.
  if (!file) throw new ForeignGistError()

  // Gists over ~1MB come back truncated; fetch the raw blob in that case.
  let content = file.content ?? ''
  if (file.truncated && file.raw_url) {
    const res = await fetch(file.raw_url)
    if (!res.ok) throw new Error('Could not download the full cloud copy.')
    content = await res.text()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('The cloud copy is not readable JSON.')
  }
  if (!isOurEnvelope(parsed)) throw new ForeignGistError()
  return parsed
}

const hydrate = (state: Partial<AppState>): AppState => {
  const base = emptyState()
  return {
    ...base,
    ...state,
    settings: { ...base.settings, ...(state.settings ?? {}) },
  }
}

const envelopeFor = (state: AppState, deviceId: string): Envelope => ({
  app: APP_MARKER,
  version: ENVELOPE_VERSION,
  updatedAt: new Date().toISOString(),
  device: deviceId,
  state,
})

/* ------------------------------------------------------------------ status */
export type SyncPhase =
  | 'off'
  | 'connecting'
  | 'pulling'
  | 'pushing'
  | 'idle'
  | 'offline'
  | 'error'
  | 'conflict'

export interface SyncApi {
  phase: SyncPhase
  message: string
  lastSyncedAt: string | null
  gistId: string | null
  connected: boolean
  /** Create a brand new gist for this app and adopt the local data into it. */
  createStore: (token: string) => Promise<string>
  /** Attach to an existing Creator OS gist (refuses anything else). */
  connectStore: (token: string, gistId: string) => Promise<void>
  disconnect: () => void
  syncNow: () => Promise<void>
  /** Conflict resolution — always an explicit choice, never an automatic merge. */
  keepCloud: () => Promise<void>
  keepThisDevice: () => Promise<void>
}

const SyncCtx = createContext<SyncApi | null>(null)

export const useSync = (): SyncApi => {
  const ctx = useContext(SyncCtx)
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>')
  return ctx
}

/* ---------------------------------------------------------------- provider */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { state, replaceAll } = useStore()

  const [config, setConfig] = useState<SyncConfig | null>(loadConfig)
  const [phase, setPhase] = useState<SyncPhase>(() => (loadConfig() ? 'connecting' : 'off'))
  const [message, setMessage] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  /** The remote stamp we last saw, used to detect edits from another device. */
  const remoteStamp = useRef<string | null>(null)
  /** Serialised state we last successfully sent, so we can tell "dirty" apart. */
  const lastPushed = useRef<string | null>(null)
  /** Set when a state change came from a pull, so it does not bounce back up. */
  const fromRemote = useRef(false)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)

  const configRef = useRef(config)
  configRef.current = config

  const stateRef = useRef(state)
  stateRef.current = state

  const fail = useCallback((err: unknown) => {
    const text = err instanceof Error ? err.message : String(err)
    if (text === 'offline') {
      setPhase('offline')
      setMessage('No connection — changes are saved on this device and will go up when you are back.')
    } else {
      setPhase('error')
      setMessage(text)
    }
  }, [])

  /* --------------------------------------------------------------- pull */
  const adopt = useCallback(
    (envelope: Envelope) => {
      fromRemote.current = true
      const next = hydrate(envelope.state)
      replaceAll(next)
      lastPushed.current = JSON.stringify(next)
      remoteStamp.current = envelope.updatedAt
      setLastSyncedAt(new Date().toISOString())
      setPhase('idle')
      setMessage('')
    },
    [replaceAll],
  )

  const pull = useCallback(async () => {
    const cfg = configRef.current
    if (!cfg || busy.current) return
    busy.current = true
    setPhase('pulling')
    try {
      const gist = await api(`/gists/${cfg.gistId}`, cfg.token)
      adopt(await readEnvelope(gist))
    } catch (err) {
      fail(err)
    } finally {
      busy.current = false
    }
  }, [adopt, fail])

  /* --------------------------------------------------------------- push */
  const push = useCallback(
    async (force = false) => {
      const cfg = configRef.current
      if (!cfg || busy.current) return
      const serialized = JSON.stringify(stateRef.current)
      if (!force && serialized === lastPushed.current) return

      busy.current = true
      setPhase('pushing')
      try {
        // Cloud is the source of truth, so check nobody else moved it first.
        if (!force) {
          const current = await api(`/gists/${cfg.gistId}`, cfg.token)
          const remote = await readEnvelope(current)
          if (remoteStamp.current && remote.updatedAt !== remoteStamp.current) {
            setPhase('conflict')
            setMessage('This was changed on another device. Choose which copy to keep.')
            return
          }
        }

        const envelope = envelopeFor(stateRef.current, cfg.deviceId)
        await api(`/gists/${cfg.gistId}`, cfg.token, {
          method: 'PATCH',
          body: JSON.stringify({
            files: { [FILENAME]: { content: JSON.stringify(envelope, null, 2) } },
          }),
        })

        lastPushed.current = JSON.stringify(envelope.state)
        remoteStamp.current = envelope.updatedAt
        setLastSyncedAt(new Date().toISOString())
        setPhase('idle')
        setMessage('')
      } catch (err) {
        fail(err)
      } finally {
        busy.current = false
      }
    },
    [fail],
  )

  /* ------------------------------------------------------ connect / setup */
  const createStore = useCallback(
    async (token: string) => {
      setPhase('connecting')
      setMessage('')
      const deviceId = uid('dev')
      const envelope = envelopeFor(stateRef.current, deviceId)
      try {
        const gist = await api('/gists', token, {
          method: 'POST',
          body: JSON.stringify({
            description: 'Creator OS — private app data. Do not edit by hand.',
            public: false,
            files: { [FILENAME]: { content: JSON.stringify(envelope, null, 2) } },
          }),
        })
        const next = { token, gistId: gist.id, deviceId }
        storeConfig(next)
        setConfig(next)
        lastPushed.current = JSON.stringify(envelope.state)
        remoteStamp.current = envelope.updatedAt
        setLastSyncedAt(new Date().toISOString())
        setPhase('idle')
        return gist.id
      } catch (err) {
        fail(err)
        throw err
      }
    },
    [fail],
  )

  const connectStore = useCallback(
    async (token: string, gistId: string) => {
      setPhase('connecting')
      setMessage('')
      try {
        const gist = await api(`/gists/${gistId.trim()}`, token)
        // Throws ForeignGistError before anything is written or adopted.
        const envelope = await readEnvelope(gist)
        const next = { token, gistId: gist.id, deviceId: uid('dev') }
        storeConfig(next)
        setConfig(next)
        adopt(envelope)
      } catch (err) {
        fail(err)
        throw err
      }
    },
    [adopt, fail],
  )

  const disconnect = useCallback(() => {
    storeConfig(null)
    setConfig(null)
    setPhase('off')
    setMessage('')
    setLastSyncedAt(null)
    remoteStamp.current = null
    lastPushed.current = null
  }, [])

  /* ------------------------------------------------------------ conflicts */
  const keepCloud = useCallback(async () => {
    setPhase('pulling')
    await pull()
  }, [pull])

  const keepThisDevice = useCallback(async () => {
    await push(true)
  }, [push])

  const syncNow = useCallback(async () => {
    if (phase === 'conflict') return
    const serialized = JSON.stringify(stateRef.current)
    if (lastPushed.current !== null && serialized !== lastPushed.current) await push()
    else await pull()
  }, [phase, pull, push])

  /* ------------------------------------------------- initial pull on boot */
  const booted = useRef(false)
  useEffect(() => {
    if (!config || booted.current) return
    booted.current = true
    void pull()
  }, [config, pull])

  /* ------------------------------------------------------- debounced push */
  useEffect(() => {
    if (!config) return
    if (fromRemote.current) {
      fromRemote.current = false
      return
    }
    if (phase === 'conflict' || phase === 'connecting' || lastPushed.current === null) return
    if (JSON.stringify(state) === lastPushed.current) return

    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => void push(), PUSH_DEBOUNCE_MS)
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current)
    }
  }, [state, config, phase, push])

  /* ------------------------------------- poll for edits from other devices */
  useEffect(() => {
    if (!config) return

    const check = async () => {
      const cfg = configRef.current
      if (!cfg || busy.current || document.hidden) return
      if (phase === 'conflict' || phase === 'pushing') return
      try {
        const gist = await api(`/gists/${cfg.gistId}`, cfg.token)
        const remote = await readEnvelope(gist)
        if (remote.updatedAt === remoteStamp.current) {
          if (phase === 'offline' || phase === 'error') {
            setPhase('idle')
            setMessage('')
          }
          return
        }
        // Someone else moved the cloud copy.
        const dirty = lastPushed.current !== null && JSON.stringify(stateRef.current) !== lastPushed.current
        if (dirty) {
          setPhase('conflict')
          setMessage('This was changed on another device while you had unsaved edits here.')
        } else {
          adopt(remote)
        }
      } catch (err) {
        fail(err)
      }
    }

    const id = setInterval(() => void check(), POLL_INTERVAL_MS)
    const onVisible = () => { if (!document.hidden) void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [config, phase, adopt, fail])

  /* --------------------------------- flush a pending push before unloading */
  useEffect(() => {
    const onHide = () => {
      if (pushTimer.current) {
        clearTimeout(pushTimer.current)
        void push()
      }
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [push])

  const value = useMemo<SyncApi>(
    () => ({
      phase,
      message,
      lastSyncedAt,
      gistId: config?.gistId ?? null,
      connected: !!config,
      createStore,
      connectStore,
      disconnect,
      syncNow,
      keepCloud,
      keepThisDevice,
    }),
    [phase, message, lastSyncedAt, config, createStore, connectStore, disconnect, syncNow, keepCloud, keepThisDevice],
  )

  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>
}
