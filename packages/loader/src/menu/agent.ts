import { defaultLogger } from '../logger.js';
import type {
  MenuGuardrailAction,
  MenuGuardrailModel,
  MenuIngestionAgentOptions,
  MenuIngestionOutcome,
  MenuScraper,
  RestaurantContext,
} from './types.js';

const DEFAULT_MAX_PAGES = 12;

const normalizeUrl = (candidate: string) => candidate.replace(/#.*$/, '');

export class MenuIngestionAgent {
  private readonly scraper: MenuScraper;

  private readonly guardrail: MenuGuardrailModel;

  private readonly options: MenuIngestionAgentOptions;

  private readonly baseLogger = defaultLogger;

  constructor(scraper: MenuScraper, guardrail: MenuGuardrailModel, options: MenuIngestionAgentOptions = {}) {
    this.scraper = scraper;
    this.guardrail = guardrail;
    this.options = options;
    this.baseLogger = options.logger ? options.logger.child({}) : defaultLogger;
  }

  async ingestMenu(context: RestaurantContext, seedUrls: string[]): Promise<MenuIngestionOutcome> {
    const logger = this.baseLogger.child({ scope: 'menu-agent', restaurant: context.name });

    const queue: string[] = [];
    const visited = new Set<string>();
    const accepted: MenuIngestionOutcome['accepted'] = [];
    const rejected: MenuIngestionOutcome['rejected'] = [];

    const normalizedSeeds = seedUrls
      .filter(Boolean)
      .map((url) => normalizeUrl(url))
      .filter((url, index, arr) => arr.indexOf(url) === index);

    queue.push(...normalizedSeeds);

    const maxPages = Math.max(1, this.options.maxPages ?? DEFAULT_MAX_PAGES);
    const maxAccepted = Math.max(1, this.options.maxAccepted ?? 3);

    while (queue.length > 0 && visited.size < maxPages && accepted.length < maxAccepted) {
      const nextUrl = queue.shift();
      if (!nextUrl) {
        break;
      }
      const normalizedUrl = normalizeUrl(nextUrl);
      if (visited.has(normalizedUrl)) {
        continue;
      }
      visited.add(normalizedUrl);

      const page = await this.scraper.scrape(normalizedUrl, context);
      if (!page) {
        rejected.push({ url: normalizedUrl, reason: 'Scraper failed or unsupported content' });
        continue;
      }

      const verdict = await this.guardrail.evaluatePage(context, page, logger);

      const queueFollowUps = (verdict.followUps || [])
        .map((url) => normalizeUrl(url))
        .filter((url) => !visited.has(url) && !queue.includes(url));

      if (queueFollowUps.length > 0) {
        logger.debug('Menu agent adding follow-up targets', { followUps: queueFollowUps });
        queue.push(...queueFollowUps);
      }

      if (verdict.action === 'accept') {
        accepted.push({
          url: page.url,
          normalizedUrl: verdict.normalizedMenuUrl || page.url,
          text: verdict.cleanedMenuText ?? page.content,
          sourceAction: verdict.action as MenuGuardrailAction,
        });
        continue;
      }

      if (verdict.action === 'redirect') {
        rejected.push({ url: page.url, reason: verdict.reason || 'Redirected by guardrail' });
        continue;
      }

      rejected.push({ url: page.url, reason: verdict.reason || 'Rejected by guardrail' });
    }

    return {
      accepted,
      rejected,
      visited: Array.from(visited),
      remainingQueue: queue,
    };
  }
}
