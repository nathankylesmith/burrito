type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogMeta = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const readEnv = (key: string) => {
  const globalAny = globalThis as any;
  const nodeEnv = globalAny?.process?.env;
  if (nodeEnv && typeof nodeEnv[key] === 'string') {
    return nodeEnv[key];
  }

  try {
    const denoEnv = globalAny?.Deno?.env;
    if (denoEnv && typeof denoEnv.get === 'function') {
      return denoEnv.get(key);
    }
  } catch {
    // Ignore permission errors when accessing Deno env.
  }

  return undefined;
};

const normalizeLevel = (value?: string | null): LogLevel => {
  if (!value) return 'info';
  const normalized = value.toLowerCase() as LogLevel;
  return normalized in LEVEL_WEIGHT ? normalized : 'info';
};

const ROOT_LEVEL = normalizeLevel(readEnv('LOADER_LOG_LEVEL') || readEnv('LOG_LEVEL'));

const shouldLog = (current: LogLevel, candidate: LogLevel) =>
  LEVEL_WEIGHT[candidate] >= LEVEL_WEIGHT[current];

const write = (level: LogLevel, scope: string, message: string, metadata?: LogMeta) => {
  const prefix = `[DishLoader][${scope}] ${message}`;
  const payload = metadata && Object.keys(metadata).length > 0 ? metadata : undefined;
  if (payload) {
    // eslint-disable-next-line no-console
    console[level](prefix, payload);
  } else {
    // eslint-disable-next-line no-console
    console[level](prefix);
  }
};

export interface LoaderLogger {
  level: LogLevel;
  scope: string;
  debug: (message: string, meta?: LogMeta) => void;
  info: (message: string, meta?: LogMeta) => void;
  warn: (message: string, meta?: LogMeta) => void;
  error: (message: string, meta?: LogMeta) => void;
  child: (meta: LogMeta) => LoaderLogger;
}

export type Logger = LoaderLogger;

interface LoggerOptions {
  level?: LogLevel;
  baseMeta?: LogMeta;
}

export const createLogger = (
  scope: string,
  baseMeta: LogMeta = {},
  options: LoggerOptions = {}
): LoaderLogger => {
  const level = options.level ?? ROOT_LEVEL;

  const log = (targetLevel: LogLevel, message: string, meta?: LogMeta) => {
    if (!shouldLog(level, targetLevel)) {
      return;
    }
    write(targetLevel, scope, message, { ...baseMeta, ...(meta || {}) });
  };

  const child = (meta: LogMeta = {}) =>
    createLogger(scope, { ...baseMeta, ...meta }, { level });

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

export const withContext = (logger: LoaderLogger = defaultLogger, context?: LogMeta): LoaderLogger => {
  if (!context || Object.keys(context).length === 0) {
    return logger;
  }

  return logger.child(context);
};
