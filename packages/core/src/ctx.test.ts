import { describe, expect, it } from "vitest";

import type { ServiceCtx } from "./ctx";

describe("ServiceCtx", () => {
  it("is satisfied by a minimal shape", () => {
    const ctx = {
      db: {} as ServiceCtx["db"],
      userId: null,
    } satisfies ServiceCtx;
    expect(ctx.userId).toBeNull();
  });
});
