/**
 * Display formatting shared by server and client components.
 *
 * Dates here are calendar strings, never `Date` objects (§00 rule 4). Parsing
 * "2026-06-01" into a `Date` to format it is how a yard in Kolkata ends up
 * showing 31 May on a phone set to UTC.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** `2026-06-01` → `01 Jun`. */
export function formatDay(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day} ${MONTHS[Number(month) - 1] ?? '???'}`;
}

/** `2026-06-01` → `01 Jun 2026`. */
export function formatDayFull(iso: string): string {
  return `${formatDay(iso)} ${iso.slice(0, 4)}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Sakamoto's algorithm. Offsets into the year for each month. */
const SAKAMOTO = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];

/**
 * `2026-06-01` → `Mon, 01 Jun`.
 *
 * The weekday matters in a yard: "it went out Monday" is how a lending is
 * remembered and argued about, and a bare date makes an admin count backwards
 * on their fingers to check a contractor's story.
 *
 * Worked out arithmetically rather than by `new Date(iso).getDay()`, for the
 * reason at the top of this file — parsing the string into a `Date` is exactly
 * how a phone set to UTC ends up naming the wrong day.
 */
export function formatDayWeekday(iso: string): string {
  const [yearPart, monthPart, dayPart] = iso.split('-');
  const month = Number(monthPart);
  const day = Number(dayPart);
  let year = Number(yearPart);

  if (!year || !month || !day || month < 1 || month > 12) return formatDay(iso);

  // January and February are treated as months 13 and 14 of the previous year,
  // which is what lets one leap-year rule cover the whole table.
  if (month < 3) year -= 1;

  const weekday =
    (year +
      Math.floor(year / 4) -
      Math.floor(year / 100) +
      Math.floor(year / 400) +
      SAKAMOTO[month - 1] +
      day) %
    7;

  return `${WEEKDAYS[weekday]}, ${formatDay(iso)}`;
}

/** `2026-06-01` (or `2026-06`) → `Jun 2026`. */
export function formatMonth(iso: string): string {
  const [year, month] = iso.split('-');
  return `${MONTHS[Number(month) - 1] ?? '???'} ${year}`;
}

/** `20` → `20 days`, `1` → `1 day`. */
export function formatDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function formatQty(qty: number, unit = 'nos'): string {
  return `${qty} ${unit}`;
}

/** A timestamp from the server, shown in the yard's timezone. */
export function formatWhen(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoTimestamp));
}

/** `+919846012345` → `+91 98460 12345`, for a header a contractor reads. */
export function formatMobile(mobile: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(mobile);
  return match ? `+91 ${match[1]} ${match[2]}` : mobile;
}

export function telHref(mobile: string): string {
  return `tel:${mobile}`;
}

/**
 * A wa.me link the admin sends from their own WhatsApp (§09 — no Business API
 * in v1, it costs money and needs approval).
 */
export function waHref(mobile: string, text: string): string {
  return `https://wa.me/${mobile.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export const MOVEMENT_LABEL: Record<string, string> = {
  ISSUE: 'Issued',
  RETURN: 'Returned',
  RETURN_DAMAGED: 'Returned damaged',
  LOST: 'Lost',
  REVERSAL: 'Reversed',
};
