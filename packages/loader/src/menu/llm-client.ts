import type { LoaderLogger } from '../logger.js';
import type { LlmClient, LlmProvider } from './types.js';

export interface LocalTextModelOptions {
  endpoint?: string;
  model: string;
  temperature?: number;
  maxRetries?: number;
  provider?: LlmProvider;
  logger?: LoaderLogger;
}

const DEFAULT_TEXT_ENDPOINT = 'http://127.0.0.1:11434';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class LocalTextModel implements LlmClient {
  readonly provider: LlmProvider;

  readonly model: string;

  private readonly options: LocalTextModelOptions;

  constructor(options: LocalTextModelOptions) {
    if (!options?.model) {
      throw new Error('A model name is required to use the menu guardrail agent.');
    }
    this.options = options;
    this.model = options.model;
    this.provider = options.provider || 'local';
  }

  private get endpoint() {
    return this.options.endpoint || DEFAULT_TEXT_ENDPOINT;
  }

  private get logger() {
    return this.options.logger;
  }

  async generate(prompt: string): Promise<string | null> {
    const maxAttempts = Math.max(1, this.options.maxRetries ?? 2);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const base = this.endpoint.replace(/\/+$/, '');
        const target = base.endsWith('/api/generate') ? base : `${base}/api/generate`;

        this.logger?.debug?.('Guardrail calling local endpoint', {
          endpoint: target,
          model: this.model,
          attempt,
        });

        const response = await fetch(target, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            prompt,
            stream: false,
            options: {
              temperature: this.options.temperature ?? 0.2,
            },
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Guardrail model returned ${response.status}: ${errorBody}`);
        }

        const payload = (await response.json()) as { response?: string };
        const rawText = payload.response?.trim();
        if (!rawText) {
          this.logger?.warn('Guardrail model returned empty response');
          return null;
        }

        this.logger?.debug?.('Guardrail received response from local endpoint', {
          endpoint: target,
          model: this.model,
          attempt,
        });

        return rawText;
      } catch (error) {
        this.logger?.warn('Menu guardrail model call failed', {
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt >= maxAttempts) {
          break;
        }
        await sleep(250 * attempt);
      }
    }

    return null;
  }
}
