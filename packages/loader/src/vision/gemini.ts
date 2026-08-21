import type { LoaderLogger } from '../logger.js';
import type {
  DescribeDishPhotoParams,
  DishPhotoClassification,
  DishPhotoInsight,
  ClassifyDishPhotoParams,
  VisionClient,
} from './types.js';
import {
  buildDescribePrompt,
  coerceNumber,
  DEFAULT_CLASSIFY_PROMPT,
  DEFAULT_DESCRIBE_PROMPT,
  normalizeStringArray,
  safeJsonParse,
} from './utils.js';

interface GeminiVisionOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxRetries?: number;
  promptTemplate?: string;
  logger?: LoaderLogger;
}

const DEFAULT_MODEL = 'gemini-2.0-flash-exp';
const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractJsonFromResponse = (payload: any): any | null => {
  if (!payload?.candidates || !Array.isArray(payload.candidates)) {
    return null;
  }

  for (const candidate of payload.candidates) {
    const parts = candidate?.content?.parts;
    if (!parts || !Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      if (typeof part?.text === 'string') {
        const text = part.text.trim();
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return safeJsonParse(jsonMatch[0]);
        }
        // If no JSON found, return the text as is
        return { raw_text: text };
      }
    }
  }

  return null;
};

export class GeminiVisionClient implements VisionClient {
  readonly provider = 'remote' as const;

  readonly model: string;

  private readonly options: GeminiVisionOptions;

  private readonly logger?: LoaderLogger;

  constructor(options: GeminiVisionOptions) {
    if (!options?.apiKey) {
      throw new Error('GeminiVisionClient requires an API key.');
    }

    this.options = options;
    this.model = options.model || DEFAULT_MODEL;
    this.logger = options.logger;
  }

  private buildUrl(): string {
    const normalizedModel = this.model.startsWith('models/') ? this.model : `models/${this.model}`;
    const endpoint = this.options.apiKey;

    return `${DEFAULT_ENDPOINT}/${normalizedModel}:generateContent?key=${endpoint}`;
  }

  private async generateWithImage(prompt: string, imageBase64: string, mimeType: string = 'image/jpeg'): Promise<any | null> {
    const maxAttempts = Math.max(1, this.options.maxRetries ?? 2);
    const url = this.buildUrl();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: prompt,
                  },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: imageBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: this.options.temperature ?? 0.2,
            },
          }),
        });

        if (!response.ok) {
          let errorMessage = `Gemini Vision API returned ${response.status}`;
          try {
            const errorPayload = await response.json();
            if (errorPayload?.error?.message) {
              errorMessage = `${errorMessage}: ${errorPayload.error.message}`;
            }
          } catch {
            // ignore JSON parse errors for error response
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        const result = extractJsonFromResponse(data);
        if (result) {
          return result;
        }

        this.logger?.warn('Gemini Vision model returned no usable response', { attempt, model: this.model });
        return null;
      } catch (error) {
        this.logger?.warn('Gemini Vision model call failed', {
          attempt,
          error: error instanceof Error ? error.message : String(error),
          model: this.model,
        });

        if (attempt >= maxAttempts) {
          return null;
        }
        await sleep(250 * attempt);
      }
    }

    return null;
  }

  async classifyDishPhoto(params: ClassifyDishPhotoParams): Promise<DishPhotoClassification | null> {
    try {
      const { photo } = params;
      if (!photo?.buffer || photo.buffer.length === 0) {
        this.logger?.warn('No photo data provided for classification');
        return null;
      }

      const photoBase64 = Buffer.from(photo.buffer).toString('base64');
      const prompt = DEFAULT_CLASSIFY_PROMPT;
      const result = await this.generateWithImage(prompt, photoBase64, photo.contentType);

      if (!result) {
        return null;
      }

      // Parse the classification result
      const isDish = result.is_food_dish === true || result.is_dish === true ||
                    (typeof result.is_dish === 'string' && result.is_dish.toLowerCase().includes('yes'));

      return {
        model: this.model,
        is_dish: isDish,
        confidence: coerceNumber(result.confidence) ?? coerceNumber(result.certainty),
        tags: normalizeStringArray(result.tags),
        raw_response: result,
      };
    } catch (error) {
      this.logger?.error('Failed to classify dish photo with Gemini', {
        error: error instanceof Error ? error.message : String(error),
        placeId: params.placeId,
        photoReference: params.photoReference,
      });
      return null;
    }
  }

  async describeDishPhoto(params: DescribeDishPhotoParams): Promise<DishPhotoInsight | null> {
    try {
      const { photo } = params;
      if (!photo?.buffer || photo.buffer.length === 0) {
        this.logger?.warn('No photo data provided for description');
        return null;
      }

      const photoBase64 = Buffer.from(photo.buffer).toString('base64');
      const prompt = buildDescribePrompt(this.options.promptTemplate, params);
      const result = await this.generateWithImage(prompt, photoBase64, photo.contentType);

      if (!result) {
        return null;
      }

      // Parse the description result
      return {
        model: this.model,
        dish_guess: result.dish_name || result.dish_guess || null,
        alternate_names: normalizeStringArray(result.alternate_names || result.alternative_names),
        caption: result.caption || result.description || null,
        cuisine_guess: result.cuisine || result.cuisine_type || null,
        ingredients: normalizeStringArray(result.ingredients),
        tags: normalizeStringArray(result.tags),
        dietary_tags: normalizeStringArray(result.dietary_tags || result.dietary_restrictions),
        price_tier: result.price_tier || null,
        price_estimate: coerceNumber(result.price_estimate),
        confidence: coerceNumber(result.confidence),
        raw_response: result,
      };
    } catch (error) {
      this.logger?.error('Failed to describe dish photo with Gemini', {
        error: error instanceof Error ? error.message : String(error),
        placeId: params.placeId,
        photoReference: params.photoReference,
      });
      return null;
    }
  }
}
