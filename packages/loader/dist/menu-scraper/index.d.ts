import type { SupabaseClient } from '@supabase/supabase-js';
import type { LoaderResult } from '../index.js';
import { LoaderLogger } from '../logger.js';
export interface MenuSource {
    name: string;
    menuUrl: string;
    websiteUrl?: string | null;
    placeId?: string | null;
    address?: string | null;
    cuisine_type?: string | null;
    phoneNumber?: string | null;
    imageUrl?: string | null;
}
export interface MenuScraperOptions {
    supabase: SupabaseClient;
    location: {
        lat: number;
        lng: number;
    } | string;
    regionId?: string;
    regionName?: string | null;
    radius?: number;
    restaurants: MenuSource[];
    dryRun?: boolean;
    logger?: LoaderLogger;
    profileId?: string | null;
    runId?: string | null;
    reviewPriority?: number;
    llmModel?: string;
    llmEndpoint?: string;
    llmApiKey?: string;
}
export declare const loadRestaurantsFromMenuSources: (options: MenuScraperOptions) => Promise<LoaderResult>;
