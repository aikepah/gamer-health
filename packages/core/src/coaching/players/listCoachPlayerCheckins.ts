import { z } from "zod/v4";

import type { ListCheckinsResult } from "../../checkins/listCheckins";
import type { ServiceCtx } from "../../ctx";
import { assertCoachOf } from "../../authz/assertCoachOf";
import {
  listCheckinsFor,
  listCheckinsInput,
} from "../../checkins/listCheckins";

export const listCoachPlayerCheckinsInput = listCheckinsInput.extend({
  playerUserId: z.string().min(1),
});
export type ListCoachPlayerCheckinsInput = z.infer<
  typeof listCoachPlayerCheckinsInput
>;

/**
 * Paginated check-in history (mood/energy/sleep + notes) for a roster
 * player (#12), reusing `listCheckinsFor` pointed at `input.playerUserId`.
 * Free-text notes are included — they're wellness content the player wrote
 * while coached, and the point of this feature. `assertCoachOf` runs first,
 * as the only authorization check this service needs.
 */
export async function listCoachPlayerCheckins(
  ctx: ServiceCtx,
  input: ListCoachPlayerCheckinsInput,
): Promise<ListCheckinsResult> {
  await assertCoachOf(ctx, input.playerUserId);

  const { playerUserId, ...rest } = input;
  return listCheckinsFor(ctx, playerUserId, rest);
}
