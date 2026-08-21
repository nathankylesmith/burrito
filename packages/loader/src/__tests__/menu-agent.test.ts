import { describe, expect, it, vi } from 'vitest';
import { MenuIngestionAgent } from '../menu/agent.js';
import type { MenuGuardrailModel, MenuScraper, RestaurantContext } from '../menu/types.js';

const createScraper = (pages: Record<string, { content: string; links?: string[] }>): MenuScraper => ({
  scrape: vi.fn(async (url: string) => {
    const entry = pages[url];
    if (!entry) return null;
    return { url, content: entry.content, links: entry.links };
  }),
});

const createGuardrail = (
  verdicts: Record<string, { action: 'accept' | 'reject' | 'redirect'; reason?: string; followUps?: string[] }>
): MenuGuardrailModel => ({
  evaluatePage: vi.fn(async (_context, page) => {
    const verdict = verdicts[page.url];
    return (
      verdict || {
        action: 'reject',
        reason: 'missing',
      }
    );
  }),
});

const baseContext: RestaurantContext = { name: 'Testaurant', websiteUrl: 'https://example.com' };

describe('MenuIngestionAgent', () => {
  it('accepts a valid menu page immediately', async () => {
    const scraper = createScraper({
      'https://example.com/menu': { content: 'Menu: tacos $10' },
    });

    const guardrail = createGuardrail({
      'https://example.com/menu': { action: 'accept', reason: 'menu found' },
    });

    const agent = new MenuIngestionAgent(scraper, guardrail, { maxPages: 2, maxAccepted: 1 });
    const outcome = await agent.ingestMenu(baseContext, ['https://example.com/menu']);

    expect(outcome.accepted).toHaveLength(1);
    expect(outcome.accepted[0].url).toBe('https://example.com/menu');
    expect(outcome.rejected).toHaveLength(0);
    expect(outcome.visited).toEqual(['https://example.com/menu']);
  });

  it('follows guardrail suggestions until a menu is accepted', async () => {
    const scraper = createScraper({
      'https://example.com': { content: 'Welcome page', links: ['https://example.com/menu'] },
      'https://example.com/menu': { content: 'PDF menu available' },
    });

    const guardrail = createGuardrail({
      'https://example.com': {
        action: 'redirect',
        reason: 'Found menu link',
        followUps: ['https://example.com/menu'],
      },
      'https://example.com/menu': { action: 'accept', reason: 'menu confirmed' },
    });

    const agent = new MenuIngestionAgent(scraper, guardrail, { maxPages: 3, maxAccepted: 1 });
    const outcome = await agent.ingestMenu(baseContext, ['https://example.com']);

    expect(outcome.accepted).toHaveLength(1);
    expect(outcome.rejected).toEqual([
      { url: 'https://example.com', reason: 'Found menu link' },
    ]);
    expect(outcome.visited).toEqual(['https://example.com', 'https://example.com/menu']);
  });
});
