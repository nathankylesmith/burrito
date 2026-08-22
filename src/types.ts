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
  address: string;
  hours: string;
  phone: string | null;
  website: string | null;
  blurb: string;
  tags: string[];
  photo: string;
  mapsUrl: string;
  source: "cville" | "live";
};

export type SwipeAction = "nope" | "like" | "super";

export type Match = Spot & {
  action: SwipeAction;
  matchedAt: number;
};
