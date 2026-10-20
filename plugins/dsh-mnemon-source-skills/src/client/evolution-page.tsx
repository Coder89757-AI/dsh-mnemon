import { useEffect, useMemo, useState, type JSX } from 'react'
import { Button, DiffBlock, SegmentedControl, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BacktestRun, DraftView, SkillDraft, SkillSuggestion, SuggestionStatus, SuggestionView, Trajectory } from '../contracts.ts'
import { css, percent, points, relative, useT } from './presentation.ts'
import { Block, Busy, Confidence, Confirm, diffLabels, Empty, SignalTag, StatusTag, StepTimeline } from './shared.tsx'
import type { SkillsLocation, SkillsPageContext } from './ui.tsx'

type Filter = 'open' | 'review' | 'done' | 'closed'
const FILTER_STATUSES: Record<Filter, readonly SuggestionStatus[]> = {
  open: ['pending', 'drafting'], review: ['review'], done: ['adopted'], closed: ['dismissed', 'expired', 'invalidated'],
}

/** One row of the inbox: a suggestion, or a draft written for a skill directly. */
type Item = { kind: 'suggestion'; suggestion: SkillSuggestion } | { kind: 'draft'; draft: SkillDraft }

export function EvolutionPage(props: { context: SkillsPageContext; location: SkillsLocation }): JSX.Element {
  const t = useT()
  const { context } = props
  const [filter, setFilter] = useState<Filter>(props.location.draftId !== undefined ? 'review' : 'open')
  const [suggestions, setSuggestions] = useState<SkillSuggestion[] | null>(null)
  const [drafts, setDrafts] = useState<SkillDraft[]>([])
  const [selected, setSelected] = useState<string | undefined>(props.location.suggestionId ?? props.location.draftId)
  useEffect(() => {
    let active = true
    void context.client.suggestions().then(list => { if (active) setSuggestions(list) }).catch(context.fail)
    return () => { active = false }
  }, [context.client, context.revision])
  useEffect(() => {
    let active = true
    // Drafts written for a skill directly have no suggestion; list the ready ones beside the suggestions.
    void context.client.overview().then(async overview => {
      const ids = overview.attention.filter(item => item.kind === 'draft').map(item => item.id)
      const views = await Promise.all(ids.map(id => context.client.draft(id).then(view => view.draft).catch(() => undefined)))
      if (active) setDrafts(views.filter((draft): draft is SkillDraft => draft !== undefined && draft.suggestionId === undefined))
    }).catch(() => undefined)
    return () => { active = false }
  }, [context.client, context.revision])
  useEffect(() => {
    const id = props.location.suggestionId ?? props.location.draftId
    if (id === undefined) return
    setSelected(id)
    const suggestion = suggestions?.find(entry => entry.id === id || entry.draftId === id)
    if (suggestion !== undefined) {
      setSelected(suggestion.id)
      setFilter((Object.keys(FILTER_STATUSES) as Filter[]).find(key => FILTER_STATUSES[key].includes(suggestion.status)) ?? 'open')
    }
  }, [props.location.suggestionId, props.location.draftId, props.location.nonce, suggestions])
  const items: Item[] = useMemo(() => [
    ...(filter === 'review' ? drafts.map(draft => ({ kind: 'draft' as const, draft })) : []),
    ...(suggestions ?? []).filter(entry => FILTER_STATUSES[filter].includes(entry.status)).map(suggestion => ({ kind: 'suggestion' as const, suggestion })),
  ], [filter, suggestions, drafts])
  if (suggestions === null) return <Busy label={t('common.loading')} />
  const count = (key: Filter) => suggestions.filter(entry => FILTER_STATUSES[key].includes(entry.status)).length + (key === 'review' ? drafts.length : 0)
  const current = items.find(item => (item.kind === 'suggestion' ? item.suggestion.id : item.draft.id) === selected) ?? items[0]
  return <div className={css.skSplit}>
    <aside className={css.skList}>
      <header>
        <SegmentedControl id="skill-evolution-filter" label={t('tab.evolution')} value={filter} onChange={value => { setFilter(value); setSelected(undefined) }}
          options={(Object.keys(FILTER_STATUSES) as Filter[]).map(key => ({ value: key, label: `${t(`evolution.filter.${key}`)} ${count(key)}` }))} />
      </header>
      {items.length === 0 && <Empty glyph="✧" title={t('evolution.empty')}>{t('evolution.emptyOpen')}</Empty>}
      {items.map(item => item.kind === 'draft'
        ? <button key={item.draft.id} type="button" className={css.skListItem} data-selected={current === item ? '' : undefined} onClick={() => setSelected(item.draft.id)}>
            <div><strong>{item.draft.skillName}</strong><Tag tone="warning">{t('evolution.standalone')}</Tag></div>
            <p>{item.draft.notes}</p>
            <footer><time>{relative(t, item.draft.updatedAt)}</time></footer>
          </button>
        : <button key={item.suggestion.id} type="button" className={css.skListItem} data-selected={current === item ? '' : undefined} onClick={() => setSelected(item.suggestion.id)}>
            <div><strong><Tag tone={item.suggestion.action === 'create' ? 'success' : 'info'}>{t(`action.${item.suggestion.action}`)}</Tag> {item.suggestion.skillName}</strong><Confidence value={item.suggestion.confidence} /></div>
            <p>{item.suggestion.summary}</p>
            <footer>{item.suggestion.status === 'drafting' ? <StatusTag status="drafting" /> : item.suggestion.signals.slice(0, 3).map(signal => <SignalTag key={signal} signal={signal} />)}<time>{relative(t, item.suggestion.updatedAt)}</time></footer>
          </button>)}
    </aside>
    <div className={css.skPane}>
      {current === undefined
        ? <Empty glyph="✧" title={t('evolution.select')}>{t('evolution.selectBody')}</Empty>
        : current.kind === 'suggestion'
          ? <SuggestionDetail key={current.suggestion.id} context={context} id={current.suggestion.id} />
          : <DraftReview key={current.draft.id} context={context} draftId={current.draft.id} />}
    </div>
  </div>
}

