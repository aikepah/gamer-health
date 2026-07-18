import { describe, expect, it, vi } from "vitest";

import { AdminAuditLog } from "@gamer-health/db/schema";

import type { ServiceCtx } from "../ctx";
import { recordAdminAudit } from "./audit";

describe("recordAdminAudit", () => {
  it("inserts a row with the given actor/target/action/meta", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn((table: unknown) => {
      expect(table).toBe(AdminAuditLog);
      return { values };
    });
    const db = { insert } as unknown as ServiceCtx["db"];

    await recordAdminAudit(db, {
      actorUserId: "admin_1",
      targetUserId: "user_1",
      action: "role_change",
      meta: { from: "player", to: "coach" },
    });

    expect(values).toHaveBeenCalledWith({
      actorUserId: "admin_1",
      targetUserId: "user_1",
      action: "role_change",
      meta: { from: "player", to: "coach" },
    });
  });

  it("defaults targetUserId to null and meta to {} when omitted", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const db = { insert } as unknown as ServiceCtx["db"];

    await recordAdminAudit(db, {
      actorUserId: "admin_1",
      action: "game_delete",
    });

    expect(values).toHaveBeenCalledWith({
      actorUserId: "admin_1",
      targetUserId: null,
      action: "game_delete",
      meta: {},
    });
  });
});
