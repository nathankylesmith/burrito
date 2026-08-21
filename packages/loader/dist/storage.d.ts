import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlacePhotoResponse } from './google.js';
import { type LoaderLogger } from './logger.js';
export declare const getFileExtension: (contentType: string) => "jpg" | "png" | "webp" | "gif";
export declare const uploadPhotoToStorage: (supabase: SupabaseClient, photoData: PlacePhotoResponse | null, bucket: string, filePath: string, logger?: LoaderLogger) => Promise<string | null>;
export declare const uploadRestaurantPhoto: (supabase: SupabaseClient, photoData: PlacePhotoResponse | null, placeId: string, bucket: string, logger?: LoaderLogger) => Promise<string | null>;
export declare const uploadDishPhoto: (supabase: SupabaseClient, photoData: PlacePhotoResponse | null, placeId: string, photoReference: string, bucket: string, logger?: LoaderLogger) => Promise<string | null>;
