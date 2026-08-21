const slugify = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'restaurant';
};
import type { SupabaseClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { createLogger, LoaderLogger, withContext } from './logger.js';
import { GooglePlacesClient } from './google/client.js';
import { createLocalVisionClient } from './vision/local.js';
import { GeminiVisionClient } from './vision/gemini.js';
import { BasicMenuScraper } from './menu/basic-scraper.js';
import { MenuIngestionAgent } from './menu/agent.js';
import { LlmGuardrailModel } from './menu/llm-guardrail.js';
import { LocalTextModel } from './menu/llm-client.js';
import { GeminiTextModel } from './menu/gemini-client.js';
import { uploadDishPhoto } from './storage.js';
import { persistRestaurantsAndDishes, upsertRegion, generateRegionKey } from './index.js';
import type { RegionDefinition } from './index.js';
import type { DishTemplate } from './dishes/types.js';
import type { PlacePhotoResponse } from './google/types.js';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { CostMonitor } from './cost-monitor.js';

interface RestaurantBasicInfo {
  name: string;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
  place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface HybridLoaderOptions {
  supabase: SupabaseClient;
  location: { lat: number; lng: number };
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

interface ProcessedRestaurantResult {
  placeId: string;
  restaurant: RestaurantBasicInfo & { place_id: string };
  restaurantRecord: Record<string, any> | null;
  dishes: DishTemplate[];
  stats: {
    menuDishes: number;
    visionDishes: number;
    imagesProcessed: number;
    dishesWithImages: number;
  };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const convertWebpToJpeg = async (input: Uint8Array): Promise<Uint8Array> => {
  const buffer = Buffer.from(input);
  const result = await sharp(buffer).jpeg().toBuffer();
  return new Uint8Array(result);
};

/**
 * Hybrid loader that minimizes Google Places API usage by:
 * 1. Getting basic restaurant list with minimal API calls
 * 2. Scraping websites for menus and images
 * 3. Using local vision processing
 * 4. Falling back to Google Places API only for missing data
 */
export class HybridLoader {
  private options: HybridLoaderOptions;
  private logger: LoaderLogger;
  private googleClient?: GooglePlacesClient;
  private visionClient?: any;
  private menuScraper: BasicMenuScraper;
  private menuAgent?: MenuIngestionAgent;
  private costMonitor: CostMonitor;
  private dumpResultsPath?: string;
  private saveScrapesDir?: string;
  private regionRecord: (RegionDefinition & { id?: string }) | null = null;

  constructor(options: HybridLoaderOptions) {
    this.options = options;
    this.logger = options.logger || createLogger('hybrid-loader');
    this.costMonitor = new CostMonitor();

    // Initialize Google client only if API key provided (optional)
    if (options.googleApiKey) {
      this.googleClient = new GooglePlacesClient({
        apiKey: options.googleApiKey,
        logger: this.logger,
        enableCache: true,
      });
    }

    // Initialize vision client
    if (options.visionModel) {
      const visionProvider = (options.visionProvider ?? 'local').toLowerCase() as 'local' | 'gemini';

      if (visionProvider === 'gemini') {
        if (!options.googleApiKey) {
          throw new Error('Gemini vision provider requires a Google API key. Provide --google-api-key or set GOOGLE_PLACES_API_KEY.');
        }
        this.visionClient = new GeminiVisionClient({
          apiKey: options.googleApiKey,
          model: options.visionModel,
          logger: this.logger,
        });
      } else {
        this.visionClient = createLocalVisionClient({
          model: options.visionModel || 'qwen3-vl:8b',
          endpoint: options.visionEndpoint || 'http://127.0.0.1:11434',
          logger: this.logger,
        });
      }
    }

    // Initialize menu scraper
    this.menuScraper = new BasicMenuScraper({
      logger: this.logger,
    });

    // Initialize menu agent if LLM available
    if (options.llmModel) {
      const provider = (options.llmProvider ?? 'local').toLowerCase() as 'local' | 'gemini';
      let llmApiKey = options.llmApiKey;

      if (provider === 'gemini' && !llmApiKey) {
        throw new Error('Gemini LLM provider requires an API key. Provide --llm-api-key or set GOOGLE_GEMINI_API_KEY.');
      }

      const llmClient =
        provider === 'gemini'
          ? new GeminiTextModel({
              apiKey: llmApiKey as string,
              model: options.llmModel,
              endpoint: options.llmEndpoint,
              logger: this.logger,
            })
          : new LocalTextModel({
              model: options.llmModel || 'qwen3-vl:8b',
              endpoint: options.llmEndpoint,
              provider: 'local',
              logger: this.logger,
            });

      const guardrail = new LlmGuardrailModel(llmClient, {
        logger: this.logger,
      });

      this.menuAgent = new MenuIngestionAgent(this.menuScraper, guardrail, {
        logger: this.logger,
      });
    }

    if (options.saveScrapesDir) {
      const resolvedDir = resolve(options.saveScrapesDir);
      mkdirSync(resolvedDir, { recursive: true });
      this.saveScrapesDir = resolvedDir;
      this.logger.info('Scrape saving enabled', { directory: resolvedDir });
    }

    if (options.dumpResultsPath) {
      const resolvedFile = resolve(options.dumpResultsPath);
      mkdirSync(dirname(resolvedFile), { recursive: true });
      this.dumpResultsPath = resolvedFile;
      this.logger.info('Hybrid result dumping enabled', { file: resolvedFile });
    }
  }

  async loadRegion(): Promise<any> {
    const scopedLogger = withContext(this.logger, {
      component: 'hybrid-loader',
      regionName: this.options.regionName,
    });

    scopedLogger.info('Starting hybrid restaurant loading', {
      location: this.options.location,
      radius: this.options.radius,
      maxRestaurants: this.options.maxRestaurants,
    });

    // Track that we're starting a hybrid load operation
    this.costMonitor.trackCall({
      service: 'local-vision',
      operation: 'hybrid-load-start',
      metadata: { restaurantCount: this.options.maxRestaurants },
    });

    await this.ensureRegion(scopedLogger);

    // Step 1: Get basic restaurant list with minimal API usage
    const restaurants = await this.getBasicRestaurantList(scopedLogger);
    scopedLogger.info(`Found ${restaurants.length} restaurants to process`);

    // Step 2: Process each restaurant using scraping-first approach
    const processedResults: ProcessedRestaurantResult[] = [];
    for (const restaurant of restaurants) {
      try {
        const result = await this.processRestaurant(restaurant, scopedLogger);
        if (result) {
          processedResults.push(result);
        }
        // Rate limiting to be respectful to websites
        await sleep(1000);
      } catch (error) {
        scopedLogger.warn(`Failed to process restaurant ${restaurant.name}`, {
          error: (error as Error).message,
        });
      }
    }

    if (!this.options.dryRun && processedResults.length > 0) {
      await this.persistProcessedRestaurants(processedResults, scopedLogger);
    }

    const aggregatedDishes = processedResults.flatMap((item) => item.dishes);
    const restaurantSummaries = processedResults.map((item) => ({
      placeId: item.placeId,
      name: item.restaurant.name,
      website: item.restaurant.website ?? null,
      address: item.restaurant.address ?? null,
      stats: item.stats,
      dishes: item.dishes,
    }));

    // Print cost report
    this.costMonitor.printReport();

    scopedLogger.info('Hybrid loading complete', {
      processed: processedResults.length,
      totalRestaurants: restaurants.length,
    });

    const summaryRegion = {
      id: this.options.regionId ?? null,
      name: this.options.regionName ?? null,
      latitude: this.options.location.lat,
      longitude: this.options.location.lng,
      radius: this.options.radius,
    };

    const payload = {
      region: summaryRegion,
      restaurants: restaurantSummaries,
      dishes: aggregatedDishes,
      costReport: this.costMonitor.generateReport(),
      costData: this.costMonitor.exportData(),
    };

    if (this.dumpResultsPath) {
      try {
        writeFileSync(this.dumpResultsPath, JSON.stringify(payload, null, 2), 'utf-8');
        scopedLogger.info('Hybrid output written to file', { file: this.dumpResultsPath });
      } catch (error) {
        scopedLogger.warn('Failed to write hybrid output file', {
          error: error instanceof Error ? error.message : String(error),
          file: this.dumpResultsPath,
        });
      }
    }

    return payload;
  }

  private async getBasicRestaurantList(logger: LoaderLogger): Promise<RestaurantBasicInfo[]> {
    // Method 1: Use minimal Google Places API calls
    if (this.googleClient) {
      try {
        logger.info('Getting restaurant list from Google Places API');
        // Track Google Places API search
        this.costMonitor.trackGooglePlaces('search', {
          location: this.options.location,
          radius: this.options.radius,
          maxResults: this.options.maxRestaurants,
        });

        const searchResults = await this.googleClient.nearbySearch({
          location: this.options.location,
          radius: this.options.radius,
          maxResults: this.options.maxRestaurants,
          type: 'restaurant',
        });

        logger.info(`Found ${searchResults.length} places from Google Places API`);

        const placeIds = searchResults.map((place) => place.place_id).filter(Boolean) as string[];
        let detailsMap: Map<string, any> | null = null;

        if (placeIds.length > 0) {
          placeIds.forEach((placeId) => {
            this.costMonitor.trackGooglePlaces('details', {
              placeId,
              purpose: 'website-enrichment',
            });
          });

          try {
            detailsMap = await this.googleClient.getPlaceDetailsBatch(placeIds, {
              fields: ['website', 'formatted_address', 'international_phone_number', 'types'],
            });
          } catch (detailError) {
            logger.warn('Unable to fetch place details for websites', {
              error: (detailError as Error).message,
            });
          }
        }

        const restaurants = searchResults
          .map((result) => {
            const details = detailsMap?.get(result.place_id ?? '');
            const website = details?.website || details?.url || result.website || null;
            const phone = details?.international_phone_number || details?.formatted_phone_number || result.formatted_phone_number || null;
            const address = details?.formatted_address || result.formatted_address || result.vicinity || null;
            const types = details?.types || [];

            return {
              name: result.name || 'Unknown Restaurant',
              address,
              website,
              phone,
              place_id: result.place_id,
              latitude: result.geometry?.location?.lat ?? null,
              longitude: result.geometry?.location?.lng ?? null,
              types,
            };
          })
          .filter((restaurant) => {
            // Filter to only actual restaurants
            const types = restaurant.types || [];
            const isRestaurant = types.includes('restaurant') ||
                                types.includes('food') ||
                                types.includes('meal_takeaway') ||
                                types.includes('meal_delivery') ||
                                types.includes('bar') ||
                                types.includes('cafe');

            // Exclude obviously non-restaurant places
            const isNonRestaurant = types.includes('night_club') ||
                                   types.includes('lodging') ||
                                   types.includes('store') ||
                                   types.includes('shopping_mall') ||
                                   types.includes('museum') ||
                                   types.includes('park') ||
                                   types.includes('hospital');

            return isRestaurant && !isNonRestaurant;
          });

        logger.info(`Filtered ${searchResults.length} places down to ${restaurants.length} actual restaurants`);

        return restaurants;
      } catch (error) {
        logger.warn('Google Places API failed, falling back to alternative methods', {
          error: (error as Error).message,
        });
      }
    }

    // Method 2: Fallback - use a directory service or manual list
    // For now, return empty array - user can provide manual restaurant list
    logger.info('Using manual restaurant list (Google API not available or failed)');
    return [];
  }

  private async processRestaurant(
    restaurant: RestaurantBasicInfo,
    logger: LoaderLogger
  ): Promise<ProcessedRestaurantResult | null> {
    const normalizedRestaurant: RestaurantBasicInfo & { place_id: string } = {
      ...restaurant,
      place_id: this.getOrCreatePlaceId(restaurant),
    };

    const placeLogger = withContext(logger, {
      restaurant: normalizedRestaurant.name,
      website: normalizedRestaurant.website,
      placeId: normalizedRestaurant.place_id,
    });

    placeLogger.info('Processing restaurant');

    let menuData: string | null = null;
    let menuText: string | null = null;
    let websiteImages: string[] = [];

    // Step 1: Scrape restaurant website for menu and images
    if (normalizedRestaurant.website) {
      try {
        placeLogger.info('Scraping restaurant website');
        const scrapingResult = await this.scrapeRestaurantWebsite(normalizedRestaurant, placeLogger);
        menuData = scrapingResult.menuData;
        menuText = scrapingResult.menuText;
        websiteImages = scrapingResult.images;
      } catch (error) {
        placeLogger.warn('Website scraping failed', {
          error: (error as Error).message,
        });
      }
    }

    // Step 2: Extract dishes from menu data using local LLM
    let dishes: DishTemplate[] = [];
    if (menuData && this.menuAgent) {
      try {
        placeLogger.info('Extracting dishes from menu data');
        const menuResult = await this.menuAgent.ingestMenu(
          { name: normalizedRestaurant.name },
          [normalizedRestaurant.website || '']
        );

        if (menuResult.accepted.length > 0) {
          dishes = this.convertMenuItemsToDishTemplates(
            menuResult.accepted[0].text || '',
            normalizedRestaurant,
            placeLogger
          );
        } else if (menuText) {
          placeLogger.debug('Guardrail returned no accepted menus; using fallback parser');
          dishes = this.convertMenuItemsToDishTemplates(menuText, normalizedRestaurant, placeLogger, true);
        }
      } catch (error) {
        placeLogger.warn('Menu extraction failed', {
          error: (error as Error).message,
        });
        if (menuText) {
          placeLogger.info('Using fallback menu parsing due to guardrail failure');
          dishes = this.convertMenuItemsToDishTemplates(menuText, normalizedRestaurant, placeLogger, true);
        }
      }
    } else if (menuText) {
      placeLogger.debug('Menu agent unavailable; using fallback parser');
      dishes = this.convertMenuItemsToDishTemplates(menuText, normalizedRestaurant, placeLogger, true);
    }

    // Step 3: Process website images with local vision
    if (websiteImages.length > 0 && this.visionClient) {
      try {
        placeLogger.info(`Processing ${websiteImages.length} website images`);
        const visionDishes = await this.processImagesWithLocalVision(
          websiteImages,
          normalizedRestaurant,
          placeLogger
        );
        dishes = [...dishes, ...visionDishes];
      } catch (error) {
        placeLogger.warn('Image processing failed', {
          error: (error as Error).message,
        });
      }
    }

    // Step 3.5: Deduplicate dishes by restaurant and name to prevent upsert conflicts
    dishes = this.deduplicateDishes(dishes, placeLogger);

    // Step 4: Fill gaps with Google Places API (last resort)
    const missingImages = this.findDishesWithoutImages(dishes);
    if (
      missingImages.length > 0 &&
      this.options.enableGooglePhotoFallback &&
      this.googleClient &&
      normalizedRestaurant.place_id
    ) {
      try {
        placeLogger.info(`Filling ${missingImages.length} missing images from Google Places`);
        await this.fillMissingImagesWithGooglePlaces(
          missingImages,
          normalizedRestaurant,
          placeLogger
        );
      } catch (error) {
        placeLogger.warn('Google Places fallback failed', {
          error: (error as Error).message,
        });
      }
    }

    const stats = this.buildStats(dishes, websiteImages.length);
    const restaurantRecord = this.buildRestaurantRecord(
      normalizedRestaurant.place_id,
      normalizedRestaurant,
      dishes,
      stats
    );

    if (!restaurantRecord && !this.options.dryRun) {
      placeLogger.warn('Unable to build restaurant payload for persistence', {
        placeId: normalizedRestaurant.place_id,
      });
    }

    return {
      placeId: normalizedRestaurant.place_id,
      restaurant: normalizedRestaurant,
      restaurantRecord,
      dishes,
      stats,
    };
  }

  private async scrapeRestaurantWebsite(
    restaurant: RestaurantBasicInfo,
    logger: LoaderLogger
  ): Promise<{ menuData: string; menuText: string | null; images: string[] }> {
    const websiteUrl = restaurant.website || '';
    // Use the existing menu scraper to get website content
    const page = await this.menuScraper.scrape(websiteUrl, {
      name: 'temp',
    });

    if (!page) {
      throw new Error('Failed to scrape website');
    }

    const htmlContent = page.content || '';

    if (htmlContent) {
      logger.debug('Menu HTML preview', {
        preview: htmlContent.slice(0, 400),
        hasMore: htmlContent.length > 400,
      });
    } else {
      logger.warn('Menu scrape returned empty content');
    }

    if (htmlContent && this.saveScrapesDir) {
      try {
        const fileName = `${restaurant.place_id || slugify(restaurant.name || 'restaurant')}.html`;
        const filePath = resolve(this.saveScrapesDir, fileName);
        writeFileSync(filePath, htmlContent, 'utf-8');
        logger.info('Saved scraped menu HTML', { filePath });
      } catch (error) {
        logger.warn('Failed to save scraped HTML', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const menuText = htmlContent ? this.extractTextFromHtml(htmlContent) : null;
    const images = this.extractImagesFromHtml(htmlContent, restaurant.website);

    return {
      menuData: htmlContent,
      menuText,
      images,
    };
  }

  private extractTextFromHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  private extractImagesFromHtml(html: string, baseUrl?: string | null): string[] {
    const imageUrls: string[] = [];
    const imgRegex = /<img[^>]+src=["']([^"'#]+)["'][^>]*>/gi;
    let match;
    const normalizedBase =
      baseUrl && typeof baseUrl === 'string' && /^https?:\/\//i.test(baseUrl) ? baseUrl : undefined;

    while ((match = imgRegex.exec(html)) !== null) {
      const src = match[1];
      if (src && !src.includes('icon') && !src.includes('logo') && src.length > 10) {
        try {
          // Convert relative URLs to absolute
          const absoluteUrl = new URL(src, normalizedBase || 'https://example.com').toString();
          if (absoluteUrl.startsWith('http')) {
            imageUrls.push(absoluteUrl);
          }
        } catch {
          // Skip invalid URLs
        }
      }
    }

    return imageUrls.slice(0, 10); // Limit to 10 images per site
  }

  private deduplicateDishes(dishes: DishTemplate[], logger: LoaderLogger): DishTemplate[] {
    const seen = new Map<string, DishTemplate>();
    const duplicates: string[] = [];

    for (const dish of dishes) {
      const key = `${dish.placeId}:${dish.name.toLowerCase().trim()}`;
      if (seen.has(key)) {
        duplicates.push(dish.name);
        // Keep the dish with higher confidence, or the one with an image
        const existing = seen.get(key)!;
        const shouldReplace = (
          (dish.confidence || 0) > (existing.confidence || 0) ||
          (dish.image_url && !existing.image_url)
        );
        if (shouldReplace) {
          seen.set(key, dish);
        }
      } else {
        seen.set(key, dish);
      }
    }

    if (duplicates.length > 0) {
      logger.debug('Deduplicated dishes', {
        duplicates: duplicates.length,
        sample: duplicates.slice(0, 3),
        totalAfterDedupe: seen.size
      });
    }

    return Array.from(seen.values());
  }

  private convertMenuItemsToDishTemplates(
    menuText: string,
    restaurant: RestaurantBasicInfo,
    logger: LoaderLogger,
    isFallback = false
  ): DishTemplate[] {
    const normalized = menuText
      .replace(/\r/g, '\n')
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 3 && line.length < 120);

    // Filter out obvious non-menu content
    const menuCandidates = normalized.filter(line => {
      const lower = line.toLowerCase();
      const trimmed = line.trim();

      // Skip navigation and UI elements
      if (lower.includes('skip to') ||
          lower.includes('book now') ||
          lower.includes('arrival') ||
          lower.includes('departure') ||
          lower.includes('select dates') ||
          lower.includes('search') ||
          lower.includes('menu') && lower.length < 20 ||
          lower.includes('about') ||
          lower.includes('contact') ||
          lower.includes('home') ||
          lower.includes('reservation') ||
          lower.includes('privacy') ||
          lower.includes('terms') ||
          lower.includes('copyright') ||
          lower.includes('all rights') ||
          lower.includes('facebook') ||
          lower.includes('instagram') ||
          lower.includes('twitter') ||
          lower.includes('please note') ||
          lower.includes('sample menu') ||
          lower.includes('current menu') ||
          lower.includes('may not reflect') ||
          lower.includes('©') ||
          /^\d{4}/.test(line) || // years like "2024"
          trimmed.length < 8 ||
          trimmed.length > 150) {
        return false;
      }

      // Must contain some food-related content to be considered a menu item
      const hasFoodKeywords = /\b(appetizer|entree|main|course|salad|soup|sandwich|burger|pizza|pasta|steak|chicken|fish|beef|lamb|pork|tuna|salmon|shrimp|crab|lobster|scallop|oyster|clam|mussel|vegetarian|vegan|gluten|spicy|hot|cold|fresh|grilled|baked|fried|roasted|smoked|poached|seared|braised|steamed|raw|rare|medium|well|done)\b/i.test(line);

      const hasDescriptiveWords = /\b(with|and|or|topped|covered|served|accompanied|featuring|includes|comes|garnished|drizzled|sprinkled)\b/i.test(line);

      const hasCuisineWords = /\b(italian|french|chinese|japanese|thai|mexican|indian|spanish|greek|mediterranean|asian|american|fusion|organic|local|seasonal|daily|special|chef|house|signature|traditional|classic)\b/i.test(line);

      const hasPortions = /\b(small|large|medium|half|full|single|double|triple|side|extra|add|choice|select|portion|serving|plate|bowl|cup|glass|bottle)\b/i.test(line);

      // Must have at least one food indicator
      return hasFoodKeywords || hasDescriptiveWords || hasCuisineWords || hasPortions;
    });

    logger.debug(isFallback ? 'Fallback menu parser candidates' : 'Menu ingestion candidate lines', {
      restaurant: restaurant.name,
      total: menuCandidates.length,
      sample: menuCandidates.slice(0, 5),
    });

    // Deduplicate by name and limit to reasonable number
    const seenNames = new Set<string>();
    const uniqueCandidates = menuCandidates
      .filter(line => {
        const normalizedName = line.toLowerCase().trim();
        if (seenNames.has(normalizedName)) {
          return false;
        }
        seenNames.add(normalizedName);
        return true;
      })
      .slice(0, 25); // Limit to 25 potential dishes per restaurant

    return uniqueCandidates.map((line) => {
      // Extract potential price from the line
      const priceMatch = line.match(/\$(\d+\.?\d{0,2})|(\d+\.?\d{0,2})\s*\$/);
      const extractedPrice = priceMatch ? parseFloat(priceMatch[1] || priceMatch[2]) : null;

      // Clean the name by removing price info
      const cleanName = line.replace(/\$\d+\.?\d{0,2}|\d+\.?\d{0,2}\s*\$/g, '').trim();

      return {
        placeId: restaurant.place_id || `manual-${createHash('md5').update(restaurant.name).digest('hex')}`,
        name: cleanName,
        description: `Menu item from ${restaurant.name}`,
        price: extractedPrice,
        image_url: null,
        cuisine_type: null,
        dietary_tags: null,
        googlePlaceId: restaurant.place_id || null,
        googlePhotoReference: null,
        source_type: 'menu' as const,
        source_review_id: null,
        source_photo_reference: null,
        confidence: isFallback ? 0.4 : 0.6, // Slightly higher confidence for filtered content
        review_excerpt: null,
        menu_section: null,
        captured_at: null,
        photo_insight: null,
        photo_classification: null,
        prehydrated: false,
      };
    });
  }

  private async processImagesWithLocalVision(
    imageUrls: string[],
    restaurant: RestaurantBasicInfo,
    logger: LoaderLogger
  ): Promise<DishTemplate[]> {
    const dishes: DishTemplate[] = [];
    const shouldConvertWebp = this.options.visionWebpConversion !== false;

    for (const imageUrl of imageUrls.slice(0, 5)) {
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) continue;

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await response.arrayBuffer();
        let photo: PlacePhotoResponse = {
          buffer: new Uint8Array(arrayBuffer),
          contentType,
          width: undefined,
          height: undefined,
        };

        if (shouldConvertWebp && contentType.toLowerCase().includes('webp')) {
          try {
            const converted = await convertWebpToJpeg(photo.buffer);
            photo = {
              buffer: converted,
              contentType: 'image/jpeg',
              width: undefined,
              height: undefined,
            };
          } catch (conversionError) {
            logger.debug('Failed to convert WebP image, skipping', {
              imageUrl,
              error: conversionError instanceof Error ? conversionError.message : String(conversionError),
            });
            continue;
          }
        }

        this.costMonitor.trackLocalVision({
          source: 'website-scraping',
          restaurant: restaurant.name,
        });

        const classification = await this.visionClient.classifyDishPhoto({
          photo,
          placeId: restaurant.place_id || 'unknown',
          restaurantName: restaurant.name,
        });

        if (classification?.is_dish && (classification.confidence ?? 0) > (this.options.minDishPhotoConfidence || 0.35)) {
          const insight = await this.visionClient.describeDishPhoto({
            photo,
            placeId: restaurant.place_id || 'unknown',
            restaurantName: restaurant.name,
          });

          const imageSize = photo.buffer.length;
          const uploadedUrl = await uploadDishPhoto(
            this.options.supabase,
            photo,
            restaurant.place_id || 'unknown',
            createHash('sha1').update(imageUrl).digest('hex'),
            'dish-images',
            logger
          );

          if (uploadedUrl) {
            this.costMonitor.trackStorage('upload', imageSize, {
              source: 'website-scraping',
              restaurant: restaurant.name,
              imageUrl,
            });

            dishes.push({
              placeId: restaurant.place_id || `manual-${createHash('md5').update(restaurant.name).digest('hex')}`,
              name: insight?.dish_guess || `Dish from ${restaurant.name}`,
              description: insight?.caption || `Dish photographed at ${restaurant.name}`,
              price: insight?.price_estimate || null,
              image_url: uploadedUrl,
              cuisine_type: insight?.cuisine_guess || null,
              dietary_tags: insight?.dietary_tags || null,
              googlePlaceId: restaurant.place_id || null,
              googlePhotoReference: null,
              source_type: 'photo' as const,
              source_review_id: null,
              source_photo_reference: createHash('sha1').update(imageUrl).digest('hex'),
              confidence: insight?.confidence || classification.confidence || 0.5,
              review_excerpt: null,
              menu_section: null,
              captured_at: null,
              photo_insight: insight || null,
              photo_classification: classification || null,
              prehydrated: true,
            });
          }
        }
      } catch (error) {
        logger.debug('Failed to process image', {
          imageUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return dishes;
  }

  private findDishesWithoutImages(dishes: DishTemplate[]): DishTemplate[] {
    return dishes.filter(dish => !dish.image_url);
  }

  private async fillMissingImagesWithGooglePlaces(
    dishes: DishTemplate[],
    restaurant: RestaurantBasicInfo,
    logger: LoaderLogger
  ): Promise<void> {
    if (!restaurant.place_id || !this.googleClient) return;

    try {
      // Get place details with photos (fallback)
      this.costMonitor.trackGooglePlaces('details', {
        placeId: restaurant.place_id,
        purpose: 'fallback-missing-images',
      });
      const details = await this.googleClient.getPlaceDetails(restaurant.place_id, {
        fields: ['photos'],
      });

      if (details?.photos && details.photos.length > 0) {
        // Download and process a few photos for missing dishes
        for (let i = 0; i < Math.min(3, details.photos.length); i++) {
          const photoRef = details.photos[i]?.photo_reference;
          if (!photoRef) continue;

          try {
            const photoData = await this.googleClient.fetchPhoto(photoRef, {
              maxwidth: 800,
            });

            // Use local vision to classify
            if (this.visionClient) {
              const classification = await this.visionClient.classifyDishPhoto({
                photo: photoData,
                placeId: restaurant.place_id,
                restaurantName: restaurant.name,
              });

              if (classification.is_dish && classification.confidence > 0.5) {
                // Assign to first dish without image
                const dishWithoutImage = dishes.find(d => !d.image_url);
                if (dishWithoutImage) {
                  const uploadedUrl = await uploadDishPhoto(
                    this.options.supabase,
                    photoData,
                    restaurant.place_id || 'unknown',
                    photoRef || 'unknown',
                    'dish-images',
                    logger
                  );

                  if (uploadedUrl) {
                    dishWithoutImage.image_url = uploadedUrl;
                    dishWithoutImage.googlePhotoReference = photoRef;
                  }
                }
              }
            }
          } catch (error) {
            logger.debug('Failed to process Google Places photo', {
              photoRef,
              error: (error as Error).message,
            });
          }
        }
      }
    } catch (error) {
      logger.warn('Google Places fallback failed', {
        error: (error as Error).message,
      });
    }
  }

  private async persistProcessedRestaurants(
    processedResults: ProcessedRestaurantResult[],
    logger: LoaderLogger
  ): Promise<void> {
    if (processedResults.length === 0) {
      logger.warn('No processed restaurants available for persistence');
      return;
    }

    const restaurantRecords = new Map<string, any>();
    const dishTemplates: DishTemplate[] = [];

    for (const result of processedResults) {
      if (result.restaurantRecord) {
        restaurantRecords.set(result.placeId, result.restaurantRecord);
      }
      if (result.dishes.length > 0) {
        dishTemplates.push(...result.dishes);
      }
    }

    if (restaurantRecords.size === 0) {
      logger.warn('Processed restaurants contained no payloads; skipping persistence');
      return;
    }

    const persistenceResult = await persistRestaurantsAndDishes(
      {
        supabase: this.options.supabase,
        logger,
        dryRun: false,
        profileId: this.options.profileId ?? null,
        runId: this.options.runId ?? null,
        reviewPriority: undefined,
      },
      restaurantRecords,
      dishTemplates
    );

    logger.info('Saved restaurants and dishes to database', {
      restaurantCount: persistenceResult.restaurants.length,
      dishCount: persistenceResult.dishes.length,
    });
  }

  private async ensureRegion(logger: LoaderLogger): Promise<void> {
    if (this.regionRecord) return;

    const baseRegion: RegionDefinition = {
      id: this.options.regionId,
      name: this.options.regionName ?? null,
      latitude: this.options.location.lat,
      longitude: this.options.location.lng,
      radius: this.options.radius,
      keyword: null,
    };

    if (this.options.dryRun) {
      if (this.options.regionId) {
        const { data, error } = await this.options.supabase
          .from('regions')
          .select('*')
          .eq('id', this.options.regionId)
          .limit(1);

        if (error) {
          logger.warn('Failed to fetch region for dry run', { error: error.message });
        }

        this.regionRecord = (data?.[0] as RegionDefinition) ?? {
          ...baseRegion,
          id: this.options.regionId,
          region_key: generateRegionKey(baseRegion),
        };
      } else {
        this.regionRecord = {
          ...baseRegion,
          id: `dry-run-${generateRegionKey(baseRegion)}`,
        } as RegionDefinition;
      }
      return;
    }

    const regionRecord = await upsertRegion(this.options.supabase, baseRegion, logger);
    const now = new Date().toISOString();
    await this.options.supabase
      .from('regions')
      .update({ refresh_requested_at: now, status: 'refreshing' })
      .eq('id', regionRecord.id);
    this.regionRecord = regionRecord;
  }

  private buildRestaurantRecord(
    placeId: string,
    restaurant: RestaurantBasicInfo,
    dishes: DishTemplate[],
    stats: ProcessedRestaurantResult['stats']
  ): Record<string, any> | null {
    if (!this.regionRecord?.id) {
      return null;
    }

    const now = new Date().toISOString();
    const gallery = dishes
      .filter(d => Boolean(d.image_url))
      .slice(0, 12)
      .map(d => ({
        url: d.image_url,
        type: 'dish',
        label: d.name,
        source_type: d.source_type,
      }));

    return {
      region_id: this.regionRecord.id,
      place_id: placeId,
      name: restaurant.name,
      address: restaurant.address ?? null,
      latitude: restaurant.latitude ?? null,
      longitude: restaurant.longitude ?? null,
      cuisine_type: null,
      price_range: null,
      image_url: gallery[0]?.url ?? null,
      website_url: restaurant.website ?? null,
      phone_number: restaurant.phone ?? null,
      menu_url: restaurant.website ?? null,
      menu_source: 'hybrid-web',
      menu_last_sync_at: now,
      menu_hidden: false,
      source_provider: 'hybrid',
      source_place_id: restaurant.place_id ?? placeId,
      source_status: stats.dishesWithImages > 0 ? 'has-media' : 'scraped',
      last_seen_at: now,
      tracked: true,
      tracked_at: now,
      managed_by_profile_id: this.options.profileId ?? null,
      source_run_id: this.options.runId ?? null,
      review_status: 'pending',
      photo_gallery: gallery,
    };
  }

  private buildStats(
    dishes: DishTemplate[],
    imagesProcessed: number
  ): ProcessedRestaurantResult['stats'] {
    const menuDishes = dishes.filter(d => d.source_type === 'menu').length;
    const visionDishes = dishes.filter(d => d.source_type === 'photo').length;
    const dishesWithImages = dishes.filter(d => Boolean(d.image_url)).length;

    return {
      menuDishes,
      visionDishes,
      imagesProcessed,
      dishesWithImages,
    };
  }

  private getOrCreatePlaceId(restaurant: RestaurantBasicInfo): string {
    if (restaurant.place_id && restaurant.place_id.trim().length > 0) {
      return restaurant.place_id;
    }

    const seed = `${restaurant.name || 'restaurant'}-${restaurant.address || ''}`;
    return `manual-${createHash('sha1').update(seed).digest('hex')}`;
  }
}

export async function loadRestaurantsHybrid(options: HybridLoaderOptions) {
  const loader = new HybridLoader(options);
  return await loader.loadRegion();
}
