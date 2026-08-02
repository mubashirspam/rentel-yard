/**
 * What the yard calls things.
 *
 * The owner's word is **lend** — the yard lends equipment out and takes it
 * back. The ledger keeps its `ISSUE` movement type (§02 schema; renaming a
 * movement type rewrites history for a label), and the `/issue` routes keep
 * their paths for the same reason. Only what a person reads changes, and it
 * changes here, in one place.
 */

export const WORDS = {
  /** The noun: equipment out on lending. */
  lending: 'Lending',
  /** The verb, for buttons. */
  lend: 'Lend',
  /** The nav label — short enough for a five-tab bar at 360px. */
  lendTab: 'Lend',
  /** Going out again to a site that already holds equipment. */
  lendMore: 'Lend more',
  /** The counterpart, unchanged: equipment coming back. */
  return: 'Return',
} as const;
