#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadRestaurantsFromGooglePlaces, generateRegionKey } from './index.js';
import { loadRestaurantsFromMenuSources } from './menu-scraper/index.js';
import { loadRestaurantsHybrid } from './hybrid-loader.js';
import { createLogger } from './logger.js';

// Load environment variables from apps/admin/.env.local if it exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envLocalPath = join(__dirname, '../../..', 'apps/admin/.env.local');

if (existsSync(envLocalPath)) {
  const envContent = readFileSync(envLocalPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

const asNumber = (label: string) => (value: string) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new InvalidArgumentError(`${label} must be a valid number.`);
  }
  return parsed;
};

const parseLocation = (location: string) => {
  const [latStr, lngStr] = location.split(',').map((part) => part.trim());
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new InvalidArgumentError('Location must be in "lat,lng" format.');
  }
  return { lat, lng };
};

const isLocalEndpoint = (endpoint?: string) => {
  if (!endpoint) {
    return false;
  }

  try {
    const url = new URL(endpoint);
    const host = url.hostname?.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
};

const program = new Command();

program
  .name('dishswipe-loader')
  .description('Load restaurants and dishes into Supabase from Google Places or website menus')
  .option('-l, --location <lat,lng>', 'Latitude and longitude in "lat,lng" format')
  .option('-r, --radius <meters>', 'Search radius in meters', asNumber('Radius'), 1500)
  .option('-k, --keyword <keyword>', 'Optional keyword to filter Google Places results')
  .option('--max-results <count>', 'Maximum number of Google Places results to process', asNumber('max-results'), 20)
  .option('--region-name <name>', 'Human friendly name for the region')
  .option('--region-id <uuid>', 'Use an existing region identifier')
  .option('--profile-id <uuid>', 'Use a stored region_import_profiles entry')
  .option('--photo-bucket <bucket>', 'Supabase storage bucket for restaurant photos', 'dish-images')
  .option('--max-dishes <count>', 'Maximum dishes to persist per restaurant', asNumber('max-dishes'))
  .option('--max-dish-photos <count>', 'Maximum dish photos to download per restaurant', asNumber('max-dish-photos'))
  .option('--max-review-dishes <count>', 'Maximum dishes derived from reviews', asNumber('max-review-dishes'))
  .option('--dish-photo-concurrency <count>', 'Parallel uploads for dish photos', asNumber('dish-photo-concurrency'))
  .option('--max-concurrency <count>', 'Max concurrent Google detail requests', asNumber('max-concurrency'))
  .option('--enable-photo-insights', 'Run dish photos through a local vision model', false)
  .option('--vision-model <name>', 'Local vision model to use (default: qwen3-vl:8b)')
  .option('--vision-endpoint <url>', 'Local vision server URL', 'http://127.0.0.1:11434')
  .option('--vision-temperature <value>', 'Sampling temperature for the vision model', asNumber('vision-temperature'))
  .option('--vision-prompt <text>', 'Override default JSON prompt for photo insights')
  .option(
    '--min-dish-photo-confidence <value>',
    'Minimum confidence (0-1) required to accept a photo as a dish',
    asNumber('min-dish-photo-confidence'),
    0.35
  )
  .option('--skip-if-fresh <minutes>', 'Skip refresh if region updated within the last N minutes', asNumber('skip-if-fresh'))
  .option('--since <iso>', 'Only refresh if last refresh is before this ISO timestamp')
  .option('--dry-run', 'Run without writing data to Supabase', false)
  .option('--verbose', 'Enable verbose loader logging', false)
  .option('--review-priority <value>', 'Priority value for auto-created review tasks', asNumber('review-priority'), 0)
  .option('--mode <mode>', 'Loader mode: google, menu, or hybrid', 'google')
  .option('--menu-sources <path>', 'Path to JSON file with restaurant menu definitions')
  .option('--llm-model <model>', 'Model to use for menu extraction (default: qwen3-vl:8b)')
  .option('--llm-provider <provider>', 'LLM provider to use: local or gemini', 'local')
  .option('--vision-provider <provider>', 'Vision provider to use: local or gemini', 'local')
  .option('--llm-endpoint <url>', 'LLM endpoint for menu mode (defaults to OpenAI API or local Ollama)', 'http://127.0.0.1:11434')
  .option('--no-vision-webp-conversion', 'Disable WebP image conversion before local vision')
  .option('--llm-api-key <key>', 'Override LLM API key for menu mode (defaults to OPENAI_API_KEY)')
  .option('--enable-google-photo-fallback', 'Allow Google Places photo fallback for hybrid mode', false)
  .option('--dump-results <path>', 'Write hybrid dry-run JSON output to this file')
  .option('--save-scrapes <dir>', 'Save raw scraped menu HTML into this directory')
  .action(async (options) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
    const loaderMode = (options.mode as string) || 'google';
    const isGoogleMode = loaderMode === 'google';
    const isHybridMode = loaderMode === 'hybrid';
    const llmProvider = ((options.llmProvider as string) || 'local').toLowerCase();
    options.llmProvider = llmProvider;

    const visionProvider = ((options.visionProvider as string) || 'local').toLowerCase();
    options.visionProvider = visionProvider;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
      process.exit(1);
    }

    if (isGoogleMode && !googleApiKey) {
      console.error('GOOGLE_MAPS_API_KEY must be provided as an environment variable.');
      process.exit(1);
    }

    if (!isGoogleMode && !isHybridMode && !options.menuSources) {
      console.error('In menu mode, --menu-sources must point to a JSON file describing restaurants.');
      process.exit(1);
    }

    if (isHybridMode && !googleApiKey) {
      console.warn('Warning: GOOGLE_MAPS_API_KEY not provided. Hybrid mode will work but won\'t be able to fall back to Google Places API for missing data.');
    }

    let resolvedLlmEndpoint =
      options.llmEndpoint ||
      process.env.LLM_ENDPOINT ||
      (llmProvider === 'gemini'
        ? 'https://generativelanguage.googleapis.com/v1beta'
        : isHybridMode
        ? 'http://127.0.0.1:11434'
        : undefined);

    if (resolvedLlmEndpoint) {
      options.llmEndpoint = resolvedLlmEndpoint;
    }

    const usingLocalLlmEndpoint =
      llmProvider === 'local' &&
      ((resolvedLlmEndpoint && isLocalEndpoint(resolvedLlmEndpoint)) ||
        (!resolvedLlmEndpoint && isHybridMode));

    let resolvedLlmApiKey = options.llmApiKey as string | undefined;
    if (!resolvedLlmApiKey) {
      if (llmProvider === 'gemini') {
        resolvedLlmApiKey =
          process.env.GOOGLE_GEMINI_API_KEY ||
          process.env.GEMINI_API_KEY ||
          process.env.LLM_API_KEY;
      } else if (!usingLocalLlmEndpoint) {
        resolvedLlmApiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
      }
    }

    if (resolvedLlmApiKey) {
      options.llmApiKey = resolvedLlmApiKey;
    }

    if (!isGoogleMode) {
      if (llmProvider === 'gemini' && !options.llmApiKey) {
        console.error('Gemini provider requires GOOGLE_GEMINI_API_KEY (or --llm-api-key) for menu extraction.');
        process.exit(1);
      }
      if (llmProvider === 'local' && !usingLocalLlmEndpoint && !options.llmApiKey) {
        console.error('Remote menu mode requires OPENAI_API_KEY or --llm-api-key for menu extraction.');
      process.exit(1);
      }
    }

    if (options.enablePhotoInsights && !options.visionModel) {
      console.error('--vision-model is required when --enable-photo-insights is set.');
      process.exit(1);
    }

    const sinceDate = options.since ? new Date(options.since) : null;
    if (sinceDate && Number.isNaN(sinceDate.getTime())) {
      console.error(`Invalid --since timestamp: ${options.since}`);
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let menuSources: any[] | null = null;
    if (!isGoogleMode && options.menuSources) {
      try {
        const menuPath = options.menuSources.startsWith('/')
          ? options.menuSources
          : join(process.cwd(), options.menuSources);
        const raw = readFileSync(menuPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          throw new Error('Menu sources file must be a JSON array.');
        }
        menuSources = parsed;
      } catch (error) {
        console.error('Failed to parse menu sources file:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }

    let profileRow: any = null;
    if (options.profileId) {
      const { data, error } = await supabase
        .from('region_import_profiles')
        .select('*')
        .eq('id', options.profileId)
        .maybeSingle();
      if (error || !data) {
        console.error(`Failed to load region_import_profiles ${options.profileId}:`, error?.message || 'not found');
        process.exit(1);
      }
      profileRow = data;
    }

    const resolvedLocation = profileRow
      ? `${profileRow.latitude},${profileRow.longitude}`
      : options.location;

    if (!resolvedLocation) {
      console.error('Either --location or --profile-id must be provided.');
      process.exit(1);
    }

    const coords = parseLocation(resolvedLocation);
    const normalizedLocation = `${coords.lat},${coords.lng}`;
    options.location = normalizedLocation;

    if (profileRow) {
      options.radius = profileRow.radius ?? options.radius;
      options.keyword = options.keyword ?? profileRow.keyword ?? undefined;
      options.regionName = options.regionName ?? profileRow.name ?? undefined;
      options.maxResults = options.maxResults ?? profileRow.max_results ?? options.maxResults;
      options.maxDishes = options.maxDishes ?? profileRow.max_dishes ?? options.maxDishes;
      options.maxDishPhotos = options.maxDishPhotos ?? profileRow.max_dish_photos ?? options.maxDishPhotos;
    }

  const fetchExistingRegion = async () => {
      if (options.regionId) {
        const { data, error } = await supabase
          .from('regions')
          .select('id,last_refreshed_at,name,region_key')
          .eq('id', options.regionId)
          .maybeSingle();
        if (error) {
          throw error;
        }
        return data;
      }

      const regionKey = generateRegionKey({
        latitude: coords.lat,
        longitude: coords.lng,
        radius: options.radius,
        keyword: options.keyword ?? null,
      });

      const { data, error } = await supabase
        .from('regions')
        .select('id,last_refreshed_at,name,region_key')
        .eq('region_key', regionKey)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    };

  let regionImportRun: any = null;

  try {
      const existingRegion = await fetchExistingRegion();
      const lastRefreshedAt = existingRegion?.last_refreshed_at ? new Date(existingRegion.last_refreshed_at) : null;
      const now = new Date();

      const freshnessMinutes = Number(options.skipIfFresh);
      if (
        lastRefreshedAt &&
        Number.isFinite(freshnessMinutes) &&
        freshnessMinutes > 0 &&
        now.getTime() - lastRefreshedAt.getTime() < freshnessMinutes * 60 * 1000
      ) {
        console.log(
          `Skipping refresh for region ${existingRegion?.id || existingRegion?.region_key} because it was refreshed at ${lastRefreshedAt.toISOString()}`
        );
        process.exit(0);
      }

      if (sinceDate && lastRefreshedAt && lastRefreshedAt >= sinceDate) {
        console.log(
          `Skipping refresh: last refresh (${lastRefreshedAt.toISOString()}) is newer than --since (${sinceDate.toISOString()}).`
        );
        process.exit(0);
      }

      if (profileRow && !options.dryRun) {
        const { data: runData, error: runError } = await supabase
          .from('region_import_runs')
          .insert({
            profile_id: profileRow.id,
            region_id: existingRegion?.id ?? null,
            status: 'running',
            started_at: now.toISOString(),
          })
          .select('*')
          .single();

        if (runError) {
          throw runError;
        }

        regionImportRun = runData;
      }

      const loaderLogger = createLogger(
        'cli-runner',
        { cli: true },
        { level: options.verbose ? 'debug' : undefined }
      );

      console.log(`Starting DishSwipe loader in ${loaderMode} mode...`);

      const result = isGoogleMode
        ? await loadRestaurantsFromGooglePlaces(supabase, {
            apiKey: googleApiKey,
            location: options.location,
            radius: options.radius,
            keyword: options.keyword,
            maxResults: options.maxResults,
            regionId: options.regionId,
            regionName: options.regionName,
            photoBucket: options.photoBucket,
            maxDishesPerRestaurant: options.maxDishes,
            maxDishPhotosPerRestaurant: options.maxDishPhotos,
            maxReviewDishes: options.maxReviewDishes,
            dishPhotoConcurrency: options.dishPhotoConcurrency,
            googleDetailConcurrency: options.maxConcurrency,
            dryRun: options.dryRun,
            logger: loaderLogger,
            enablePhotoInsights: options.enablePhotoInsights,
            visionModel: options.visionModel,
            visionEndpoint: options.visionEndpoint,
            visionTemperature: options.visionTemperature,
            visionPromptTemplate: options.visionPrompt,
            minDishPhotoConfidence: options.minDishPhotoConfidence,
            profileId: profileRow?.id ?? null,
            runId: regionImportRun?.id ?? null,
            reviewPriority: options.reviewPriority,
          })
        : isHybridMode
        ? await loadRestaurantsHybrid({
            supabase,
            location: parseLocation(options.location),
            radius: options.radius,
            maxRestaurants: options.maxResults,
            regionId: options.regionId,
            regionName: options.regionName,
            dryRun: options.dryRun,
            logger: loaderLogger,
            visionModel: options.visionModel,
            visionEndpoint: options.visionEndpoint,
            llmModel: options.llmModel,
            llmEndpoint: options.llmEndpoint,
            llmProvider: llmProvider === 'gemini' ? 'gemini' : 'local',
            visionProvider: visionProvider === 'gemini' ? 'gemini' : 'local',
            llmApiKey: options.llmApiKey,
            googleApiKey: googleApiKey,
            profileId: profileRow?.id ?? null,
            runId: regionImportRun?.id ?? null,
            maxDishesPerRestaurant: options.maxDishes,
            minDishPhotoConfidence: options.minDishPhotoConfidence,
            dumpResultsPath: options.dumpResults,
            saveScrapesDir: options.saveScrapes,
            visionWebpConversion: options.visionWebpConversion,
            enableGooglePhotoFallback: options.enableGooglePhotoFallback,
          })
        : await loadRestaurantsFromMenuSources({
            supabase,
            location: options.location,
            radius: options.radius,
            regionId: options.regionId,
            regionName: options.regionName,
            restaurants: menuSources ?? [],
            dryRun: options.dryRun,
            logger: loaderLogger,
            profileId: profileRow?.id ?? null,
            runId: regionImportRun?.id ?? null,
            reviewPriority: options.reviewPriority,
            llmModel: options.llmModel,
            llmEndpoint: options.llmEndpoint,
            llmApiKey: options.llmApiKey,
          });

      if (regionImportRun) {
        await supabase
          .from('region_import_runs')
          .update({
            completed_at: new Date().toISOString(),
            status: 'completed',
            restaurants_processed: result.restaurants.length,
            dishes_generated: result.dishes.length,
            region_id: result.region?.id ?? regionImportRun.region_id,
          })
          .eq('id', regionImportRun.id);
      }

      if (profileRow && !options.dryRun) {
        await supabase
          .from('region_import_profiles')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: 'completed',
            last_region_id: result.region?.id ?? null,
          })
          .eq('id', profileRow.id);
      }

      console.log('Region refresh completed.');
      console.log(`Region: ${result.region?.name || result.region?.id}`);
      console.log(`Restaurants processed: ${result.restaurants.length}`);
      console.log(`Dishes generated: ${result.dishes.length}`);
    } catch (error) {
      if (regionImportRun) {
        await supabase
          .from('region_import_runs')
          .update({
            completed_at: new Date().toISOString(),
            status: 'failed',
            log: error instanceof Error ? error.message : String(error),
          })
          .eq('id', regionImportRun.id);
      }

      if (profileRow && !options.dryRun) {
        await supabase
          .from('region_import_profiles')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: 'failed',
          })
          .eq('id', profileRow.id);
      }

      console.error(`Failed to load data in ${loaderMode} mode:`, error);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
