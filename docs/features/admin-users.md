# Feature: Admin User Management (#5)

**MVP 2, wave 1 — parallel-safe with #6 and #8 after #4 merges.**
Issue: [#5](https://github.com/aikepah/gamer-health/issues/5). Depends on #4.

## Goal

An `/admin/users` console: list/search users with role and coarse activity,
change roles, deactivate/reactivate accounts — with privileged actions
recorded in `admin_audit_log` and a last-admin lockout guard.

## Fixed decisions

- Activity shown to admins is **coarse aggregates only** (session count,
  check-in count, last-active timestamp) — never wellness detail (moods,
  notes). Detail access is the coach's, gated by #11.
- Audit rows are written by a shared core helper and are append-only; the
  taxonomy is plain-text constants in core (like reward events), not an enum.
- Last-admin guard: any action that would leave zero **active admins**
  (role change away from admin, or deactivating an admin) fails with
  `CONFLICT`.
- Admins cannot deactivate themselves (`BAD_REQUEST`) — prevents the
  lockout footgun; another admin can do it.
- Deactivation revokes live Better Auth sessions (delete the user's rows in
  the auth `session` table) so the FORBIDDEN gate from #4 takes effect
  immediately.

## Acceptance criteria

1. `/admin/users` lists all users (name, email, role badge, active status,
   joined date, session/check-in counts, last active), searchable by
   name/email substring and filterable by role; deactivated rows visibly
   dimmed. Simple offset pagination (50/page, prev/next).
2. Changing a role via the row's role select (with confirm dialog) persists,
   writes a `role_change` audit row, and is blocked with a clear error when
   it would demote the last active admin.
3. Deactivate/reactivate works with confirm, writes audit rows, kills the
   target's live sessions, and respects the last-admin and self-target
   guards. A deactivated account can no longer use the app (per #4).
4. A "Recent admin activity" panel on the page shows the latest audit
   entries (actor, action, target, when).
5. Role changes for users **without a profile row** work (the upsert creates
   the row with `platforms: []`).

## Core services (`packages/core/src/admin/`)

Shared helper first:

```ts
// audit.ts
export const ADMIN_AUDIT_ACTIONS = [
  "role_change", "user_deactivate", "user_reactivate",
  "invite_create", "invite_revoke", "invite_accept",           // used by #6
  "game_rename", "game_merge", "game_delete",                  // used by #7
  "habit_def_create", "habit_def_update", "habit_def_archive",
  "habit_def_unarchive", "habit_def_delete",                   // used by #7
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];
export async function recordAdminAudit(
  db: ServiceCtx["db"] | TxDb,
  entry: { actorUserId: string; targetUserId?: string | null;
           action: AdminAuditAction; meta?: Record<string, unknown> },
): Promise<void>;
```

```ts
// listUsers.ts
export const listUsersInput = z.object({
  query: z.string().trim().max(255).optional(),        // ILIKE on name OR email
  role: z.enum(USER_ROLES).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export async function listUsers(ctx, input): Promise<{
  total: number;
  users: {
    userId: string; name: string; email: string;
    role: UserRole; deactivatedAt: Date | null; createdAt: Date;
    sessionCount: number; checkinCount: number; lastActiveAt: Date | null;
  }[];
}>;
// requireRole(ctx, ["admin"]). LEFT JOIN profile (missing → player/active);
// counts via grouped subqueries; lastActiveAt = greatest(max game_session
// .startedAt, max checkin.createdAt), null when neither exists. Order by
// createdAt desc.

// setUserRole.ts
export const setUserRoleInput = z.object({
  userId: z.string().min(1),
  role: z.enum(USER_ROLES),
});
export async function setUserRole(ctx, input): Promise<{ userId: string; role: UserRole }>;
// requireRole admin; target user must exist (NOT_FOUND); same role → return
// unchanged, no audit. If target's current role is admin and new role isn't:
// count OTHER admins with deactivatedAt null — 0 → CONFLICT("last active
// admin"). Transaction: upsert profile role + recordAdminAudit("role_change",
// meta { from, to }).

// setUserActivation.ts
export const setUserActivationInput = z.object({
  userId: z.string().min(1),
  active: z.boolean(),
});
export async function setUserActivation(ctx, input): Promise<{ userId: string; deactivatedAt: Date | null }>;
// requireRole admin; target exists (NOT_FOUND); target === self →
// BAD_REQUEST. Already in requested state → return unchanged, no audit.
// Deactivating an active admin who is the last active admin → CONFLICT.
// Transaction: upsert profile deactivatedAt (now / null); on deactivate also
// delete the target's Better Auth `session` rows; audit
// "user_deactivate" / "user_reactivate".

// listAdminAuditLog.ts
export const listAdminAuditLogInput = z.object({
  targetUserId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export async function listAdminAuditLog(ctx, input): Promise<{
  id: string; action: string; meta: Record<string, unknown>; createdAt: Date;
  actor: { userId: string; name: string; email: string };
  target: { userId: string; name: string; email: string } | null;
}[]>;
// requireRole admin; newest first.
```

## tRPC routes (`packages/api/src/router/admin/users.ts`, key `users` in the admin router)

All `adminProcedure` one-liners: `list` (query), `setRole` (mutation),
`setActivation` (mutation), `auditLog` (query).

## UI surfaces

- `/admin/users` page: debounced search input + role filter select; table as
  in AC 1; per-row role `Select` (confirm dialog before mutate) and
  Deactivate/Reactivate button (confirm dialog); toasts on success, error
  toast surfacing CONFLICT/BAD_REQUEST messages; invalidate list on success.
- Audit panel below the table: latest 20 entries from `auditLog`.

## Seed additions

- Three extra players via the Better Auth pattern:
  `player1@gamerhealth.dev` ("Riley Chen"), `player2@gamerhealth.dev`
  ("Sam Okafor"), `player3@gamerhealth.dev` ("Jordan Blake"), password
  `demo1234`, default profiles (role player, `platforms: []`).
  `player3` deactivated (`deactivatedAt` set).
- Audit rows (delete-then-insert by actor = demo admin): one `role_change`
  (demo coach player→coach) and one `user_deactivate` (player3), so the
  audit panel is populated from a fresh seed.

## Non-goals

- No user deletion, no email/name editing, no impersonation, no password
  reset, no per-user drill-down page, no CSV export, no audit UI beyond the
  recent-activity panel.

## Dependencies / provides

- Uses #4: `requireRole`, `adminProcedure`, admin router skeleton, seeded
  admin. Uses auth `session` table for revocation.
- Provides: `recordAdminAudit` + `ADMIN_AUDIT_ACTIONS` (extended, not
  redefined, by #6/#7 — coordinate: this file owns the constant; #6/#7 add
  values only if this PR hasn't already listed them, which it has).
