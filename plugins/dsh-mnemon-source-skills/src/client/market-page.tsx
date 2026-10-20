import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Button, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { SearchField, SelectField, SidebarModal, useLocale } from 'dsh-mnemon/client'
import { SKILL_ROOT_KINDS, type LocalizedText, type MarketItem, type MarketPreview, type MarketView, type SkillRootKind } from '../contracts.ts'
import { splitFrontmatter } from '../fence.ts'
import { css, errorText, relative, useT } from './presentation.ts'
import { Busy, Empty, Field, SkillIcon, SkillMarkdown } from './shared.tsx'
import type { SkillsLocation, SkillsPageContext } from './ui.tsx'

function text(value: LocalizedText | undefined, language: string): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return (language.startsWith('zh') ? value['zh-CN'] ?? value.en : value.en ?? value['zh-CN']) ?? ''
}

function size(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const STATE_TONE = { installed: 'success', update: 'info', modified: 'warning', conflict: 'quiet', available: 'outline' } as const

export function MarketPage(props: { context: SkillsPageContext; location: SkillsLocation }): JSX.Element {
  const t = useT()
  const language = useLocale()
  const { context } = props
  const [view, setView] = useState<MarketView | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [registriesOpen, setRegistriesOpen] = useState(false)
  const [open, setOpen] = useState<MarketItem | null>(null)
  const refreshed = useRef(false)
  useEffect(() => {
    let active = true
    void context.client.market().then(value => {
      if (!active) return
      setView(value)
      // A registry copy older than the refresh window is fetched once per visit.
      if (!refreshed.current && value.stale.length > 0 && context.writable) {
        refreshed.current = true
        setRefreshing(true)
        void context.client.refreshMarket(value.stale).then(() => context.client.market()).then(next => { if (active) setView(next) }).catch(() => undefined).finally(() => { if (active) setRefreshing(false) })
      }
    }).catch(context.fail)
    return () => { active = false }
  }, [context.client, context.revision])
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (view?.items ?? []).filter(item => (category === '' || item.category === category)
      && (needle === '' || [item.name, text(item.title, language), text(item.description, language), item.author ?? ''].some(value => value.toLowerCase().includes(needle))))
  }, [view, query, category, language])
  if (view === null) return <Busy label={t('common.loading')} />
  const registryName = (id: string) => text(view.registries.find(registry => registry.id === id)?.name, language) || id
  const refresh = async () => {
    setRefreshing(true)
    try { await context.client.refreshMarket(); context.refresh() } catch (error) { context.fail(error) } finally { setRefreshing(false) }
  }
  return <div className={css.skMarket}>
    <header className={css.skMarketBar}>
      <SearchField label={t('market.search')} placeholder={t('market.search')} value={query} onChange={event => setQuery(event.target.value)} />
      <SelectField size="sm" hideLabel label={t('market.allCategories')} value={category} onChange={setCategory} options={[{ value: '', label: t('market.allCategories') }, ...view.categories.map(entry => ({ value: entry.id, label: text(entry.label, language) }))]} />
      <Button variant="outline" size="sm" onClick={() => setRegistriesOpen(true)}>{t('market.registries')} · {view.registries.filter(registry => registry.enabled).length}</Button>
      <Button variant="ghost" size="sm" disabled={refreshing || !context.writable} onClick={() => void refresh()}>{refreshing ? t('market.refreshing') : t('market.refresh')}</Button>
    </header>
    {items.length === 0 ? <Empty glyph="⌕" title={t('market.empty')}>{t('market.emptyBody')}</Empty> : <div className={css.skMarketGrid}>
      {items.map(item => <article key={`${item.registryId}/${item.name}`} className={css.skMarketCard} data-state={item.state}>
        <button type="button" className={css.skMarketOpen} onClick={() => setOpen(item)} aria-label={`${t('market.preview')} ${item.name}`}>
          <header>
            <SkillIcon name={item.name} category={item.category} />
            <div><strong>{text(item.title, language) || item.name}</strong><code>{item.name}</code></div>
          </header>
          <p>{text(item.description, language)}</p>
        </button>
        <footer>
          <span>{item.author ?? registryName(item.registryId)}</span>
          {item.state === 'available'
            ? <Button variant="outline" size="sm" disabled={!context.writable} onClick={() => setOpen(item)}>{t('market.install')}</Button>
            : <Tag tone={STATE_TONE[item.state]}>{t(item.state === 'update' ? 'market.update' : item.state === 'modified' ? 'market.modified' : item.state === 'conflict' ? 'market.conflict' : 'market.installed')}</Tag>}
        </footer>
      </article>)}
    </div>}
    {open !== null && <MarketDetail context={context} item={open} registryName={registryName(open.registryId)} onClose={() => setOpen(null)} />}
    {registriesOpen && <RegistriesDialog context={context} view={view} onClose={() => setRegistriesOpen(false)} />}
  </div>
}

