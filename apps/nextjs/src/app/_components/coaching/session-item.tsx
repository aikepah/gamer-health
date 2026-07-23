import type { RouterOutputs } from "@gamer-health/api";

import { formatSessionWindow } from "~/lib/format";

export type SessionListRow =
  RouterOutputs["coaching"]["sessions"]["list"][number];

/**
 * Derives the human label for a session's status (#15): there's no
 * `declined` status in the schema — a coach declining a proposal is a
 * `cancelled` row with `confirmedAt IS NULL`, distinguished from a
 * cancellation-after-confirmation, and `cancelledByUserId` says who acted.
 * This is pure display derivation from those three already-fetched fields —
 * no business decision, so it lives here rather than in `packages/core`.
 */
export function sessionStatusLabel(
  session: Pick<
    SessionListRow,
    | "status"
    | "confirmedAt"
    | "cancelledByUserId"
    | "playerUserId"
    | "coachUserId"
  >,
  viewerUserId: string | undefined,
): string {
  switch (session.status) {
    case "proposed":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "completed":
      return "Completed";
    case "cancelled": {
      const byViewer = session.cancelledByUserId === viewerUserId;
      const byCoach = session.cancelledByUserId === session.coachUserId;
      if (session.confirmedAt == null) {
        // Never confirmed: either the coach declined it, or the player
        // withdrew their own proposal before a response.
        if (byCoach) {
          return byViewer ? "Declined by you" : "Declined by your coach";
        }
        return byViewer ? "Withdrawn by you" : "Withdrawn by the player";
      }
      return byViewer ? "Cancelled by you" : "Cancelled by the other side";
    }
    default:
      return session.status;
  }
}

/** One session row (#15), shared by the player list, coach page, and scheduler. */
export function SessionItem({
  session,
  viewerUserId,
  otherPartyLabel,
  actions,
}: {
  session: SessionListRow;
  viewerUserId: string | undefined;
  /** "Coaching with Demo Coach" / "Session with Riley Chen" — caller decides the phrasing. */
  otherPartyLabel: string;
  actions?: React.ReactNode;
}) {
  const statusLabel = sessionStatusLabel(session, viewerUserId);
  const toneClass =
    session.status === "cancelled"
      ? "text-destructive"
      : session.status === "completed"
        ? "text-muted-foreground"
        : session.status === "confirmed"
          ? "text-primary"
          : "text-muted-foreground";

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{otherPartyLabel}</p>
          <p className="text-muted-foreground text-sm">
            {/* The coach's own timezone isn't in this row, so omit it — the
                formatter suppresses the "(coach's time: …)" suffix when it's
                absent rather than being handed a placeholder zone. */}
            {formatSessionWindow(session.startsAt, session.endsAt)}
          </p>
        </div>
        <span className={`text-xs font-semibold ${toneClass}`}>
          {statusLabel}
        </span>
      </div>
      {session.note && <p className="text-sm">{session.note}</p>}
      {session.status === "cancelled" && session.cancelReason && (
        <p className="text-muted-foreground text-xs italic">
          "{session.cancelReason}"
        </p>
      )}
      {actions && <div className="mt-1 flex gap-2">{actions}</div>}
    </li>
  );
}
