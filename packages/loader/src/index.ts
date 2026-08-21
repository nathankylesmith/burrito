import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { DishTemplate } from './dishes/types.js';
import { createDishTemplates } from './dishes/extractor.js';
import { matchReviewDishesToPhotos } from './dishes/matcher.js';
import { deriveCuisines, mapPriceLevelToDishPrice, mapPriceLevelToRange } from './dishes/utils.js';
import { GooglePlacesClient } from './google/client.js';
import { defaultLogger, LoaderLogger, withContext } from './logger.js';
import { uploadDishPhoto, uploadRestaurantPhoto } from './storage.js';
import type { DishPhotoClassification, DishPhotoInsight, VisionClient } from './vision/types.js';
import { createLocalVisionClient } from './vision/local.js';
import type { PlacePhotoResponse } from './google/types.js';
import { computeDishCompleteness } from './completeness.js';

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
  location: { lat: number; lng: number } | string;
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

const DEFAULT_BUCKET = 'dish-images';

type PhotoGalleryEntry = {
  url: string;
  type: 'restaurant' | 'dish';
  label?: string;
  source_type?: string | null;
};

type ExternalPhotoInput = {
  url: string;
  label?: string | null;
  dishName?: string | null;
  sourceType?: string | null;
  type?: 'restaurant' | 'dish' | null;
};

const summarizeReviews = (reviews: any[] | undefined | null) => {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return null;
  }

  let positive = 0;
  let critical = 0;
  let totalRating = 0;
  const highlights: Array<{ author: string; excerpt: string }> = [];

  reviews.slice(0, 6).forEach((review: any) => {
    const rating = Number(review?.rating ?? 0);
    totalRating += rating;
    if (rating >= 4) {
      positive += 1;
    } else if (rating <= 2) {
      critical += 1;
    }

    if (review?.text) {
      highlights.push({
        author: review?.author_name || 'Guest',
        excerpt: review.text.slice(0, 160),
      });
    }
  });

  return {
    total: reviews.length,
    average_rating: Number((totalRating / reviews.length || 0).toFixed(2)),
    positive,
    critical,
    highlights,
  };
};

