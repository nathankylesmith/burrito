import { defaultLogger, LoaderLogger } from './logger.js';
import { GooglePlacesClient } from './google/client.js';
import { formatLocation, GooglePlacesError } from './google/common.js';
import type {
  NearbySearchOptions,
  PlacePhotoResponse,
  PlaceSummary,
  GooglePlacesClientOptions,
  PlaceDetailsField,
  PlaceDetailsOptions,
} from './google/types.js';

export { GooglePlacesClient, GooglePlacesError, formatLocation };
export type {
  NearbySearchOptions,
  PlacePhotoResponse,
  PlaceSummary,
  GooglePlacesClientOptions,
  PlaceDetailsField,
  PlaceDetailsOptions,
};

const createClient = (apiKey: string, logger: LoaderLogger = defaultLogger) =>
  new GooglePlacesClient({ apiKey, logger });

export const searchForRestaurants = async (
  apiKey: string,
  options: NearbySearchOptions,
  logger: LoaderLogger = defaultLogger
) => {
  const client = createClient(apiKey, logger);
  return client.nearbySearch(options);
};

export const getPlaceDetails = async (
  apiKey: string,
  placeId: string,
  logger: LoaderLogger = defaultLogger,
  options?: Pick<PlaceDetailsOptions, 'fields' | 'forceRefresh' | 'useCache'>
) => {
  const client = createClient(apiKey, logger);
  return client.getPlaceDetails(placeId, options);
};

export const fetchPlacePhoto = async (
  photoReference: string | undefined,
  apiKey: string,
  options?: { maxwidth?: number },
  logger: LoaderLogger = defaultLogger
): Promise<PlacePhotoResponse | null> => {
  const client = createClient(apiKey, logger);
  return client.fetchPhoto(photoReference, options);
};
