import type { NearbySearchOptions } from './types.js';
export declare const delay: (ms: number) => Promise<unknown>;
export declare class GooglePlacesError extends Error {
    retryable: boolean;
    constructor(message: string, retryable: boolean);
}
export interface BackoffOptions {
    retries?: number;
    baseDelay?: number;
    factor?: number;
}
export declare const executeWithBackoff: <T>(fn: (attempt: number) => Promise<T>, { retries, baseDelay, factor }?: BackoffOptions) => Promise<T>;
export declare const formatLocation: (location?: NearbySearchOptions["location"]) => string | null;
export declare const buildGoogleUrl: (path: string, params: Record<string, unknown>, apiKey: string) => URL;
export declare const fetchGoogleJson: <T extends {
    status?: string;
}>(endpoint: string, params: Record<string, unknown>, apiKey: string, logger?: import("../logger.js").LoaderLogger) => Promise<T>;
