import { describe, it, expect } from "vitest";
import { makeTestDb } from "../test/helpers/db";
import { getSetting, setSetting, isCallingEnabled } from "./settings";

describe("settings KV", () => {
  it("returns undefined for an unset key", () => {
    const db = makeTestDb();
    expect(getSetting(db, "missing")).toBeUndefined();
  });

  it("sets and reads back a value (upsert)", () => {
    const db = makeTestDb();
    setSetting(db, "alerts_calling_enabled", "true");
    expect(getSetting(db, "alerts_calling_enabled")).toBe("true");
    setSetting(db, "alerts_calling_enabled", "false");
    expect(getSetting(db, "alerts_calling_enabled")).toBe("false");
  });

  it("isCallingEnabled defaults to false when unset and reflects the toggle", () => {
    const db = makeTestDb();
    expect(isCallingEnabled(db)).toBe(false);
    setSetting(db, "alerts_calling_enabled", "true");
    expect(isCallingEnabled(db)).toBe(true);
  });
});
