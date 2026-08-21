import type { DishTemplate } from './types.js';
export interface DishExtractionOptions {
    fallbackImageUrl: string | null;
    fallbackPhotoReference: string | null;
    priceLevel: number | null | undefined;
    cuisines?: string[];
    restaurantName: string;
    menuUrl?: string | null;
    maxDishes?: number;
    maxReviewDishes?: number;
}
export declare const createFallbackDishes: (details: any, cuisines: string[], priceLevel: number | null | undefined, fallbackImageUrl: string | null, photoReference: string | null) => {
    placeId: any;
    name: string;
    description: string;
    price: number;
    image_url: string | null;
    cuisine_type: string;
    dietary_tags: null;
    googlePlaceId: any;
    googlePhotoReference: string | null;
    source_type: "fallback";
    source_review_id: null;
    source_photo_reference: string | null;
    confidence: number;
    review_excerpt: null;
    menu_section: null;
    captured_at: null;
}[];
export declare const createReviewDishTemplates: (details: any, options: DishExtractionOptions, cuisines: string[], priceLevel: number | null | undefined) => DishTemplate[];
export declare const createMenuDishTemplates: (details: any, cuisines: string[], priceLevel: number | null | undefined) => DishTemplate[];
export interface DishExtractionResult {
    reviewDishes: DishTemplate[];
    menuDishes: DishTemplate[];
    fallbackDishes: DishTemplate[];
}
export declare const createDishTemplates: (details: any, options: DishExtractionOptions) => DishExtractionResult;
