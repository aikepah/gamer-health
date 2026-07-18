import { describe, expect, it } from "vitest";

import { coachInviteStatus } from "./status";

describe("coachInviteStatus", () => {
  const now = new Date("2026-01-15T00:00:00Z");

  it("returns revoked when revokedAt is set, even if also expired", () => {
    expect(
      coachInviteStatus(
        {
          revokedAt: new Date("2026-01-10T00:00:00Z"),
          acceptedAt: null,
          expiresAt: new Date("2026-01-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe("revoked");
  });

  it("returns accepted when acceptedAt is set and not revoked, even if also expired", () => {
    expect(
      coachInviteStatus(
        {
          revokedAt: null,
          acceptedAt: new Date("2026-01-10T00:00:00Z"),
          expiresAt: new Date("2026-01-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe("accepted");
  });

  it("returns expired when expiresAt is in the past and neither revoked nor accepted", () => {
    expect(
      coachInviteStatus(
        {
          revokedAt: null,
          acceptedAt: null,
          expiresAt: new Date("2026-01-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe("expired");
  });

  it("returns pending otherwise", () => {
    expect(
      coachInviteStatus(
        {
          revokedAt: null,
          acceptedAt: null,
          expiresAt: new Date("2026-02-01T00:00:00Z"),
        },
        now,
      ),
    ).toBe("pending");
  });

  it("defaults `now` to the current time when omitted", () => {
    const future = new Date(Date.now() + 60_000);
    expect(
      coachInviteStatus({
        revokedAt: null,
        acceptedAt: null,
        expiresAt: future,
      }),
    ).toBe("pending");
  });
});
