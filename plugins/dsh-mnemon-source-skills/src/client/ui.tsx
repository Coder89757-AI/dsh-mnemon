import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { installMemorySourceUI, MemorySourcePageFrame, PageHeader, type MemorySourcePageProps } from 'dsh-mnemon/client'
import type { SkillsOverview } from '../contracts.ts'
import { skillsPageClient, type SkillsPageClient } from './api.ts'
import { EvalsPage } from './evals-page.tsx'
import { EvidencePage } from './evidence-page.tsx'
import { EvolutionPage } from './evolution-page.tsx'
import { MarketPage } from './market-page.tsx'
import { OverviewPage } from './overview-page.tsx'
import { css, errorText, sidebarCss, translate, useT } from './presentation.ts'
import { SkillsPage } from './skills-page.tsx'
import { installSkillUseBridge, requestSkillUse } from './use-skill.tsx'

export type SkillsTab = 'overview' | 'skills' | 'market' | 'evolution' | 'evidence' | 'evals'

/** Where a link inside the page points: a tab, and what to select there. */
export interface SkillsLocation {
  tab: SkillsTab
  skillKey?: string
  suggestionId?: string
  draftId?: string
  trajectoryId?: string
  steps?: number[]
  evalSkill?: string
  runId?: string
  nonce?: number
}

export interface SkillsPageContext {
  client: SkillsPageClient
  writable: boolean
  /** Reload this page's data; every tab watches it. */
  revision: number
  refresh(): void
  navigate(location: SkillsLocation): void
  notice(text: string): void
  fail(error: unknown): void
  /** Put `/name` into the conversation's input and go back to it. */
  useSkill(name: string): void
}

const TABS: readonly SkillsTab[] = ['overview', 'skills', 'market', 'evolution', 'evidence', 'evals']
const POLL_MS = 3_000

/** `skill:<key>`, `suggestion:<id>`, `draft:<id>`, `trajectory:<id>` or `evals:<skill>` from a link elsewhere. */
function seedLocation(input: MemorySourcePageProps['navigationInput']): SkillsLocation | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || typeof input.seed !== 'string') return undefined
  const nonce = typeof input.nonce === 'number' ? input.nonce : Date.now()
  const [kind, ...rest] = input.seed.split(':')
  const value = rest.join(':')
  if (value === '') return undefined
  if (kind === 'skill') return { tab: 'skills', skillKey: value, nonce }
  if (kind === 'suggestion') return { tab: 'evolution', suggestionId: value, nonce }
  if (kind === 'draft') return { tab: 'evolution', draftId: value, nonce }
  if (kind === 'trajectory') return { tab: 'evidence', trajectoryId: value, nonce }
  if (kind === 'evals') return { tab: 'evals', evalSkill: value, nonce }
  return undefined
}

const remembered = new WeakMap<object, SkillsTab>()

