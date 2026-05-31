import { describe, it, expect } from "vitest";
import { makeTestDb } from "./helpers/db";

describe("test infrastructure", () => {
  it("creates an in-memory db with the app schema", () => {
    const db = makeTestDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("transactions");
    expect(names).toContain("violations");
  });
});
