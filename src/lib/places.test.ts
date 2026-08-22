import { describe, expect, it } from "vitest";
import { buildOverpassQuery } from "./places";

describe("buildOverpassQuery", () => {
  it("searches around the given coordinates", () => {
    const query = buildOverpassQuery({ lat: 38.0293, lon: -78.4767 }, 16000);
    expect(query).toContain("around:16000,38.0293,-78.4767");
    expect(query).toContain("burrito");
    expect(query).toContain("mexican");
  });
});
