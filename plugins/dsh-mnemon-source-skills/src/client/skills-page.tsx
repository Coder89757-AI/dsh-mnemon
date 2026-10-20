import { useEffect, useMemo, useState, type JSX } from 'react'
import Markdown from 'markdown-to-jsx'
import { Button, DiffBlock, SegmentedControl, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { SearchField, SelectField, SidebarModal } from 'dsh-mnemon/client'
import { SKILL_ROOT_KINDS, type CatalogView, type SkillDocument, type SkillRootKind, type SkillSummary, type SkillVersion } from '../contracts.ts'
import { css, errorText, percent, stamp, useT, type SkillsTranslate } from './presentation.ts'
import { Busy, Confirm, Empty, Field } from './shared.tsx'
import type { SkillsLocation, SkillsPageContext } from './ui.tsx'

export function diffLabels(t: SkillsTranslate) {
  return {
    codeLabel: t('draft.labels.code'), wrapLabel: t('draft.labels.wrap'), unwrapLabel: t('draft.labels.unwrap'),
    copy: t('draft.labels.copy'), copied: t('draft.labels.copied'), collapseAria: t('draft.labels.collapse'),
    expandAria: (hidden: number) => t('draft.labels.expand', { count: hidden }), collapse: t('draft.labels.collapse'),
    expand: (hidden: number) => t('draft.labels.expand', { count: hidden }),
  }
}

/** The SKILL.md body as Markdown, without its frontmatter. */
export function SkillMarkdown(props: { body: string }): JSX.Element {
  return <div className={css.markdownBody}><Markdown options={{ disableParsingRawHTML: true, forceBlock: true }}>{props.body}</Markdown></div>
}

export function SkillsPage(props: { context: SkillsPageContext; location: SkillsLocation }): JSX.Element {
  const t = useT()
  const { context } = props
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | undefined>(props.location.skillKey)
  const [creating, setCreating] = useState(false)
  useEffect(() => { if (props.location.skillKey !== undefined) setSelected(props.location.skillKey) }, [props.location.skillKey, props.location.nonce])
  useEffect(() => {
    let active = true
    void context.client.catalog().then(value => {
      if (!active) return
      setCatalog(value)
      setSelected(current => current !== undefined && value.skills.some(skill => skill.key === current) ? current : value.skills.find(skill => skill.shadowedBy === undefined)?.key)
    }).catch(context.fail)
    return () => { active = false }
  }, [context.client, context.revision])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (catalog?.skills ?? []).filter(skill => needle === '' || skill.name.includes(needle) || skill.description.toLowerCase().includes(needle))
  }, [catalog, query])
  if (catalog === null) return <Busy label={t('common.loading')} />
  const groups = catalog.roots.map(root => ({ root, skills: visible.filter(skill => skill.root === root.kind) }))
  return <div className={css.skSplit}>
    <aside className={css.skList}>
      <header>
        <SearchField label={t('list.search')} placeholder={t('list.search')} value={query} onChange={event => setQuery(event.target.value)} />
        <Button variant="outline" size="sm" disabled={!context.writable} onClick={() => setCreating(true)}>{t('list.new')}</Button>
      </header>
      {catalog.skills.length === 0 && <Empty glyph="✦" title={t('list.empty')}>{t('list.emptyBody')}</Empty>}
      {catalog.skills.length > 0 && visible.length === 0 && <p className={css.skMuted}>{t('list.noMatch')}</p>}
      {groups.filter(group => group.skills.length > 0).map(group => <section key={group.root.kind} className={css.skListGroup}>
        <h5 title={group.root.path}>{t(`root.${group.root.kind}`)}</h5>
        {group.skills.map(skill => <SkillRow key={skill.key} skill={skill} stats={catalog.stats[skill.name]} selected={selected === skill.key} onSelect={() => setSelected(skill.key)} />)}
      </section>)}
      {catalog.problems.length > 0 && <details className={css.skProblems}>
        <summary>{t('list.problems', { count: catalog.problems.length })}</summary>
        <ul>{catalog.problems.map(problem => <li key={problem.path}><code title={problem.path}>{problem.path.split(/[\\/]/u).slice(-2).join('/')}</code><span>{problem.reason}</span></li>)}</ul>
      </details>}
    </aside>
    <div className={css.skPane}>
      {selected === undefined
        ? <Empty glyph="✦" title={t('detail.select')}>{t('detail.selectBody')}</Empty>
        : <SkillDetail key={selected} context={context} skillKey={selected} stats={catalog.stats[catalog.skills.find(skill => skill.key === selected)?.name ?? '']} onDeleted={() => setSelected(undefined)} />}
    </div>
    {creating && <CreateDialog context={context} roots={catalog.roots.map(root => root.kind)} onClose={() => setCreating(false)} onCreated={skill => { setCreating(false); setSelected(skill.key); context.refresh() }} />}
  </div>
}

