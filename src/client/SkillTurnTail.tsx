import { memo, useCallback, useEffect, useSyncExternalStore, type JSX } from 'react'
import { IconSkillOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientConnectionHandle, SkillActivitySnapshot } from '../host/protocol.ts'
import { MnemonClient } from './api.ts'
import { dispatchMnemonAnchor } from './anchor.ts'
import type { MnemonClientContext } from './dsh-context.ts'
import type { MnemonKey } from './locales.ts'
import css from './SkillTurnTail.module.css'

/** The Skills page every link here opens; its seed says what to show. */
export const SKILLS_PAGE = 'skills/library'
/** How often a conversation is read again while one of its reviews waits or runs. */
const POLL_MS = 3_000
/** After a turn ends, the bar looks a few more times for the review it may have earned. */
const SETTLE_CHECKS = 2

interface Entry {
  snapshot?: SkillActivitySnapshot
  loading?: Promise<void>
  timer?: ReturnType<typeof setTimeout>
  /** Re-reads left to catch a review scheduled just after the turn ended. */
  settle: number
  listeners: Set<() => void>
}

/** One snapshot per conversation, shared by every bar under its turns. */
const entries = new WeakMap<ClientConnectionHandle, Map<string, Entry>>()

function entryOf(connection: ClientConnectionHandle, sessionId: string): Entry {
  let sessions = entries.get(connection)
  if (sessions === undefined) {
    sessions = new Map()
    entries.set(connection, sessions)
  }
  let entry = sessions.get(sessionId)
  if (entry === undefined) {
    entry = { settle: 0, listeners: new Set() }
    sessions.set(sessionId, entry)
  }
  return entry
}

function waiting(snapshot: SkillActivitySnapshot | undefined): boolean {
  return snapshot?.reviews.some(review => review.state === 'scheduled' || review.state === 'reviewing') === true
}

function load(connection: ClientConnectionHandle, sessionId: string, entry: Entry): void {
  if (entry.loading !== undefined) return
  if (entry.timer !== undefined) { clearTimeout(entry.timer); delete entry.timer }
  entry.loading = new MnemonClient(connection, sessionId).skillActivity()
    .then(snapshot => { entry.snapshot = snapshot }, () => undefined)
    .finally(() => {
      delete entry.loading
      for (const listener of [...entry.listeners]) listener()
      // Follow a review only while some bar is on screen to show it.
      if (entry.listeners.size === 0) return
      if (waiting(entry.snapshot)) entry.timer = setTimeout(() => load(connection, sessionId, entry), POLL_MS)
      else if (entry.settle > 0) { entry.settle -= 1; entry.timer = setTimeout(() => load(connection, sessionId, entry), POLL_MS) }
    })
}

/** The conversation's skills activity, read again when a newer turn's bar appears. */
function useSkillActivity(connection: ClientConnectionHandle, sessionId: string | undefined, turn: number | undefined): SkillActivitySnapshot | undefined {
  const entry = sessionId === undefined ? undefined : entryOf(connection, sessionId)
  const subscribe = useCallback((listener: () => void) => {
    if (entry === undefined) return () => {}
    entry.listeners.add(listener)
    return () => {
      entry.listeners.delete(listener)
      if (entry.listeners.size === 0 && entry.timer !== undefined) { clearTimeout(entry.timer); delete entry.timer }
    }
  }, [entry])
  const getSnapshot = useCallback(() => entry?.snapshot, [entry])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    if (entry === undefined || sessionId === undefined || turn === undefined) return
    const newest = entry.snapshot === undefined ? undefined : Math.max(-1, ...entry.snapshot.turns.map(item => item.turn), ...entry.snapshot.reviews.map(item => item.turn))
    if (entry.snapshot !== undefined && newest !== undefined && turn <= newest && !waiting(entry.snapshot)) return
    // A turn newer than what was read: its uses and any review it earned are not known yet.
    entry.settle = SETTLE_CHECKS
    load(connection, sessionId, entry)
  }, [connection, entry, sessionId, turn])
  return snapshot
}

interface SkillTurnTailProps {
  /** Engine-owned closing Turn boundary (TurnLocation on the wire). */
  turn: unknown
  seq: number
  /** Injected by the slot host: the session this tail belongs to. */
  sessionId?: string
  connection: ClientConnectionHandle
  localeRuntime: Pick<MnemonClientContext['locale'], 'getSnapshot' | 'subscribe'>
  t: (key: MnemonKey, params?: Record<string, unknown>) => string
}

function turnNumber(turn: unknown): number | undefined {
  const value = (turn as { turn?: unknown } | null)?.turn
  return typeof value === 'number' ? value : undefined
}

function isClosedTurn(turn: unknown): boolean {
  return (turn as { status?: unknown } | null)?.status === 'closed'
}

/**
 * One line under a finished turn about skills: the ones it used, each opening
 * on the Skills page, and the review that followed it — waiting or running,
 * then the suggestions it left. Hidden when the turn has nothing to say.
 */
export const SkillTurnTail = memo(function SkillTurnTail({ turn, sessionId, connection, localeRuntime, t }: SkillTurnTailProps): JSX.Element | null {
  const subscribeLocale = useCallback((listener: () => void) => localeRuntime.subscribe(listener), [localeRuntime])
  const getLocale = useCallback(() => localeRuntime.getSnapshot(), [localeRuntime])
  useSyncExternalStore(subscribeLocale, getLocale, getLocale)
  const number = turnNumber(turn)
  const closed = isClosedTurn(turn)
  const snapshot = useSkillActivity(connection, sessionId, closed ? number : undefined)
  if (!closed || number === undefined || snapshot?.available !== true) return null
  const used = snapshot.turns.find(entry => entry.turn === number)?.skills ?? []
  const review = snapshot.reviews.find(entry => entry.turn === number)
  const reviewing = review?.state === 'scheduled' || review?.state === 'reviewing'
  const suggestions = review?.suggestions ?? []
  const failed = review?.state === 'error'
  if (used.length === 0 && !reviewing && suggestions.length === 0 && !failed) return null
  const open = (seed: string): void => dispatchMnemonAnchor({ page: SKILLS_PAGE, seed, ...(sessionId === undefined ? {} : { sessionId }) })
  return <div className={css.root}>
    <span className={css.mark} aria-hidden="true"><IconSkillOutlineRegular size={14} /></span>
    <span className={css.label}>{t('skillTail.label')}</span>
    <span className={css.items}>
      {used.map(skill => <button key={skill.name} type="button" className={css.item} title={t('skillTail.openSkill', { name: skill.name })} onClick={() => open(`name:${skill.name}`)}>{skill.name}</button>)}
      {reviewing && <span className={css.state} role="status"><TextShimmer active>{t('skillTail.reviewing')}</TextShimmer></span>}
      {!reviewing && suggestions.length > 0 && <button type="button" className={css.item} data-tone="accent" title={t('skillTail.openSuggestions')}
        onClick={() => open(suggestions.length === 1 ? `suggestion:${suggestions[0]!.id}` : 'evolution:pending')}>{t('skillTail.suggested', { count: suggestions.length })}</button>}
      {!reviewing && failed && <span className={css.state} data-tone="error" title={review.error}>{t('skillTail.failed')}</span>}
    </span>
  </div>
})
