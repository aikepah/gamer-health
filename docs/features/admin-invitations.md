# Feature: Admin Coach Invitations (#6)

**MVP 2, wave 1 — parallel-safe with #5 and #8 after #4 merges.**
Issue: [#6](https://github.com/aikepah/gamer-health/issues/6). Depends on #4.
Soft-depends on #5's `recordAdminAudit` helper — if #5 hasn't merged when
this builds, create `packages/core/src/admin/audit.ts` exactly as specified
in `docs/features/admin-users.md` (the specs define one identical file; the
later PR rebases onto it).

## Goal

An admin invites a coach by email and gets a copyable tokenized link (no
email sending in MVP). The recipient signs up / signs in, opens the link,
and — if their account email matches the invited email — becomes a coach.

## Fixed decisions

- **Token is stored in plaintext** (`coach_invite.token`, unique). Rationale:
  with no email delivery, the admin must be able to re-copy the link from
  `/admin/invites` at any time. The token is a 32-char
  `crypto.randomBytes(24).toString("base64url")` secret and grants only a
  role upgrade for a specific email. Documented tradeoff; revisit if invites
  ever carry more power.
- **Status is derived, never stored**: `revoked` (revokedAt set) >
  `accepted` (acceptedAt set) > `expired` (expiresAt < now) > `pending`.
  One core helper `coachInviteStatus(invite, now)` is the only place this
  ordering lives.
- **Email binding is strict**: the signed-in user's email must equal the
  invited email (both lowercased). No transfer, no "accept anyway".
- At most one pending, unexpired invite per email — enforced in core
  (expiry can't sit in a partial unique index), not the DB.
- Accepting when already `coach` is a no-op role-wise; already `admin` keeps
  admin (never demote); both still mark the invite accepted.

## Acceptance criteria

1. Admin creates an invite at `/admin/invites` (email + expiry days,
   default 14); the new row appears with a working "Copy link" action
   producing `<origin>/invite/<token>`.
2. Creating is rejected with a clear CONFLICT when the email already belongs
   to a coach/admin, or when a pending unexpired invite for it exists.
3. Revoke works on pending invites only; revoked/expired/accepted rows show
   the right status badge and no revoke/copy-link actions (copy allowed only
   while pending).
4. `/invite/<token>` renders correct states: unknown token (not found),
   expired, revoked, already accepted, pending+signed-out (sign-in/up CTA
   that returns to the invite), pending+wrong email (explains which email is
   required, offers sign-out), pending+matching email (Accept button).
5. Accepting flips the user's role to coach (visible in `/admin/users` and
   via the #4 nav gating), marks the invite accepted, writes an
   `invite_accept` audit row, and is idempotent-safe (second accept →
   CONFLICT with a friendly page state).
6. All lifecycle actions write audit rows (`invite_create`, `invite_revoke`,
   `invite_accept`).

## Core services (`packages/core/src/invites/`)

```ts
// status.ts
export type CoachInviteStatus = "pending" | "accepted" | "revoked" | "expired";
export function coachInviteStatus(
  invite: { revokedAt: Date | null; acceptedAt: Date | null; expiresAt: Date },
  now?: Date,
): CoachInviteStatus;

// createCoachInvite.ts
export const createCoachInviteInput = z.object({
  email: z.email().max(255).transform((e) => e.trim().toLowerCase()),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});
export async function createCoachInvite(ctx, input): Promise<{
  invite: CoachInviteRow; acceptPath: string;   // `/invite/${token}`
}>;
// requireRole admin. Guards (CONFLICT): user with this email already
// coach/admin; existing pending unexpired invite for this email ("revoke it
// first"). Insert + audit "invite_create" (target null, meta { email }).

// listCoachInvites.ts — no input beyond optional status filter
export const listCoachInvitesInput = z.object({
  status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
});
export async function listCoachInvites(ctx, input): Promise<{
  id: string; email: string; token: string; status: CoachInviteStatus;
  invitedBy: { userId: string; name: string };
  expiresAt: Date; createdAt: Date;
  acceptedAt: Date | null; revokedAt: Date | null;
}[]>;
// requireRole admin; newest first; filter applied after deriving status.

// revokeCoachInvite.ts
export const revokeCoachInviteInput = z.object({ inviteId: z.uuid() });
export async function revokeCoachInvite(ctx, input): Promise<CoachInviteRow>;
// requireRole admin; NOT_FOUND; status must be pending else CONFLICT.
// Sets revokedAt + audit "invite_revoke".

// getCoachInviteByToken.ts — PUBLIC (token is the credential)
export const getCoachInviteByTokenInput = z.object({
  token: z.string().min(1).max(64),
});
export async function getCoachInviteByToken(ctx, input): Promise<{
  email: string; status: CoachInviteStatus; expiresAt: Date;
}>;
// NOT_FOUND on unknown token. Returns only what the accept page needs.

// acceptCoachInvite.ts
export const acceptCoachInviteInput = z.object({
  token: z.string().min(1).max(64),
});
export async function acceptCoachInvite(ctx, input): Promise<{ role: UserRole }>;
// requireActiveUser (from #4). Load invite by token (NOT_FOUND). Status must
// be pending (else CONFLICT — message names the actual state). Load the
// caller's `user` row; lowercase(email) must equal invite.email else
// FORBIDDEN("This invite is for a different email address").
// Transaction: set acceptedAt/acceptedByUserId; upsert profile role
// (player → coach; coach/admin unchanged); audit "invite_accept"
// (actor = target = acceptor, meta { inviteId }).
```

## tRPC routes

- `packages/api/src/router/admin/invites.ts`, key `invites` in the admin
  router — all `adminProcedure`: `create`, `list`, `revoke`.
- `packages/api/src/router/invite.ts`, mounted `invite` in root.ts:
  `byToken` (**public** query → `getCoachInviteByToken`), `accept`
  (protected mutation → `acceptCoachInvite`).

## UI surfaces

- `/admin/invites`: create form (email input, expiry-days number input,
  submit) above a table (email, status badge, invited by, created, expires,
  actions). Actions per AC 3; "Copy link" uses
  `navigator.clipboard.writeText(new URL(acceptPath, window.location.origin))`
  with a toast.
- `/invite/[token]` (public route, outside the authed shell): fetches
  `invite.byToken`; renders the states in AC 4. Signed-out CTA links to the
  existing sign-in/sign-up pages with a redirect back to
  `/invite/<token>` (verify the auth pages honor a callback/redirect param;
  if they don't, add support — smallest possible change). On accept success:
  confirmation state + link to the home page.

## Seed additions (delete-then-insert `coach_invite` rows by these emails)

- Pending: `pending-coach@gamerhealth.dev`, **fixed token**
  `seed-pending-coach-invite-token` (deterministic for tests/verification),
  expires 14 days from seed run, invited by demo admin.
- Expired: `expired-coach@gamerhealth.dev`, created −30d, expired −16d.
- Revoked: `revoked-coach@gamerhealth.dev`, revoked −1d.
- Accepted: `coach@gamerhealth.dev`, accepted by the demo coach (ties the
  seeded coach's origin story together), accepted −7d.
- Matching `invite_create` audit rows are optional; skip to keep the section
  small.

## Non-goals

- No email sending or reminders, no player invites, no multi-use or quota
  invites, no token hashing (see decisions), no rate limiting, no invite
  editing (revoke + recreate instead).

## Dependencies / provides

- Uses #4: `requireRole`, `requireActiveUser`, `adminProcedure`, admin
  router skeleton. Uses #5's audit helper (or creates it, see header).
- Provides: the coach onboarding path used by wave 2 (#9 coach profiles
  assume coaches exist).
