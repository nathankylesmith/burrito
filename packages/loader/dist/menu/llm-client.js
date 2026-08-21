const DEFAULT_TEXT_ENDPOINT = 'http://127.0.0.1:11434';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class LocalTextModel {
    constructor(options) {
        if (!options?.model) {
            throw new Error('A model name is required to use the menu guardrail agent.');
        }
        this.options = options;
        this.model = options.model;
        this.provider = options.provider || 'local';
    }
    get endpoint() {
        return this.options.endpoint || DEFAULT_TEXT_ENDPOINT;
    }
    get logger() {
        return this.options.logger;
    }
    async generate(prompt) {
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
                const payload = (await response.json());
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
            }
            catch (error) {
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
