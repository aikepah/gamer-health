import { createTRPCRouter } from "../../trpc";
import { invitesRouter } from "./invites";
import { usersRouter } from "./users";

/**
 * Admin router skeleton (docs/features/roles-authorization.md, #4). #5/#6/#7
 * each add one key here (`users`, `invites`, `content`) — keeping additions
 * to this single file is what keeps their root.ts merges conflict-free.
 */
export const adminRouter = createTRPCRouter({
  invites: invitesRouter,
  users: usersRouter,
});
