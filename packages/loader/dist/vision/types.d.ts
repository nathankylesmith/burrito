import type { PlacePhotoResponse } from '../google/types.js';
export interface DishPhotoInsight {
    model: string;
    dish_guess?: string | null;
    alternate_names?: string[];
    caption?: string | null;
    cuisine_guess?: string | null;
    ingredients?: string[];
    tags?: string[];
    dietary_tags?: string[];
    price_tier?: 'low' | 'medium' | 'high' | 'premium' | null;
    price_estimate?: number | null;
    confidence?: number | null;
    raw_response?: unknown;
}
export interface DishPhotoClassification {
    model: string;
    is_dish: boolean;
    confidence?: number | null;
    tags?: string[];
    raw_response?: unknown;
}
export interface ClassifyDishPhotoParams {
    photo: PlacePhotoResponse;
    placeId?: string | null;
    photoReference?: string | null;
    restaurantName?: string | null;
    dishName?: string | null;
}
export interface DescribeDishPhotoParams {
    photo: PlacePhotoResponse;
    restaurantName?: string | null;
    dishName?: string | null;
    cuisineType?: string | null;
    reviewExcerpt?: string | null;
    sourceType?: string | null;
    placeId?: string | null;
    photoReference?: string | null;
}
export interface VisionClient {
    classifyDishPhoto?(params: ClassifyDishPhotoParams): Promise<DishPhotoClassification | null>;
    describeDishPhoto(params: DescribeDishPhotoParams): Promise<DishPhotoInsight | null>;
}