function SkillRow(props: { skill: SkillSummary; stats: CatalogView['stats'][string] | undefined; selected: boolean; onSelect: () => void }): JSX.Element {
  const t = useT()
  const { skill, stats } = props
  return <button type="button" className={css.skListItem} data-selected={props.selected ? '' : undefined} data-shadowed={skill.shadowedBy === undefined ? undefined : ''} onClick={props.onSelect}>
    <div><strong>{skill.name}</strong>{stats?.lastPassRate !== undefined && <span className={css.skRate} data-good={stats.lastPassRate >= 0.8 ? '' : undefined}>{percent(stats.lastPassRate)}</span>}</div>
    <p>{skill.description}</p>
    <footer>
      {skill.shadowedBy !== undefined && <Tag tone="quiet">{t('chip.shadowed')}</Tag>}
      {!skill.invocation.modelInvocable && <Tag tone="outline">{t('chip.modelOff')}</Tag>}
      {!skill.invocation.userInvocable && <Tag tone="outline">{t('chip.menuOff')}</Tag>}
      {(stats?.open ?? 0) > 0 && <Tag tone="info">{t('chip.open', { count: stats!.open })}</Tag>}
    </footer>
  </button>
}

type DetailView = 'content' | 'versions'

function SkillDetail(props: { context: SkillsPageContext; skillKey: string; stats: CatalogView['stats'][string] | undefined; onDeleted: () => void }): JSX.Element {
  const t = useT()
  const { context } = props
  const [skill, setSkill] = useState<(SkillDocument & { versions: SkillVersion[] }) | null>(null)
  const [view, setView] = useState<DetailView>('content')
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [comparing, setComparing] = useState<{ version: SkillVersion; content: string } | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    void context.client.skill(props.skillKey).then(value => { if (active) setSkill(value) }).catch(context.fail)
    return () => { active = false }
  }, [context.client, props.skillKey, context.revision, reload])
  if (skill === null) return <Busy label={t('common.loading')} />
  const write = async (operation: () => Promise<unknown>) => {
    setBusy(true)
    try { await operation(); setReload(value => value + 1); context.refresh() } catch (error) { context.fail(error) } finally { setBusy(false) }
  }
  const toggle = (patch: Partial<SkillDocument['invocation']>) => void write(() => context.client.setInvocation(skill.key, { ...skill.invocation, ...patch }, skill.hash))
  const draft = () => void write(async () => { await context.client.generateDraft({ skill: skill.name }); context.notice(t('detail.draftStarted')) })
  return <article className={css.skDetail}>
    <header className={css.skDetailHead}>
      <div>
        <span>{t(`root.${skill.root}`)}</span>
        <h3>{skill.name}</h3>
        <p>{skill.description}</p>
        <code title={skill.path}>{skill.path}</code>
      </div>
      <div className={css.skDetailActions}>
        <Button variant="outline" size="sm" disabled={!context.writable || busy} onClick={() => setEditing(skill.content)}>{t('common.edit')}</Button>
        {context.client.canAssist('skill-draft') && <Button variant="outline" size="sm" disabled={!context.writable || busy} onClick={draft}>{t('detail.draft')}</Button>}
        <Button variant="ghost" size="sm" disabled={!context.writable || busy} onClick={() => setDeleting(true)}>{t('common.delete')}</Button>
      </div>
    </header>
    {skill.shadowedBy !== undefined && <p className={css.skWarn}>{t('detail.shadowedBy', { key: skill.shadowedBy })}</p>}
    <div className={css.skSwitches}>
      <label><Switch checked={skill.invocation.modelInvocable} label={t('detail.model')} disabled={!context.writable || busy} onChange={next => toggle({ modelInvocable: next })} /><div><strong>{t('detail.model')}</strong><small>{t('detail.modelHint')}</small></div></label>
      <label><Switch checked={skill.invocation.userInvocable} label={t('detail.menu')} disabled={!context.writable || busy} onChange={next => toggle({ userInvocable: next })} /><div><strong>{t('detail.menu')}</strong><small>{t('detail.menuHint')}</small></div></label>
    </div>
    <div className={css.skLinks}>
      <button type="button" onClick={() => context.navigate({ tab: 'evals', evalSkill: skill.name })}>
        <span>{t('detail.evalSummary', { cases: props.stats?.cases ?? 0 })}{props.stats?.lastPassRate === undefined ? '' : ` · ${t('detail.evalRate', { rate: percent(props.stats.lastPassRate) })}`}</span><b>{t('detail.openEvals')} ›</b>
      </button>
      <button type="button" onClick={() => context.navigate({ tab: 'evolution' })}>
        <span>{t('detail.evolveSummary', { count: props.stats?.open ?? 0 })}</span><b>{t('detail.openEvolution')} ›</b>
      </button>
    </div>
    <SegmentedControl id={`skill-view-${skill.key}`} label={skill.name} value={view} onChange={setView} options={[{ value: 'content', label: t('detail.content') }, { value: 'versions', label: `${t('detail.versions')} · ${skill.versions.length}` }]} />
    {view === 'content' && <>
      {skill.whenToUse !== undefined && <p className={css.skWhen}><strong>{t('detail.whenToUse')}</strong>{skill.whenToUse}</p>}
      <SkillMarkdown body={skill.body} />
      {(skill.resources?.length ?? 0) > 0 && <div className={css.skResources}><span>{t('detail.resources')}</span>{skill.resources!.map(file => <code key={file}>{file}</code>)}</div>}
    </>}
    {view === 'versions' && (skill.versions.length === 0
      ? <p className={css.skMuted}>{t('versions.empty')}</p>
      : <ul className={css.skVersions}>{skill.versions.map(version => <li key={version.id}>
          <Tag tone={version.reason === 'evolution' ? 'success' : version.reason === 'original' ? 'neutral' : 'outline'}>{t(`versions.reason.${version.reason}`)}</Tag>
          <time title={version.createdAt}>{stamp(version.createdAt)}</time>
          <code>{version.hash.slice(0, 8)}</code>
          {version.hash === skill.hash && <Tag tone="solid">{t('versions.current')}</Tag>}
          <span />
          {version.hash !== skill.hash && <>
            <Button variant="ghost" size="sm" onClick={() => void context.client.version(skill.key, version.id).then(setComparing).catch(context.fail)}>{t('versions.compare')}</Button>
            <Button variant="ghost" size="sm" disabled={!context.writable || busy} onClick={() => void write(() => context.client.restoreVersion(skill.key, version.id, skill.hash))}>{t('versions.restore')}</Button>
          </>}
        </li>)}</ul>)}
    {editing !== null && <SidebarModal wide title={t('editor.title')} description={t('editor.hint')} busy={busy} onClose={() => setEditing(null)} footer={<>
      <Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
      <Button variant="primary" disabled={busy || editing === skill.content} onClick={() => void write(async () => { await context.client.saveSkill(skill.key, editing, skill.hash); setEditing(null) })}>{busy ? t('common.saving') : t('common.save')}</Button>
    </>}>
      <textarea className={css.skEditor} spellCheck={false} value={editing} onChange={event => setEditing(event.target.value)} aria-label="SKILL.md" />
    </SidebarModal>}
    {comparing !== null && <SidebarModal wide title={`${t('versions.compare')} · ${stamp(comparing.version.createdAt)}`} onClose={() => setComparing(null)}>
      <DiffBlock maxLines={400} labels={diffLabels(t)} diffs={[{ path: `${skill.name}/SKILL.md`, oldText: comparing.content, newText: skill.content }]} />
    </SidebarModal>}
    {deleting && <Confirm danger title={t('detail.deleteTitle', { name: skill.name })} body={t('detail.deleteBody')} confirmLabel={t('common.confirmDelete')} busy={busy} onClose={() => setDeleting(false)} onConfirm={() => void (async () => {
      setBusy(true)
      try {
        const result = await context.client.deleteSkill(skill.key, skill.hash)
        context.notice(t('detail.deleted', { path: result.trashedTo }))
        setDeleting(false)
        props.onDeleted()
        context.refresh()
      } catch (error) { context.fail(error) } finally { setBusy(false) }
    })()} />}
  </article>
}

