import { createLogger } from '../logger.js';
export const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const logger = createLogger('google:common');
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const isRetryableStatus = (status) => status === 429 || status >= 500;
export class GooglePlacesError extends Error {
    constructor(message, retryable) {
        super(message);
        this.name = 'GooglePlacesError';
        this.retryable = retryable;
    }
}
export const executeWithBackoff = async (fn, { retries = 5, baseDelay = 500, factor = 2 } = {}) => {
    let attempt = 0;
    while (attempt <= retries) {
        try {
            return await fn(attempt);
        }
        catch (error) {
            const retryable = error?.retryable;
            if (!retryable || attempt === retries) {
                throw error;
            }
            const timeout = baseDelay * Math.pow(factor, attempt);
            await delay(timeout);
            attempt += 1;
        }
    }
    throw new Error('Backoff execution failed unexpectedly.');
};
export const formatLocation = (location) => {
    if (!location) {
        return null;
    }
    if (typeof location === 'string') {
        return location;
    }
    if (typeof location === 'object' && location.lat !== undefined && location.lng !== undefined) {
        return `${location.lat},${location.lng}`;
    }
    throw new Error('Location must be a "lat,lng" string or an object with { lat, lng } keys.');
};
export const buildGoogleUrl = (path, params, apiKey) => {
    const url = new URL(`${GOOGLE_PLACES_BASE_URL}/${path}`);
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });
    url.searchParams.set('key', apiKey);
    return url;
};
export const fetchGoogleJson = async (endpoint, params, apiKey) => {
    return executeWithBackoff(async () => {
        const url = buildGoogleUrl(`${endpoint}/json`, params, apiKey);
        logger.debug('Fetching Google endpoint', { endpoint, params: { ...params, key: undefined } });
        const response = await fetch(url.toString());
        if (isRetryableStatus(response.status)) {
            throw new GooglePlacesError(`Google Places ${endpoint} request failed with status ${response.status}.`, true);
        }
        const body = (await response.json());
        const retryableStatuses = new Set(['RESOURCE_EXHAUSTED', 'OVER_QUERY_LIMIT', 'UNKNOWN_ERROR']);
        if (retryableStatuses.has(body.status)) {
            throw new GooglePlacesError(`Google Places ${endpoint} responded with status ${body.status}.`, true);
        }
        if (!['OK', 'ZERO_RESULTS'].includes(body.status)) {
            throw new GooglePlacesError(`Google Places ${endpoint} responded with status ${body.status}.`, false);
        }
        return body;
    });
};
