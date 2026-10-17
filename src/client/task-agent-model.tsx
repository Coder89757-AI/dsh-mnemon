import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { type ClientConnectionHandle, type ClientSettingsScope, type Config, type TaskAgentModelCatalog, type TaskAgentModelConfig } from '../host/protocol.ts'
import { MnemonClient } from './api.ts'
import type { MnemonKey, MnemonTranslate } from './locales.ts'
import css from './MnemonSettingsCard.module.css'
import { message } from './page-kit.tsx'
import { SelectRow, ToggleRow, type SettingOption } from './settings-controls.tsx'
import { useLive, useScope } from './settings-panel.tsx'

/**
 * Where the background task Agents run: DSH's new-session route, which may
 * yield to the asking conversation's own model, or a fixed Provider and model.
 */
export interface TaskAgentRoute {
  mode: 'inherit' | 'fixed'
  /** An inherited route takes the asking conversation's model first; off by default. */
  follow: boolean
  provider: string
  model: string
}

/** Where a task's route comes from, as the Host names it. */
export type TaskAgentRouteSource = NonNullable<TaskAgentModelCatalog['effective']>['source']

/** What the model directory answered, and whether every Provider's models were read. */
export interface TaskAgentCatalogState {
  state: 'unavailable' | 'loading' | 'ready' | 'error'
  value: TaskAgentModelCatalog | null
  error: string | null
  full: boolean
}

export function routeOf(value: Config | undefined): TaskAgentRoute {
  const configured = value?.taskAgentModel
  const fixed = configured?.mode === 'fixed'
  return {
    mode: fixed ? 'fixed' : 'inherit',
    follow: !fixed && configured?.followConversation === true,
    provider: configured?.provider?.trim() ?? '',
    model: configured?.model?.trim() ?? '',
  }
}

/** What a route stores: an inherited one only its switch, and only when it is on; a fixed one its Provider and model. */
function stored(route: TaskAgentRoute): TaskAgentModelConfig {
  return route.mode === 'inherit'
    ? { mode: 'inherit', ...(route.follow ? { followConversation: true } : {}) }
    : { mode: 'fixed', provider: route.provider, model: route.model }
}

/** The route choosing a fixed model starts from: the saved one, else DSH's default, else the first listed. */
export function startingRoute(catalog: TaskAgentModelCatalog, current: TaskAgentRoute): { provider: string; model: string } | undefined {
  const listed = (provider: string): boolean => catalog.groups.some(group => group.id === provider)
  const provider = (listed(current.provider) ? current.provider : '') || catalog.defaultSelection?.provider || catalog.groups[0]?.id || ''
  const models = catalog.groups.find(group => group.id === provider)?.models ?? []
  const model = (current.provider === provider ? current.model : '')
    || (catalog.defaultSelection?.provider === provider ? catalog.defaultSelection.model : '') || models[0]?.id || ''
  return provider === '' || model === '' ? undefined : { provider, model }
}

/**
 * The route the next task Agent takes: a fixed route's own model; for an
 * inherited one, the asking conversation's route when the setting follows it
 * and that conversation is open, else the route the Host reports for an
 * inherited setting. It is put together from the parts the Host reported, so a
 * switch shows its effect at once. Until this page has read the settings, it
 * cannot know the stored route, and states the one the Host resolved.
 */
export function effectiveRoute(route: TaskAgentRoute, catalog: TaskAgentModelCatalog | null, settled = true): { provider: string; model: string; source: TaskAgentRouteSource } | undefined {
  if (!settled) return catalog?.effective
  if (route.mode === 'fixed') return route.provider === '' || route.model === '' ? undefined : { provider: route.provider, model: route.model, source: 'fixed' }
  if (route.follow && catalog?.session !== undefined) return { ...catalog.session, source: 'session' }
  // A Host from before the inherited route was reported still names DSH's default.
  return catalog?.inherited ?? (catalog?.defaultSelection === undefined ? undefined : { ...catalog.defaultSelection, source: 'dsh-default' })
}

export function routeSourceKey(source: TaskAgentRouteSource): MnemonKey {
  return `config.taskAgentSource.${source}`
}

/**
 * The task Agent route a page shows and writes: the stored route, the model
 * directory it is chosen from, and the write that applies a choice at once.
 * The route is read from the settings themselves, so every page that shows it
 * agrees, and a change made on another page reads here at once. A page
 * belongs to one conversation, so the directory it reads names that
 * conversation's model, and a read that fails says why and can be asked for
 * again instead of quietly falling back.
 */
