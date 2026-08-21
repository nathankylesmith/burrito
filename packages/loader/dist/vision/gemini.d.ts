import type { LoaderLogger } from '../logger.js';
import type { DescribeDishPhotoParams, DishPhotoClassification, DishPhotoInsight, ClassifyDishPhotoParams, VisionClient } from './types.js';
interface GeminiVisionOptions {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxRetries?: number;
    promptTemplate?: string;
    logger?: LoaderLogger;
}
export declare class GeminiVisionClient implements VisionClient {
    readonly provider: "remote";
    readonly model: string;
    private readonly options;
    private readonly logger?;
    constructor(options: GeminiVisionOptions);
    private buildUrl;
    private generateWithImage;
    classifyDishPhoto(params: ClassifyDishPhotoParams): Promise<DishPhotoClassification | null>;
    describeDishPhoto(params: DescribeDishPhotoParams): Promise<DishPhotoInsight | null>;
}
export {};
