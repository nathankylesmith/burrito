import type { DishTemplate } from './types.js';
import { deriveCuisines, mapPriceLevelToDishPrice, titleCase } from './utils.js';

const DISH_KEYWORDS = [
  'pizza',
  'burger',
  'ramen',
  'taco',
  'tacos',
  'sushi',
  'poke',
  'salad',
  'steak',
  'pasta',
  'noodle',
  'noodles',
  'dumpling',
  'dumplings',
  'burrito',
  'bowl',
  'sandwich',
  'curry',
  'pho',
  'roll',
  'rolls',
  'bao',
  'bun',
  'buns',
  'wings',
  'shawarma',
  'falafel',
  'kebab',
  'brisket',
  'bbq',
  'soup',
  'ceviche',
  'risotto',
  'gnocchi',
  'paella',
  'lobster',
  'crab',
  'oyster',
  'clam',
  'pancake',
  'waffle',
  'toast',
  'ice cream',
  'dessert',
  'cake',
  'pie',
];

const MAX_REVIEW_DISHES = 4;
const MAX_MENU_DISHES = 2;

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

const toTitle = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => titleCase(word))
    .join(' ');

const extractNamesFromText = (text: string) => {
  if (!text) return [];
  const unique = new Set<string>();

  DISH_KEYWORDS.forEach((keyword) => {
    const pattern = new RegExp(`((?:[\\w'&]+\\s+){0,2})(${keyword})`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const phrase = `${match[1] || ''}${match[2]}`.trim();
      if (!phrase) continue;
      const cleaned = phrase.replace(/[^a-zA-Z0-9'&\\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length < 3) continue;
      unique.add(toTitle(cleaned));
    }
  });

  return Array.from(unique);
};

const createReviewDishes = (
  details: any,
  options: Required<Pick<DishExtractionOptions, 'fallbackImageUrl' | 'fallbackPhotoReference' | 'priceLevel'>>,
  cuisines: string[],
  maxCount: number
) => {
  const reviews = Array.isArray(details?.reviews) ? details.reviews : [];
  if (reviews.length === 0) {
    return [];
  }

  const templates: DishTemplate[] = [];

  for (const review of reviews) {
    const names = extractNamesFromText(review?.text || '');
    if (names.length === 0) {
      continue;
    }

    for (const name of names) {
      if (templates.length >= maxCount) {
        return templates;
      }

      const capturedAt =
        typeof review?.time === 'number'
          ? new Date(Number(review.time) * 1000).toISOString()
          : null;

      templates.push({
        placeId: details.place_id,
        name,
        description: `Mentioned by ${review?.author_name || 'a diner'}: "${(review?.text || '').slice(0, 120).trim()}"`,
        price: mapPriceLevelToDishPrice(options.priceLevel, templates.length),
        image_url: null, // Don't assign restaurant image to review dishes - they'll get photos if available
        cuisine_type: cuisines[0] || null,
        dietary_tags: null,
        googlePlaceId: details.place_id || null,
        googlePhotoReference: null, // Review dishes don't have specific photo references
        source_type: 'review' as const,
        source_review_id: review?.author_url || String(review?.time || Date.now()),
        source_photo_reference: null,
        confidence: Math.min(0.95, Math.max(0.35, (review?.rating ?? 4) / 5)),
        review_excerpt: (review?.text || '').slice(0, 180) || null,
        menu_section: null,
        captured_at: capturedAt,
      });
    }
  }

  return templates;
};

const createMenuDishes = (
  details: any,
  cuisines: string[],
  priceLevel: number | null | undefined,
  maxCount: number
) => {
  const menus: DishTemplate[] = [];
  const cuisineList = cuisines.length > 0 ? cuisines : deriveCuisines(details);

  cuisineList.slice(0, maxCount).forEach((cuisine: string, index: number) => {
    menus.push({
      placeId: details.place_id,
      name: `${cuisine} Chef's Tasting`,
      description: `Chef curated ${cuisine.toLowerCase()} tasting menu inspired by ${details.name}.`,
      price: mapPriceLevelToDishPrice(priceLevel, index + 1),
      image_url: null,
      cuisine_type: cuisine,
      dietary_tags: null,
      googlePlaceId: details.place_id || null,
      googlePhotoReference: null,
      source_type: 'menu' as const,
      source_review_id: null,
      source_photo_reference: null,
      confidence: 0.45,
      review_excerpt: null,
      menu_section: 'Chef Recommendations',
      captured_at: null,
    });
  });

  return menus;
};

export const createFallbackDishes = (
  details: any,
  cuisines: string[],
  priceLevel: number | null | undefined,
  fallbackImageUrl: string | null,
  photoReference: string | null
) => {
  const fallbackCuisine = cuisines.length > 0 ? cuisines : [details?.name || 'House'];

  return fallbackCuisine.slice(0, 2).map((cuisine: string, index: number) => ({
    placeId: details.place_id,
    name: `${cuisine} Special ${index + 1}`,
    description: `Signature ${cuisine.toLowerCase()} dish from ${details.name}.`,
    price: mapPriceLevelToDishPrice(priceLevel, index),
    image_url: fallbackImageUrl,
    cuisine_type: cuisine,
    dietary_tags: null,
    googlePlaceId: details.place_id || null,
    googlePhotoReference: photoReference,
    source_type: 'fallback' as const,
    source_review_id: null,
    source_photo_reference: photoReference,
    confidence: 0.2,
    review_excerpt: null,
    menu_section: null,
    captured_at: null,
  }));
};

export const createReviewDishTemplates = (
  details: any,
  options: DishExtractionOptions,
  cuisines: string[],
  priceLevel: number | null | undefined
) =>
  createReviewDishes(
    details,
    {
      fallbackImageUrl: options.fallbackImageUrl,
      fallbackPhotoReference: options.fallbackPhotoReference,
      priceLevel,
    },
    cuisines,
    options.maxReviewDishes ?? MAX_REVIEW_DISHES
  );

export const createMenuDishTemplates = (
  details: any,
  cuisines: string[],
  priceLevel: number | null | undefined
) => createMenuDishes(details, cuisines, priceLevel, MAX_MENU_DISHES);

export interface DishExtractionResult {
  reviewDishes: DishTemplate[];
  menuDishes: DishTemplate[];
  fallbackDishes: DishTemplate[];
}

export const createDishTemplates = (details: any, options: DishExtractionOptions): DishExtractionResult => {
  if (!details?.place_id) {
    return {
      reviewDishes: [],
      menuDishes: [],
      fallbackDishes: [],
    };
  }

  const cuisines = options.cuisines?.length ? options.cuisines : deriveCuisines(details);
  const priceLevel = options.priceLevel ?? details?.price_level ?? null;
  const reviewDishes = createReviewDishTemplates(details, options, cuisines, priceLevel);
  const menuDishes = createMenuDishTemplates(details, cuisines, priceLevel);
  const fallbackDishes =
    reviewDishes.length === 0 && menuDishes.length === 0
      ? createFallbackDishes(details, cuisines, priceLevel, options.fallbackImageUrl, options.fallbackPhotoReference)
      : [];

  return {
    reviewDishes,
    menuDishes,
    fallbackDishes,
  };
};
