import { describe, expect, it } from "vitest";
import { buildOverpassQuery } from "./places";

describe("buildOverpassQuery", () => {
  it("searches around the given coordinates", () => {
    const query = buildOverpassQuery({ lat: 37.76, lon: -122.42 }, 7000);
    expect(query).toContain("around:7000,37.76,-122.42");
    expect(query).toContain("burrito");
    expect(query).toContain("mexican");
  });
});
