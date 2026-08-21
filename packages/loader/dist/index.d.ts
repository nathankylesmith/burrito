import type { SupabaseClient } from '@supabase/supabase-js';
import type { DishTemplate } from './dishes/types.js';
import { GooglePlacesClient } from './google/client.js';
import { LoaderLogger } from './logger.js';
import type { VisionClient } from './vision/types.js';
export interface RegionDefinition {
    id?: string;
    latitude: number;
    longitude: number;
    radius: number;
    keyword?: string | null;
    name?: string | null;
}
export interface LoaderOptions {
    apiKey?: string;
    location: {
        lat: number;
        lng: number;
    } | string;
    radius?: number;
    keyword?: string;
    maxResults?: number;
    photoBucket?: string;
    photoMaxWidth?: number;
    regionId?: string;
    regionName?: string | null;
    logger?: LoaderLogger;
    maxDishesPerRestaurant?: number;
    maxDishPhotosPerRestaurant?: number;
    maxReviewDishes?: number;
    dishPhotoConcurrency?: number;
    dryRun?: boolean;
    googleDetailConcurrency?: number;
    enablePhotoInsights?: boolean;
    visionModel?: string;
    visionEndpoint?: string;
    visionTemperature?: number;
    visionPromptTemplate?: string;
    minDishPhotoConfidence?: number;
    profileId?: string | null;
    runId?: string | null;
    reviewPriority?: number;
}
export interface LoaderResult {
    region: any;
    restaurants: any[];
    dishes: any[];
}
export declare const generateRegionKey: ({ latitude, longitude, radius, keyword, }: Pick<RegionDefinition, "latitude" | "longitude" | "radius" | "keyword">) => string;
export declare const upsertRegion: (supabase: SupabaseClient, region: RegionDefinition, logger: LoaderLogger) => Promise<any>;
interface LoadContext {
    supabase: SupabaseClient;
    bucket: string;
    maxResults?: number;
    radius?: number;
    keyword?: string;
    location: {
        lat: number;
        lng: number;
    } | string;
    photoMaxWidth?: number;
    logger: LoaderLogger;
    googleClient: GooglePlacesClient;
    dryRun?: boolean;
    maxDishesPerRestaurant?: number;
    maxDishPhotosPerRestaurant?: number;
    maxReviewDishes?: number;
    dishPhotoConcurrency?: number;
    detailConcurrency?: number;
    visionClient?: VisionClient;
    minDishPhotoConfidence?: number;
    profileId?: string | null;
    runId?: string | null;
    reviewPriority?: number;
}
export type PersistenceContext = Pick<LoadContext, 'supabase' | 'logger' | 'dryRun' | 'profileId' | 'runId' | 'reviewPriority'>;
export declare const persistRestaurantsAndDishes: (context: PersistenceContext, restaurantRecords: Map<string, any>, dishTemplates: DishTemplate[]) => Promise<{
    restaurants: any[];
    dishes: any[];
}>;
export declare const loadRestaurantsFromGooglePlaces: (supabase: SupabaseClient, options: LoaderOptions) => Promise<LoaderResult>;
export declare const createRegionIfMissing: (supabase: SupabaseClient, region: RegionDefinition, logger?: LoaderLogger) => Promise<any>;
export type { NearbySearchOptions } from './google';
export { uploadPhotoToStorage } from './storage.js';
export { MenuIngestionAgent } from './menu/agent.js';
export { BasicMenuScraper } from './menu/basic-scraper.js';
export { LocalTextModel } from './menu/llm-client.js';
export { LlmGuardrailModel } from './menu/llm-guardrail.js';
export { computeDishCompleteness, summarizeMissingFields } from './completeness.js';
export { loadRestaurantsHybrid, HybridLoader } from './hybrid-loader.js';
export type { MenuIngestionOutcome, RestaurantContext, MenuScraper, MenuGuardrailModel, LlmClient, } from './menu/types.js';
