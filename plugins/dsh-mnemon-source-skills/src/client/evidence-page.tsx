import { useEffect, useMemo, useState, type JSX } from 'react'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { SelectField } from 'dsh-mnemon/client'
import { EVOLUTION_SIGNALS, type EvolutionSignal, type Trajectory, type TrajectorySummary } from '../contracts.ts'
import { css, relative, stamp, useT } from './presentation.ts'
import { Block, Busy, Confirm, Empty, SignalTag, StepTimeline } from './shared.tsx'
import type { SkillsLocation, SkillsPageContext } from './ui.tsx'

const OUTCOME_TONE = { suggested: 'success', nothing: 'quiet', error: 'danger', captured: 'outline' } as const

export function EvidencePage(props: { context: SkillsPageContext; location: SkillsLocation }): JSX.Element {
  const t = useT()
  const { context } = props
  const [list, setList] = useState<TrajectorySummary[] | null>(null)
  const [skill, setSkill] = useState('')
  const [signal, setSignal] = useState('')
  const [selected, setSelected] = useState<string | undefined>(props.location.trajectoryId)
  useEffect(() => { if (props.location.trajectoryId !== undefined) setSelected(props.location.trajectoryId) }, [props.location.trajectoryId, props.location.nonce])
  useEffect(() => {
    let active = true
    void context.client.trajectories({ ...(skill === '' ? {} : { skill }), ...(signal === '' ? {} : { signal }) }).then(value => { if (active) setList(value) }).catch(context.fail)
    return () => { active = false }
  }, [context.client, context.revision, skill, signal])
  const skills = useMemo(() => [...new Set((list ?? []).flatMap(entry => entry.stats.skills))].sort(), [list])
  if (list === null) return <Busy label={t('common.loading')} />
  const sorted = [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const current = sorted.find(entry => entry.id === selected) ?? sorted[0]
  return <div className={css.skSplit}>
    <aside className={css.skList}>
      <header className={css.skFilters}>
        <SelectField size="sm" label={t('evidence.filter.skill')} value={skill} onChange={setSkill} options={[{ value: '', label: t('common.all') }, ...skills.map(name => ({ value: name, label: name }))]} />
        <SelectField size="sm" label={t('evidence.filter.signal')} value={signal} onChange={setSignal} options={[{ value: '', label: t('common.all') }, ...EVOLUTION_SIGNALS.map(value => ({ value, label: t(`signal.${value}`) }))]} />
      </header>
      {sorted.length === 0 && <Empty glyph="⋯" title={t('evidence.empty')}>{t('evidence.emptyBody')}</Empty>}
      {sorted.map(entry => <button key={entry.id} type="button" className={css.skListItem} data-selected={current?.id === entry.id ? '' : undefined} onClick={() => setSelected(entry.id)}>
        <div><strong>{entry.sessionTitle ?? entry.sessionId.slice(0, 8)}</strong><time>{relative(t, entry.createdAt)}</time></div>
        <p>{t('evidence.stats', { turns: entry.stats.turns, tools: entry.stats.toolCalls, failures: entry.stats.toolFailures })}</p>
        <footer>
          {entry.pinned && <Tag tone="solid">{t('evidence.pinned')}</Tag>}
          <Tag tone={OUTCOME_TONE[entry.outcome]}>{t(`evidence.outcome.${entry.outcome}`)}</Tag>
          {entry.signals.slice(0, 2).map(value => <SignalTag key={value} signal={value} />)}
          {entry.stats.skills.slice(0, 2).map(name => <code key={name}>{name}</code>)}
        </footer>
      </button>)}
    </aside>
    <div className={css.skPane}>
      {current === undefined
        ? <Empty glyph="⋯" title={t('evidence.select')}>{t('evidence.selectBody')}</Empty>
        : <TrajectoryDetail key={current.id} context={context} id={current.id} focus={current.id === props.location.trajectoryId ? props.location.steps : undefined} onDeleted={() => setSelected(undefined)} />}
    </div>
  </div>
}

function TrajectoryDetail(props: { context: SkillsPageContext; id: string; focus: number[] | undefined; onDeleted: () => void }): JSX.Element {
  const t = useT()
  const { context } = props
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null)
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(props.focus ?? []))
  const [signal, setSignal] = useState<EvolutionSignal | ''>('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [catalogNames, setCatalogNames] = useState<string[]>([])
  useEffect(() => {
    let active = true
    void context.client.trajectory(props.id).then(value => {
      if (!active) return
      setTrajectory(value)
      setTarget(current => current !== '' ? current : value.stats.skills[0] ?? '')
    }).catch(context.fail)
    void context.client.catalog().then(catalog => { if (active) setCatalogNames([...new Set(catalog.skills.map(skill => skill.name))]) }).catch(() => undefined)
    return () => { active = false }
  }, [context.client, props.id, context.revision])
  if (trajectory === null) return <Busy label={t('common.loading')} />
  const steps = signal === '' ? trajectory.steps : trajectory.steps.filter(step => trajectory.annotations.some(annotation => annotation.step === step.index && annotation.signal === signal))
  const targets = [...new Set([...trajectory.stats.skills, ...catalogNames])]
  const skillName = target !== '' ? target : targets[0] ?? ''
  const toggle = (index: number) => setChosen(current => {
    const next = new Set(current)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    return next
  })
  const derive = async () => {
    setBusy(true)
    try {
      const result = await context.client.deriveCases({ trajectoryId: trajectory.id, skillName, ...(chosen.size === 0 ? {} : { steps: [...chosen].sort((a, b) => a - b) }) })
      context.notice(t('evidence.derived', { added: result.added.length, skipped: result.skipped > 0 ? t('evidence.derivedSkipped', { count: result.skipped }) : '' }))
      setChosen(new Set())
      context.refresh()
    } catch (error) { context.fail(error) } finally { setBusy(false) }
  }
  const pin = async () => {
    setBusy(true)
    try { await context.client.pinTrajectory(trajectory.id, !trajectory.pinned); context.refresh() } catch (error) { context.fail(error) } finally { setBusy(false) }
  }
  return <article className={css.skDetail}>
    <header className={css.skDetailHead}>
      <div>
        <span><Tag tone={OUTCOME_TONE[trajectory.outcome]}>{t(`evidence.outcome.${trajectory.outcome}`)}</Tag> {trajectory.pinned && <Tag tone="solid">{t('evidence.pinned')}</Tag>}</span>
        <h3>{trajectory.sessionTitle ?? trajectory.sessionId}</h3>
        <p>{t('evidence.stats', { turns: trajectory.stats.turns, tools: trajectory.stats.toolCalls, failures: trajectory.stats.toolFailures })}{trajectory.score === undefined ? '' : ` · ${t('overview.score', { score: trajectory.score.score })}`} · {stamp(trajectory.createdAt)}</p>
        {trajectory.workspace !== undefined && <code title={trajectory.workspace}>{trajectory.workspace}</code>}
      </div>
      <div className={css.skDetailActions}>
        <Button variant="outline" size="sm" disabled={!context.writable || busy} onClick={() => void pin()}>{trajectory.pinned ? t('evidence.unpin') : t('evidence.pin')}</Button>
        <Button variant="ghost" size="sm" disabled={!context.writable || busy} onClick={() => setDeleting(true)}>{t('common.delete')}</Button>
      </div>
    </header>
    {trajectory.reviewSummary !== undefined && <Block title={t('evidence.summary')}><p className={css.skProse}>{trajectory.reviewSummary}</p></Block>}
    {(trajectory.suggestionIds.length > 0 || trajectory.caseIds.length > 0) && <div className={css.skChips}>
      <span>{t('evidence.linked')}</span>
      {trajectory.suggestionIds.map((id, index) => <button key={id} type="button" className={css.skLink} onClick={() => context.navigate({ tab: 'evolution', suggestionId: id })}>{t('evidence.linkedSuggestion', { index: index + 1 })} ›</button>)}
      {trajectory.caseIds.length > 0 && <button type="button" className={css.skLink} onClick={() => context.navigate({ tab: 'evals', ...(skillName === '' ? {} : { evalSkill: skillName }) })}>{t('evidence.linkedCases', { count: trajectory.caseIds.length })} ›</button>}
    </div>}
    <Block title={t('evidence.steps')} actions={<SelectField size="sm" hideLabel label={t('evidence.filter.signal')} value={signal} onChange={value => setSignal(value as EvolutionSignal | '')} options={[{ value: '', label: t('common.all') }, ...EVOLUTION_SIGNALS.filter(value => trajectory.signals.includes(value)).map(value => ({ value, label: t(`signal.${value}`) }))]} />}>
      <StepTimeline steps={steps} annotations={trajectory.annotations} highlight={new Set(props.focus ?? [])} selected={chosen} {...(context.writable ? { onToggle: toggle } : {})} />
    </Block>
    {context.client.canAssist('skill-derive-cases') && <div className={css.skComposer}>
      <p className={css.skMuted}>{t('evidence.deriveHint')}</p>
      <footer>
        <span className={css.skMuted}>{t('evidence.select.steps', { count: chosen.size })}</span>
        {targets.length > 0 && <SelectField size="sm" inline label={t('evidence.deriveFor')} value={skillName} onChange={setTarget} options={targets.map(name => ({ value: name, label: name }))} />}
        <Button variant="primary" disabled={!context.writable || busy || skillName === ''} onClick={() => void derive()}>{t('evidence.derive')}</Button>
      </footer>
    </div>}
    {deleting && <Confirm danger title={t('evidence.deleteTitle')} body={t('evidence.deleteBody')} confirmLabel={t('common.confirmDelete')} busy={busy} onClose={() => setDeleting(false)} onConfirm={() => void (async () => {
      setBusy(true)
      try { await context.client.deleteTrajectory(trajectory.id); setDeleting(false); props.onDeleted(); context.refresh() } catch (error) { context.fail(error) } finally { setBusy(false) }
    })()} />}
  </article>
}
