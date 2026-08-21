import type { LoaderLogger } from '../logger.js';
import type { VisionClient } from './types.js';
interface LocalVisionOptions {
    endpoint?: string;
    model: string;
    temperature?: number;
    maxRetries?: number;
    promptTemplate?: string;
    logger?: LoaderLogger;
}
export declare const createLocalVisionClient: (options: LocalVisionOptions) => VisionClient;
export {};
