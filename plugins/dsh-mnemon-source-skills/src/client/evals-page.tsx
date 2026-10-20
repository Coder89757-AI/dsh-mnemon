import { useEffect, useMemo, useState, type JSX } from 'react'
import { Button, Checkbox, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { SelectField, SidebarModal } from 'dsh-mnemon/client'
import type { BacktestRun, EvalCase, RunTarget, SkillDraft } from '../contracts.ts'
import type { CaseDraft } from './api.ts'
import { css, errorText, percent, points, relative, stamp, useT } from './presentation.ts'
import { Block, Busy, Confirm, Empty, Field, RunStatusDot } from './shared.tsx'
import type { SkillsLocation, SkillsPageContext } from './ui.tsx'

const ORIGIN_TONE = { review: 'info', trajectory: 'neutral', manual: 'outline' } as const

export function EvalsPage(props: { context: SkillsPageContext; location: SkillsLocation }): JSX.Element {
  const t = useT()
  const { context } = props
  const [names, setNames] = useState<string[] | null>(null)
  const [skill, setSkill] = useState<string | undefined>(props.location.evalSkill)
  useEffect(() => { if (props.location.evalSkill !== undefined) setSkill(props.location.evalSkill) }, [props.location.evalSkill, props.location.nonce])
  useEffect(() => {
    let active = true
    void Promise.all([context.client.catalog(), context.client.cases()]).then(([catalog, cases]) => {
      if (!active) return
      // A case may belong to a skill that does not exist yet: a suggested new skill.
      const all = [...new Set([...catalog.skills.filter(entry => entry.shadowedBy === undefined).map(entry => entry.name), ...cases.map(entry => entry.skillName)])].sort()
      setNames(all)
      setSkill(current => current !== undefined && all.includes(current) ? current : all[0])
    }).catch(context.fail)
    return () => { active = false }
  }, [context.client, context.revision])
  if (names === null) return <Busy label={t('common.loading')} />
  if (names.length === 0 || skill === undefined) return <Empty glyph="✓" title={t('evals.empty')}>{t('evals.emptyBody')}</Empty>
  return <div className={css.skEvals}>
    <header className={css.skEvalsHead}>
      <SelectField label={t('evals.skill')} inline value={skill} onChange={setSkill} options={names.map(name => ({ value: name, label: name }))} />
      <p className={css.skMuted}>{t('evals.simulation')}</p>
    </header>
    <SkillEvals key={skill} context={context} skill={skill} focusRun={props.location.runId} />
  </div>
}

function SkillEvals(props: { context: SkillsPageContext; skill: string; focusRun: string | undefined }): JSX.Element {
  const t = useT()
  const { context } = props
  const [cases, setCases] = useState<EvalCase[] | null>(null)
  const [runs, setRuns] = useState<BacktestRun[]>([])
  const [drafts, setDrafts] = useState<SkillDraft[]>([])
  const [hasFile, setHasFile] = useState(false)
  const [editing, setEditing] = useState<CaseDraft | null>(null)
  const [deleting, setDeleting] = useState<EvalCase | null>(null)
  const [openRun, setOpenRun] = useState<string | undefined>(props.focusRun)
  const [target, setTarget] = useState('current')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.all([context.client.cases(props.skill), context.client.runs(props.skill), context.client.evidencePack({ skill: props.skill })]).then(([list, history, pack]) => {
      if (!active) return
      setCases(list)
      setRuns(history)
      setDrafts(pack.drafts.filter(draft => draft.status === 'ready'))
      setHasFile(pack.skill !== undefined)
      setTarget(current => current === 'current' && pack.skill === undefined ? 'none' : current)
    }).catch(context.fail)
    return () => { active = false }
  }, [context.client, props.skill, context.revision])
  const trend = useMemo(() => runs.filter(run => run.status === 'completed' && run.score !== undefined).slice(0, 12).reverse(), [runs])
  if (cases === null) return <Busy label={t('common.loading')} />
  const targets: Array<{ value: string; label: string; target: RunTarget }> = [
    ...(hasFile ? [{ value: 'current', label: t('evals.target.current'), target: { kind: 'current' as const } }] : []),
    ...drafts.map(draft => ({ value: `draft:${draft.id}`, label: t('evals.target.draft', { time: stamp(draft.updatedAt) }), target: { kind: 'draft' as const, draftId: draft.id } })),
    { value: 'none', label: t('evals.target.none'), target: { kind: 'none' as const } },
  ]
  const enabled = cases.filter(entry => entry.enabled)
  const run = async () => {
    const chosen = targets.find(entry => entry.value === target) ?? targets[0]!
    setBusy(true)
    try {
      const started = await context.client.backtest({ skillName: props.skill, target: chosen.target })
      setOpenRun(started.runId)
      context.notice(t('evals.runStarted'))
      context.refresh()
    } catch (error) { context.fail(error) } finally { setBusy(false) }
  }
  const save = async (input: CaseDraft) => {
    setBusy(true)
    try { await context.client.saveCase(input); setEditing(null); context.refresh() } catch (error) { context.fail(error) } finally { setBusy(false) }
  }
  const running = runs.some(entry => entry.status === 'running')
  return <>
    <div className={css.skEvalsGrid}>
      <Block title={`${t('evals.cases')} · ${enabled.length}/${cases.length}`} actions={<Button variant="outline" size="sm" disabled={!context.writable} onClick={() => setEditing({ skillName: props.skill, title: '', prompt: '', checks: [{ text: '', must: true }] })}>{t('evals.add')}</Button>}>
        {cases.length === 0 ? <p className={css.skMuted}>{t('evals.emptyBody')}</p> : <ul className={css.skCases}>
          {cases.map(entry => <li key={entry.id} data-off={entry.enabled ? undefined : ''}>
            <header>
              <strong>{entry.title}</strong>
              <Switch checked={entry.enabled} label={t('evals.enabled')} disabled={!context.writable || busy} onChange={next => void save({ ...entry, enabled: next })} />
            </header>
            <p>{entry.prompt}</p>
            <ul>{entry.checks.map(check => <li key={check.id}><Tag tone={check.must ? 'solid' : 'outline'}>{check.must ? t('evals.must') : t('evals.should')}</Tag><span>{check.text}</span></li>)}</ul>
            <footer>
              {entry.origin.trajectoryId !== undefined
                ? <button type="button" className={css.skLink} onClick={() => context.navigate({ tab: 'evidence', trajectoryId: entry.origin.trajectoryId!, ...(entry.origin.steps === undefined ? {} : { steps: entry.origin.steps }) })}><Tag tone={ORIGIN_TONE[entry.origin.kind]}>{t(`evals.origin.${entry.origin.kind}`)}</Tag> ›</button>
                : <Tag tone={ORIGIN_TONE[entry.origin.kind]}>{t(`evals.origin.${entry.origin.kind}`)}</Tag>}
              <time>{relative(t, entry.updatedAt)}</time>
              <Button variant="ghost" size="sm" disabled={!context.writable} onClick={() => setEditing({ ...entry })}>{t('common.edit')}</Button>
              <Button variant="ghost" size="sm" disabled={!context.writable} onClick={() => setDeleting(entry)}>{t('common.delete')}</Button>
            </footer>
          </li>)}
        </ul>}
      </Block>
      <div className={css.skEvalsSide}>
        <Block title={t('evals.run')}>
          <div className={css.skRunBar}>
            <SelectField size="sm" label={t('evals.runTarget')} value={targets.some(entry => entry.value === target) ? target : targets[0]!.value} onChange={setTarget} options={targets.map(entry => ({ value: entry.value, label: entry.label }))} />
            <Button variant="primary" size="sm" disabled={!context.writable || busy || running || enabled.length === 0 || !context.client.canAssist('skill-backtest')} onClick={() => void run()}>{t('evals.run')}</Button>
          </div>
        </Block>
        {trend.length > 1 && <Block title={t('evals.trend')}><Trend runs={trend} /></Block>}
        <Block title={t('evals.runs')}>
          {runs.length === 0 ? <p className={css.skMuted}>{t('evals.runsEmpty')}</p> : <ul className={css.skRuns}>
            {runs.map(entry => <li key={entry.id}>
              <button type="button" data-open={openRun === entry.id ? '' : undefined} onClick={() => setOpenRun(openRun === entry.id ? undefined : entry.id)}>
                <RunStatusDot status={entry.status} />
                <Tag tone={entry.target.kind === 'draft' ? 'warning' : entry.target.kind === 'none' ? 'quiet' : 'outline'}>{targetLabel(t, entry.target)}</Tag>
                <span>{entry.status === 'running' ? t('run.progress', { done: entry.progress.done, total: entry.progress.total }) : entry.status === 'completed' ? `${t('run.passRate', { rate: percent(entry.passRate) })} · ${t('run.score', { score: points(entry.score) })}` : t(`run.status.${entry.status}`)}</span>
                <time>{relative(t, entry.startedAt)}</time>
              </button>
              {openRun === entry.id && <RunDetail run={entry} />}
            </li>)}
          </ul>}
        </Block>
      </div>
    </div>
    {editing !== null && <CaseEditor initial={editing} busy={busy} onClose={() => setEditing(null)} onSave={input => void save(input)} />}
    {deleting !== null && <Confirm danger title={t('evals.deleteCase')} body={deleting.title} confirmLabel={t('common.confirmDelete')} busy={busy} onClose={() => setDeleting(null)} onConfirm={() => void (async () => {
      setBusy(true)
      try { await context.client.deleteCase(deleting.id); setDeleting(null); context.refresh() } catch (error) { context.fail(error) } finally { setBusy(false) }
    })()} />}
  </>
}

