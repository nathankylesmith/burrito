import { createLogger, type LoaderLogger } from '../logger.js';
import type {
  GooglePlaceDetails,
  GooglePlacesClientOptions,
  NearbySearchOptions,
  PlaceDetailsField,
  PlaceDetailsOptions,
  PlacePhotoResponse,
  PlaceSummary,
} from './types.js';
import {
  GooglePlacesError,
  buildGoogleUrl,
  delay,
  executeWithBackoff,
  fetchGoogleJson,
  formatLocation,
} from './common.js';

const DEFAULT_DETAIL_FIELDS: PlaceDetailsField[] = [
  'place_id',
  'name',
  'formatted_address',
  'geometry',
  'types',
  'price_level',
  'rating',
  'user_ratings_total',
  'photos',
  'reviews',
  'website',
  'international_phone_number',
  'current_opening_hours',
];

type ClientRuntimeOptions = Required<Omit<GooglePlacesClientOptions, 'apiKey' | 'logger'>>;

const DEFAULT_OPTIONS: ClientRuntimeOptions = {
  backoff: { retries: 5, baseDelay: 500, factor: 2 },
  maxConcurrency: 4,
  enableCache: true,
};

type CacheKey = string;

const createLimiter = (maxConcurrency: number) => {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    active -= 1;
    const resolver = queue.shift();
    if (resolver) {
      resolver();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= maxConcurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }

    active += 1;
    try {
      return await fn();
    } finally {
      next();
    }
  };
};

export class GooglePlacesClient {
  private readonly apiKey: string;
  private readonly logger: LoaderLogger;
  private readonly options: ClientRuntimeOptions;
  private readonly cache = new Map<CacheKey, GooglePlaceDetails>();
  private readonly limiter;

  constructor(options: GooglePlacesClientOptions) {
    this.apiKey = options.apiKey;
    this.options = {
      backoff: options.backoff ?? DEFAULT_OPTIONS.backoff,
      maxConcurrency: options.maxConcurrency ?? DEFAULT_OPTIONS.maxConcurrency,
      enableCache: options.enableCache ?? DEFAULT_OPTIONS.enableCache,
    };
    this.logger = options.logger ?? createLogger('google:client');
    this.limiter = createLimiter(this.options.maxConcurrency);
  }

  clearCache() {
    this.cache.clear();
  }

  private getCacheKey(placeId: string, fields?: PlaceDetailsField[]) {
    const mask = (fields || DEFAULT_DETAIL_FIELDS).join(',');
    return `${placeId}:${mask}`;
  }

  async nearbySearch(options: NearbySearchOptions): Promise<PlaceSummary[]> {
    const formattedLocation = formatLocation(options.location);
    if (!formattedLocation) {
      throw new Error('A location must be provided to search Google Places.');
    }

    const maxResults = options.maxResults ?? 20;
    const results: PlaceSummary[] = [];
    let nextPageToken: string | undefined;

    do {
      const params = {
        location: formattedLocation,
        radius: options.radius ?? 1500,
        type: options.type ?? 'restaurant',
        keyword: options.keyword,
        pagetoken: nextPageToken,
      };

      const body = await fetchGoogleJson<any>('nearbysearch', params, this.apiKey);
      const pageResults = Array.isArray(body.results) ? (body.results as PlaceSummary[]) : [];
      results.push(...pageResults);

      const hasCapacity = results.length < maxResults;
      nextPageToken = hasCapacity && body.next_page_token ? body.next_page_token : undefined;

      if (nextPageToken && hasCapacity) {
        await delay(2000);
      }
    } while (nextPageToken && results.length < maxResults);

    this.logger.info('Nearby search completed', {
      radius: options.radius,
      keyword: options.keyword,
      total: results.length,
    });

    return results.slice(0, maxResults);
  }

  async getPlaceDetails(
    placeId: string,
    options: PlaceDetailsOptions = {}
  ): Promise<GooglePlaceDetails | null> {
    if (!placeId) {
      throw new Error('A place_id is required to request place details.');
    }

    const fields = options.fields?.length ? options.fields : DEFAULT_DETAIL_FIELDS;
    const useCache = options.useCache ?? this.options.enableCache;
    const cacheKey = this.getCacheKey(placeId, fields);

    if (useCache && this.cache.has(cacheKey) && !options.forceRefresh) {
      return this.cache.get(cacheKey)!;
    }

    const params = { place_id: placeId, fields: fields.join(',') };
    const body = await fetchGoogleJson<{ status: string; result?: GooglePlaceDetails }>(
      'details',
      params,
      this.apiKey
    );
    const result = body.result ?? null;

    if (useCache && result) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  async getPlaceDetailsBatch(
    placeIds: string[],
    options: PlaceDetailsOptions & { concurrency?: number } = {}
  ): Promise<Map<string, GooglePlaceDetails>> {
    const concurrency = options.concurrency ?? this.options.maxConcurrency;
    const limiter = concurrency === this.options.maxConcurrency ? this.limiter : createLimiter(concurrency);

    const entries = await Promise.allSettled(
      placeIds.map((placeId) =>
        limiter(() => this.getPlaceDetails(placeId, options).then((details) => [placeId, details] as const))
      )
    );

    const map = new Map<string, GooglePlaceDetails>();
    entries.forEach((entry) => {
      if (entry.status === 'fulfilled') {
        const [id, details] = entry.value;
        if (details) {
          map.set(id, details);
        }
      } else {
        this.logger.warn('Place detail batch request failed', { error: entry.reason });
      }
    });

    return map;
  }

  async fetchPhoto(
    photoReference: string | undefined,
    options: { maxwidth?: number; maxheight?: number } = {}
  ): Promise<PlacePhotoResponse | null> {
    if (!photoReference) {
      return null;
    }

    return executeWithBackoff(
      async () => {
        const url = buildGoogleUrl(
          'photo',
          {
            photo_reference: photoReference,
            maxwidth: options.maxwidth ?? 1600,
            maxheight: options.maxheight,
          },
          this.apiKey
        );

        const response = await fetch(url.toString());
        if (response.status === 429 || response.status >= 500) {
          throw new GooglePlacesError(
            `Google Places photo request failed with status ${response.status}.`,
            true
          );
        }

        if (!response.ok) {
          throw new GooglePlacesError(
            `Google Places photo request failed with status ${response.status}.`,
            false
          );
        }

        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        return {
          buffer: new Uint8Array(buffer),
          contentType,
          width: Number(response.headers.get('x-goog-meta-width')) || undefined,
          height: Number(response.headers.get('x-goog-meta-height')) || undefined,
        };
      },
      this.options.backoff
    );
  }
}

