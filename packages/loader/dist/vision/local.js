import { buildDescribePrompt, coerceNumber, DEFAULT_CLASSIFY_PROMPT, normalizeStringArray, safeJsonParse, sleep, } from './utils.js';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';
class LocalVisionClient {
    constructor(options) {
        if (!options.model) {
            throw new Error('A local vision model name is required.');
        }
        this.endpoint = options.endpoint || DEFAULT_ENDPOINT;
        this.model = options.model;
        this.options = options;
    }
    get logger() {
        return this.options.logger;
    }
    async generateResponse(prompt, photoBase64, attemptMeta) {
        const maxAttempts = Math.max(1, this.options.maxRetries ?? 2);
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const base = this.endpoint.replace(/\/+$/, '');
            const target = base.endsWith('/api/generate') ? base : `${base}/api/generate`;
            try {
                const response = await fetch(target, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: this.model,
                        prompt,
                        images: [photoBase64],
                        stream: false,
                        options: {
                            temperature: this.options.temperature ?? 0.2,
                        },
                    }),
                });
                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`Vision model returned ${response.status}: ${errorBody}`);
                }
                const payload = (await response.json());
                const rawText = payload.response?.trim();
                if (!rawText) {
                    this.logger?.warn('Vision model returned empty response', attemptMeta);
                    return null;
                }
                return rawText;
            }
            catch (error) {
                this.logger?.warn('Local vision model call failed', {
                    ...attemptMeta,
                    attempt,
                    error: error instanceof Error ? error.message : String(error),
                });
                if (attempt >= maxAttempts) {
                    return null;
                }
                await sleep(250 * attempt);
            }
        }
        return null;
    }
    async classifyDishPhoto(params) {
        if (!params.photo.buffer || params.photo.buffer.length === 0) {
            return null;
        }
        const photoBase64 = Buffer.from(params.photo.buffer).toString('base64');
        const prompt = DEFAULT_CLASSIFY_PROMPT;
        const rawText = await this.generateResponse(prompt, photoBase64, {
            placeId: params.placeId,
            photoReference: params.photoReference,
            component: 'vision.classify',
        });
        if (!rawText) {
            return null;
        }
        const parsed = safeJsonParse(rawText);
        if (!parsed) {
            this.logger?.warn('Vision classification response was not valid JSON', {
                placeId: params.placeId,
                sample: rawText.slice(0, 160),
            });
            return null;
        }
        const classification = {
            model: this.model,
            is_dish: Boolean(parsed.is_dish ?? parsed.dish ?? parsed.food ?? false),
            confidence: coerceNumber(parsed.confidence),
            tags: normalizeStringArray(parsed.tags ?? parsed.labels),
            raw_response: parsed,
        };
        return classification;
    }
    async describeDishPhoto(params) {
        if (!params.photo?.buffer || params.photo.buffer.length === 0) {
            return null;
        }
        const photoBase64 = Buffer.from(params.photo.buffer).toString('base64');
        const prompt = buildDescribePrompt(this.options.promptTemplate, params);
        const rawText = await this.generateResponse(prompt, photoBase64, {
            placeId: params.placeId,
            photoReference: params.photoReference,
            component: 'vision.describe',
        });
        if (!rawText) {
            return null;
        }
        const parsed = safeJsonParse(rawText);
        if (!parsed) {
            this.logger?.warn('Vision model response was not valid JSON', {
                placeId: params.placeId,
                sample: rawText.slice(0, 160),
            });
            return null;
        }
        const pickString = (...keys) => {
            for (const key of keys) {
                const value = parsed[key];
                if (typeof value === 'string' && value.trim()) {
                    return value.trim();
                }
            }
            return null;
        };
        const insight = {
            model: this.model,
            dish_guess: pickString('dish_guess', 'dish', 'name'),
            alternate_names: normalizeStringArray(parsed.alternate_names ?? parsed.aliases),
            caption: pickString('caption', 'description', 'summary'),
            cuisine_guess: pickString('cuisine_guess', 'cuisine'),
            ingredients: normalizeStringArray(parsed.ingredients),
            tags: normalizeStringArray(parsed.tags ?? parsed.labels),
            dietary_tags: normalizeStringArray(parsed.dietary_tags),
            price_tier: pickString('price_tier', 'priceTier', 'price_level', 'priceLevel'),
            price_estimate: coerceNumber(parsed.price_estimate ?? parsed.priceEstimate),
            confidence: coerceNumber(parsed.confidence),
            raw_response: parsed,
        };
        return insight;
    }
}
export const createLocalVisionClient = (options) => new LocalVisionClient(options);
