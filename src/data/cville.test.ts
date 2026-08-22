import { describe, expect, it } from "vitest";
import { CVILLE, cvilleDeck, isNearCville } from "./cville";

describe("cvilleDeck", () => {
  it("includes real Charlottesville burrito spots with addresses", () => {
    const deck = cvilleDeck(CVILLE);
    const names = deck.map((spot) => spot.name);
    expect(names).toContain("Barbie's Burrito Barn");
    expect(names).toContain("Taqueria El Comalito");
    expect(names).toContain("Desayuna con Gomez");
    expect(deck.every((spot) => spot.address.length > 0)).toBe(true);
    expect(deck.every((spot) => spot.photos.length > 0)).toBe(true);
    expect(deck.find((spot) => spot.id === "cville-chavo-jpa")?.signature?.price).toBe("$13.00");
    expect(deck.every((spot) => spot.lat > 37.9 && spot.lat < 38.2)).toBe(true);
  });

  it("treats downtown as near Charlottesville and San Francisco as not", () => {
    expect(isNearCville(CVILLE)).toBe(true);
    expect(isNearCville({ lat: 37.76, lon: -122.42 })).toBe(false);
  });
});
