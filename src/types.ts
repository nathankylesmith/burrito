export type Coords = {
  lat: number;
  lon: number;
};

export type Spot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMiles: number;
  neighborhood: string;
  blurb: string;
  tags: string[];
  photo: string;
  heat: number;
  mapsUrl: string;
  source: "live" | "curated";
};

export type SwipeAction = "nope" | "like" | "super";

export type Match = Spot & {
  action: SwipeAction;
  matchedAt: number;
};

export type City = {
  id: string;
  name: string;
  region: string;
  coords: Coords;
  vibe: string;
};
