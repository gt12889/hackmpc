import { describe, it, expect } from "vitest";
import { makeTestDb } from "../test/helpers/db";
import { getSetting, setSetting, isCallingEnabled, ALERTS_CALLING_ENABLED } from "./settings";

describe("settings KV", () => {
  it("returns undefined for an unset key", () => {
    const db = makeTestDb();
    expect(getSetting(db, "missing")).toBeUndefined();
  });

  it("sets and reads back a value (upsert)", () => {
    const db = makeTestDb();
    setSetting(db, ALERTS_CALLING_ENABLED, "true");
    expect(getSetting(db, ALERTS_CALLING_ENABLED)).toBe("true");
    setSetting(db, ALERTS_CALLING_ENABLED, "false");
    expect(getSetting(db, ALERTS_CALLING_ENABLED)).toBe("false");
  });

  it("isCallingEnabled defaults to false when unset and reflects the toggle", () => {
    const db = makeTestDb();
    expect(isCallingEnabled(db)).toBe(false);
    setSetting(db, ALERTS_CALLING_ENABLED, "true");
    expect(isCallingEnabled(db)).toBe(true);
  });
});
