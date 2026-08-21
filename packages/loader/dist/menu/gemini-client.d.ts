import type { LoaderLogger } from '../logger.js';
import type { LlmClient } from './types.js';
interface GeminiTextModelOptions {
    apiKey: string;
    model: string;
    endpoint?: string;
    temperature?: number;
    maxRetries?: number;
    logger?: LoaderLogger;
}
export declare class GeminiTextModel implements LlmClient {
    readonly provider: "remote";
    readonly model: string;
    private readonly options;
    private readonly logger?;
    constructor(options: GeminiTextModelOptions);
    private buildUrl;
    generate(prompt: string): Promise<string | null>;
}
export {};
