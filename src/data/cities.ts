import type { City, Coords, Spot } from "../types";
import { photoForId } from "./photos";
import { formatNeighborhood, haversineMiles, mapsUrl } from "../lib/geo";

export const CITIES: City[] = [
  {
    id: "sf",
    name: "San Francisco",
    region: "Mission District energy",
    coords: { lat: 37.7599, lon: -122.4148 },
    vibe: "The spiritual home of the foil-wrapped burrito.",
  },
  {
    id: "austin",
    name: "Austin",
    region: "Breakfast burrito capital",
    coords: { lat: 30.2672, lon: -97.7431 },
    vibe: "Migas, brisket, and a little too much hot sauce.",
  },
  {
    id: "sd",
    name: "San Diego",
    region: "California burrito country",
    coords: { lat: 32.7157, lon: -117.1611 },
    vibe: "Fries inside the burrito is not a debate. It is law.",
  },
  {
    id: "la",
    name: "Los Angeles",
    region: "Truck and shop circuit",
    coords: { lat: 34.0522, lon: -118.2437 },
    vibe: "Al pastor glow and late-night foil.",
  },
  {
    id: "denver",
    name: "Denver",
    region: "Green chile belt",
    coords: { lat: 39.7392, lon: -104.9903 },
    vibe: "Smothered, sloppy, and proud of it.",
  },
  {
    id: "nyc",
    name: "New York",
    region: "Surprisingly strong field",
    coords: { lat: 40.7282, lon: -73.9942 },
    vibe: "Tiny kitchens, huge opinions.",
  },
];

type CuratedSpot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  neighborhood: string;
  blurb: string;
  tags: string[];
  heat: number;
};

