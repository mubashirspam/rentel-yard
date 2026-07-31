/**
 * What the yard calls things.
 *
 * "Issue" is accounting language. Nobody at a gate says "I am issuing you a
 * hundred jacks" — they say the delivery is going out. The ledger keeps its
 * `ISSUE` movement type, because that is the §02 schema and changing it would
 * rewrite history for a label; the *screens* say Delivery.
 *
 * One place, so the day the owner prefers "Dispatch" or "Out" it is a one-line
 * change rather than a hunt through twenty files.
 */

export const WORDS = {
  /** The noun: what leaves the yard. */
  delivery: 'Delivery',
  deliveries: 'Deliveries',
  /** The verb, for buttons. */
  deliver: 'Deliver',
  /** The nav label — short enough for a five-tab bar at 360px. */
  deliveryTab: 'Deliver',
  /** Going out again to a site that already has equipment. */
  deliverMore: 'Deliver more',
  /** The counterpart, unchanged: equipment coming back. */
  return: 'Return',
} as const;
