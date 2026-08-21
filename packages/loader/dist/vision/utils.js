export const DEFAULT_DESCRIBE_PROMPT = `You are a food critic AI describing a restaurant dish photo.
Respond with NOTHING except a single valid JSON object in the exact format below.
Do NOT add prose, commentary, markdown fences, or extra keys.

{
  "dish_guess": string | null,
  "alternate_names": string[],
  "caption": string,
  "cuisine_guess": string | null,
  "ingredients": string[],
  "tags": string[],
  "dietary_tags": string[],
  "price_tier": "low" | "medium" | "high" | "premium" | null,
  "price_estimate": number | null,
  "confidence": number (0-1)
}

If unsure, use null or [] as appropriate.`;
export const DEFAULT_CLASSIFY_PROMPT = `You are an AI assistant that determines whether an image shows a prepared dish/meal.
Respond with ONLY this JSON shape:
{
  "is_dish": true | false,
  "confidence": number (0-1),
  "tags": string[]
}

Consider plates, bowls, drinks, dessert cups as dishes. Interiors, exteriors, menus, people are not dishes.`;
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const normalizeStringArray = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry || '').trim()))
            .filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return value
            .split(/[,/]/)
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
};
export const coerceNumber = (value) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};
export const extractJsonCandidates = (raw) => {
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
export const safeJsonParse = (raw) => {
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
export const buildDescribePrompt = (template, context) => {
    const lines = [
        template || DEFAULT_DESCRIBE_PROMPT,
        '',
        'Context:',
        context.restaurantName ? `Restaurant: ${context.restaurantName}` : null,
        context.dishName ? `Candidate dish name: ${context.dishName}` : null,
        context.cuisineType ? `Cuisine hint: ${context.cuisineType}` : null,
        context.reviewExcerpt ? `Review excerpt: ${context.reviewExcerpt}` : null,
    ].filter(Boolean);
    return lines.join('\n');
};