export function useTaskAgentModel(options: {
  scope: ClientSettingsScope<Config>
  connection?: ClientConnectionHandle | undefined
  sessionId?: string | undefined
  workspaceId?: string | undefined
  /** Stating the route needs no model directory; a page that only states it reads the route alone. */
  routeOnly?: boolean | undefined
}): {
  route: TaskAgentRoute
  /** The page has read the stored settings, so the route above is the stored one. */
  settled: boolean
  catalog: TaskAgentCatalogState
  /** A fixed model was chosen and waits for the full catalog to pick its first route. */
  choosing: boolean
  /** The Host refused the last write, as the page shows it. */
  failed: string | null
  /** Read the model directory again after a read that failed. */
  retry: () => void
  setMode: (mode: TaskAgentRoute['mode']) => void
  setFollow: (follow: boolean) => void
  setRoute: (route: { provider: string; model: string }) => void
} {
  const { scope, connection, sessionId, workspaceId } = options
  const snapshot = useScope(scope)
  const saved = routeOf(snapshot.value)
  const route = useLive(saved, async next => {
    await scope.mutate([{ op: 'set', path: ['taskAgentModel'], value: stored(next) }])
  })

  const [catalog, setCatalog] = useState<TaskAgentCatalogState>(
    { state: connection === undefined ? 'unavailable' : 'loading', value: null, error: null, full: false })
  const request = useRef(0)
  const client = useMemo(() => connection === undefined ? undefined : new MnemonClient(connection, sessionId, workspaceId), [connection, sessionId, workspaceId])
  // What the catalog read so far for this conversation: DSH's route alone, or every Provider's models too.
  const loaded = useRef<{ client: MnemonClient | undefined; level: 'none' | 'route' | 'full' }>({ client: undefined, level: 'none' })
  const level = (): 'none' | 'route' | 'full' => loaded.current.client === client ? loaded.current.level : 'none'
  const load = useCallback((full: boolean): void => {
    if (client === undefined) return
    const current = ++request.current
    setCatalog(value => ({ ...value, state: 'loading', error: null }))
    void client.taskAgentModels(full).then(value => {
      if (request.current !== current) return
      loaded.current = { client, level: full ? 'full' : 'route' }
      setCatalog({ state: 'ready', value, error: null, full })
    }, reason => {
      if (request.current === current) setCatalog(value => ({ ...value, state: 'error', error: message(reason) }))
    })
  }, [client])
  useEffect(() => () => { request.current += 1 }, [])
  // A fixed route shows every Provider's models where it can be changed; what was read already is not read again.
  const fullFixed = saved.mode === 'fixed' && options.routeOnly !== true
  useEffect(() => {
    if (fullFixed ? level() === 'full' : level() !== 'none') return
    load(fullFixed)
  }, [fullFixed, load])
  // Choosing a fixed model before the full catalog arrived takes its first choices once it does.
  const [choosing, setChoosing] = useState(false)
  useEffect(() => {
    if (!choosing) return
    if (catalog.state === 'error') { setChoosing(false); return }
    if (!catalog.full || catalog.value === null) return
    setChoosing(false)
    const start = startingRoute(catalog.value, route.value)
    if (start !== undefined) route.set({ mode: 'fixed', follow: false, ...start })
  }, [choosing, catalog])
  const setMode = (mode: TaskAgentRoute['mode']): void => {
    if (mode === 'inherit') {
      setChoosing(false)
      // Backing out of a fixed model that was never written keeps the stored route, its switch included.
      if (route.value.mode === 'inherit') return
      route.set({ mode: 'inherit', follow: false, provider: '', model: '' })
      return
    }
    const start = catalog.full && catalog.value !== null ? startingRoute(catalog.value, route.value) : undefined
    if (start !== undefined) { route.set({ mode: 'fixed', follow: false, ...start }); return }
    setChoosing(true)
    load(true)
  }
  return {
    route: route.value,
    settled: snapshot.status === 'ready',
    catalog,
    choosing,
    failed: route.failed,
    // A fixed route, or one being chosen, needs every Provider's models again, not just the route.
    retry: () => { load(fullFixed || choosing || level() === 'full') },
    setMode,
    setFollow: follow => { route.set({ mode: 'inherit', follow, provider: '', model: '' }) },
    setRoute: next => { route.set({ mode: 'fixed', follow: false, ...next }) },
  }
}

/** The route a page states: where the next task runs, and why. */
export function EffectiveRoute(props: { route: TaskAgentRoute; settled?: boolean | undefined; choosing?: boolean | undefined; catalog: TaskAgentModelCatalog | null; state: TaskAgentCatalogState['state']; t: MnemonTranslate }): JSX.Element {
  const { t } = props
  const effective = props.choosing === true ? undefined : effectiveRoute(props.route, props.catalog, props.settled !== false)
  return <span className={css.routeValue}>
    {effective === undefined
      ? <small>{props.state === 'loading' || props.choosing === true ? t('config.taskAgentLoading') : t('config.taskAgentUnavailable')}</small>
      : <><code>{effective.provider} / {effective.model}</code><small>{t(routeSourceKey(effective.source))}</small></>}
  </span>
}

