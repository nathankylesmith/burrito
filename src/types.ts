export type Coords = {
  lat: number;
  lon: number;
};

export type Review = {
  quote: string;
  source: string;
};

export type MenuItem = {
  name: string;
  price: string;
  ingredients: string[];
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
  photos: string[];
  photoCredit: string | null;
  rating: number | null;
  reviewCount: number | null;
  ratingSource: string | null;
  priceRange: string;
  signature: MenuItem | null;
  menu: MenuItem[];
  reviews: Review[];
  mapsUrl: string;
  source: "cville" | "live";
};

export type SwipeAction = "nope" | "like" | "super";

export type Match = Spot & {
  action: SwipeAction;
  matchedAt: number;
};
