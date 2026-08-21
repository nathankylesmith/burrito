import { type LoaderLogger } from '../logger.js';
import type { LlmClient, MenuGuardrailModel, MenuGuardrailVerdict, RestaurantContext, ScrapedMenuPage } from './types.js';
export interface LlmGuardrailOptions {
    promptTemplate?: string;
    logger?: LoaderLogger;
}
export declare class LlmGuardrailModel implements MenuGuardrailModel {
    private readonly llm;
    private readonly options;
    private readonly logger;
    constructor(llm: LlmClient, options?: LlmGuardrailOptions);
    private buildPrompt;
    evaluatePage(context: RestaurantContext, page: ScrapedMenuPage, logger?: LoaderLogger): Promise<MenuGuardrailVerdict>;
}
