import type { GooglePlaceDetails, GooglePlacesClientOptions, NearbySearchOptions, PlaceDetailsOptions, PlacePhotoResponse, PlaceSummary } from './types.js';
export declare class GooglePlacesClient {
    private readonly apiKey;
    private readonly logger;
    private readonly options;
    private readonly cache;
    private readonly limiter;
    constructor(options: GooglePlacesClientOptions);
    clearCache(): void;
    private getCacheKey;
    nearbySearch(options: NearbySearchOptions): Promise<PlaceSummary[]>;
    getPlaceDetails(placeId: string, options?: PlaceDetailsOptions): Promise<GooglePlaceDetails | null>;
    getPlaceDetailsBatch(placeIds: string[], options?: PlaceDetailsOptions & {
        concurrency?: number;
    }): Promise<Map<string, GooglePlaceDetails>>;
    fetchPhoto(photoReference: string | undefined, options?: {
        maxwidth?: number;
        maxheight?: number;
    }): Promise<PlacePhotoResponse | null>;
}
