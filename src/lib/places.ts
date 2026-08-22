import { CVILLE, cvilleDeck, localNames } from "../data/cville";
import { photoForId } from "../data/photos";
import type { Coords, Spot } from "../types";
import { haversineMiles, mapsUrl } from "./geo";

type OverpassElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CHAINS = /taco bell|chipotle|torchy/i;

function addressFor(tags: Record<string, string>): string {
  const number = tags["addr:housenumber"];
  const street = tags["addr:street"];
  if (number && street) return `${number} ${street}`;
  return street ?? "Charlottesville";
}

function hoursFor(tags: Record<string, string>): string {
  return tags.opening_hours?.replaceAll(";", " · ") ?? "Hours not listed";
}

function tagsFor(name: string, tags: Record<string, string>): string[] {
  const next = new Set<string>();
  const cuisine = (tags.cuisine ?? "").toLowerCase();
  if (name.toLowerCase().includes("burrito") || cuisine.includes("burrito")) next.add("burrito");
  if (name.toLowerCase().includes("taqueria") || cuisine.includes("mexican")) next.add("mexican");
  if (cuisine.includes("tex-mex")) next.add("tex-mex");
  if (tags.takeaway === "yes") next.add("takeout");
  if (next.size === 0) next.add("nearby");
  return [...next].slice(0, 3);
}

function toSpot(element: OverpassElement, origin: Coords): Spot | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (!name || lat == null || lon == null) return null;
  if (CHAINS.test(name)) return null;

  const coords = { lat, lon };
  const id = `osm-${element.type}-${element.id}`;
  const address = addressFor(tags);

  return {
    id,
    name,
    lat,
    lon,
    distanceMiles: haversineMiles(origin, coords),
    neighborhood: tags["addr:suburb"] || tags["addr:neighbourhood"] || "Charlottesville",
    address,
    hours: hoursFor(tags),
    phone: tags.phone ?? tags["contact:phone"] ?? null,
    website: tags.website ?? tags["contact:website"] ?? null,
    blurb: `${address}. Extra OSM listing. No posted burrito menu in our file yet.`,
    tags: tagsFor(name, tags),
    photos: [photoForId(id)],
    photoCredit: null,
    rating: null,
    reviewCount: null,
    ratingSource: null,
    priceRange: "n/a",
    signature: null,
    menu: [],
    reviews: [],
    mapsUrl: mapsUrl(lat, lon, `${name} ${address} Charlottesville VA`),
    source: "live",
  };
}

export function buildOverpassQuery(origin: Coords, radiusMeters: number): string {
  const { lat, lon } = origin;
  return `
    [out:json][timeout:20];
    (
      nwr["amenity"~"restaurant|fast_food|cafe"]["cuisine"~"mexican|tex-mex|latin|burrito",i](around:${radiusMeters},${lat},${lon});
      nwr["amenity"~"restaurant|fast_food|cafe"]["name"~"burrito|taqueria|taco",i](around:${radiusMeters},${lat},${lon});
    );
    out center 40;
  `.trim();
}

export async function fetchLiveSpots(origin: Coords): Promise<Spot[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      body: `data=${encodeURIComponent(buildOverpassQuery(origin, 16000))}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
    const payload = (await response.json()) as { elements?: OverpassElement[] };
    const seen = new Set<string>();
    const spots: Spot[] = [];

    for (const element of payload.elements ?? []) {
      const spot = toSpot(element, origin);
      if (!spot) continue;
      const key = `${spot.name.toLowerCase()}|${spot.lat.toFixed(3)}|${spot.lon.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      spots.push(spot);
    }

    return spots.sort((a, b) => a.distanceMiles - b.distanceMiles);
  } finally {
    window.clearTimeout(timer);
  }
}

export async function loadDeck(origin: Coords = CVILLE): Promise<{ spots: Spot[]; live: boolean }> {
  const known = cvilleDeck(origin);
  const knownNames = new Set(localNames());

  try {
    const live = await fetchLiveSpots(origin);
    const extras = live.filter((spot) => {
      const name = spot.name.toLowerCase();
      return ![...knownNames].some((knownName) => name.includes(knownName) || knownName.includes(name));
    });
    return {
      spots: [...known, ...extras].sort((a, b) => a.distanceMiles - b.distanceMiles),
      live: true,
    };
  } catch {
    return { spots: known, live: false };
  }
}