function MarketDetail(props: { context: SkillsPageContext; item: MarketItem; registryName: string; onClose: () => void }): JSX.Element {
  const t = useT()
  const language = useLocale()
  const { context, item } = props
  const [preview, setPreview] = useState<MarketPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [root, setRoot] = useState<SkillRootKind>('user-dsh')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void context.client.marketPreview(item.registryId, item.name).then(value => { if (active) setPreview(value) }).catch(reason => { if (active) setPreviewError(errorText(reason)) })
    return () => { active = false }
  }, [context.client, item.registryId, item.name])
  const install = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await context.client.installMarket({ registryId: item.registryId, name: item.name, root, ...(item.state === 'modified' ? { overwrite: true } : {}) })
      context.notice(t(result.updated ? 'market.updatedNote' : 'market.installedNote', { name: item.name }))
      context.refresh()
      props.onClose()
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const canInstall = item.state === 'available' || item.state === 'update' || item.state === 'modified'
  const body = preview === null ? undefined : splitFrontmatter(preview.content)?.body ?? preview.content
  return <SidebarModal wide title={text(item.title, language) || item.name} description={text(item.description, language)} busy={busy} onClose={props.onClose} footer={<>
    {error !== null && <span className={css.skFormError}>{error}</span>}
    {item.skillKey !== undefined && <Button variant="ghost" onClick={() => { props.onClose(); context.navigate({ tab: 'skills', skillKey: item.skillKey! }) }}>{t('market.open')}</Button>}
    <Button variant="ghost" onClick={props.onClose}>{t('common.close')}</Button>
    {canInstall && <Button variant="primary" disabled={busy || !context.writable} onClick={() => void install()}>
      {busy ? t('market.installing') : item.state === 'modified' ? t('market.overwrite') : item.state === 'update' ? t('market.update') : t('market.install')}
    </Button>}
  </>}>
    <div className={css.skMarketDetail}>
      <div className={css.skChips}>
        <SkillIcon name={item.name} category={item.category} />
        <code>{item.name}</code>
        <Tag tone="outline">{t('market.from', { registry: props.registryName })}</Tag>
        {item.version !== undefined && <Tag tone="neutral">{t('market.version', { version: item.version })}</Tag>}
        {item.installedVersion !== undefined && <Tag tone="success">{t('market.installedVersion', { version: item.installedVersion })}</Tag>}
        <Tag tone="quiet">{item.license === undefined ? t('market.licenseUpstream') : t('market.license', { license: item.license })}</Tag>
      </div>
      {item.homepage !== undefined && <p className={css.skMuted}>{t('market.source')}: <a href={item.homepage} target="_blank" rel="noreferrer">{item.homepage}</a></p>}
      <p className={css.skWarn}>{t('market.trust')}</p>
      {item.state === 'modified' && <p className={css.skWarn}>{t('market.overwriteHint')}</p>}
      {item.state === 'available' && <div className={css.skFormRow}><SelectField size="sm" inline label={t('market.installTo')} value={root} onChange={setRoot} options={SKILL_ROOT_KINDS.map(kind => ({ value: kind, label: t(`root.${kind}`) }))} /></div>}
      {previewError !== null && <p className={css.inlineError}>{previewError}</p>}
      {preview === null && previewError === null && <Busy label={t('common.loading')} />}
      {preview !== null && <>
        <p className={css.skMuted}>{t('market.files', { count: preview.files.length, size: size(preview.totalBytes) })}</p>
        {preview.files.length > 1 && <div className={css.skResources}>{preview.files.slice(0, 40).map(file => <code key={file.path}>{file.path}</code>)}</div>}
        <SkillMarkdown body={body ?? ''} />
      </>}
    </div>
  </SidebarModal>
}

function RegistriesDialog(props: { context: SkillsPageContext; view: MarketView; onClose: () => void }): JSX.Element {
  const t = useT()
  const language = useLocale()
  const { context } = props
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (operation: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setError(null)
    try { await operation(); after?.(); context.refresh() } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  return <SidebarModal wide title={t('registry.title')} description={t('registry.description')} busy={busy} onClose={props.onClose} footer={<>
    {error !== null && <span className={css.skFormError}>{error}</span>}
    <Button variant="ghost" onClick={props.onClose}>{t('common.close')}</Button>
  </>}>
    <div className={css.skForm}>
      <ul className={css.skRegistries}>
        {props.view.registries.map(registry => <li key={registry.id}>
          <div>
            <strong>{text(registry.name, language) || registry.id}</strong>
            {registry.builtin && <Tag tone="solid">{t('registry.official')}</Tag>}
            <small>{t('registry.entries', { count: registry.entries })} · {registry.fetchedAt === undefined ? t('registry.bundled') : t('registry.fetched', { time: relative(t, registry.fetchedAt) })}</small>
            <code title={registry.location}>{registry.location}</code>
            {registry.error !== undefined && <em>{registry.error}</em>}
          </div>
          {!registry.builtin && <Button variant="ghost" size="sm" disabled={busy || !context.writable} onClick={() => void act(() => context.client.removeRegistry(registry.id))}>{t('registry.remove')}</Button>}
          <Switch checked={registry.enabled} label={t('registry.enabled', { name: text(registry.name, language) || registry.id })} disabled={busy || !context.writable} onChange={next => void act(() => context.client.toggleRegistry(registry.id, next))} />
        </li>)}
      </ul>
      <Field label={t('registry.add')}>{control => <div className={css.skInline}>
        <input {...control} value={location} placeholder={t('registry.placeholder')} onChange={event => setLocation(event.target.value)} />
        <Button variant="primary" size="sm" disabled={busy || location.trim() === '' || !context.writable} onClick={() => void act(() => context.client.addRegistry(location.trim()), () => setLocation(''))}>{busy ? t('registry.adding') : t('registry.add')}</Button>
      </div>}</Field>
      <details className={css.skFormat}><summary>{t('registry.format')}</summary><pre>{JSON.stringify(JSON.parse(t('registry.formatBody')), null, 2)}</pre></details>
    </div>
  </SidebarModal>
}
