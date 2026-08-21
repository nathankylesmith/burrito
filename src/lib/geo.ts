import type { Coords } from "../types";

const EARTH_MILES = 3958.8;

export function haversineMiles(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(miles: number): string {
  if (miles < 0.08) return "right here";
  if (miles < 0.95) return `${Math.max(0.1, miles).toFixed(1)} mi`;
  return `${miles.toFixed(1)} mi`;
}

export function mapsUrl(lat: number, lon: number, name: string): string {
  const query = encodeURIComponent(`${name} @${lat},${lon}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function formatNeighborhood(origin: Coords, spot: Coords): string {
  const miles = haversineMiles(origin, spot);
  if (miles < 0.4) return "Around the corner";
  if (miles < 1.5) return "In the neighborhood";
  if (miles < 4) return "A short foil run";
  return "Worth the trip";
}

export function readBrowserLocation(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(error.message || "Location permission was denied."));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}