function targetLabel(t: ReturnType<typeof useT>, target: RunTarget): string {
  if (target.kind === 'current') return t('evals.target.current') + (target.hash === undefined ? '' : ` ${target.hash.slice(0, 6)}`)
  if (target.kind === 'draft') return t('draft.candidate')
  if (target.kind === 'version') return t('detail.versions')
  return t('evals.target.none')
}

/** Scores of finished runs, oldest to newest, as bars. */
function Trend(props: { runs: readonly BacktestRun[] }): JSX.Element {
  const t = useT()
  return <div className={css.skTrend} role="img" aria-label={props.runs.map(run => `${targetLabel(t, run.target)} ${points(run.score)}`).join(', ')}>
    {props.runs.map(run => <div key={run.id} title={`${stamp(run.finishedAt)} · ${targetLabel(t, run.target)} · ${points(run.score)}`}>
      <i style={{ height: `${Math.max(4, Math.round((run.score ?? 0) * 100))}%` }} data-kind={run.target.kind} />
      <span>{points(run.score)}</span>
    </div>)}
  </div>
}

function RunDetail(props: { run: BacktestRun }): JSX.Element {
  const t = useT()
  if (props.run.error !== undefined && props.run.results.length === 0) return <p className={css.inlineError}>{props.run.error}</p>
  return <div className={css.skRunDetail}>
    {props.run.results.map(result => <details key={result.caseId}>
      <summary>
        <Tag tone={result.verdict === 'pass' ? 'success' : result.verdict === 'error' ? 'danger' : 'warning'}>{t(`run.verdict.${result.verdict}`)}</Tag>
        <strong>{result.title}</strong>
        <span>{points(result.score)}</span>
      </summary>
      {result.error !== undefined && <p className={css.inlineError}>{result.error}</p>}
      {result.checks.length > 0 && <ul className={css.skVerdicts}>{result.checks.map(check => <li key={check.checkId} data-pass={check.pass ? '' : undefined}><b aria-hidden="true">{check.pass ? '✓' : '✕'}</b><span>{check.note}</span></li>)}</ul>}
      {result.summary !== undefined && <p className={css.skMuted}>{t('run.judge')}: {result.summary}</p>}
      {result.steps.length > 0 && <><h6>{t('run.steps')}</h6><ol className={css.skRunSteps}>{result.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></>}
      {result.answer !== '' && <><h6>{t('run.answer')}</h6><pre className={css.skAnswer}>{result.answer}</pre></>}
    </details>)}
  </div>
}

function CaseEditor(props: { initial: CaseDraft; busy: boolean; onClose: () => void; onSave: (input: CaseDraft) => void }): JSX.Element {
  const t = useT()
  const [value, setValue] = useState<CaseDraft>(props.initial)
  const [error, setError] = useState<string | null>(null)
  const checks = value.checks.filter(check => check.text.trim() !== '')
  const valid = value.title.trim() !== '' && value.prompt.trim() !== '' && checks.length > 0
  const setCheck = (index: number, patch: Partial<CaseDraft['checks'][number]>) => setValue(current => ({ ...current, checks: current.checks.map((check, position) => position === index ? { ...check, ...patch } : check) }))
  return <SidebarModal wide title={props.initial.id === undefined ? t('evals.newTitle') : t('evals.editTitle')} busy={props.busy} onClose={props.onClose} footer={<>
    {error !== null && <span className={css.skFormError}>{error}</span>}
    <Button variant="ghost" onClick={props.onClose}>{t('common.cancel')}</Button>
    <Button variant="primary" disabled={!valid || props.busy} onClick={() => { try { props.onSave({ ...value, checks }) } catch (reason) { setError(errorText(reason)) } }}>{t('common.save')}</Button>
  </>}>
    <div className={css.skForm}>
      <Field label={t('evals.title')}>{control => <input {...control} value={value.title} onChange={event => setValue({ ...value, title: event.target.value })} />}</Field>
      <Field label={t('evals.prompt')} hint={t('evals.promptHint')}>{control => <textarea {...control} rows={4} value={value.prompt} onChange={event => setValue({ ...value, prompt: event.target.value })} />}</Field>
      <Field label={t('evals.context')}>{control => <textarea {...control} rows={3} value={value.context ?? ''} onChange={event => setValue({ ...value, context: event.target.value })} />}</Field>
      <fieldset className={css.skChecks}>
        <legend>{t('evals.checksLabel')}</legend>
        {value.checks.map((check, index) => <div key={index}>
          <Checkbox checked={check.must} label={t('evals.must')} onChange={must => setCheck(index, { must })} />
          <span>{t('evals.must')}</span>
          <input value={check.text} placeholder={t('evals.checkPlaceholder')} onChange={event => setCheck(index, { text: event.target.value })} />
          <button type="button" className={css.skDismiss} aria-label={t('common.delete')} onClick={() => setValue(current => ({ ...current, checks: current.checks.filter((_, position) => position !== index) }))}>×</button>
        </div>)}
        {value.checks.length < 8 && <Button variant="ghost" size="sm" onClick={() => setValue(current => ({ ...current, checks: [...current.checks, { text: '', must: false }] }))}>{t('evals.addCheck')}</Button>}
      </fieldset>
    </div>
  </SidebarModal>
}
