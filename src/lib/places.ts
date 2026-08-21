import { fallbackDeck } from "../data/cities";
import { photoForId } from "../data/photos";
import type { Coords, Spot } from "../types";
import { formatNeighborhood, haversineMiles, mapsUrl } from "./geo";

type OverpassElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function heatFor(name: string, tags: Record<string, string>, miles: number): number {
  let score = 70;
  const haystack = `${name} ${tags.cuisine ?? ""} ${tags.description ?? ""}`.toLowerCase();
  if (haystack.includes("burrito")) score += 16;
  if (haystack.includes("taqueria")) score += 10;
  if (haystack.includes("mexican")) score += 6;
  if (haystack.includes("tex-mex")) score += 5;
  if (tags.website || tags.contact_website) score += 4;
  if (tags.opening_hours) score += 3;
  if (miles < 0.5) score += 6;
  else if (miles < 1.5) score += 3;
  return Math.max(68, Math.min(99, score));
}

function blurbFor(name: string, tags: Record<string, string>, miles: number): string {
  const cuisine = (tags.cuisine ?? "").replaceAll(";", ", ");
  if (name.toLowerCase().includes("burrito")) {
    return "The name is doing a lot of the work. Swipe and find out if the foil holds up.";
  }
  if (cuisine.includes("mexican")) {
    return miles < 1
      ? "Close enough that the tortilla will still be warm when you get there."
      : "A Mexican spot with burrito potential. Trust the heat score, then the salsa.";
  }
  return "OpenStreetMap thinks this is foil-adjacent. Your mouth gets the final vote.";
}

function tagsFor(name: string, tags: Record<string, string>): string[] {
  const next = new Set<string>();
  const cuisine = (tags.cuisine ?? "").toLowerCase();
  if (name.toLowerCase().includes("burrito") || cuisine.includes("burrito")) next.add("burrito");
  if (cuisine.includes("mexican")) next.add("mexican");
  if (cuisine.includes("tex-mex")) next.add("tex-mex");
  if (tags.takeaway === "yes") next.add("takeout");
  if (tags.opening_hours?.includes("24/7")) next.add("24/7");
  if (next.size === 0) next.add("nearby");
  return [...next].slice(0, 3);
}

function toSpot(element: OverpassElement, origin: Coords): Spot | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (!name || lat == null || lon == null) return null;

  const coords = { lat, lon };
  const distanceMiles = haversineMiles(origin, coords);
  const id = `osm-${element.type}-${element.id}`;

  return {
    id,
    name,
    lat,
    lon,
    distanceMiles,
    neighborhood: tags["addr:suburb"] || tags["addr:neighbourhood"] || formatNeighborhood(origin, coords),
    blurb: blurbFor(name, tags, distanceMiles),
    tags: tagsFor(name, tags),
    photo: photoForId(id),
    heat: heatFor(name, tags, distanceMiles),
    mapsUrl: mapsUrl(lat, lon, name),
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
      body: `data=${encodeURIComponent(buildOverpassQuery(origin, 7000))}`,
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

    return spots.sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, 30);
  } finally {
    window.clearTimeout(timer);
  }
}

export async function loadDeck(origin: Coords): Promise<{ spots: Spot[]; live: boolean }> {
  try {
    const live = await fetchLiveSpots(origin);
    if (live.length >= 4) return { spots: live, live: true };
    const curated = fallbackDeck(origin);
    const merged = [...live];
    for (const spot of curated) {
      if (!merged.some((item) => item.name.toLowerCase() === spot.name.toLowerCase())) {
        merged.push(spot);
      }
    }
    return { spots: merged.sort((a, b) => a.distanceMiles - b.distanceMiles), live: live.length > 0 };
  } catch {
    return { spots: fallbackDeck(origin), live: false };
  }
}
