import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  ...(isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});

export function createLogger(prefix: string): {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, err?: unknown) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
} {
  const child = logger.child({ module: prefix });
  return {
    info: (msg: string, meta?: Record<string, unknown>) => child.info(meta ?? {}, msg),
    error: (msg: string, err?: unknown) => child.error({ err }, msg),
    debug: (msg: string, meta?: Record<string, unknown>) => child.debug(meta ?? {}, msg),
  };
}