function SuggestionDetail(props: { context: SkillsPageContext; id: string }): JSX.Element {
  const t = useT()
  const { context } = props
  const [view, setView] = useState<SuggestionView | null>(null)
  const [trajectories, setTrajectories] = useState<Map<string, Trajectory | null>>(new Map())
  const [guidance, setGuidance] = useState('')
  const [busy, setBusy] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  useEffect(() => {
    let active = true
    void context.client.suggestion(props.id).then(async value => {
      if (!active) return
      setView(value)
      const loaded = new Map<string, Trajectory | null>()
      for (const reference of value.suggestion.evidence.slice(-4)) {
        if (loaded.has(reference.trajectoryId)) continue
        loaded.set(reference.trajectoryId, await context.client.trajectory(reference.trajectoryId).catch(() => null))
      }
      if (active) setTrajectories(loaded)
    }).catch(context.fail)
    return () => { active = false }
  }, [context.client, props.id, context.revision])
  if (view === null) return <Busy label={t('common.loading')} />
  const { suggestion } = view
  const canDraft = context.client.canAssist('skill-draft')
  const generate = async () => {
    setBusy(true)
    try { await context.client.generateDraft({ suggestionId: suggestion.id, ...(guidance.trim() === '' ? {} : { guidance: guidance.trim() }) }); setGuidance(''); context.refresh() } catch (error) { context.fail(error) } finally { setBusy(false) }
  }
  const open = suggestion.status === 'pending'
  return <article className={css.skDetail}>
    <header className={css.skDetailHead}>
      <div>
        <span><Tag tone={suggestion.action === 'create' ? 'success' : 'info'}>{t(`action.${suggestion.action}`)}</Tag> <StatusTag status={suggestion.status} /></span>
        <h3>{suggestion.skillName}</h3>
        <p>{suggestion.summary}</p>
        <small className={css.skMuted}>{suggestion.sourceSessionTitle === undefined ? '' : `${t('evolution.source', { session: suggestion.sourceSessionTitle })} · `}{relative(t, suggestion.createdAt)}</small>
      </div>
      <Confidence value={suggestion.confidence} />
    </header>
    {suggestion.action === 'update' && view.skill === undefined && <p className={css.skWarn}>{t('evolution.skillGone')}</p>}
    {suggestion.action === 'update' && view.skill !== undefined && !view.hashCurrent && open && <p className={css.skWarn}>{t('evolution.hashChanged')}</p>}
    {suggestion.rationale !== undefined && <Block title={t('evolution.rationale')}><p className={css.skProse}>{suggestion.rationale}</p></Block>}
    {suggestion.signals.length > 0 && <div className={css.skChips}><span>{t('evolution.signals')}</span>{suggestion.signals.map(signal => <SignalTag key={signal} signal={signal} />)}</div>}
    <Block title={t('evolution.evidence')}>
      {suggestion.evidence.slice(-4).map((reference, index) => {
        const trajectory = trajectories.get(reference.trajectoryId)
        if (trajectory === undefined) return <Busy key={index} label={t('common.loading')} />
        if (trajectory === null) return <p key={index} className={css.skMuted}>{t('evolution.evidenceMissing')}</p>
        const cited = new Set(reference.steps)
        const steps = trajectory.steps.filter(step => [...cited].some(value => Math.abs(value - step.index) <= 1))
        return <div key={index} className={css.skEvidence}>
          <header><strong>{trajectory.sessionTitle ?? trajectory.sessionId.slice(0, 8)}</strong><span>{relative(t, trajectory.createdAt)}</span>
            <Button variant="ghost" size="sm" onClick={() => context.navigate({ tab: 'evidence', trajectoryId: trajectory.id, steps: reference.steps })}>{t('evolution.openTrajectory')} ›</Button></header>
          <StepTimeline compact steps={steps} annotations={trajectory.annotations} highlight={cited} />
        </div>
      })}
    </Block>
    {suggestion.status === 'drafting' && <Busy label={t('evolution.drafting')} />}
    {suggestion.lastError !== undefined && suggestion.status === 'pending' && <p className={css.inlineError}>{t('evolution.lastError', { error: suggestion.lastError })}</p>}
    {suggestion.status === 'review' && suggestion.draftId !== undefined && <DraftReview context={context} draftId={suggestion.draftId} suggestion={suggestion} />}
    {suggestion.status === 'adopted' && view.skill !== undefined && <p className={css.skSuccess}>{t('evolution.adoptedNote', { key: view.skill.key })} <button type="button" className={css.skLink} onClick={() => context.navigate({ tab: 'skills', skillKey: view.skill!.key })}>{t('common.open')} ›</button></p>}
    {open && <div className={css.skComposer}>
      {!canDraft && <p className={css.skMuted}>{t('evolution.noAgent')}</p>}
      <label><span>{t('evolution.guidance')}</span><textarea rows={2} value={guidance} placeholder={t('evolution.guidancePlaceholder')} onChange={event => setGuidance(event.target.value)} /></label>
      <footer>
        <Button variant="ghost" disabled={!context.writable || busy} onClick={() => setDismissing(true)}>{t('evolution.dismiss')}</Button>
        <Button variant="primary" disabled={!context.writable || busy || !canDraft || (suggestion.action === 'update' && view.skill === undefined)} onClick={() => void generate()}>{t('evolution.generate')}</Button>
      </footer>
    </div>}
    {dismissing && <Confirm title={t('evolution.dismiss')} body={suggestion.summary} confirmLabel={t('evolution.dismiss')} busy={busy} onClose={() => setDismissing(false)} onConfirm={() => void (async () => {
      setBusy(true)
      try { await context.client.dismissSuggestion(suggestion.id); setDismissing(false); context.refresh() } catch (error) { context.fail(error) } finally { setBusy(false) }
    })()} />}
  </article>
}

