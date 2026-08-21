import type { MenuGuardrailModel, MenuIngestionAgentOptions, MenuIngestionOutcome, MenuScraper, RestaurantContext } from './types.js';
export declare class MenuIngestionAgent {
    private readonly scraper;
    private readonly guardrail;
    private readonly options;
    private readonly baseLogger;
    constructor(scraper: MenuScraper, guardrail: MenuGuardrailModel, options?: MenuIngestionAgentOptions);
    ingestMenu(context: RestaurantContext, seedUrls: string[]): Promise<MenuIngestionOutcome>;
}
