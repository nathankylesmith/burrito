import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { DishTemplate } from '../dishes/types.js';
import type { LoaderResult, RegionDefinition } from '../index.js';
import { generateRegionKey, persistRestaurantsAndDishes, upsertRegion } from '../index.js';
import { defaultLogger, LoaderLogger, withContext } from '../logger.js';

interface MenuDishCandidate {
  name: string;
  description?: string | null;
  price?: number | null;
  menu_section?: string | null;
}

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
  location: { lat: number; lng: number } | string;
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

const extractTextFromPdf = (buffer: ArrayBuffer) => {
  const binary = Buffer.from(buffer).toString('latin1');
  const cleaned = binary.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
};

const extractTextFromHtml = (html: string) => {
  const withBreaks = html
    .replace(/<\/(p|div|li|br)[^>]*>/gi, '\n')
    .replace(/<(p|div|li|br)[^>]*>/gi, '\n');
  const withoutScripts = withBreaks
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const textOnly = withoutScripts.replace(/<[^>]+>/g, ' ');
  return textOnly.replace(/\s+/g, ' ').trim();
};

const fetchMenuText = async (source: MenuSource, logger: LoaderLogger) => {
  const response = await fetch(source.menuUrl);
  if (!response.ok) {
    throw new Error(`Failed to download menu from ${source.menuUrl}: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = await response.arrayBuffer();
  const isPdf = contentType.toLowerCase().includes('pdf') || source.menuUrl.toLowerCase().endsWith('.pdf');
  const text = isPdf ? extractTextFromPdf(buffer) : extractTextFromHtml(new TextDecoder().decode(buffer));

  if (!text) {
    logger.warn('Menu content was empty after normalization', { menuUrl: source.menuUrl });
  }

  return text;
};

const normalizePrice = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseDishResponse = (content: string): MenuDishCandidate[] => {
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  const target = jsonMatch ? jsonMatch[0] : content;
  const parsed = JSON.parse(target);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item) => ({
      name: typeof item.name === 'string' ? item.name : '',
      description: typeof item.description === 'string' ? item.description : null,
      price: normalizePrice(item.price),
      menu_section: typeof item.menu_section === 'string' ? item.menu_section : null,
    }))
    .filter((item) => item.name);
};

const callMenuModel = async (
  menuText: string,
  restaurantName: string,
  options: { endpoint?: string; model?: string; apiKey?: string }
): Promise<MenuDishCandidate[]> => {
  const endpoint = options.endpoint ?? 'https://api.openai.com/v1/chat/completions';
  const model = options.model ?? 'gpt-4o-mini';
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY or llmApiKey is required to scrape menu text.');
  }

  const payload = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'Extract a concise list of dishes from the provided restaurant menu text. Return JSON array with objects: {"name": string, "description": string | null, "price": number | null, "menu_section": string | null}. Keep descriptions under 200 characters.',
      },
      {
        role: 'user',
        content: `Restaurant: ${restaurantName}\nMenu text (truncated):\n${menuText}`,
      },
    ],
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Model request failed with status ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return [];
  }

  try {
    return parseDishResponse(content);
  } catch (error) {
    console.warn('Failed to parse menu model response', error);
    return [];
  }
};

const fallbackDishesFromText = (text: string): MenuDishCandidate[] => {
  const candidates: MenuDishCandidate[] = [];
  const lines = text.split(/\n+/).map((line) => line.trim());
  for (const line of lines) {
    if (line.length < 6) continue;
    const priceMatch = line.match(/\$?\s?(\d+[\d.,]*)/);
    const name = line.replace(/\$?\s?\d+[\d.,]*/, '').trim();
    if (!name) continue;
    candidates.push({ name, description: null, price: normalizePrice(priceMatch?.[1] ?? null), menu_section: null });
    if (candidates.length >= 25) break;
  }
  return candidates;
};

const buildDishTemplates = (dishes: MenuDishCandidate[], placeId: string, source: MenuSource): DishTemplate[] =>
  dishes.map((dish, index) => ({
    placeId,
    name: dish.name || `Menu Dish ${index + 1}`,
    description: dish.description ?? null,
    price: dish.price ?? null,
    image_url: source.imageUrl ?? null,
    cuisine_type: source.cuisine_type ?? null,
    dietary_tags: null,
    googlePlaceId: source.placeId ?? null,
    googlePhotoReference: null,
    source_type: 'menu',
    source_review_id: null,
    source_photo_reference: null,
    confidence: 0.7,
    review_excerpt: null,
    menu_section: dish.menu_section ?? null,
    captured_at: null,
  }));

const buildRestaurantPayload = (
  source: MenuSource,
  regionId: string,
  placeId: string
): Record<string, any> => ({
  region_id: regionId,
  place_id: placeId,
  name: source.name,
  description: null,
  address: source.address ?? null,
  latitude: null,
  longitude: null,
  cuisine_type: source.cuisine_type ?? null,
  price_range: null,
  image_url: source.imageUrl ?? null,
  rating: null,
  review_count: null,
  website_url: source.websiteUrl ?? source.menuUrl,
  phone_number: source.phoneNumber ?? null,
  menu_url: source.menuUrl,
  photo_gallery: null,
  review_summary: null,
  serves_beer: null,
  serves_wine: null,
  serves_vegetarian: null,
  good_for_children: null,
  wheelchair_accessible: null,
  takeout: null,
  delivery: null,
  dine_in: null,
  reservable: null,
  place_types: null,
  managed_by_profile_id: null,
  source_run_id: null,
  review_status: 'pending',
});

const hashPlaceId = (source: MenuSource) =>
  source.placeId || `menu-${createHash('sha1').update(`${source.menuUrl}:${source.name}`).digest('hex').slice(0, 16)}`;

export const loadRestaurantsFromMenuSources = async (
  options: MenuScraperOptions
): Promise<LoaderResult> => {
  const logger = withContext(options.logger ?? defaultLogger, { component: 'loader.menu' });
  const location = parseLocation(options.location);

  const baseRegion: RegionDefinition = {
    id: options.regionId,
    name: options.regionName ?? null,
    latitude: location.lat,
    longitude: location.lng,
    radius: options.radius ?? 1500,
    keyword: null,
  };

  const regionKey = generateRegionKey(baseRegion);
  const isDryRun = Boolean(options.dryRun);
  let regionRecord: any;

  if (isDryRun) {
    if (options.regionId) {
      const { data } = await options.supabase.from('regions').select('*').eq('id', options.regionId).single();
      regionRecord = data ?? { ...baseRegion, id: options.regionId, region_key: regionKey };
    } else {
      regionRecord = { ...baseRegion, id: `dry-run-${regionKey}`, region_key: regionKey };
    }
  } else {
    regionRecord = await upsertRegion(options.supabase, baseRegion, logger);
  }

  if (!regionRecord) {
    throw new Error('Failed to create or retrieve region record.');
  }

  const now = new Date().toISOString();

  if (!isDryRun) {
    await options.supabase
      .from('regions')
      .update({ refresh_requested_at: now, status: 'refreshing' })
      .eq('id', regionRecord.id);
  }

  const restaurantRecords = new Map<string, any>();
  const dishTemplates: DishTemplate[] = [];

  for (const source of options.restaurants) {
    const placeId = hashPlaceId(source);
    const placeLogger = withContext(logger, { placeId, menuUrl: source.menuUrl, name: source.name });
    try {
      const menuText = await fetchMenuText(source, placeLogger);
      if (!menuText) {
        placeLogger.warn('No text extracted from menu');
        continue;
      }

      const truncatedText = menuText.slice(0, 8000);
      const llmDishes = await callMenuModel(truncatedText, source.name, {
        endpoint: options.llmEndpoint,
        model: options.llmModel,
        apiKey: options.llmApiKey,
      });

      const dishes = llmDishes.length > 0 ? llmDishes : fallbackDishesFromText(truncatedText);
      if (dishes.length === 0) {
        placeLogger.warn('Model returned no dishes for menu');
        continue;
      }

      const dishTemplatesForPlace = buildDishTemplates(dishes, placeId, source);
      dishTemplates.push(...dishTemplatesForPlace);

      const restaurantPayload = buildRestaurantPayload(source, regionRecord.id, placeId);
      restaurantPayload.managed_by_profile_id = options.profileId ?? null;
      restaurantPayload.source_run_id = options.runId ?? null;
      restaurantRecords.set(placeId, restaurantPayload);
    } catch (error) {
      placeLogger.warn('Skipping menu source due to error', { error: (error as Error).message });
    }
  }

  let loadResult: Awaited<ReturnType<typeof persistRestaurantsAndDishes>>;

  try {
    loadResult = await persistRestaurantsAndDishes(
      {
        supabase: options.supabase,
        logger,
        dryRun: options.dryRun,
        profileId: options.profileId ?? null,
        runId: options.runId ?? null,
        reviewPriority: options.reviewPriority ?? 0,
      },
      restaurantRecords,
      dishTemplates
    );
  } catch (error) {
    if (!isDryRun) {
      const failureCompletedAt = new Date().toISOString();
      const refreshLog = {
        started_at: now,
        completed_at: failureCompletedAt,
        keyword: null,
        dry_run: isDryRun,
        error: error instanceof Error ? error.message : String(error),
      };

      await options.supabase
        .from('regions')
        .update({ status: 'error', refresh_log: refreshLog })
        .eq('id', regionRecord.id);
    }

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
      keyword: null,
      dry_run: isDryRun,
    };

    const { data } = await options.supabase
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
  }

  return {
    region: updatedRegion || regionRecord,
    restaurants: loadResult.restaurants,
    dishes: loadResult.dishes,
  };
};
