import { useId, type JSX, type ReactNode } from 'react'
import Markdown from 'markdown-to-jsx'
import { Button, Checkbox, StateDot, Tag, TextShimmer, type StateDotState, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, SidebarModal } from 'dsh-mnemon/client'
import type { EvolutionSignal, RunStatus, SuggestionStatus, TrajectoryAnnotation, TrajectoryStep } from '../contracts.ts'
import { css, useT, type SkillsKey, type SkillsTranslate } from './presentation.ts'

const SIGNAL_TONE: Record<EvolutionSignal, TagTone> = {
  correction: 'warning', directive: 'info', 'tool-failure': 'danger', 'approach-change': 'warning',
  procedure: 'info', 'skill-gap': 'warning', 'skill-misleading': 'warning', success: 'success',
}

export function SignalTag(props: { signal: EvolutionSignal }): JSX.Element {
  const t = useT()
  return <Tag tone={SIGNAL_TONE[props.signal]}>{t(`signal.${props.signal}` as SkillsKey)}</Tag>
}

const STATUS_TONE: Record<SuggestionStatus, TagTone> = {
  pending: 'info', drafting: 'info', review: 'warning', adopted: 'success', dismissed: 'quiet', expired: 'quiet', invalidated: 'quiet',
}

export function StatusTag(props: { status: SuggestionStatus }): JSX.Element {
  const t = useT()
  return <Tag tone={STATUS_TONE[props.status]}>{t(`status.${props.status}` as SkillsKey)}</Tag>
}

export function RunStatusDot(props: { status: RunStatus }): JSX.Element {
  const state: Record<RunStatus, StateDotState> = { running: 'ongoing', completed: 'done', failed: 'error', interrupted: 'warning' }
  return <StateDot state={state[props.status]} />
}

/** Confidence as a short bar: the number and how full it is. */
export function Confidence(props: { value: number }): JSX.Element {
  const t = useT()
  const value = Math.round(Math.min(1, Math.max(0, props.value)) * 100)
  return <span className={css.skConfidence} title={t('evolution.confidence', { value: `${value}%` })}>
    <i aria-hidden="true"><b style={{ width: `${value}%` }} data-high={value >= 70 ? '' : undefined} /></i>
    <span>{value}%</span>
  </span>
}

export function Busy(props: { label: string }): JSX.Element {
  return <span className={css.skBusy} role="status"><StateDot state="ongoing" /><TextShimmer active>{props.label}</TextShimmer></span>
}

export function Empty(props: { glyph: string; title: string; children: string }): JSX.Element {
  return <div className={css.skEmpty}><EmptyState glyph={props.glyph} title={props.title}>{props.children}</EmptyState></div>
}

/** A titled block inside a pane, with optional actions on the right. */
export function Block(props: { title: string; actions?: ReactNode; children: ReactNode; className?: string }): JSX.Element {
  return <section className={[css.skBlock, props.className].filter(Boolean).join(' ')}>
    <header><h4>{props.title}</h4>{props.actions !== undefined && <div>{props.actions}</div>}</header>
    {props.children}
  </section>
}

export function Confirm(props: { title: string; body: string; confirmLabel: string; busy?: boolean; danger?: boolean; onConfirm: () => void; onClose: () => void }): JSX.Element {
  const t = useT()
  return <SidebarModal title={props.title} description={props.body} {...(props.busy === undefined ? {} : { busy: props.busy })} onClose={props.onClose} footer={<>
    <Button variant="ghost" onClick={props.onClose}>{t('common.cancel')}</Button>
    <Button variant="primary" className={props.danger === true ? css.skDangerButton : undefined} disabled={props.busy === true} onClick={props.onConfirm}>{props.confirmLabel}</Button>
  </>}><span /></SidebarModal>
}

const STEP_GLYPH: Record<TrajectoryStep['kind'], string> = { user: '›', assistant: '‹', tool: '⚙', skill: '✦' }

