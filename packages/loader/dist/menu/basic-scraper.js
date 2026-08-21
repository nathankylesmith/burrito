import { URL } from 'url';
import { defaultLogger } from '../logger.js';
const MAX_BYTES = 500000; // 500kb per page
const TEXT_CONTENT_TYPES = ['text/html', 'text/plain'];
const extractLinks = (html, baseUrl) => {
    const hrefs = new Set();
    const anchorPattern = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
    let match;
    while ((match = anchorPattern.exec(html))) {
        const href = match[1];
        try {
            const resolved = new URL(href, baseUrl);
            if (resolved.protocol.startsWith('http')) {
                hrefs.add(resolved.toString());
            }
        }
        catch {
            // ignore malformed URLs
        }
    }
    return Array.from(hrefs);
};
const trimContent = (raw) => {
    if (!raw || raw.length <= MAX_BYTES)
        return raw;
    return raw.slice(0, MAX_BYTES);
};
export class BasicMenuScraper {
    constructor(options = {}) {
        this.logger = options.logger || defaultLogger.child({ scope: 'menu-scraper' });
        this.userAgent = options.userAgent || 'DishSwipeMenuBot/0.1';
    }
    async scrape(url, context) {
        try {
            const headers = {
                'User-Agent': this.userAgent,
            };
            if (context.websiteUrl) {
                headers.Referer = context.websiteUrl;
            }
            const response = await fetch(url, {
                headers,
            });
            if (!response.ok) {
                this.logger.debug('Menu scraper received non-2xx response', { url, status: response.status });
                return null;
            }
            const contentType = response.headers.get('content-type');
            if (!contentType || !TEXT_CONTENT_TYPES.some((type) => contentType.startsWith(type))) {
                this.logger.debug('Menu scraper ignoring non-text content', { url, contentType });
                return null;
            }
            const buffer = await response.arrayBuffer();
            const rawText = Buffer.from(buffer).toString('utf-8');
            const content = trimContent(rawText);
            const links = contentType.startsWith('text/html') ? extractLinks(content, url) : [];
            return {
                url,
                content,
                contentType,
                links,
            };
        }
        catch (error) {
            this.logger.debug('Menu scraper failed to fetch url', {
                url,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
}