function CreateDialog(props: { context: SkillsPageContext; roots: readonly SkillRootKind[]; onClose: () => void; onCreated: (skill: SkillSummary) => void }): JSX.Element {
  const t = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [root, setRoot] = useState<SkillRootKind>(props.roots.includes('user-dsh') ? 'user-dsh' : props.roots[0] ?? 'user-dsh')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) && name.length <= 64 && description.trim() !== ''
  const submit = async () => {
    setBusy(true)
    setError(null)
    try { props.onCreated(await props.context.client.createSkill({ name, description: description.trim(), root })) } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  return <SidebarModal title={t('create.title')} busy={busy} onClose={props.onClose} footer={<>
    {error !== null && <span className={css.skFormError}>{error}</span>}
    <Button variant="ghost" onClick={props.onClose}>{t('common.cancel')}</Button>
    <Button variant="primary" disabled={!valid || busy} onClick={() => void submit()}>{t('create.submit')}</Button>
  </>}>
    <div className={css.skForm}>
      <Field label={t('create.name')} hint={t('create.nameHint')}>{control => <input {...control} value={name} placeholder="release-notes" onChange={event => setName(event.target.value.trim().toLowerCase())} />}</Field>
      <Field label={t('create.description')} hint={t('create.descriptionHint')}>{control => <textarea {...control} rows={3} value={description} onChange={event => setDescription(event.target.value)} />}</Field>
      <div className={css.skFormRow}><SelectField label={t('create.root')} value={root} options={SKILL_ROOT_KINDS.filter(kind => props.roots.includes(kind)).map(kind => ({ value: kind, label: t(`root.${kind}`) }))} onChange={setRoot} /></div>
    </div>
  </SidebarModal>
}

