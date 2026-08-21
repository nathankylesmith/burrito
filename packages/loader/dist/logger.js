const LEVEL_WEIGHT = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
const readEnv = (key) => {
    const globalAny = globalThis;
    const nodeEnv = globalAny?.process?.env;
    if (nodeEnv && typeof nodeEnv[key] === 'string') {
        return nodeEnv[key];
    }
    try {
        const denoEnv = globalAny?.Deno?.env;
        if (denoEnv && typeof denoEnv.get === 'function') {
            return denoEnv.get(key);
        }
    }
    catch {
        // Ignore permission errors when accessing Deno env.
    }
    return undefined;
};
const normalizeLevel = (value) => {
    if (!value)
        return 'info';
    const normalized = value.toLowerCase();
    return normalized in LEVEL_WEIGHT ? normalized : 'info';
};
const ROOT_LEVEL = normalizeLevel(readEnv('LOADER_LOG_LEVEL') || readEnv('LOG_LEVEL'));
const shouldLog = (current, candidate) => LEVEL_WEIGHT[candidate] >= LEVEL_WEIGHT[current];
const write = (level, scope, message, metadata) => {
    const prefix = `[DishLoader][${scope}] ${message}`;
    const payload = metadata && Object.keys(metadata).length > 0 ? metadata : undefined;
    if (payload) {
        // eslint-disable-next-line no-console
        console[level](prefix, payload);
    }
    else {
        // eslint-disable-next-line no-console
        console[level](prefix);
    }
};
export const createLogger = (scope, baseMeta = {}, options = {}) => {
    const level = options.level ?? ROOT_LEVEL;
    const log = (targetLevel, message, meta) => {
        if (!shouldLog(level, targetLevel)) {
            return;
        }
        write(targetLevel, scope, message, { ...baseMeta, ...(meta || {}) });
    };
    const child = (meta = {}) => createLogger(scope, { ...baseMeta, ...meta }, { level });
    return {
        level,
        scope,
        debug: (message, meta) => log('debug', message, meta),
        info: (message, meta) => log('info', message, meta),
        warn: (message, meta) => log('warn', message, meta),
        error: (message, meta) => log('error', message, meta),
        child,
    };
};
export const defaultLogger = createLogger('loader');
export const withContext = (logger = defaultLogger, context) => {
    if (!context || Object.keys(context).length === 0) {
        return logger;
    }
    return logger.child(context);
};
