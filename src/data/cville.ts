import { photoForId } from "./photos";
import type { Coords, Spot } from "../types";
import { haversineMiles, mapsUrl } from "../lib/geo";

export const CVILLE: Coords = { lat: 38.0293, lon: -78.4767 };

type LocalSpot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  neighborhood: string;
  address: string;
  hours: string;
  phone: string | null;
  website: string | null;
  blurb: string;
  tags: string[];
};

const LOCAL: LocalSpot[] = [
  {
    id: "cville-barbies",
    name: "Barbie's Burrito Barn",
    lat: 38.028131,
    lon: -78.477429,
    neighborhood: "Belmont",
    address: "201 Avon St",
    hours: "Tue–Thu 11am–5pm · Fri 11am–7pm · closed Sat–Mon",
    phone: "(434) 328-8020",
    website: "http://www.barbiesburritobarn.com/",
    blurb: "Cali Mex, Cville style. Fresh batches, patio out front, the actual burrito barn.",
    tags: ["california burrito", "belmont", "takeout"],
  },
  {
    id: "cville-comalito",
    name: "Taqueria El Comalito",
    lat: 38.0298771,
    lon: -78.4746551,
    neighborhood: "Downtown",
    address: "905 E Market St",
    hours: "Tue–Fri 11am–8pm · Sat 9am–8pm · Sun 9am–6pm · closed Mon",
    phone: "(434) 227-1936",
    website: null,
    blurb: "Handmade tortillas next to the BP. People come here for tacos, burritos, and the green sauce.",
    tags: ["handmade tortillas", "downtown", "family"],
  },
  {
    id: "cville-gomez",
    name: "Desayuna con Gomez",
    lat: 38.0364357,
    lon: -78.4618825,
    neighborhood: "Locust Grove",
    address: "1305 Long St",
    hours: "Mon–Sat 7am–2:30pm · closed Sun",
    phone: "(434) 960-7806",
    website: null,
    blurb: "Breakfast burrito spot from the Tacos Gomez people. Chorizo, eggs, and a line of locals.",
    tags: ["breakfast burrito", "morning", "cheap"],
  },
  {
    id: "cville-chavo-jpa",
    name: "Taqueria El Chavo",
    lat: 38.025593,
    lon: -78.515653,
    neighborhood: "JPA",
    address: "2211 Jefferson Park Ave",
    hours: "Mon–Wed 11am–9:30pm · Thu–Sat 11am–10pm",
    phone: "(434) 234-2263",
    website: "https://taqueriaelchavova.com/",
    blurb: "JPA taqueria. Quesabirria, asada, al pastor, and a burrito if that’s the move.",
    tags: ["taqueria", "jpa", "quesabirria"],
  },
  {
    id: "cville-chavo-maury",
    name: "Taqueria El Chavo truck",
    lat: 38.0263917,
    lon: -78.5156229,
    neighborhood: "JPA",
    address: "111 Maury Ave",
    hours: "Usually 11am–9:30pm · hours can move with the truck",
    phone: "(434) 234-2263",
    website: "https://taqueriaelchavova.com/",
    blurb: "The lot by 7 Day Junior. Same kitchen energy, standing-up foil.",
    tags: ["truck", "jpa", "quick"],
  },
  {
    id: "cville-mejicali",
    name: "Mejicali",
    lat: 38.0319794,
    lon: -78.492728,
    neighborhood: "West Main",
    address: "852 W Main St",
    hours: "Mon 5–10pm · Tue–Wed 12–10pm · Thu–Fri 12pm–1am · Sat 10am–1am · Sun 10am–10pm",
    phone: "(434) 244-2679",
    website: "https://mejicalirestaurant.com/",
    blurb: "West Main street-food plates. Late enough to be a post-show burrito.",
    tags: ["west main", "late", "street food"],
  },
  {
    id: "cville-el-puerto",
    name: "El Puerto Mexican Grill",
    lat: 38.0514145,
    lon: -78.4988583,
    neighborhood: "Barracks",
    address: "2045 Barracks Rd",
    hours: "Mon–Thu 11am–10pm · Fri 11am–11pm · Sat 11am–10pm · Sun 11:30am–9pm",
    phone: "(434) 872-9488",
    website: "https://www.elpuertomexicancville.com/",
    blurb: "Barracks Road sit-down. Family recipes, vegetarian plates, the reliable weeknight table.",
    tags: ["barracks", "sit-down", "family"],
  },
  {
    id: "cville-brazos-2nd",
    name: "Brazos Tacos",
    lat: 38.024824,
    lon: -78.483112,
    neighborhood: "Belmont",
    address: "925 2nd St SE",
    hours: "Sun–Wed 8am–8pm · Thu–Sat 8am–9pm",
    phone: "(434) 984-1163",
    website: "https://store.brazostacos.com/",
    blurb: "Breakfast through dinner. Tacos, burritos, and a Belmont counter.",
    tags: ["breakfast", "belmont", "tacos"],
  },
  {
    id: "cville-brazos-emmet",
    name: "Brazos",
    lat: 38.0519127,
    lon: -78.5005385,
    neighborhood: "Barracks",
    address: "1133 Emmet St N",
    hours: "Mon–Wed 8am–8pm · Thu–Sat 8am–9pm · Sun 8am–8pm",
    phone: null,
    website: "https://brazostacos.com/",
    blurb: "The Barracks / Emmet location. Same burrito logic, closer to campus shopping.",
    tags: ["barracks", "breakfast", "campus"],
  },
  {
    id: "cville-cactus",
    name: "Cactus Mexican Restaurant",
    lat: 38.022956,
    lon: -78.470253,
    neighborhood: "Belmont",
    address: "221 Carlton Rd",
    hours: "Mon 10am–10pm · Tue–Thu 10am–9pm · Fri–Sun 10am–10pm",
    phone: "(434) 295-4748",
    website: "https://cactuscvillerest.com",
    blurb: "Belmont Mexican restaurant with a burrito on the menu and a parking lot.",
    tags: ["belmont", "sit-down", "classic"],
  },
  {
    id: "cville-michoacana",
    name: "La Michoacana",
    lat: 38.0314661,
    lon: -78.4646028,
    neighborhood: "Locust Grove",
    address: "508 Stewart St",
    hours: "Check before you go",
    phone: null,
    website: null,
    blurb: "Neighborhood Mexican counter. Good when you already know you want something messy.",
    tags: ["neighborhood", "counter", "local"],
  },
  {
    id: "cville-bebedero",
    name: "The Bebedero",
    lat: 38.0311414,
    lon: -78.4822809,
    neighborhood: "Downtown",
    address: "225 W Main St",
    hours: "Mon–Sat noon–2am",
    phone: null,
    website: "https://thebebedero.com/",
    blurb: "Downtown late. More bar than barn, but the Mexican plate is why people stay.",
    tags: ["late night", "downtown", "drinks"],
  },
  {
    id: "cville-al-carbon",
    name: "Al Carbon",
    lat: 38.0117322,
    lon: -78.4998983,
    neighborhood: "5th Street Station",
    address: "365 Merchant Walk Square",
    hours: "Check before you go",
    phone: null,
    website: "https://www.alcarbonva.com",
    blurb: "5th Street Station grill. Carne asada energy, burrito-adjacent on purpose.",
    tags: ["5th street", "grilled", "mall"],
  },
  {
    id: "cville-mariscos",
    name: "Mariscos El Barco",
    lat: 38.031567,
    lon: -78.489232,
    neighborhood: "West Main",
    address: "625 W Main St",
    hours: "Daily 11am–10pm",
    phone: "(434) 202-2953",
    website: "https://www.mariscoselbarcova.com",
    blurb: "West Main seafood-Mexican. Not a foil specialist, still a real Cville plate.",
    tags: ["west main", "seafood", "sit-down"],
  },
];

export function cvilleDeck(origin: Coords): Spot[] {
  return LOCAL.map((spot) => ({
    ...spot,
    distanceMiles: haversineMiles(origin, { lat: spot.lat, lon: spot.lon }),
    photo: photoForId(spot.id),
    mapsUrl: mapsUrl(spot.lat, spot.lon, `${spot.name} ${spot.address} Charlottesville VA`),
    source: "cville" as const,
  })).sort((a, b) => a.distanceMiles - b.distanceMiles);
}

export function isNearCville(origin: Coords): boolean {
  return haversineMiles(origin, CVILLE) <= 20;
}

export function localNames(): string[] {
  return LOCAL.map((spot) => spot.name.toLowerCase());
}