const CURATED: Record<string, CuratedSpot[]> = {
  sf: [
    {
      id: "sf-la-taqueria",
      name: "La Taqueria",
      lat: 37.7509,
      lon: -122.418,
      neighborhood: "Mission",
      blurb: "No rice. Just meat, salsa, and a reputation that starts arguments.",
      tags: ["mission-style", "carne asada", "cash-only energy"],
      heat: 98,
    },
    {
      id: "sf-el-farolito",
      name: "El Farolito",
      lat: 37.7527,
      lon: -122.4061,
      neighborhood: "Mission",
      blurb: "Open late, wrapped tight, and somehow always the move.",
      tags: ["late night", "super burrito", "foil art"],
      heat: 96,
    },
    {
      id: "sf-castillito",
      name: "Taqueria El Castillito",
      lat: 37.7648,
      lon: -122.4316,
      neighborhood: "Castro / Mission",
      blurb: "A quieter crush. Still hits like a first date that goes well.",
      tags: ["california", "salsa bar", "weeknight"],
      heat: 88,
    },
    {
      id: "sf-papalote",
      name: "Papalote",
      lat: 37.7514,
      lon: -122.4192,
      neighborhood: "Mission",
      blurb: "Roasted salsa so good it should have its own dating profile.",
      tags: ["salsa", "vegetarian-friendly", "sit-down"],
      heat: 90,
    },
    {
      id: "sf-chihuahua",
      name: "The Little Chihuahua",
      lat: 37.7703,
      lon: -122.445,
      neighborhood: "Lower Haight",
      blurb: "Organic-ish, still messy, still a burrito. A modern romance.",
      tags: ["organic", "guac", "date-adjacent"],
      heat: 84,
    },
    {
      id: "sf-cancun",
      name: "Taqueria Cancún",
      lat: 37.7605,
      lon: -122.4212,
      neighborhood: "Mission",
      blurb: "Fluorescent lights, giant foil torpedoes, zero pretense.",
      tags: ["huge", "al pastor", "no frills"],
      heat: 92,
    },
  ],
  austin: [
    {
      id: "atx-veracruz",
      name: "Veracruz All Natural",
      lat: 30.257,
      lon: -97.7267,
      neighborhood: "East Austin",
      blurb: "The migas burrito that ruined other breakfasts for a generation.",
      tags: ["migas", "breakfast", "trailer"],
      heat: 97,
    },
    {
      id: "atx-valentinas",
      name: "Valentina's Tex Mex BBQ",
      lat: 30.1616,
      lon: -97.7928,
      neighborhood: "South Austin",
      blurb: "Brisket in a tortilla. That is the entire pitch. It works.",
      tags: ["brisket", "tex-mex", "smoke"],
      heat: 95,
    },
    {
      id: "atx-torchys",
      name: "Torchy's Tacos",
      lat: 30.2637,
      lon: -97.744,
      neighborhood: "Downtown",
      blurb: "Not a purist pick. Still a reliable 1 a.m. situation.",
      tags: ["damn good", "chain-local", "queso"],
      heat: 82,
    },
    {
      id: "atx-tacodeli",
      name: "Tacodeli",
      lat: 30.3055,
      lon: -97.749,
      neighborhood: "Central Austin",
      blurb: "Cowboy taco energy, but the breakfast burrito is the sleeper.",
      tags: ["breakfast", "local", "pico"],
      heat: 86,
    },
    {
      id: "atx-chilito",
      name: "El Chilito",
      lat: 30.2849,
      lon: -97.7195,
      neighborhood: "East Austin",
      blurb: "Patio, salsa, and the kind of burrito you eat in the car anyway.",
      tags: ["casual", "salsa", "weekday"],
      heat: 85,
    },
  ],
  sd: [
    {
      id: "sd-karinas",
      name: "Karina's Taco Shop",
      lat: 32.8328,
      lon: -117.1614,
      neighborhood: "Clairemont",
      blurb: "California burrito with the correct ratio of fries to regret.",
      tags: ["california", "carne asada fries", "local legend"],
      heat: 94,
    },
    {
      id: "sd-lolitas",
      name: "Lolita's Mexican Food",
      lat: 32.832,
      lon: -117.2046,
      neighborhood: "Clairemont",
      blurb: "A city-wide crush. Everyone has a location they swear is the one.",
      tags: ["california", "carne asada", "classic"],
      heat: 91,
    },
    {
      id: "sd-cotixan",
      name: "Cotixan Mexican Food",
      lat: 32.8322,
      lon: -117.204,
      neighborhood: "Linda Vista",
      blurb: "Old-school shop energy. The foil still has something to prove.",
      tags: ["old school", "super", "carne asada"],
      heat: 89,
    },
    {
      id: "sd-zarape",
      name: "El Zarape",
      lat: 32.7554,
      lon: -117.1307,
      neighborhood: "University Heights",
      blurb: "Rolled tacos get the fame. The burrito is the better date.",
      tags: ["neighborhood", "late-ish", "comfort"],
      heat: 87,
    },
  ],
  la: [
    {
      id: "la-guisados",
      name: "Guisados",
      lat: 34.0704,
      lon: -118.211,
      neighborhood: "Boyle Heights",
      blurb: "Stewed meats, handmade tortillas, main-character energy.",
      tags: ["guisados", "handmade", "date night"],
      heat: 95,
    },
    {
      id: "la-1986",
      name: "Tacos 1986",
      lat: 34.0635,
      lon: -118.3004,
      neighborhood: "Koreatown",
      blurb: "Adobada-forward. Burrito optional. Still swipe-right material.",
      tags: ["adobada", "late night", "line"],
      heat: 90,
    },
    {
      id: "la-homestate",
      name: "HomeState",
      lat: 34.084,
      lon: -118.3467,
      neighborhood: "Los Feliz",
      blurb: "Texas breakfast burrito, Los Angeles lighting.",
      tags: ["breakfast", "migas", "brunch"],
      heat: 86,
    },
    {
      id: "la-leos",
      name: "Leo's Taco Truck",
      lat: 34.0528,
      lon: -118.355,
      neighborhood: "Mid-City",
      blurb: "Truck fluorescent, al pastor glow, standing-up romance.",
      tags: ["truck", "al pastor", "late"],
      heat: 93,
    },
  ],
  denver: [
    {
      id: "den-santiagos",
      name: "Santiago's",
      lat: 39.7401,
      lon: -104.987,
      neighborhood: "Downtown",
      blurb: "Green chile as a love language. Sloppy on purpose.",
      tags: ["green chile", "smothered", "local chain"],
      heat: 90,
    },
    {
      id: "den-chubbys",
      name: "Chubby's",
      lat: 39.7762,
      lon: -105.0244,
      neighborhood: "Highland",
      blurb: "A Denver rite of passage. Napkins are not optional.",
      tags: ["smothered", "late night", "classic"],
      heat: 88,
    },
    {
      id: "den-illegal",
      name: "Illegal Pete's",
      lat: 39.7541,
      lon: -104.9997,
      neighborhood: "LoDo",
      blurb: "Customizable, reliable, the friend who always texts back.",
      tags: ["build-your-own", "casual", "patio"],
      heat: 80,
    },
    {
      id: "den-pinche",
      name: "Pinche Taqueria",
      lat: 39.7616,
      lon: -104.9818,
      neighborhood: "RiNo",
      blurb: "A little louder, a little hotter, still foil-compatible.",
      tags: ["taqueria", "spicy", "neighborhood"],
      heat: 84,
    },
  ],
  nyc: [
    {
      id: "nyc-los-tacos",
      name: "Los Tacos No. 1",
      lat: 40.7425,
      lon: -74.006,
      neighborhood: "Chelsea Market",
      blurb: "Adobada and a line. The burrito is the long-term relationship.",
      tags: ["adobada", "market", "line"],
      heat: 93,
    },
    {
      id: "nyc-dos-toros",
      name: "Dos Toros",
      lat: 40.7308,
      lon: -73.9926,
      neighborhood: "East Village",
      blurb: "Mission expat energy. Not trying to be subtle about it.",
      tags: ["mission-style", "fast", "guac"],
      heat: 84,
    },
    {
      id: "nyc-taco-project",
      name: "The Taco Project",
      lat: 40.7282,
      lon: -73.9857,
      neighborhood: "East Village",
      blurb: "Small shop, strong opinions, surprisingly tender foil.",
      tags: ["neighborhood", "late", "salsa"],
      heat: 82,
    },
    {
      id: "nyc-taqueria-st-marks",
      name: "Taqueria St. Marks",
      lat: 40.729,
      lon: -73.9881,
      neighborhood: "St. Marks",
      blurb: "The after-bar burrito you pretend is a personality.",
      tags: ["late night", "cheap", "walk-up"],
      heat: 81,
    },
  ],
};

function toSpot(spot: CuratedSpot, origin: Coords): Spot {
  return {
    id: spot.id,
    name: spot.name,
    lat: spot.lat,
    lon: spot.lon,
    distanceMiles: haversineMiles(origin, { lat: spot.lat, lon: spot.lon }),
    neighborhood: spot.neighborhood,
    blurb: spot.blurb,
    tags: spot.tags,
    photo: photoForId(spot.id),
    heat: spot.heat,
    mapsUrl: mapsUrl(spot.lat, spot.lon, spot.name),
    source: "curated",
  };
}

export function nearestCity(origin: Coords): City {
  return [...CITIES].sort(
    (a, b) => haversineMiles(origin, a.coords) - haversineMiles(origin, b.coords),
  )[0];
}

export function curatedDeck(cityId: string, origin: Coords): Spot[] {
  const spots = CURATED[cityId] ?? CURATED.sf;
  return spots
    .map((spot) => toSpot(spot, origin))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

export function fallbackDeck(origin: Coords): Spot[] {
  const city = nearestCity(origin);
  return curatedDeck(city.id, origin).map((spot) => ({
    ...spot,
    neighborhood: spot.neighborhood || formatNeighborhood(origin, spot),
  }));
}
