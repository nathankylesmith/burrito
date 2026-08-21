import { describe, expect, it } from "vitest";
import { formatDistance, haversineMiles } from "./geo";

describe("haversineMiles", () => {
  it("returns 0 for the same point", () => {
    expect(haversineMiles({ lat: 37.75, lon: -122.41 }, { lat: 37.75, lon: -122.41 })).toBe(0);
  });

  it("measures Mission to downtown SF as a few miles", () => {
    const miles = haversineMiles(
      { lat: 37.7599, lon: -122.4148 },
      { lat: 37.784, lon: -122.409 },
    );
    expect(miles).toBeGreaterThan(1);
    expect(miles).toBeLessThan(3);
  });
});

describe("formatDistance", () => {
  it("uses a nearby label for tiny distances", () => {
    expect(formatDistance(0.02)).toBe("right here");
  });

  it("keeps one decimal for walkable distances", () => {
    expect(formatDistance(0.42)).toBe("0.4 mi");
    expect(formatDistance(2.36)).toBe("2.4 mi");
  });
});