/**
 * A trajectory as a numbered timeline. Annotated steps carry their signal and
 * note; selectable steps get a checkbox, for turning them into eval cases.
 */
export function StepTimeline(props: {
  steps: readonly TrajectoryStep[]
  annotations?: readonly TrajectoryAnnotation[]
  highlight?: ReadonlySet<number>
  selected?: ReadonlySet<number>
  onToggle?: (index: number) => void
  compact?: boolean
}): JSX.Element {
  const t = useT()
  const notes = new Map<number, TrajectoryAnnotation[]>()
  for (const annotation of props.annotations ?? []) notes.set(annotation.step, [...(notes.get(annotation.step) ?? []), annotation])
  let lastTurn: number | undefined
  return <ol className={css.skTimeline} data-compact={props.compact === true ? '' : undefined}>
    {props.steps.map(step => {
      const annotated = notes.get(step.index) ?? []
      const turnLabel = step.turn !== lastTurn ? t('evidence.turn', { turn: step.turn }) : undefined
      lastTurn = step.turn
      const failed = step.kind === 'tool' && step.tool?.ok === false
      return <li key={step.index} data-kind={step.kind} data-failed={failed ? '' : undefined} data-annotated={annotated.length > 0 ? '' : undefined} data-highlight={props.highlight?.has(step.index) === true ? '' : undefined}>
        {turnLabel !== undefined && <div className={css.skTurn}>{turnLabel}</div>}
        <div className={css.skStep}>
          {props.onToggle !== undefined
            ? <Checkbox checked={props.selected?.has(step.index) === true} label={`#${step.index}`} onChange={() => props.onToggle!(step.index)} />
            : <span className={css.skStepIndex}>{step.index}</span>}
          <span className={css.skStepGlyph} aria-hidden="true">{STEP_GLYPH[step.kind]}</span>
          <div className={css.skStepBody}>
            <div className={css.skStepHead}>
              <strong>{step.kind === 'tool' ? step.tool?.name ?? t('evidence.step.tool') : t(`evidence.step.${step.kind}` as SkillsKey)}</strong>
              {step.kind === 'skill' && step.skill !== undefined && <code>{step.skill.by === 'user' ? t('evidence.step.byUser', { name: step.skill.name }) : `${step.skill.name} · ${t('evidence.step.byModel')}`}</code>}
              {step.kind === 'tool' && step.tool?.input !== undefined && <code title={step.tool.input}>{step.tool.input}</code>}
              {failed && <Tag tone="danger">{t('run.verdict.error')}</Tag>}
            </div>
            {step.kind !== 'skill' && step.text !== '' && <p>{step.text}</p>}
            {annotated.map((annotation, index) => <div key={index} className={css.skAnnotation}><SignalTag signal={annotation.signal} /><span>{annotation.note}</span></div>)}
          </div>
        </div>
      </li>
    })}
  </ol>
}

/** A labelled form control with an optional hint, associated for assistive technology. */
export function Field(props: { label: string; hint?: string; children: (control: { id: string; 'aria-describedby'?: string }) => ReactNode }): JSX.Element {
  const id = useId()
  const hintId = useId()
  return <div className={css.skField}>
    <label htmlFor={id}>{props.label}</label>
    {props.children({ id, ...(props.hint === undefined ? {} : { 'aria-describedby': hintId }) })}
    {props.hint !== undefined && <small id={hintId}>{props.hint}</small>}
  </div>
}

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

const CATEGORY_GLYPH: Record<string, string> = {
  'docs-writing': '✎', 'content-creation': '✦', 'design-ui': '◐', development: '⌘', devops: '⇪', 'research-analysis': '⌕', productivity: '✓', marketing: '◎',
}

/** A square with the category's glyph, or the skill's initial. */
export function SkillIcon(props: { name: string; category?: string | undefined }): JSX.Element {
  const glyph = props.category === undefined ? undefined : CATEGORY_GLYPH[props.category]
  return <span className={css.skIcon} aria-hidden="true">{glyph ?? props.name.slice(0, 1).toUpperCase()}</span>
}