/** Average score of one run, for comparing a draft with its baseline. */
function runScore(run: BacktestRun | undefined): number | undefined {
  return run?.status === 'completed' ? run.score : undefined
}

function DraftReview(props: { context: SkillsPageContext; draftId: string; suggestion?: SkillSuggestion }): JSX.Element {
  const t = useT()
  const { context } = props
  const [view, setView] = useState<DraftView | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [guidance, setGuidance] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmAdopt, setConfirmAdopt] = useState(false)
  const [cases, setCases] = useState<number | undefined>(undefined)
  useEffect(() => {
    let active = true
    void context.client.draft(props.draftId).then(value => {
      if (!active) return
      setView(value)
      void context.client.cases(value.draft.skillName).then(list => { if (active) setCases(list.filter(entry => entry.enabled).length) })
    }).catch(context.fail)
    return () => { active = false }
  }, [context.client, props.draftId, context.revision])
  if (view === null) return <Busy label={t('common.loading')} />
  const { draft } = view
  const candidate = view.runs.find(run => run.target.kind === 'draft' && run.target.draftId === draft.id)
  const baseline = view.runs.find(run => run.target.kind !== 'draft')
  const candidateScore = runScore(candidate)
  const baselineScore = runScore(baseline)
  const regressed = candidateScore !== undefined && baselineScore !== undefined && candidateScore < baselineScore
  const act = async (operation: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    try { await operation(); after?.(); context.refresh() } catch (error) { context.fail(error) } finally { setBusy(false) }
  }
  const adopt = () => act(async () => {
    const result = await context.client.adoptDraft(draft.id)
    context.notice(t('draft.adopted', { key: result.skill.key }))
  }, () => setConfirmAdopt(false))
  const backtest = () => act(async () => {
    await context.client.backtest({ skillName: draft.skillName, target: { kind: 'draft', draftId: draft.id } })
    await context.client.backtest({ skillName: draft.skillName, target: { kind: draft.action === 'update' ? 'current' : 'none' } })
  })
  const results = new Map<string, { title: string; base?: BacktestRun['results'][number]; next?: BacktestRun['results'][number] }>()
  for (const result of baseline?.results ?? []) results.set(result.caseId, { title: result.title, base: result })
  for (const result of candidate?.results ?? []) results.set(result.caseId, { ...results.get(result.caseId), title: result.title, next: result })
  return <section className={css.skDraft}>
    <Block title={t('draft.title')} actions={<Button variant="ghost" size="sm" disabled={!context.writable || busy} onClick={() => setEditing(draft.content)}>{t('draft.edit')}</Button>}>
      {draft.notes !== '' && <p className={css.skProse}>{draft.notes}</p>}
      {draft.changes.length > 0 && <ul className={css.skChanges}>{draft.changes.map(change => <li key={change}>{change}</li>)}</ul>}
      <h5 className={css.skSubhead}>{draft.action === 'create' ? t('draft.newFile') : t('draft.diff')}</h5>
      {editing === null
        ? <DiffBlock maxLines={60} labels={diffLabels(t)} diffs={[{ path: `${draft.skillName}/SKILL.md`, oldText: view.base?.content ?? null, newText: draft.content }]} />
        : <div className={css.skComposer}>
            <textarea className={css.skEditor} spellCheck={false} value={editing} onChange={event => setEditing(event.target.value)} aria-label="SKILL.md" />
            <footer>
              <Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" disabled={busy || editing === draft.content} onClick={() => void act(() => context.client.updateDraft(draft.id, editing), () => setEditing(null))}>{t('common.save')}</Button>
            </footer>
          </div>}
    </Block>
    <Block title={t('draft.backtest')} actions={cases !== undefined && cases > 0 && view.runs.every(run => run.status !== 'running') && context.client.canAssist('skill-backtest')
      ? <Button variant="ghost" size="sm" disabled={!context.writable || busy} onClick={() => void backtest()}>{t('draft.backtestRun')}</Button> : undefined}>
      {cases === 0 && <p className={css.skMuted}>{t('draft.backtestNone')}</p>}
      {view.runs.length > 0 && <>
        <div className={css.skCompare}>
          <div><span>{baseline?.target.kind === 'none' ? t('draft.baselineNone') : t('draft.baseline')}</span><strong>{baseline?.status === 'running' ? t('draft.running', { done: baseline.progress.done, total: baseline.progress.total }) : percent(baseline?.passRate)}</strong><small>{t('run.score', { score: points(baselineScore) })}</small></div>
          <i aria-hidden="true">→</i>
          <div data-tone={regressed ? 'bad' : candidateScore !== undefined && baselineScore !== undefined && candidateScore > baselineScore ? 'good' : undefined}><span>{t('draft.candidate')}</span><strong>{candidate?.status === 'running' ? t('draft.running', { done: candidate.progress.done, total: candidate.progress.total }) : percent(candidate?.passRate)}</strong><small>{t('run.score', { score: points(candidateScore) })}</small></div>
        </div>
        {candidateScore !== undefined && baselineScore !== undefined && <p className={regressed ? css.skWarn : css.skSuccess}>
          {regressed ? t('draft.regressed') : candidateScore > baselineScore ? t('draft.improved', { delta: Math.round((candidateScore - baselineScore) * 100) }) : t('draft.equal')}
        </p>}
        {results.size > 0 && <table className={css.skTable}>
          <thead><tr><th>{t('evals.cases')}</th><th>{baseline?.target.kind === 'none' ? t('draft.baselineNone') : t('draft.baseline')}</th><th>{t('draft.candidate')}</th></tr></thead>
          <tbody>{[...results.entries()].map(([id, row]) => <tr key={id}>
            <td>{row.title}</td>
            <td>{row.base === undefined ? '—' : <Tag tone={row.base.verdict === 'pass' ? 'success' : row.base.verdict === 'error' ? 'danger' : 'warning'}>{t(`run.verdict.${row.base.verdict}`)}</Tag>}</td>
            <td>{row.next === undefined ? '—' : <Tag tone={row.next.verdict === 'pass' ? 'success' : row.next.verdict === 'error' ? 'danger' : 'warning'}>{t(`run.verdict.${row.next.verdict}`)}</Tag>}{row.next?.checks.filter(check => !check.pass).slice(0, 1).map(check => <small key={check.checkId}>{check.note}</small>)}</td>
          </tr>)}</tbody>
        </table>}
      </>}
    </Block>
    {draft.status === 'ready' && <div className={css.skComposer}>
      <label><span>{t('evolution.guidance')}</span><textarea rows={2} value={guidance} placeholder={t('evolution.guidancePlaceholder')} onChange={event => setGuidance(event.target.value)} /></label>
      {draft.guidance.length > 0 && <ul className={css.skGuidance}>{draft.guidance.map((text, index) => <li key={index}>{text}</li>)}</ul>}
      <footer>
        <Button variant="ghost" disabled={!context.writable || busy} onClick={() => void act(() => context.client.discardDraft(draft.id))}>{t('draft.discard')}</Button>
        <Button variant="outline" disabled={!context.writable || busy || guidance.trim() === '' || !context.client.canAssist('skill-draft')} onClick={() => void act(() => context.client.generateDraft({ ...(draft.suggestionId === undefined ? { skill: draft.skillName } : { suggestionId: draft.suggestionId }), guidance: guidance.trim() }), () => setGuidance(''))}>{t('evolution.regenerate')}</Button>
        <Button variant="primary" disabled={!context.writable || busy || editing !== null} onClick={() => regressed ? setConfirmAdopt(true) : void adopt()}>{t('draft.adopt')}</Button>
      </footer>
    </div>}
    {confirmAdopt && <Confirm title={t('draft.adoptRegressed')} body={t('draft.regressed')} confirmLabel={t('draft.adoptRegressed')} busy={busy} onClose={() => setConfirmAdopt(false)} onConfirm={() => void adopt()} />}
  </section>
}
