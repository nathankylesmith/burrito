import { defaultLogger } from './logger.js';
import { GooglePlacesClient } from './google/client.js';
import { formatLocation, GooglePlacesError } from './google/common.js';
export { GooglePlacesClient, GooglePlacesError, formatLocation };
const createClient = (apiKey, logger = defaultLogger) => new GooglePlacesClient({ apiKey, logger });
export const searchForRestaurants = async (apiKey, options, logger = defaultLogger) => {
    const client = createClient(apiKey, logger);
    return client.nearbySearch(options);
};
export const getPlaceDetails = async (apiKey, placeId, logger = defaultLogger, options) => {
    const client = createClient(apiKey, logger);
    return client.getPlaceDetails(placeId, options);
};
export const fetchPlacePhoto = async (photoReference, apiKey, options, logger = defaultLogger) => {
    const client = createClient(apiKey, logger);
    return client.fetchPhoto(photoReference, options);
};
