import { LoaderLogger } from './logger.js';
import { GooglePlacesClient } from './google/client.js';
import { formatLocation, GooglePlacesError } from './google/common.js';
import type { NearbySearchOptions, PlacePhotoResponse, PlaceSummary, GooglePlacesClientOptions, PlaceDetailsField, PlaceDetailsOptions } from './google/types.js';
export { GooglePlacesClient, GooglePlacesError, formatLocation };
export type { NearbySearchOptions, PlacePhotoResponse, PlaceSummary, GooglePlacesClientOptions, PlaceDetailsField, PlaceDetailsOptions, };
export declare const searchForRestaurants: (apiKey: string, options: NearbySearchOptions, logger?: LoaderLogger) => Promise<PlaceSummary[]>;
export declare const getPlaceDetails: (apiKey: string, placeId: string, logger?: LoaderLogger, options?: Pick<PlaceDetailsOptions, "fields" | "forceRefresh" | "useCache">) => Promise<import("./google/types.js").GooglePlaceDetails | null>;
export declare const fetchPlacePhoto: (photoReference: string | undefined, apiKey: string, options?: {
    maxwidth?: number;
}, logger?: LoaderLogger) => Promise<PlacePhotoResponse | null>;
