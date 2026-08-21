import type { SupabaseClient } from '@supabase/supabase-js';
import { LoaderLogger } from './logger.js';
interface HybridLoaderOptions {
    supabase: SupabaseClient;
    location: {
        lat: number;
        lng: number;
    };
    radius: number;
    maxRestaurants: number;
    regionId?: string;
    regionName?: string;
    dryRun?: boolean;
    logger?: LoaderLogger;
    visionModel?: string;
    visionEndpoint?: string;
    visionProvider?: 'local' | 'gemini';
    llmModel?: string;
    llmEndpoint?: string;
    llmProvider?: 'local' | 'gemini';
    llmApiKey?: string;
    googleApiKey?: string;
    profileId?: string;
    runId?: string;
    maxDishesPerRestaurant?: number;
    minDishPhotoConfidence?: number;
    dumpResultsPath?: string;
    saveScrapesDir?: string;
    visionWebpConversion?: boolean;
    enableGooglePhotoFallback?: boolean;
}
/**
 * Hybrid loader that minimizes Google Places API usage by:
 * 1. Getting basic restaurant list with minimal API calls
 * 2. Scraping websites for menus and images
 * 3. Using local vision processing
 * 4. Falling back to Google Places API only for missing data
 */
export declare class HybridLoader {
    private options;
    private logger;
    private googleClient?;
    private visionClient?;
    private menuScraper;
    private menuAgent?;
    private costMonitor;
    private dumpResultsPath?;
    private saveScrapesDir?;
    private regionRecord;
    constructor(options: HybridLoaderOptions);
    loadRegion(): Promise<any>;
    private getBasicRestaurantList;
    private processRestaurant;
    private scrapeRestaurantWebsite;
    private extractTextFromHtml;
    private extractImagesFromHtml;
    private deduplicateDishes;
    private convertMenuItemsToDishTemplates;
    private processImagesWithLocalVision;
    private findDishesWithoutImages;
    private fillMissingImagesWithGooglePlaces;
    private persistProcessedRestaurants;
    private ensureRegion;
    private buildRestaurantRecord;
    private buildStats;
    private getOrCreatePlaceId;
}
export declare function loadRestaurantsHybrid(options: HybridLoaderOptions): Promise<any>;
export {};
