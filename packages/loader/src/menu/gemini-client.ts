import type { LoaderLogger } from '../logger.js';
import type { LlmClient } from './types.js';

interface GeminiTextModelOptions {
  apiKey: string;
  model: string;
  endpoint?: string;
  temperature?: number;
  maxRetries?: number;
  logger?: LoaderLogger;
}

const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractTextFromResponse = (payload: any): string | null => {
  if (!payload?.candidates || !Array.isArray(payload.candidates)) {
    return null;
  }

  for (const candidate of payload.candidates) {
    const parts = candidate?.content?.parts;
    if (!parts || !Array.isArray(parts)) {
      continue;
    }

    const textPart = parts.find((part: any) => typeof part?.text === 'string' && part.text.trim().length > 0);
    if (textPart?.text) {
      return textPart.text.trim();
    }
  }

  return null;
};

export class GeminiTextModel implements LlmClient {
  readonly provider = 'remote' as const;

  readonly model: string;

  private readonly options: GeminiTextModelOptions;

  private readonly logger?: LoaderLogger;

  constructor(options: GeminiTextModelOptions) {
    if (!options?.apiKey) {
      throw new Error('GeminiTextModel requires an API key.');
    }
    if (!options?.model) {
      throw new Error('GeminiTextModel requires a model name.');
    }

    this.options = options;
    this.model = options.model;
    this.logger = options.logger;
  }

  private buildUrl(): string {
    const normalizedModel = this.model.startsWith('models/') ? this.model : `models/${this.model}`;
    const endpoint = this.options.endpoint?.trim();

    if (endpoint && endpoint.includes(':generateContent')) {
      const separator = endpoint.includes('?') ? '&' : '?';
      return `${endpoint}${separator}key=${this.options.apiKey}`;
    }

    const base = (endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');
    return `${base}/${normalizedModel}:generateContent?key=${this.options.apiKey}`;
  }

  async generate(prompt: string): Promise<string | null> {
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
                ],
              },
            ],
            generationConfig: {
              temperature: this.options.temperature ?? 0.2,
            },
          }),
        });

        if (!response.ok) {
          let errorMessage = `Gemini API returned ${response.status}`;
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
        const text = extractTextFromResponse(data);
        if (text) {
          return text;
        }

        this.logger?.warn('Gemini model returned no usable text', { attempt, model: this.model });
        return null;
      } catch (error) {
        this.logger?.warn('Gemini model call failed', {
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
}

