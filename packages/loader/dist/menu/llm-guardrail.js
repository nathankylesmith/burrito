import { defaultLogger } from '../logger.js';
const DEFAULT_PROMPT = `You are a cautious quality-control agent that filters restaurant menu pages before they are saved.
Return ONLY a single JSON object with this exact shape and no extra keys:
{
  "action": "accept" | "reject" | "redirect",
  "reason": string,
  "normalized_menu_url": string | null,
  "cleaned_menu_text": string | null,
  "follow_ups": string[]
}

Rules:
- action "accept" only if the page truly contains the restaurant's menu (food/drink items and prices or descriptions).
- action "reject" for career pages, reservations, press, generic landing pages, or irrelevant content.
- action "redirect" when the page hints at a better link (e.g., nav links labelled Menu, Food, Order Online, PDF download). Put the suggested absolute URLs in follow_ups.
- cleaned_menu_text should summarize the menu text you see (trim to essentials, no HTML) when action is accept; otherwise null.
- normalized_menu_url should be the canonical/most specific menu URL if you can infer one; otherwise null.`;
const extractJsonCandidates = (raw) => {
    const candidates = [];
    const fencedMatches = raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
    for (const match of fencedMatches) {
        if (match[1]) {
            candidates.push(match[1].trim());
        }
    }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
        candidates.push(raw.slice(start, end + 1).trim());
    }
    candidates.push(raw.trim());
    return candidates;
};
const safeJsonParse = (raw) => {
    const candidates = extractJsonCandidates(raw);
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        }
        catch {
            // continue
        }
    }
    return null;
};
export class LlmGuardrailModel {
    constructor(llm, options = {}) {
        this.llm = llm;
        this.options = options;
        this.logger = options.logger || defaultLogger.child({ scope: 'menu-guardrail' });
    }
    buildPrompt(context, page) {
        const lines = [
            this.options.promptTemplate || DEFAULT_PROMPT,
            '',
            'Context:',
            `Restaurant: ${context.name}`,
            context.cuisineHints && context.cuisineHints.length > 0
                ? `Cuisine hints: ${context.cuisineHints.join(', ')}`
                : null,
            context.websiteUrl ? `Restaurant site: ${context.websiteUrl}` : null,
            `Evaluating URL: ${page.url}`,
            page.content ? `Page excerpt: ${page.content.slice(0, 1600)}` : 'Page is empty',
        ].filter(Boolean);
        return lines.join('\n');
    }
    async evaluatePage(context, page, logger) {
        const prompt = this.buildPrompt(context, page);
        const rawResponse = await this.llm.generate(prompt);
        if (!rawResponse) {
            return {
                action: 'reject',
                reason: 'LLM returned no response',
                normalizedMenuUrl: null,
                cleanedMenuText: null,
                followUps: [],
            };
        }
        const parsed = safeJsonParse(rawResponse);
        if (!parsed || typeof parsed !== 'object') {
            (logger || this.logger).debug('Failed to parse guardrail response', { rawResponse });
            return {
                action: 'reject',
                reason: 'Unparseable guardrail response',
                normalizedMenuUrl: null,
                cleanedMenuText: null,
                followUps: [],
            };
        }
        const action = parsed.action === 'accept' || parsed.action === 'redirect' ? parsed.action : 'reject';
        const followUps = Array.isArray(parsed.follow_ups)
            ? parsed.follow_ups.filter((entry) => typeof entry === 'string' && entry.trim()).map((url) => url.trim())
            : [];
        return {
            action,
            reason: typeof parsed.reason === 'string' ? parsed.reason : 'No reason provided',
            normalizedMenuUrl: typeof parsed.normalized_menu_url === 'string' ? parsed.normalized_menu_url.trim() || null : null,
            cleanedMenuText: typeof parsed.cleaned_menu_text === 'string' ? parsed.cleaned_menu_text.trim() || null : null,
            followUps,
        };
    }
}
