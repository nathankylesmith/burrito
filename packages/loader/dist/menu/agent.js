import { defaultLogger } from '../logger.js';
const DEFAULT_MAX_PAGES = 12;
const normalizeUrl = (candidate) => candidate.replace(/#.*$/, '');
export class MenuIngestionAgent {
    constructor(scraper, guardrail, options = {}) {
        this.baseLogger = defaultLogger;
        this.scraper = scraper;
        this.guardrail = guardrail;
        this.options = options;
        this.baseLogger = options.logger ? options.logger.child({}) : defaultLogger;
    }
    async ingestMenu(context, seedUrls) {
        const logger = this.baseLogger.child({ scope: 'menu-agent', restaurant: context.name });
        const queue = [];
        const visited = new Set();
        const accepted = [];
        const rejected = [];
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
                    sourceAction: verdict.action,
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