/**
 * The task Agent model rows: the mode, the switch that lets an inherited route
 * follow its conversation, the Provider and model a fixed route uses, and the
 * route the background work will actually take. A read that fails keeps the
 * reason on the page and offers to read again.
 */
export function TaskAgentModelRows(props: {
  mode: TaskAgentRoute['mode']
  route: TaskAgentRoute
  /** The page has read the stored settings; until then the route stated is the Host's. */
  settled?: boolean | undefined
  /** A fixed model was chosen and waits for the catalog to pick its first route. */
  choosing?: boolean | undefined
  catalog: TaskAgentModelCatalog | null
  state: TaskAgentCatalogState['state']
  error?: string | null | undefined
  disabled: boolean
  onMode: (mode: TaskAgentRoute['mode']) => void
  onFollow: (follow: boolean) => void
  onRoute: (route: { provider: string; model: string }) => void
  /** Read the model directory again; without it a failed read only states its reason. */
  retry?: (() => void) | undefined
  /** An extra line under the effective route, such as which conversation it belongs to. */
  note?: ReactNode
  t: MnemonTranslate
}): JSX.Element {
  const { route, t } = props
  // Reading a route never needs the full directory, so the page stays usable while
  // that read is still out or has failed.
  const groups = props.state === 'ready' ? props.catalog?.groups ?? [] : []
  const group = groups.find(candidate => candidate.id === route.provider)
  // The two choosers need the directory: while it is out or failed the mode still
  // reads as chosen, but empty selects would only be noise.
  const fixed = props.mode === 'fixed' && props.state === 'ready'
  // A saved route the catalog no longer lists stays selectable, so it can be read and changed.
  // Two Providers by the same name are told apart by their ids.
  const shared = (name: string): boolean => groups.filter(candidate => candidate.name === name).length > 1
  const providers: SettingOption<string>[] = [
    ...(route.provider !== '' && group === undefined ? [{ value: route.provider, label: route.provider }] : []),
    ...groups.map(candidate => ({ value: candidate.id, label: candidate.name, ...(shared(candidate.name) ? { detail: candidate.id } : {}) })),
  ]
  const models: SettingOption<string>[] = [
    ...(route.model !== '' && group?.models.some(model => model.id === route.model) !== true ? [{ value: route.model, label: route.model }] : []),
    ...(group?.models ?? []).map(model => ({ value: model.id, label: model.name, ...(model.inputModalities?.includes('image') === true ? { detail: t('config.taskAgentImageInput') } : {}) })),
  ]
  const chooseProvider = (provider: string): void => {
    const model = groups.find(candidate => candidate.id === provider)?.models[0]?.id
    if (model !== undefined) props.onRoute({ provider, model })
  }
  return <>
    <SelectRow id="mnemon-task-agent" label={t('config.taskAgentTitle')} value={props.mode} disabled={props.disabled} onChange={props.onMode}
      options={[
        { value: 'inherit', label: t('config.taskAgentInherit'), detail: t('config.taskAgentInheritHint') },
        { value: 'fixed', label: t('config.taskAgentFixed'), detail: t('config.taskAgentFixedHint'), ...(props.state === 'unavailable' ? { disabled: true } : {}) },
      ]} />
    {props.mode === 'inherit' && <ToggleRow id="mnemon-task-agent-follow" label={t('config.taskAgentFollow')} hint={t('config.taskAgentFollowHint')}
      checked={route.follow} disabled={props.disabled} onChange={props.onFollow} />}
    {fixed && <>
      <SelectRow id="mnemon-task-agent-provider" label={t('config.taskAgentProvider')} value={route.provider} disabled={props.disabled || props.state !== 'ready'} options={providers} onChange={chooseProvider} />
      <SelectRow id="mnemon-task-agent-model" label={t('config.taskAgentModel')} value={route.model} disabled={props.disabled || props.state !== 'ready' || group === undefined} options={models}
        onChange={model => props.onRoute({ provider: route.provider, model })} />
    </>}
    <div className={css.rowDetail}>
      <span className={css.effectiveRoute}>
        <span>{t('config.taskAgentEffective')}</span>
        <EffectiveRoute route={route} settled={props.settled} choosing={props.choosing} catalog={props.catalog} state={props.state} t={t} />
      </span>
      {props.note}
      {props.state === 'error' && <p className={css.warning}>
        {t('config.taskAgentLoadFailed', { error: props.error ?? '' })}
        {props.retry !== undefined && <Button variant="ghost" size="sm" onClick={props.retry}>{t('config.taskAgentRetry')}</Button>}
      </p>}
      {(props.catalog?.failures?.length ?? 0) > 0 && groups.length > 0 && <p className={css.warning}>{t('config.taskAgentPartial', { count: props.catalog!.failures.length })}</p>}
    </div>
  </>
}
