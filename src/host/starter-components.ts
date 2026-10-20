// The memory components the dsh-mnemon Starter ships, named once for the
// Host, the browser client and the repository scripts. Keep this file plain
// data with erasable types only and no imports: the scripts load it as is,
// with Node's own TypeScript support, without a build step.

/**
 * The component rows the Starter's bundle patch (cordis.patch.yml) declares,
 * in its order: each row's id and the package it names. DSH lists them under
 * the bundle's page. Tests keep this list equal to that patch and to the
 * versions package.json pins.
 */
export const STARTER_COMPONENT_ROWS: ReadonlyArray<{ rowId: string; packageName: string }> = [
  { rowId: 'mnemon-source-runtime', packageName: 'dsh-mnemon-source-runtime' },
  { rowId: 'mnemon-source-documents', packageName: 'dsh-mnemon-source-documents' },
  { rowId: 'mnemon-source-memory-spaces', packageName: 'dsh-mnemon-source-memory-spaces' },
  { rowId: 'mnemon-source-skills', packageName: 'dsh-mnemon-source-skills' },
  { rowId: 'mnemon-strategy-default-three-tier', packageName: 'dsh-mnemon-strategy-default-three-tier' },
  { rowId: 'mnemon-strategy-general', packageName: 'dsh-mnemon-strategy-general' },
  { rowId: 'mnemon-strategy-auto-capture', packageName: 'dsh-mnemon-strategy-auto-capture' },
  { rowId: 'mnemon-strategy-light-context', packageName: 'dsh-mnemon-strategy-light-context' },
  { rowId: 'mnemon-strategy-scoped', packageName: 'dsh-mnemon-strategy-scoped' },
]

/** The three enhancements the Starter ships switched off, in the order the Host suggests them for installation. */
export const STARTER_ENHANCEMENT_PACKAGES: readonly string[] = [
  'dsh-mnemon-strategy-scoped', 'dsh-mnemon-strategy-light-context', 'dsh-mnemon-strategy-auto-capture',
]

/**
 * The shipped packages that carry a bundle patch of their own, so that one
 * installed alone registers its row itself: the enhancements and the General
 * strategy. Under the Starter its rows own them, so a profile that also linked
 * them as separate bundles would declare those ids twice. A literal, not a
 * spread of the list above, so that a bundle that does not use it drops it.
 */
export const STARTER_SELF_REGISTERING_PACKAGES: readonly string[] = [
  'dsh-mnemon-strategy-scoped', 'dsh-mnemon-strategy-light-context', 'dsh-mnemon-strategy-auto-capture', 'dsh-mnemon-strategy-general',
]
