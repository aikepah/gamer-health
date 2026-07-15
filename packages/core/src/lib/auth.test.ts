import { describe, expect, it } from "vitest";

import type { ServiceCtx } from "../ctx";
import { requireUserId } from "./auth";
import { CoreError } from "./errors";

function makeCtx(userId: string | null): ServiceCtx {
  return { db: {} as ServiceCtx["db"], userId };
}

describe("requireUserId", () => {
  it("returns the userId when present", () => {
    expect(requireUserId(makeCtx("user_1"))).toBe("user_1");
  });

  it("throws CoreError(UNAUTHORIZED) when userId is null", () => {
    expect(() => requireUserId(makeCtx(null))).toThrowError(CoreError);
    try {
      requireUserId(makeCtx(null));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CoreError);
      expect((err as CoreError).code).toBe("UNAUTHORIZED");
    }
  });
});
