import { useEffect, useState, type JSX } from 'react'
import { Button, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { SelectField, SidebarModal } from 'dsh-mnemon/client'
import { SKILL_ROOT_KINDS, type SkillRootKind, type SkillsOverview, type SkillsSettings } from '../contracts.ts'
import { css, relative, useT, type SkillsKey } from './presentation.ts'
import { Block, Busy, Field } from './shared.tsx'
import type { SkillsPageContext } from './ui.tsx'

export function OverviewPage(props: { context: SkillsPageContext; overview: SkillsOverview | null; switching: boolean; onToggle: (next: boolean) => void }): JSX.Element {
  const t = useT()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { overview, context } = props
  if (overview === null) return <Busy label={t('common.loading')} />
  const settings = overview.settings
  const stats: Array<{ key: SkillsKey; value: string; onOpen?: () => void }> = [
    { key: 'overview.stat.skills', value: String(overview.counts.skills), onOpen: () => context.navigate({ tab: 'skills' }) },
    { key: 'overview.stat.pending', value: String(overview.counts.pending), onOpen: () => context.navigate({ tab: 'evolution' }) },
    { key: 'overview.stat.drafts', value: String(overview.counts.drafts), onOpen: () => context.navigate({ tab: 'evolution' }) },
    { key: 'overview.stat.trajectories', value: String(overview.counts.trajectories), onOpen: () => context.navigate({ tab: 'evidence' }) },
    { key: 'overview.stat.cases', value: String(overview.counts.cases), onOpen: () => context.navigate({ tab: 'evals' }) },
    { key: 'overview.stat.lastReview', value: overview.lastReviewAt === undefined ? t('overview.stat.never') : relative(t, overview.lastReviewAt) },
  ]
  return <div className={css.skOverview}>
    <section className={css.skLoop} data-on={settings.enabled ? '' : undefined}>
      <header>
        <div>
          <h3>{settings.enabled ? t('overview.onTitle') : t('overview.offTitle')}</h3>
          <p>{settings.enabled
            ? t('overview.onBody', { threshold: settings.reviewThreshold, idle: settings.idleSeconds, cooldown: settings.cooldownSeconds })
            : t('overview.offBody')}</p>
        </div>
        <div className={css.skLoopActions}>
          {!settings.enabled && <Button variant="primary" disabled={props.switching || !context.writable} onClick={() => props.onToggle(true)}>{t('overview.enable')}</Button>}
          <Button variant="outline" disabled={!context.writable} onClick={() => setSettingsOpen(true)}>{t('overview.settings')}</Button>
        </div>
      </header>
      <ol className={css.skLoopSteps}>
        {(['capture', 'review', 'evolve'] as const).map((step, index) => <li key={step}>
          <span aria-hidden="true">{index + 1}</span>
          <div><strong>{t(`overview.step.${step}`)}</strong><p>{t(`overview.step.${step}Hint`)}</p></div>
        </li>)}
      </ol>
    </section>

    <div className={css.skStats}>
      {stats.map(stat => stat.onOpen === undefined
        ? <article key={stat.key}><span>{t(stat.key)}</span><strong>{stat.value}</strong></article>
        : <button key={stat.key} type="button" onClick={stat.onOpen}><span>{t(stat.key)}</span><strong>{stat.value}</strong></button>)}
    </div>

    <div className={css.skOverviewColumns}>
      <Block title={t('overview.attention')}>
        {overview.attention.length === 0 ? <p className={css.skMuted}>{t('overview.attentionEmpty')}</p> : <ul className={css.skRows}>
          {overview.attention.map(item => <li key={`${item.kind}:${item.id}`}>
            <button type="button" onClick={() => context.navigate(item.kind === 'suggestion' ? { tab: 'evolution', suggestionId: item.id } : item.kind === 'draft' ? { tab: 'evolution', draftId: item.id } : { tab: 'evals', evalSkill: item.skillName, runId: item.id })}>
              <Tag tone={item.kind === 'regression' ? 'danger' : item.kind === 'draft' ? 'warning' : 'info'}>{t(`overview.attention.${item.kind}`)}</Tag>
              <strong>{item.skillName}</strong>
              <span>{item.title}</span>
              <time>{relative(t, item.at)}</time>
            </button>
          </li>)}
        </ul>}
      </Block>
      <Block title={t('overview.reviews')}>
        {overview.reviews.length === 0 ? <p className={css.skMuted}>{t('overview.reviewsEmpty')}</p> : <ul className={css.skRows}>
          {overview.reviews.map(review => <li key={review.id}>
            <button type="button" disabled={review.trajectoryId === undefined} onClick={() => review.trajectoryId !== undefined && context.navigate({ tab: 'evidence', trajectoryId: review.trajectoryId })}>
              <Tag tone={review.outcome === 'error' ? 'danger' : review.outcome === 'suggested' ? 'success' : 'quiet'}>
                {review.outcome === 'suggested' ? t('overview.outcome.suggested', { count: review.suggestions }) : t(`overview.outcome.${review.outcome}`)}
              </Tag>
              <strong>{review.sessionTitle ?? review.sessionId.slice(0, 8)}</strong>
              <span>{review.outcome === 'error' ? review.error ?? '' : review.summary ?? ''}</span>
              <time title={review.at}>{t(`overview.trigger.${review.trigger}`)} · {review.score === undefined ? '' : `${t('overview.score', { score: review.score.score })} · `}{relative(t, review.at)}</time>
            </button>
          </li>)}
        </ul>}
      </Block>
    </div>
    {settingsOpen && <SettingsDialog context={context} settings={settings} onClose={() => setSettingsOpen(false)} />}
  </div>
}

type NumberField = 'reviewThreshold' | 'idleSeconds' | 'cooldownSeconds' | 'minConfidence' | 'expiryDays' | 'maxPendingPerSession' | 'casesPerRun'
const FIELDS: ReadonlyArray<{ key: NumberField; min: number; max: number; step: number; hint?: SkillsKey }> = [
  { key: 'reviewThreshold', min: 1, max: 50, step: 1, hint: 'settings.reviewThresholdHint' },
  { key: 'idleSeconds', min: 0, max: 3600, step: 1, hint: 'settings.idleSecondsHint' },
  { key: 'cooldownSeconds', min: 0, max: 86_400, step: 1, hint: 'settings.cooldownSecondsHint' },
  { key: 'minConfidence', min: 0, max: 1, step: 0.05, hint: 'settings.minConfidenceHint' },
  { key: 'expiryDays', min: 1, max: 365, step: 1 },
  { key: 'maxPendingPerSession', min: 1, max: 50, step: 1 },
  { key: 'casesPerRun', min: 1, max: 20, step: 1 },
]

function SettingsDialog(props: { context: SkillsPageContext; settings: SkillsSettings; onClose: () => void }): JSX.Element {
  const t = useT()
  const [values, setValues] = useState<Record<NumberField, string>>(() => Object.fromEntries(FIELDS.map(field => [field.key, String(props.settings[field.key])])) as Record<NumberField, string>)
  const [root, setRoot] = useState<SkillRootKind>(props.settings.defaultRoot)
  const [autoBacktest, setAutoBacktest] = useState(props.settings.autoBacktest)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setRoot(props.settings.defaultRoot); setAutoBacktest(props.settings.autoBacktest) }, [props.settings])
  const invalid = FIELDS.find(field => {
    const value = Number(values[field.key])
    return values[field.key].trim() === '' || !Number.isFinite(value) || value < field.min || value > field.max
  })
  const changed = FIELDS.some(field => Number(values[field.key]) !== props.settings[field.key]) || root !== props.settings.defaultRoot || autoBacktest !== props.settings.autoBacktest
  const apply = async () => {
    if (invalid !== undefined) return
    setSaving(true)
    try {
      await props.context.client.updateSettings({ ...Object.fromEntries(FIELDS.map(field => [field.key, Number(values[field.key])])), defaultRoot: root, autoBacktest })
      props.context.refresh()
      props.onClose()
    } catch (error) { props.context.fail(error) } finally { setSaving(false) }
  }
  return <SidebarModal title={t('settings.title')} description={t('settings.description')} busy={saving} onClose={props.onClose} footer={<>
    {invalid !== undefined && <span className={css.skFormError}>{t('settings.invalid', { field: t(`settings.${invalid.key}`) })}</span>}
    <Button variant="ghost" onClick={props.onClose}>{t('common.cancel')}</Button>
    <Button variant="primary" disabled={!changed || invalid !== undefined || saving} onClick={() => void apply()}>{saving ? t('common.saving') : t('common.apply')}</Button>
  </>}>
    <div className={css.skForm}>
      {FIELDS.map(field => <Field key={field.key} label={t(`settings.${field.key}`)} {...(field.hint === undefined ? {} : { hint: t(field.hint) })}>
        {control => <input {...control} type="number" min={field.min} max={field.max} step={field.step} value={values[field.key]} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} />}
      </Field>)}
      <div className={css.skFormRow}>
        <SelectField label={t('settings.defaultRoot')} value={root} options={SKILL_ROOT_KINDS.map(kind => ({ value: kind, label: t(`root.${kind}`) }))} onChange={setRoot} />
      </div>
      <div className={css.skFormSwitch}>
        <div><strong>{t('settings.autoBacktest')}</strong><small>{t('settings.autoBacktestHint')}</small></div>
        <Switch checked={autoBacktest} label={t('settings.autoBacktest')} onChange={setAutoBacktest} />
      </div>
    </div>
  </SidebarModal>
}