function SkillsView(props: MemorySourcePageProps & { management: NonNullable<MemorySourcePageProps['management']> }): JSX.Element {
  const t = useT()
  const client = useMemo(() => skillsPageClient(props.management), [props.management])
  const [location, setLocation] = useState<SkillsLocation>(() => seedLocation(props.navigationInput) ?? { tab: remembered.get(props.management) ?? 'overview' })
  const [revision, setRevision] = useState(0)
  const [overview, setOverview] = useState<SkillsOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  const refreshKey = useRef(props.refreshKey)
  useEffect(() => {
    if (refreshKey.current === props.refreshKey) return
    refreshKey.current = props.refreshKey
    refresh()
  }, [props.refreshKey, refresh])
  useEffect(() => {
    const seeded = seedLocation(props.navigationInput)
    if (seeded !== undefined) setLocation(seeded)
  }, [props.navigationInput])
  useEffect(() => { remembered.set(props.management, location.tab) }, [props.management, location.tab])
  useLayoutEffect(() => { props.onResetScroll?.() }, [location.tab, props.onResetScroll])
  useEffect(() => {
    let active = true
    void client.overview().then(value => { if (active) { setOverview(value); setError(null) } }).catch(reason => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [client, revision])
  // Background reviews, drafts and backtests finish on their own; follow them while one is running.
  const busy = overview !== null && overview.counts.runsRunning > 0
  const [drafting, setDrafting] = useState(false)
  useEffect(() => {
    let active = true
    void client.suggestions(['drafting']).then(list => { if (active) setDrafting(list.length > 0) }).catch(() => undefined)
    return () => { active = false }
  }, [client, revision])
  useEffect(() => {
    if (!busy && !drafting) return
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [busy, drafting, refresh])

  const context: SkillsPageContext = {
    client,
    writable: props.writable !== false,
    revision,
    refresh,
    navigate: next => setLocation({ ...next, nonce: Date.now() }),
    notice: text => { setNotice(text); setError(null) },
    fail: reason => { setError(errorText(reason)); setNotice(null) },
    useSkill: name => {
      const taken = requestSkillUse(name, props.sessionId)
      if (props.onReturnToConversation !== undefined) props.onReturnToConversation()
      else if (taken) { setNotice(t('row.used', { name })); setError(null) }
      else { setError(t('row.noSession')); setNotice(null) }
    },
  }
  const enabled = overview?.settings.enabled === true
  const toggle = async (next: boolean) => {
    setSwitching(true)
    try { await client.updateSettings({ enabled: next }); refresh() } catch (reason) { context.fail(reason) } finally { setSwitching(false) }
  }
  const reviewNow = async () => {
    setReviewing(true)
    try {
      const result = await client.reviewNow()
      context.notice(result.inserted + result.updated + result.casesAdded > 0 ? t('review.done', { count: result.inserted + result.updated, cases: result.casesAdded }) : t('review.nothing'))
      refresh()
    } catch (reason) { context.fail(reason) } finally { setReviewing(false) }
  }
  const badge = (tab: SkillsTab): number | undefined => tab === 'evolution' && overview !== null && overview.counts.pending + overview.counts.drafts > 0 ? overview.counts.pending + overview.counts.drafts : undefined
  const canReview = props.sessionId !== undefined && client.canAssist('skill-review-now')
  return <>
    <section className={sidebarCss.memoryWorkspace}>
      <PageHeader title={t('skills.title')} description={t('skills.description')} {...(context.writable ? {} : { meta: t('skills.readOnly') })} action={<div className={css.skHeaderActions}>
        {canReview && <Button variant="outline" size="sm" disabled={reviewing || !context.writable} onClick={() => void reviewNow()}>{reviewing ? t('review.running') : t('review.now')}</Button>}
        <label className={css.skEvolutionSwitch} data-on={enabled ? '' : undefined}>
          <span>{t('evolution.label')}</span>
          <em>{switching ? t('evolution.saving') : enabled ? t('evolution.on') : t('evolution.off')}</em>
          <Switch checked={enabled} label={t('evolution.switch')} disabled={overview === null || switching || !context.writable} onChange={next => void toggle(next)} />
        </label>
      </div>} />
      <div className={sidebarCss.memoryNavigation}>
        <div className={sidebarCss.memoryTabs} role="tablist" aria-label={t('tabs.aria')}>
          {TABS.map(tab => <button key={tab} type="button" role="tab" aria-selected={location.tab === tab} data-active={location.tab === tab ? '' : undefined} onClick={() => setLocation({ tab })}>
            {t(`tab.${tab}`)}{badge(tab) !== undefined && <b className={css.skTabBadge}>{badge(tab)}</b>}
          </button>)}
        </div>
      </div>
    </section>
    {error !== null && <div className={css.inlineError} role="alert">{error}<button type="button" className={css.skDismiss} onClick={() => setError(null)} aria-label={t('common.close')}>×</button></div>}
    {notice !== null && <div className={css.skNotice} role="status">{notice}<button type="button" className={css.skDismiss} onClick={() => setNotice(null)} aria-label={t('common.close')}>×</button></div>}
    <div className={css.skPage}>
      {location.tab === 'overview' && <OverviewPage context={context} overview={overview} onToggle={next => void toggle(next)} switching={switching} />}
      {location.tab === 'skills' && <SkillsPage context={context} location={location} />}
      {location.tab === 'market' && <MarketPage context={context} location={location} />}
      {location.tab === 'evolution' && <EvolutionPage context={context} location={location} />}
      {location.tab === 'evidence' && <EvidencePage context={context} location={location} />}
      {location.tab === 'evals' && <EvalsPage context={context} location={location} />}
    </div>
  </>
}

export function SkillsSourcePage(props: MemorySourcePageProps): ReactNode {
  if (props.management === undefined) return null
  return <MemorySourcePageFrame locale={props.locale}><SkillsView key={props.sourceInstanceKey} {...props} management={props.management} /></MemorySourcePageFrame>
}

export function installSkillsMemoryUI(ctx: Parameters<typeof installMemorySourceUI>[0], locale = 'zh'): () => void {
  const t = translate(locale)
  return installMemorySourceUI(ctx, { sourceTypeId: 'skills', pages: [{
    id: 'library', order: 800, label: () => t('skills.title'),
    // This page pins its own title and tabs, as Memory Spaces does.
    navigation: { stickyHeader: false, group: 'tools', glyph: '✦' },
    component: SkillsSourcePage,
  }] })
}

export const inject = ['slots']
/** The tab is named by the component's declaration; the page label is only a fallback. */
export function apply(ctx: Parameters<typeof installMemorySourceUI>[0]): void {
  installSkillsMemoryUI(ctx)
  installSkillUseBridge(ctx)
}
