type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogMeta = Record<string, unknown>;
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
export declare const createLogger: (scope: string, baseMeta?: LogMeta, options?: LoggerOptions) => LoaderLogger;
export declare const defaultLogger: LoaderLogger;
export declare const withContext: (logger?: LoaderLogger, context?: LogMeta) => LoaderLogger;
export {};
