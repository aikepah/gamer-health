import { z } from "zod/v4";

import type { ServiceCtx } from "../../ctx";
import type { ListSessionsResult } from "../../sessions/listSessions";
import { assertCoachOf } from "../../authz/assertCoachOf";
import {
  listSessionsFor,
  listSessionsInput,
} from "../../sessions/listSessions";

export const listCoachPlayerSessionsInput = listSessionsInput.extend({
  playerUserId: z.string().min(1),
});
export type ListCoachPlayerSessionsInput = z.infer<
  typeof listCoachPlayerSessionsInput
>;

/**
 * Paginated session history for a roster player (#12), reusing
 * `listSessionsFor` pointed at `input.playerUserId`. `assertCoachOf` runs
 * first, as the only authorization check this service needs.
 */
export async function listCoachPlayerSessions(
  ctx: ServiceCtx,
  input: ListCoachPlayerSessionsInput,
): Promise<ListSessionsResult> {
  await assertCoachOf(ctx, input.playerUserId);

  const { playerUserId, ...rest } = input;
  return listSessionsFor(ctx, playerUserId, rest);
}
