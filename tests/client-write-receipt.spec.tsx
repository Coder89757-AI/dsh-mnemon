// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WriteReceipt } from '../src/client/page-controls.tsx'
import { translateEn, translateZh } from '../src/client/locales.ts'

afterEach(cleanup)

// jsdom replaces the global URL, so the path is resolved through Node's own.
const controlsCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/client/PageControls.module.css'), 'utf8')

/** The line under a receipt that says a memory has no vector: its text and its tone. */
function vectorNote(container: HTMLElement): { text: string | null; tone: string | null } | null {
  const note = container.querySelector('[role=status] > p[data-tone]')
  return note === null ? null : { text: note.textContent, tone: note.getAttribute('data-tone') }
}

describe('the receipt of a memory saved without a vector', () => {
  it.each([['zh', translateZh], ['en', translateEn]] as const)('words it by whether DSH manages the embedding settings (%s)', (_language, t) => {
    const { container, rerender } = render(<WriteReceipt t={t} action="added" summary="Saved to Release notes." unembedded embeddingManaged={false} />)
    // At their default no embedding service is set up, so no vector is what the install expects.
    expect(vectorNote(container)).toEqual({ text: t('receipt.unembeddedNoService'), tone: 'neutral' })
    // Managed, a configured service did not answer.
    rerender(<WriteReceipt t={t} action="added" summary="Saved to Release notes." unembedded embeddingManaged />)
    expect(vectorNote(container)).toEqual({ text: t('receipt.unembedded'), tone: 'caution' })
    // A caller that does not say, as Memory Spaces 0.5.21 and earlier do not, keeps the caution.
    rerender(<WriteReceipt t={t} action="updated" unembedded />)
    expect(vectorNote(container)).toEqual({ text: t('receipt.unembedded'), tone: 'caution' })
    rerender(<WriteReceipt t={t} action="partial" unembedded embeddingManaged={false} />)
    expect(vectorNote(container)?.tone).toBe('neutral')
  })

  it.each([false, true, undefined])('says nothing about a vector when the memory has one or nothing was written (managed: %s)', managed => {
    const cases = [
      { action: 'added' },
      { action: 'added', unembedded: false },
      { action: 'skipped', unembedded: true },
      { action: 'accepted', unembedded: true },
      { action: 'unknown', unembedded: true },
      { error: 'The task Agent failed.', unembedded: true },
    ]
    for (const props of cases) {
      const { container } = render(<WriteReceipt t={translateEn} {...props} {...(managed === undefined ? {} : { embeddingManaged: managed })} />)
      expect(vectorNote(container)).toBeNull()
      cleanup()
    }
  })

  it('draws the neutral note in the hint colour and only the caution in the warning colour', () => {
    expect(controlsCss).toMatch(/\.receipt > \.receiptNote \{[^}]*color: var\(--dsw-alias-label-tertiary\);/u)
    expect(controlsCss).toMatch(/\.receipt > \.receiptNote\[data-tone='caution'\] \{\s*color: var\(--dsw-alias-state-warn-label, var\(--dsw-alias-label-secondary\)\);\s*\}/u)
    expect(controlsCss.match(/--dsw-alias-state-warn-label/gu)).toHaveLength(1)
  })
})
