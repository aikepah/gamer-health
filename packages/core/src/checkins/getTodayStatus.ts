import type { ServiceCtx } from "../ctx";
import { requireUserId } from "../lib/auth";
import { findTodayDailyCheckin } from "./dailyGuard";

export interface TodayCheckinStatus {
  hasDaily: boolean;
}

/** Whether the caller already has a `daily` check-in for today (profile timezone). */
export async function getTodayCheckinStatus(
  ctx: ServiceCtx,
): Promise<TodayCheckinStatus> {
  const userId = requireUserId(ctx);
  const existingToday = await findTodayDailyCheckin(ctx, userId);
  return { hasDaily: existingToday !== null };
}
