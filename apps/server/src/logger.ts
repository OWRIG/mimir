import pino from 'pino'

export const logger = pino({
  level: process.env.MIMIR_LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.token', '*.secret'],
    remove: true,
  },
})

export type Logger = typeof logger
