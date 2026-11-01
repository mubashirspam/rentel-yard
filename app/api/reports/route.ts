import { z } from 'zod';

import { handler, ok } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { getMonthDetail, getYearOverview } from '@/lib/reports/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const query = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

/**
 * §10 reports as JSON for the mobile app: the year's billed vs received by
 * month, and — with `?month=YYYY-MM` — that month's detail.
 */
export const GET = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'report.view');

  const url = new URL(request.url);
  const { year, month } = query.parse({
    year: url.searchParams.get('year') ?? new Date().getFullYear(),
    month: url.searchParams.get('month') ?? undefined,
  });

  const [overview, detail] = await Promise.all([
    getYearOverview(session, year),
    month ? getMonthDetail(session, month) : Promise.resolve(null),
  ]);

  return ok({ overview, detail });
});
