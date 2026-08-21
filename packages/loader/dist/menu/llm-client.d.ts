import type { LoaderLogger } from '../logger.js';
import type { LlmClient, LlmProvider } from './types.js';
export interface LocalTextModelOptions {
    endpoint?: string;
    model: string;
    temperature?: number;
    maxRetries?: number;
    provider?: LlmProvider;
    logger?: LoaderLogger;
}
export declare class LocalTextModel implements LlmClient {
    readonly provider: LlmProvider;
    readonly model: string;
    private readonly options;
    constructor(options: LocalTextModelOptions);
    private get endpoint();
    private get logger();
    generate(prompt: string): Promise<string | null>;
}
