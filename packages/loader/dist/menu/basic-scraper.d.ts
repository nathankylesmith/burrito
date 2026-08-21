import { type LoaderLogger } from '../logger.js';
import type { MenuScraper, RestaurantContext, ScrapedMenuPage } from './types.js';
export interface BasicMenuScraperOptions {
    logger?: LoaderLogger;
    userAgent?: string;
}
export declare class BasicMenuScraper implements MenuScraper {
    private readonly logger;
    private readonly userAgent;
    constructor(options?: BasicMenuScraperOptions);
    scrape(url: string, context: RestaurantContext): Promise<ScrapedMenuPage | null>;
}
