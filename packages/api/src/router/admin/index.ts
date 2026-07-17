import { createTRPCRouter } from "../../trpc";

/**
 * Admin router skeleton (docs/features/roles-authorization.md, #4). #5/#6/#7
 * each add one key here (`users`, `invites`, `content`) — keeping additions
 * to this single file is what keeps their root.ts merges conflict-free.
 */
export const adminRouter = createTRPCRouter({});
