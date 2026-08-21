import type { DishPhotoClassification, DishPhotoInsight } from '../vision/types.js';
export interface DishTemplate {
    placeId: string;
    name: string;
    description: string | null;
    price: number | null;
    image_url: string | null;
    cuisine_type: string | null;
    dietary_tags: string[] | null;
    googlePlaceId: string | null;
    googlePhotoReference: string | null;
    source_type: 'review' | 'photo' | 'menu' | 'fallback';
    source_review_id: string | null;
    source_photo_reference: string | null;
    confidence: number;
    review_excerpt: string | null;
    menu_section: string | null;
    captured_at: string | null;
    photo_insight?: DishPhotoInsight | null;
    photo_classification?: DishPhotoClassification | null;
    prehydrated?: boolean;
}