const upsertRawPhotoRecord = async (
  supabase: SupabaseClient,
  logger: LoaderLogger,
  record: {
    placeId: string;
    photoReference: string;
    width?: number;
    height?: number;
    hash?: string | null;
    storageUrl?: string | null;
    classification?: DishPhotoClassification | null;
    insight?: DishPhotoInsight | null;
  }
) => {
  try {
    const payload = {
      place_id: record.placeId,
      photo_reference: record.photoReference,
      width: record.width ?? null,
      height: record.height ?? null,
      hash: record.hash ?? null,
      storage_path: record.storageUrl ?? null,
      is_dish: record.classification?.is_dish ?? null,
      is_dish_confidence: record.classification?.confidence ?? null,
      insight: record.insight ?? null,
      insight_model: record.insight?.model ?? record.classification?.model ?? null,
    };

    const { error } = await supabase.from('raw_place_photos').upsert(payload, {
      onConflict: 'photo_reference',
    });

    if (error) {
      logger.debug('Failed to upsert raw photo record', {
        placeId: record.placeId,
        photoReference: record.photoReference,
        error: error.message,
      });
    }
  } catch (error) {
    logger.debug('Failed to persist raw photo metadata', {
      placeId: record.placeId,
      photoReference: record.photoReference,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const extractExternalPhotoInputs = (details: any): ExternalPhotoInput[] => {
  const candidates: ExternalPhotoInput[] = [];

  const pushCandidate = (entry: any) => {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (!url || typeof url !== 'string') return;

    candidates.push({
      url,
      label: entry?.label || entry?.title || entry?.caption || null,
      dishName: entry?.dish_name || entry?.dishName || entry?.label || null,
      sourceType: entry?.source_type || entry?.sourceType || null,
      type: entry?.type || null,
    });
  };

  const possibleSources = [details?.photo_gallery, details?.menu_photos, details?.gallery_photos];

  possibleSources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((entry) => pushCandidate(entry));
    }
  });

  return candidates;
};

const downloadExternalPhoto = async (
  url: string,
  logger: LoaderLogger,
  meta: Record<string, unknown>
): Promise<PlacePhotoResponse | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn('Failed to download external photo', { ...meta, status: response.status });
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    return {
      buffer,
      contentType: response.headers.get('content-type') || 'image/jpeg',
      width: undefined,
      height: undefined,
    };
  } catch (error) {
    logger.warn('Error downloading external photo', {
      ...meta,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const buildPhotoDishName = (
  insight: DishPhotoInsight | null | undefined,
  cuisines: string[],
  index: number
) => {
  const base =
    insight?.dish_guess?.trim() ||
    insight?.alternate_names?.find((name) => name && name.trim()) ||
    `${cuisines[0] || 'Signature'} Dish ${index + 1}`;

  return base.trim();
};

const buildPhotoDishDescription = (
  insight: DishPhotoInsight | null | undefined,
  restaurantName: string | null
) => {
  const parts = [
    insight?.caption,
    insight?.ingredients && insight.ingredients.length > 0
      ? `Ingredients: ${insight.ingredients.join(', ')}`
      : null,
  ].filter(Boolean);

  if (parts.length === 0) {
    return `Popular dish served at ${restaurantName || 'this restaurant'}.`;
  }

  return parts.join(' ');
};

const pickDishPrice = (
  insight: DishPhotoInsight | null | undefined,
  priceLevel: number | null | undefined,
  index: number
) => {
  if (typeof insight?.price_estimate === 'number' && insight.price_estimate > 0) {
    return Number(insight.price_estimate.toFixed(2));
  }

  return mapPriceLevelToDishPrice(priceLevel, index);
};

const ingestExternalPhotoDishes = async ({
  details,
  context,
  cuisines,
  gallery,
  placeLogger,
}: {
  details: any;
  context: LoadContext;
  cuisines: string[];
  gallery: PhotoGalleryEntry[];
  placeLogger: LoaderLogger;
}): Promise<DishTemplate[]> => {
  if (!context.visionClient || !context.visionClient.classifyDishPhoto) {
    placeLogger.debug('Vision client not configured; skipping external photo ingestion');
    return [];
  }

  const candidates = extractExternalPhotoInputs(details).filter((entry) => Boolean(entry.url));
  if (candidates.length === 0) {
    return [];
  }

  const minConfidence = context.minDishPhotoConfidence ?? 0.35;
  const collected: DishTemplate[] = [];
  const seenUrls = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate.url || seenUrls.has(candidate.url)) {
      continue;
    }
    seenUrls.add(candidate.url);

    const photoMeta = { placeId: details.place_id, sourceUrl: candidate.url };
    const photoData = await downloadExternalPhoto(candidate.url, placeLogger, photoMeta);
    if (!photoData || !photoData.buffer || photoData.buffer.length === 0) {
      continue;
    }

    const photoReference = createHash('sha1').update(candidate.url).digest('hex');
    const photoHash = createHash('sha1').update(Buffer.from(photoData.buffer)).digest('hex');

    const allowedSourceTypes: Array<DishTemplate['source_type']> = ['review', 'photo', 'menu', 'fallback'];
    const sourceType = allowedSourceTypes.includes(candidate.sourceType as DishTemplate['source_type'])
      ? (candidate.sourceType as DishTemplate['source_type'])
      : 'photo';

    let classification: DishPhotoClassification | null = null;
    try {
      classification = await context.visionClient.classifyDishPhoto({
        photo: photoData,
        placeId: details.place_id,
        photoReference,
        restaurantName: details.name || null,
        dishName: candidate.dishName || candidate.label || null,
      });
    } catch (error) {
      placeLogger.warn('Vision classification failed for external photo', {
        ...photoMeta,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!classification || !classification.is_dish || (classification.confidence ?? 0) < minConfidence) {
      await upsertRawPhotoRecord(context.supabase, placeLogger, {
        placeId: details.place_id,
        photoReference,
        width: photoData.width,
        height: photoData.height,
        hash: photoHash,
        classification,
        insight: null,
      });
      continue;
    }

    let insight: DishPhotoInsight | null = null;
    try {
      insight = await context.visionClient.describeDishPhoto({
        photo: photoData,
        placeId: details.place_id,
        photoReference,
        restaurantName: details.name || null,
        dishName: candidate.dishName || candidate.label || null,
        cuisineType: cuisines[0] || null,
      });
    } catch (error) {
      placeLogger.debug('Vision insight failed for external photo', {
        ...photoMeta,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const uploadedUrl = await uploadDishPhoto(
      context.supabase,
      photoData,
      details.place_id,
      photoReference,
      context.bucket,
      placeLogger
    );

    if (!uploadedUrl) {
      await upsertRawPhotoRecord(context.supabase, placeLogger, {
        placeId: details.place_id,
        photoReference,
        width: photoData.width,
        height: photoData.height,
        hash: photoHash,
        classification,
        insight,
      });
      continue;
    }

    gallery.push({
      url: uploadedUrl,
      type: candidate.type === 'restaurant' ? 'restaurant' : 'dish',
      label: candidate.label || insight?.dish_guess || `Dish ${collected.length + 1}`,
      source_type: sourceType,
    });

    await upsertRawPhotoRecord(context.supabase, placeLogger, {
      placeId: details.place_id,
      photoReference,
      width: photoData.width,
      height: photoData.height,
      hash: photoHash,
      classification,
      insight,
      storageUrl: uploadedUrl,
    });

    collected.push({
      placeId: details.place_id,
      name: candidate.dishName || buildPhotoDishName(insight, cuisines, collected.length),
      description: buildPhotoDishDescription(insight, details.name || null),
      price: pickDishPrice(insight, details.price_level, collected.length),
      image_url: uploadedUrl,
      cuisine_type: insight?.cuisine_guess || cuisines[0] || null,
      dietary_tags: insight?.dietary_tags ?? null,
      googlePlaceId: details.place_id,
      googlePhotoReference: null,
      source_type: sourceType,
      source_review_id: null,
      source_photo_reference: photoReference,
      confidence: insight?.confidence ?? classification.confidence ?? 0.6,
      review_excerpt: null,
      menu_section: null,
      captured_at: null,
      photo_insight: insight,
      photo_classification: classification,
      prehydrated: true,
    });
  }

  return collected;
};

const generatePhotoDishTemplates = async ({
  details,
  context,
  cuisines,
  gallery,
  placeLogger,
}: {
  details: any;
  context: LoadContext;
  cuisines: string[];
  gallery: PhotoGalleryEntry[];
  placeLogger: LoaderLogger;
}): Promise<DishTemplate[]> => {
  if (!context.visionClient || !context.visionClient.classifyDishPhoto) {
    placeLogger.debug('Vision client with classification not configured; skipping photo dish extraction');
    return [];
  }

  const photos = Array.isArray(details?.photos) ? details.photos.slice(1) : [];
  if (photos.length === 0) {
    return [];
  }

  const desiredCount = Math.max(
    1,
    context.maxDishPhotosPerRestaurant ?? context.maxDishesPerRestaurant ?? 5
  );
  const scanLimit = Math.min(photos.length, desiredCount * 4);
  const collected: DishTemplate[] = [];
  const minConfidence = context.minDishPhotoConfidence ?? 0.35;

  for (let i = 0; i < scanLimit && collected.length < desiredCount; i += 1) {
    const photoRef = photos[i]?.photo_reference;
    if (!photoRef) {
      continue;
    }

    let photoData;
    try {
      photoData = await context.googleClient.fetchPhoto(photoRef, {
        maxwidth: context.photoMaxWidth || 1280,
      });
    } catch (error) {
      placeLogger.debug('Failed to fetch Google photo', {
        placeId: details.place_id,
        photoReference: photoRef,
        error: (error as Error).message,
      });
      continue;
    }

    if (!photoData || !photoData.buffer || photoData.buffer.length === 0) {
      continue;
    }

    const photoHash = createHash('sha1').update(Buffer.from(photoData.buffer)).digest('hex');

    let classification: DishPhotoClassification | null = null;

    try {
      classification = await context.visionClient.classifyDishPhoto({
        photo: photoData,
        placeId: details.place_id,
        photoReference: photoRef,
        restaurantName: details.name || null,
      });
    } catch (error) {
      placeLogger.debug('Vision classification failed for photo', {
        placeId: details.place_id,
        photoReference: photoRef,
        error: (error as Error).message,
      });
    }

    if (
      !classification ||
      !classification.is_dish ||
      (classification.confidence ?? 0) < minConfidence
    ) {
      await upsertRawPhotoRecord(context.supabase, placeLogger, {
        placeId: details.place_id,
        photoReference: photoRef,
        width: photoData.width,
        height: photoData.height,
        hash: photoHash,
        classification,
        insight: null,
      });
      continue;
    }

    let insight: DishPhotoInsight | null = null;

    try {
      insight = await context.visionClient.describeDishPhoto({
        photo: photoData,
        placeId: details.place_id,
        photoReference: photoRef,
        restaurantName: details.name || null,
        cuisineType: cuisines[0] || null,
      });
    } catch (error) {
      placeLogger.debug('Vision insight failed for photo', {
        placeId: details.place_id,
        photoReference: photoRef,
        error: (error as Error).message,
      });
    }

    const uploadedUrl = await uploadDishPhoto(
      context.supabase,
      photoData,
      details.place_id,
      photoRef,
      context.bucket,
      placeLogger
    );

    if (!uploadedUrl) {
      await upsertRawPhotoRecord(context.supabase, placeLogger, {
        placeId: details.place_id,
        photoReference: photoRef,
        width: photoData.width,
        height: photoData.height,
        hash: photoHash,
        classification,
        insight,
      });
      continue;
    }

    gallery.push({
      url: uploadedUrl,
      type: 'dish',
      label: insight?.dish_guess || `Dish ${collected.length + 1}`,
      source_type: 'photo',
    });

    await upsertRawPhotoRecord(context.supabase, placeLogger, {
      placeId: details.place_id,
      photoReference: photoRef,
      width: photoData.width,
      height: photoData.height,
      hash: photoHash,
      classification,
      insight,
      storageUrl: uploadedUrl,
    });

    collected.push({
      placeId: details.place_id,
      name: buildPhotoDishName(insight, cuisines, collected.length),
      description: buildPhotoDishDescription(insight, details.name || null),
      price: pickDishPrice(insight, details.price_level, collected.length),
      image_url: uploadedUrl,
      cuisine_type: insight?.cuisine_guess || cuisines[0] || null,
      dietary_tags: insight?.dietary_tags ?? null,
      googlePlaceId: details.place_id,
      googlePhotoReference: photoRef,
      source_type: 'photo',
      source_review_id: null,
      source_photo_reference: photoRef,
      confidence: insight?.confidence ?? classification.confidence ?? 0.6,
      review_excerpt: null,
      menu_section: null,
      captured_at: null,
      photo_insight: insight,
      photo_classification: classification,
      prehydrated: true,
    });
  }

  return collected;
};

const dedupeDishesByName = (dishes: DishTemplate[]) => {
  const seen = new Set<string>();
  return dishes.filter((dish) => {
    const key = dish.name.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};


interface HydrateDishOptions {
  templates: DishTemplate[];
  context: LoadContext;
  placeId: string;
  restaurantImageUrl: string | null;
  restaurantName: string | null;
  gallery: PhotoGalleryEntry[];
  placeLogger: LoaderLogger;
}

const hydrateDishTemplates = async ({
  templates,
  context,
  placeId,
  restaurantImageUrl,
  restaurantName,
  gallery,
  placeLogger,
}: HydrateDishOptions): Promise<DishTemplate[]> => {
  if (templates.length === 0) {
    return [];
  }

  const concurrency = Math.max(1, context.dishPhotoConcurrency ?? 2);
  let remainingPhotoSlots = context.maxDishPhotosPerRestaurant ?? 3;
  const hydrated: DishTemplate[] = new Array(templates.length);
  const pending: Promise<void>[] = [];
  const minDishConfidence = context.minDishPhotoConfidence ?? 0.35;

  const processTemplate = async (template: DishTemplate, index: number) => {
    if (template.prehydrated) {
      hydrated[index] = template;
      return;
    }

    // Only fallback to restaurant hero for explicit fallback templates
    const shouldUseRestaurantFallback = template.source_type === 'fallback';
    let imageUrl = template.image_url ?? (shouldUseRestaurantFallback ? restaurantImageUrl : null);
    let photoReference = template.googlePhotoReference ?? template.source_photo_reference ?? null;
    let photoInsight = template.photo_insight ?? null;
    let photoClassification = template.photo_classification ?? null;

    // Only use photos that are explicitly associated with this dish
    // Don't assign random photos to review dishes - it causes mismatches
    const templatePhotoReference = template.googlePhotoReference ?? template.source_photo_reference ?? undefined;
    
    const canUsePhoto =
      Boolean(templatePhotoReference) && 
      template.source_type !== 'review' && // Don't assign photos to review dishes
      (context.maxDishPhotosPerRestaurant ?? 0) !== 0 && 
      remainingPhotoSlots > 0;

    if (canUsePhoto) {
      remainingPhotoSlots -= 1;
      try {
        const photoData = await context.googleClient.fetchPhoto(templatePhotoReference, {
          maxwidth: context.photoMaxWidth || 1280,
        });

        if (!photoData) {
          placeLogger.warn('Google Places returned empty photo payload for dish', {
            placeId,
            dishName: template.name,
          });
        } else {
          const photoHash = createHash('sha1').update(Buffer.from(photoData.buffer)).digest('hex');

          if (context.visionClient?.classifyDishPhoto) {
            try {
              const classification = await context.visionClient.classifyDishPhoto({
                photo: photoData,
                placeId,
                photoReference: templatePhotoReference ?? null,
                restaurantName,
              });

              if (classification) {
                photoClassification = classification;

                const passesThreshold =
                  classification.is_dish && (classification.confidence ?? 1) >= minDishConfidence;

                if (!passesThreshold) {
                  placeLogger.debug('Vision rejected photo as non-dish', {
                    placeId,
                    dishName: template.name,
                    confidence: classification.confidence,
                  });

                  hydrated[index] = {
                    ...template,
                    image_url: null,
                    googlePhotoReference: null,
                    photo_insight: null,
                    photo_classification: classification,
                  };

                  await upsertRawPhotoRecord(context.supabase, placeLogger, {
                    placeId,
                    photoReference: templatePhotoReference as string,
                    width: photoData.width,
                    height: photoData.height,
                    hash: photoHash,
                    classification,
                    insight: null,
                  });

                  return;
                }
              }
            } catch (classificationError) {
              placeLogger.debug('Failed to classify dish photo', {
                placeId,
                dishName: template.name,
                error: classificationError instanceof Error ? classificationError.message : String(classificationError),
              });
            }
          }

          if (context.visionClient) {
            try {
              const insight = await context.visionClient.describeDishPhoto({
                photo: photoData,
                placeId,
                photoReference: templatePhotoReference ?? null,
                restaurantName,
                dishName: template.name,
                cuisineType: template.cuisine_type,
                reviewExcerpt: template.review_excerpt,
                sourceType: template.source_type,
              });

              if (insight) {
                photoInsight = insight;
              }
            } catch (visionError) {
              placeLogger.debug('Failed to generate photo insight', {
                placeId,
                dishName: template.name,
                error: visionError instanceof Error ? visionError.message : String(visionError),
              });
            }
          }

          const uploadedUrl = await uploadDishPhoto(
            context.supabase,
            photoData,
            placeId,
            templatePhotoReference as string,
            context.bucket,
            placeLogger
          );
          if (uploadedUrl) {
            imageUrl = uploadedUrl;
            photoReference = templatePhotoReference || null;
            gallery.push({
              url: uploadedUrl,
              type: 'dish',
              label: template.name,
              source_type: template.source_type ?? ('photo' as const),
            });
          } else {
            placeLogger.debug('Photo upload returned null URL', {
              placeId,
              dishName: template.name,
            });
          }

          await upsertRawPhotoRecord(context.supabase, placeLogger, {
            placeId,
            photoReference: templatePhotoReference as string,
            width: photoData.width,
            height: photoData.height,
            hash: photoHash,
            classification: photoClassification,
            insight: photoInsight,
            storageUrl: imageUrl,
          });
        }
      } catch (error) {
        placeLogger.warn('Failed to hydrate dish photo', {
          placeId,
          dishName: template.name,
          error: (error as Error).message,
        });
        // Don't fall back to restaurant image for photo dishes if upload fails
        if (template.source_type === 'photo') {
          imageUrl = null;
        }
      }
    }

    // Only use restaurant fallback if explicitly allowed and no image yet
    if (!imageUrl && shouldUseRestaurantFallback && restaurantImageUrl) {
      imageUrl = restaurantImageUrl;
    }

    hydrated[index] = {
      ...template,
      image_url: imageUrl,
      googlePhotoReference: photoReference,
      photo_insight: photoInsight ?? null,
      photo_classification: photoClassification ?? null,
    };
  };

  const enqueue = async (template: DishTemplate, index: number) => {
    const task = processTemplate(template, index);
    if (concurrency <= 1) {
      await task;
    } else {
      pending.push(task);
      if (pending.length >= concurrency) {
        await pending.shift();
      }
    }
  };

  for (let i = 0; i < templates.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await enqueue(templates[i], i);
  }

  await Promise.all(pending);
  return hydrated.filter(Boolean);
};
export const generateRegionKey = ({
  latitude,
  longitude,
  radius,
  keyword,
}: Pick<RegionDefinition, 'latitude' | 'longitude' | 'radius' | 'keyword'>) => {
  const roundedLat = Number(latitude).toFixed(4);
  const roundedLng = Number(longitude).toFixed(4);
  const normalizedKeyword = (keyword || '').trim().toLowerCase();
  return `${roundedLat}:${roundedLng}:${radius}:${normalizedKeyword}`;
};

export const upsertRegion = async (
  supabase: SupabaseClient,
  region: RegionDefinition,
  logger: LoaderLogger
) => {
  const regionKey = generateRegionKey(region);
  const scopedLogger = withContext(logger, { component: 'loader.region', regionKey });

  const payload = {
    id: region.id,
    region_key: regionKey,
    name: region.name ?? null,
    latitude: region.latitude,
    longitude: region.longitude,
    radius: region.radius,
    keyword: region.keyword ?? null,
  };

  scopedLogger.debug('Upserting region', payload);

  const { data, error } = await supabase
    .from('regions')
    .upsert(payload, { onConflict: 'region_key', ignoreDuplicates: false })
    .select('*')
    .limit(1);

  if (error) {
    scopedLogger.error('Failed to upsert region', { error: error.message });
    throw error;
  }

  scopedLogger.info('Region upserted', {
    id: data?.[0]?.id,
    updated: Boolean(region.id),
  });

  return data?.[0];
};

interface LoadContext {
  supabase: SupabaseClient;
  bucket: string;
  maxResults?: number;
  radius?: number;
  keyword?: string;
  location: { lat: number; lng: number } | string;
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

type ReviewSubject = 'restaurant' | 'dish';

const enqueueReviewTasks = async (
  supabase: SupabaseClient,
  logger: LoaderLogger,
  subjectType: ReviewSubject,
  records: any[] | null | undefined,
  runId?: string | null,
  priority?: number
) => {
  if (!records || records.length === 0) {
    return;
  }

  const payload = records.map((record) => ({
    subject_type: subjectType,
    subject_id: record.id,
    source_run_id: runId ?? null,
    status: 'pending',
    priority: priority ?? 0,
  }));

  try {
    const { error } = await supabase
      .from('data_review_queue')
      .upsert(payload, { onConflict: 'subject_type,subject_id' });

    if (error) {
      logger.warn('Failed to enqueue review tasks', {
        subjectType,
        error: error.message,
      });
    }
  } catch (error) {
    logger.warn('Unexpected error while enqueueing review tasks', {
      subjectType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const persistDishVersions = async (
  supabase: SupabaseClient,
  logger: LoaderLogger,
  dishes: Array<Record<string, any>>
) => {
  const dishIds = dishes.map((dish) => dish.id).filter(Boolean);
  if (dishIds.length === 0) return;

  const { data: existingVersions, error: versionError } = await supabase
    .from('dish_versions')
    .select('dish_id, version_number')
    .in('dish_id', dishIds)
    .order('version_number', { ascending: false });

  if (versionError) {
    logger.warn('Unable to look up existing dish versions', { error: versionError.message });
    return;
  }

  const currentVersionByDish = new Map<string, number>();
  (existingVersions || []).forEach((record) => {
    if (!currentVersionByDish.has(record.dish_id)) {
      currentVersionByDish.set(record.dish_id, record.version_number || 0);
    }
  });

  const payload = dishes.map((dish) => {
    const nextVersion = (currentVersionByDish.get(dish.id) ?? 0) + 1;

    return {
      dish_id: dish.id,
      version_number: nextVersion,
      payload: dish,
      completeness_score: dish.completeness_score ?? null,
      missing_fields: dish.missing_fields ?? null,
      needs_manual_review: dish.needs_manual_review ?? false,
      is_published: dish.is_published ?? false,
      created_at: dish.updated_at ?? dish.created_at ?? null,
    };
  });

  const { error } = await supabase
    .from('dish_versions')
    .upsert(payload, { onConflict: 'dish_id,version_number' });

  if (error) {
    logger.warn('Failed to persist dish versions', { error: error.message });
  }
};

export type PersistenceContext = Pick<
  LoadContext,
  'supabase' | 'logger' | 'dryRun' | 'profileId' | 'runId' | 'reviewPriority'
>;

export const persistRestaurantsAndDishes = async (
  context: PersistenceContext,
  restaurantRecords: Map<string, any>,
  dishTemplates: DishTemplate[]
) => {
  const scopedLogger = withContext(context.logger, { component: 'loader.persist' });

  if (restaurantRecords.size === 0) {
    scopedLogger.warn('No restaurant records were generated');
    return { restaurants: [], dishes: [] };
  }

  if (context.dryRun) {
    scopedLogger.info('Dry run enabled; skipping Supabase persistence');
    return {
      restaurants: Array.from(restaurantRecords.values()),
      dishes: dishTemplates,
    };
  }

  const restaurantPayload = Array.from(restaurantRecords.values());

  scopedLogger.info('Upserting restaurants', { count: restaurantPayload.length });

  const { data: restaurants, error: restaurantError } = await context.supabase
    .from('restaurants')
    .upsert(restaurantPayload, {
      onConflict: 'region_id,place_id',
      ignoreDuplicates: false,
    })
    .select('*');

  if (restaurantError) {
    scopedLogger.error('Failed to upsert restaurants', { error: restaurantError.message });
    throw restaurantError;
  }

  if (!context.dryRun && restaurants && restaurants.length > 0) {
    await enqueueReviewTasks(
      context.supabase,
      scopedLogger,
      'restaurant',
      restaurants,
      context.runId,
      context.reviewPriority
    );
  }

  const restaurantByPlaceId = new Map<string, any>(
    (restaurants || []).map((restaurant: any) => [restaurant.place_id, restaurant])
  );

  const dishesPayload = dishTemplates
    .map((dish) => {
      const restaurant = restaurantByPlaceId.get(dish.placeId);
      if (!restaurant) {
        return null;
      }

      const completeness = computeDishCompleteness({
        imageUrl: dish.image_url || restaurant.image_url,
        description: dish.description,
        price: dish.price,
        optionSets: (dish as any).option_sets ?? null,
      });

      return {
        restaurant_id: restaurant.id,
        name: dish.name,
        name_norm: dish.name?.toLowerCase().trim() || '',
        description: dish.description,
        price: dish.price,
        image_url: dish.image_url || restaurant.image_url,
        source_image_url: dish.image_url || null,
        cuisine_type: dish.cuisine_type,
        dietary_tags: dish.dietary_tags,
        google_place_id: dish.googlePlaceId || restaurant.place_id || null,
        google_photo_reference: dish.googlePhotoReference ?? dish.source_photo_reference ?? null,
        source_type: dish.source_type ?? null,
        source_review_id: dish.source_review_id ?? null,
        source_photo_reference: dish.source_photo_reference ?? dish.googlePhotoReference ?? null,
        confidence_score: dish.confidence ?? null,
        menu_section: dish.menu_section ?? null,
        review_excerpt: dish.review_excerpt ?? null,
        captured_at: dish.captured_at ?? null,
        photo_insight: dish.photo_insight ?? null,
        photo_insight_model: dish.photo_insight?.model ?? null,
        photo_insight_confidence: dish.photo_insight?.confidence ?? null,
        photo_is_dish: dish.photo_classification?.is_dish ?? null,
        photo_is_dish_confidence: dish.photo_classification?.confidence ?? null,
        photo_tags:
          (dish.photo_insight?.tags && dish.photo_insight.tags.length > 0 ? dish.photo_insight.tags : null) ??
          (dish.photo_classification?.tags && dish.photo_classification.tags.length > 0
            ? dish.photo_classification.tags
            : null),
        option_sets: (dish as any).option_sets ?? null,
        managed_by_profile_id: context.profileId ?? null,
        source_run_id: context.runId ?? null,
        review_status: 'pending',
        completeness_score: completeness.score,
        missing_fields: completeness.missingFields,
        needs_manual_review: completeness.needsManualReview,
        is_published: false,
      };
    })
    .filter(Boolean) as Array<{
    restaurant_id: string;
    name: string;
    name_norm: string;
    description: string;
    price: number;
    image_url: string | null;
    cuisine_type: string | null;
    dietary_tags: string[] | null;
    google_place_id: string | null;
    google_photo_reference: string | null;
    source_type: string | null;
    source_review_id: string | null;
    source_photo_reference: string | null;
    confidence_score: number | null;
    menu_section: string | null;
    review_excerpt: string | null;
    captured_at: string | null;
    photo_insight: Record<string, unknown> | null;
    photo_insight_model: string | null;
    photo_insight_confidence: number | null;
    photo_is_dish: boolean | null;
    photo_is_dish_confidence: number | null;
    photo_tags: string[] | null;
    option_sets: Record<string, unknown>[] | null;
    managed_by_profile_id: string | null;
    source_run_id: string | null;
    review_status: string;
    source_image_url: string | null;
    completeness_score: number | null;
    missing_fields: Record<string, unknown> | null;
    needs_manual_review: boolean;
    is_published: boolean;
  }>;

  let dishes: any[] = [];

  if (dishesPayload.length > 0) {
    scopedLogger.info('Upserting dishes', { count: dishesPayload.length });
    const { data, error: dishError } = await context.supabase
      .from('dishes')
      .upsert(dishesPayload, {
        onConflict: 'restaurant_id,name',
        ignoreDuplicates: false,
      })
      .select('*');

    if (dishError) {
      scopedLogger.error('Failed to upsert dishes', { error: dishError.message });
      throw dishError;
    }

    dishes = data || [];
  } else {
    scopedLogger.info('No dish payload generated');
  }

  if (!context.dryRun && dishes.length > 0) {
    await persistDishVersions(context.supabase, scopedLogger, dishes);
    await enqueueReviewTasks(
      context.supabase,
      scopedLogger,
      'dish',
      dishes,
      context.runId,
      context.reviewPriority
    );
  }

  return {
    restaurants: restaurants || [],
    dishes,
  };
};

const loadRestaurantsForRegion = async (context: LoadContext, regionRecord: any) => {
  const scopedLogger = withContext(context.logger, {
    component: 'loader.region',
    regionId: regionRecord.id,
    regionName: regionRecord.name ?? undefined,
  });

  const searchResults = await context.googleClient.nearbySearch({
    location: context.location,
    radius: context.radius,
    keyword: context.keyword,
    maxResults: context.maxResults,
  });

  if (searchResults.length === 0) {
    scopedLogger.info('Nearby search returned no results');
    return { restaurants: [], dishes: [] };
  }

  scopedLogger.info('Processing search results', { total: searchResults.length });

  const restaurantRecords = new Map<string, any>();
  const dishTemplates: DishTemplate[] = [];
  let processed = 0;
  const detailsMap = await context.googleClient.getPlaceDetailsBatch(
    searchResults.map((place) => place.place_id),
    {
      concurrency: context.detailConcurrency,
    }
  );

  for (const place of searchResults) {
    const placeLogger = withContext(scopedLogger, { placeId: place.place_id });
    processed += 1;
    placeLogger.info('Processing place', { index: processed, total: searchResults.length });
    try {
      const details = detailsMap.get(place.place_id);

      if (!details) {
        placeLogger.warn('No details returned for place');
        continue;
      }

      let imageUrl: string | null = null;
      let photoReference: string | null = null;
      const gallery: PhotoGalleryEntry[] = [];

      if (details.photos && details.photos.length > 0) {
        try {
          photoReference = details.photos[0].photo_reference || null;
          const photoData = await context.googleClient.fetchPhoto(photoReference ?? undefined, {
            maxwidth: context.photoMaxWidth || (context.radius && context.radius > 3500 ? 2048 : 1280),
          });
          imageUrl = await uploadRestaurantPhoto(
            context.supabase,
            photoData,
            details.place_id,
            context.bucket,
            placeLogger
          );
          if (imageUrl) {
            gallery.push({
              url: imageUrl,
              type: 'restaurant',
              label: 'Hero',
              source_type: 'restaurant',
            });
          }
        } catch (photoError) {
          placeLogger.warn('Unable to process photo for place', {
            error: (photoError as Error).message,
          });
        }
      }

      const cuisines = deriveCuisines(details);
      const dishGroups = createDishTemplates(details, {
        fallbackImageUrl: imageUrl,
        fallbackPhotoReference: photoReference,
        priceLevel: details.price_level,
        cuisines,
        restaurantName: details.name || 'Unknown Restaurant',
        maxReviewDishes: context.maxReviewDishes,
      });

      const photoDrivenDishes = await generatePhotoDishTemplates({
        details,
        context,
        cuisines,
        gallery,
        placeLogger,
      });

      const externalPhotoDishes = await ingestExternalPhotoDishes({
        details,
        context,
        cuisines,
        gallery,
        placeLogger,
      });

      const { matchedReviews, remainingPhotos } = matchReviewDishesToPhotos(
        dishGroups.reviewDishes,
        [...photoDrivenDishes, ...externalPhotoDishes]
      );

      const maxDishes = context.maxDishesPerRestaurant ?? null;
      let candidateDishes = dedupeDishesByName([...matchedReviews, ...remainingPhotos]);

      if (maxDishes && candidateDishes.length > maxDishes) {
        candidateDishes = candidateDishes.slice(0, maxDishes);
      }

      if (!maxDishes || candidateDishes.length < maxDishes) {
        const remainingSlots = maxDishes ? Math.max(0, maxDishes - candidateDishes.length) : undefined;
        const menuAdditions = remainingSlots
          ? dishGroups.menuDishes.slice(0, remainingSlots)
          : dishGroups.menuDishes;
        candidateDishes = dedupeDishesByName([...candidateDishes, ...menuAdditions]);
        if (maxDishes && candidateDishes.length > maxDishes) {
          candidateDishes = candidateDishes.slice(0, maxDishes);
        }
      }

      if (candidateDishes.length === 0 && dishGroups.fallbackDishes.length > 0) {
        candidateDishes = dishGroups.fallbackDishes;
      }

      const hydratedDishes = await hydrateDishTemplates({
        templates: candidateDishes,
        context,
        placeId: details.place_id,
        restaurantImageUrl: imageUrl,
        restaurantName: details.name || null,
        gallery,
        placeLogger,
      });

      const reviewSummary = summarizeReviews(details.reviews);

      restaurantRecords.set(details.place_id, {
        region_id: regionRecord.id,
        place_id: details.place_id,
        name: details.name,
        description: null,
        address: details.formatted_address || null,
        latitude: details.geometry?.location?.lat ?? null,
        longitude: details.geometry?.location?.lng ?? null,
        cuisine_type: cuisines[0] || null,
        price_range: mapPriceLevelToRange(details.price_level),
        image_url: imageUrl,
        rating: details.rating ?? null,
        review_count: details.user_ratings_total ?? null,
        website_url: details.website ?? null,
        phone_number: details.international_phone_number ?? null,
        menu_url: null,
        photo_gallery: gallery,
        review_summary: reviewSummary,
        // Google Places API metadata (removed - not available in basic API)
        serves_beer: null,
        serves_wine: null,
        serves_vegetarian: null,
        good_for_children: null,
        wheelchair_accessible: null,
        takeout: null,
        delivery: null,
        dine_in: null,
        reservable: null,
        place_types: details.types ?? null,
        managed_by_profile_id: context.profileId ?? null,
        source_run_id: context.runId ?? null,
        review_status: 'pending',
      });

      dishTemplates.push(...hydratedDishes);
    } catch (error) {
      placeLogger.warn('Skipping place due to error', { error: (error as Error).message });
    }
  }

  return persistRestaurantsAndDishes(
    {
      supabase: context.supabase,
      logger: scopedLogger,
      dryRun: context.dryRun,
      profileId: context.profileId ?? null,
      runId: context.runId ?? null,
      reviewPriority: context.reviewPriority,
    },
    restaurantRecords,
    dishTemplates
  );
};

export const loadRestaurantsFromGooglePlaces = async (
  supabase: SupabaseClient,
  options: LoaderOptions
): Promise<LoaderResult> => {
  const apiKey = options.apiKey || (globalThis as any)?.process?.env?.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('A Google Maps API key is required. Set GOOGLE_MAPS_API_KEY or pass apiKey in options.');
  }

  const parseLocation = (value: string | { lat: number; lng: number }) => {
    if (typeof value === 'string') {
      const [latStr, lngStr] = value.split(',').map((part) => part.trim());
      if (!latStr || !lngStr) {
        throw new Error('Location string must be in "lat,lng" format.');
      }
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        throw new Error('Latitude and longitude must be valid numbers.');
      }
      return { lat, lng };
    }
    return { lat: Number(value.lat), lng: Number(value.lng) };
  };

  const logger = withContext(options.logger ?? defaultLogger, {
    component: 'loader.entry',
    regionId: options.regionId ?? undefined,
  });

  logger.info('Starting Google Places load', {
    hasExplicitKey: Boolean(options.apiKey),
    radius: options.radius,
    keyword: options.keyword,
    regionName: options.regionName,
  });

  const location = parseLocation(options.location);
  logger.debug('Parsed location', location);

  const baseRegion: RegionDefinition = {
    id: options.regionId,
    name: options.regionName ?? null,
    latitude: location.lat,
    longitude: location.lng,
    radius: options.radius ?? 1500,
    keyword: options.keyword ?? null,
  };

  const regionKey = generateRegionKey(baseRegion);
  const isDryRun = Boolean(options.dryRun);
  let regionRecord: any;

  if (isDryRun) {
    if (options.regionId) {
      const { data } = await supabase.from('regions').select('*').eq('id', options.regionId).single();
      regionRecord = data ?? { ...baseRegion, id: options.regionId, region_key: regionKey };
    } else {
      regionRecord = { ...baseRegion, id: `dry-run-${regionKey}`, region_key: regionKey };
    }
  } else {
    regionRecord = await upsertRegion(supabase, baseRegion, logger);
  }

  if (!regionRecord) {
    throw new Error('Failed to create or retrieve region record.');
  }

  const now = new Date().toISOString();

  if (!isDryRun) {
    await supabase
      .from('regions')
      .update({ refresh_requested_at: now, status: 'refreshing' })
      .eq('id', regionRecord.id);
    logger.info('Marked region as refreshing', { regionId: regionRecord.id });
  } else {
    logger.info('Dry run enabled; skipping region status update');
  }

  const googleClient = new GooglePlacesClient({
    apiKey,
    logger: withContext(logger, { regionId: regionRecord.id }),
    enableCache: true,
    maxConcurrency: options.googleDetailConcurrency,
  });

  let visionClient: VisionClient | undefined;
  if (options.enablePhotoInsights && options.visionModel) {
    try {
      visionClient = createLocalVisionClient({
        model: options.visionModel,
        endpoint: options.visionEndpoint,
        temperature: options.visionTemperature,
        promptTemplate: options.visionPromptTemplate,
        logger: withContext(logger, { component: 'vision', regionId: regionRecord.id }),
      });
    } catch (error) {
      logger.warn('Failed to initialize local vision client', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let loadResult: Awaited<ReturnType<typeof loadRestaurantsForRegion>>;

  try {
    loadResult = await loadRestaurantsForRegion(
      {
        supabase,
        bucket: options.photoBucket || DEFAULT_BUCKET,
        maxResults: options.maxResults,
        radius: options.radius,
        keyword: options.keyword,
        location,
        photoMaxWidth: options.photoMaxWidth,
        logger: withContext(logger, { regionId: regionRecord.id }),
        googleClient,
        dryRun: isDryRun,
        maxDishesPerRestaurant: options.maxDishesPerRestaurant,
        maxDishPhotosPerRestaurant: options.maxDishPhotosPerRestaurant,
        maxReviewDishes: options.maxReviewDishes,
        dishPhotoConcurrency: options.dishPhotoConcurrency,
        detailConcurrency: options.googleDetailConcurrency,
        visionClient,
        minDishPhotoConfidence: options.minDishPhotoConfidence,
        profileId: options.profileId ?? null,
        runId: options.runId ?? null,
        reviewPriority: options.reviewPriority ?? 0,
      },
      regionRecord
    );
  } catch (error) {
    if (!isDryRun) {
      const failureCompletedAt = new Date().toISOString();
      const refreshLog = {
        started_at: now,
        completed_at: failureCompletedAt,
        keyword: options.keyword ?? null,
        dry_run: isDryRun,
        error: error instanceof Error ? error.message : String(error),
      };

      const { error: regionUpdateError } = await supabase
        .from('regions')
        .update({ status: 'error', refresh_log: refreshLog })
        .eq('id', regionRecord.id);

      if (regionUpdateError) {
        logger.error('Failed to mark region as error after refresh failure', {
          regionId: regionRecord.id,
          error: regionUpdateError.message,
        });
      }
    }

    logger.error('Region refresh failed', {
      regionId: regionRecord.id,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }

  const refreshCompletedAt = new Date().toISOString();
  let updatedRegion = regionRecord;

  if (!isDryRun) {
    const refreshLog = {
      started_at: now,
      completed_at: refreshCompletedAt,
      restaurants: loadResult.restaurants.length,
      dishes: loadResult.dishes.length,
      keyword: options.keyword ?? null,
      dry_run: isDryRun,
    };

    const { data } = await supabase
      .from('regions')
      .update({
        last_refreshed_at: refreshCompletedAt,
        status: 'ready',
        restaurant_count: loadResult.restaurants.length,
        dish_count: loadResult.dishes.length,
        refresh_log: refreshLog,
      })
      .eq('id', regionRecord.id)
      .select('*')
      .single();

    updatedRegion = data || regionRecord;
    logger.info('Region refresh complete', {
      regionId: regionRecord.id,
      restaurants: loadResult.restaurants.length,
      dishes: loadResult.dishes.length,
    });
  } else {
    logger.info('Dry run complete', {
      restaurants: loadResult.restaurants.length,
      dishes: loadResult.dishes.length,
    });
  }

  return {
    region: updatedRegion || regionRecord,
    restaurants: loadResult.restaurants,
    dishes: loadResult.dishes,
  };
};

export const createRegionIfMissing = async (
  supabase: SupabaseClient,
  region: RegionDefinition,
  logger: LoaderLogger = defaultLogger
) => {
  const record = await upsertRegion(supabase, region, logger);
  return record;
};

export type { NearbySearchOptions } from './google';
export { uploadPhotoToStorage } from './storage.js';
export { MenuIngestionAgent } from './menu/agent.js';
export { BasicMenuScraper } from './menu/basic-scraper.js';
export { LocalTextModel } from './menu/llm-client.js';
export { LlmGuardrailModel } from './menu/llm-guardrail.js';
export { computeDishCompleteness, summarizeMissingFields } from './completeness.js';
export { loadRestaurantsHybrid, HybridLoader } from './hybrid-loader.js';
export type {
  MenuIngestionOutcome,
  RestaurantContext,
  MenuScraper,
  MenuGuardrailModel,
  LlmClient,
} from './menu/types.js';

