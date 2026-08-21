import type { LoaderLogger } from '../logger.js';

export interface RestaurantContext {
  id?: string;
  name: string;
  websiteUrl?: string | null;
  menuUrl?: string | null;
  location?: { lat: number; lng: number } | null;
  cuisineHints?: string[] | null;
}

export interface ScrapedMenuPage {
  url: string;
  content: string | null;
  contentType?: string | null;
  links?: string[];
}

export type MenuGuardrailAction = 'accept' | 'reject' | 'redirect';

export interface MenuGuardrailVerdict {
  action: MenuGuardrailAction;
  reason?: string;
  normalizedMenuUrl?: string | null;
  cleanedMenuText?: string | null;
  followUps?: string[];
}

export interface MenuScraper {
  scrape(url: string, context: RestaurantContext): Promise<ScrapedMenuPage | null>;
}

export interface MenuGuardrailModel {
  evaluatePage(
    context: RestaurantContext,
    page: ScrapedMenuPage,
    logger?: LoaderLogger
  ): Promise<MenuGuardrailVerdict>;
}

export interface MenuIngestionAgentOptions {
  maxPages?: number;
  maxAccepted?: number;
  logger?: LoaderLogger;
}

export interface MenuIngestionOutcome {
  accepted: Array<{
    url: string;
    normalizedUrl: string | null;
    text: string | null;
    sourceAction: MenuGuardrailAction;
  }>;
  rejected: Array<{
    url: string;
    reason: string;
  }>;
  visited: string[];
  remainingQueue: string[];
}

export type LlmProvider = 'local' | 'remote';

export interface LlmClient {
  generate(prompt: string): Promise<string | null>;
  provider: LlmProvider;
  model: string;
}
