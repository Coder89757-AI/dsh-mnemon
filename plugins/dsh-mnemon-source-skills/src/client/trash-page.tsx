import { useEffect, useState, type JSX } from 'react'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TrashEntry } from '../contracts.ts'
import { css, stamp, useT } from './presentation.ts'
import { Busy, Confirm, Empty, SkillIcon } from './shared.tsx'
import type { SkillsLocation, SkillsPageContext } from './ui.tsx'

/** A size the eye can compare: bytes under a kilobyte, else whole KiB or MiB. */
function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KiB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

/**
 * Skills taken out of DSH's reach: every removal still sits on disk under the
 * Source's `trash` directory, so it can be put back, and only here can it be
 * deleted for good.
 */
export function TrashPage(props: { context: SkillsPageContext; location: SkillsLocation }): JSX.Element {
  const t = useT()
  const { context } = props
  const [entries, setEntries] = useState<TrashEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [purging, setPurging] = useState<TrashEntry | null>(null)
  const [emptying, setEmptying] = useState(false)
  useEffect(() => {
    let active = true
    void context.client.trash().then(value => { if (active) setEntries(value) }).catch(error => { if (active) context.fail(error) })
    return () => { active = false }
  }, [context.client, context.revision])
  if (entries === null) return <Busy label={t('common.loading')} />
  const run = async (operation: () => Promise<unknown>, done: () => void) => {
    setBusy(true)
    try {
      await operation()
      done()
      setEntries(await context.client.trash())
      context.refresh()
    } catch (error) { context.fail(error) } finally { setBusy(false) }
  }
  return <article className={css.skDetail}>
    <header className={css.skDetailHead}>
      <div>
        <h3>{t('trash.title')}</h3>
        <p>{t('trash.body')}</p>
        {entries.length > 0 && <span className={css.skMeta}>{t('tabs.trash', { count: entries.length })}</span>}
      </div>
      {entries.length > 0 && <div className={css.skDetailActions}>
        <Button variant="outline" size="sm" disabled={!context.writable || busy} onClick={() => setEmptying(true)}>{t('trash.empty')}</Button>
      </div>}
    </header>
    {entries.length === 0 ? <Empty glyph="♻" title={t('trash.emptyTitle')}>{t('trash.emptyBody')}</Empty> : <ul className={css.skVersions}>
      {entries.map(entry => <li key={entry.id}>
        <SkillIcon name={entry.name} />
        <span className={css.skRowText}>
          <strong>{entry.name}</strong>
          <small>{t('trash.meta', { time: stamp(entry.trashedAt), size: size(entry.bytes) })}</small>
        </span>
        {entry.root !== undefined && <Tag tone="quiet">{t(`root.${entry.root}`)}</Tag>}
        <span />
        <Button variant="outline" size="sm" disabled={!context.writable || busy} title={t('trash.restoreHint')}
          onClick={() => void run(() => context.client.restoreTrash(entry.id), () => context.notice(t('trash.restored', { name: entry.name })))}>{t('trash.restore')}</Button>
        <Button variant="ghost" size="sm" disabled={!context.writable || busy} onClick={() => setPurging(entry)}>{t('trash.purge')}</Button>
      </li>)}
    </ul>}
    {purging !== null && <Confirm danger title={t('trash.purgeTitle', { name: purging.name })} body={t('trash.purgeBody')} confirmLabel={t('trash.purge')} busy={busy}
      onClose={() => setPurging(null)} onConfirm={() => void run(() => context.client.purgeTrash(purging.id), () => { context.notice(t('trash.purged', { name: purging.name })); setPurging(null) })} />}
    {emptying && <Confirm danger title={t('trash.clearTitle', { count: entries.length })} body={t('trash.clearBody')} confirmLabel={t('trash.empty')} busy={busy}
      onClose={() => setEmptying(false)} onConfirm={() => void run(() => context.client.emptyTrash(), () => { context.notice(t('trash.emptied', { count: entries.length })); setEmptying(false) })} />}
  </article>
}
