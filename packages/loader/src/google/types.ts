import type { BackoffOptions } from './common.js';
import type { LoaderLogger } from '../logger.js';

export interface LatLng {
  lat: number;
  lng: number;
}

export type NearbySearchLocation = string | LatLng;

export interface NearbySearchOptions {
  location: NearbySearchLocation;
  radius?: number;
  keyword?: string;
  type?: string;
  maxResults?: number;
}

export interface PlaceSummary {
  place_id: string;
  name: string;
  business_status?: string;
  rating?: number;
  user_ratings_total?: number;
  formatted_address?: string;
  vicinity?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  website?: string;
  formatted_phone_number?: string;
}

export interface GooglePlacePhoto {
  height?: number;
  width?: number;
  photo_reference: string;
  html_attributions?: string[];
}

export interface GooglePlaceReview {
  author_name?: string;
  profile_photo_url?: string;
  rating?: number;
  relative_time_description?: string;
  text?: string;
  time?: number;
  original_language?: string;
  language?: string;
  translated_text?: string;
}

export interface GoogleEditorialSummary {
  overview?: string;
}

export interface GoogleGeometry {
  location?: LatLng & { lat: number; lng: number };
}

export interface GooglePlaceDetails {
  place_id: string;
  name?: string;
  formatted_address?: string;
  geometry?: GoogleGeometry;
  types?: string[];
  price_level?: number | null;
  rating?: number | null;
  user_ratings_total?: number | null;
  photos?: GooglePlacePhoto[];
  reviews?: GooglePlaceReview[];
  website?: string;
  international_phone_number?: string;
  current_opening_hours?: Record<string, unknown>;
}

export interface PlacePhotoResponse {
  buffer: Uint8Array;
  contentType: string;
  width?: number;
  height?: number;
  attributions?: string[];
}

export type PlaceDetailsField =
  | 'place_id'
  | 'name'
  | 'formatted_address'
  | 'geometry'
  | 'types'
  | 'price_level'
  | 'rating'
  | 'user_ratings_total'
  | 'photos'
  | 'reviews'
  | 'website'
  | 'international_phone_number'
  | 'current_opening_hours';

export interface PlaceDetailsOptions {
  fields?: PlaceDetailsField[];
  useCache?: boolean;
  forceRefresh?: boolean;
}

export interface GooglePlacesClientOptions {
  apiKey: string;
  logger?: LoaderLogger;
  backoff?: BackoffOptions;
  maxConcurrency?: number;
  enableCache?: boolean;
}

