import { describe, it, expect } from "vitest";
import { suggestValue } from "./queries";

const CATS = ["Fuel", "Tolls & Border", "Office & Admin", "Maintenance & Repair", "Permits & Compliance"];

describe("suggestValue (chat disambiguation)", () => {
  it("matches on substring (case-insensitive)", () => {
    expect(suggestValue("fuel", CATS)).toContain("Fuel");
    expect(suggestValue("toll", CATS)).toContain("Tolls & Border");
  });

  it("matches on token overlap when no substring", () => {
    expect(suggestValue("repair", CATS)).toContain("Maintenance & Repair");
    expect(suggestValue("compliance", CATS)).toContain("Permits & Compliance");
  });

  it("returns [] when nothing is close", () => {
    expect(suggestValue("cryptocurrency", CATS)).toEqual([]);
  });

  it("caps to the limit", () => {
    expect(suggestValue("&", CATS, 2).length).toBeLessThanOrEqual(2);
  });
});
