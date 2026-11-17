import winston from "winston";
import type { Env } from "../config/env.js";

export type Logger = winston.Logger;

const { combine, timestamp, json, colorize, printf } = winston.format;

// Development: one short line a person can read.
//   14:03:07 info request finished requestId=a1b2 method=GET path=/v1/health status=200 durationMs=3
const readableLine = printf((info) => {
  const { timestamp: time, level, message, service: _service, stack, ...rest } = info;
  const fields = Object.entries(rest)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");
  const line = [time, level, message, fields].filter(Boolean).join(" ");
  return stack ? `${line}\n${String(stack)}` : line;
});

/**
 * Builds the logger. Lines go to standard output only; the app never writes
 * log files. Rule for all code: log IDs, never CV text, email content, names,
 * contact details or secret keys.
 */
export function createLogger(env: Env): Logger {
  const format =
    env.NODE_ENV === "production"
      ? combine(timestamp(), json())
      : combine(colorize(), timestamp({ format: "HH:mm:ss" }), readableLine);

  return winston.createLogger({
    level: env.LOG_LEVEL,
    defaultMeta: { service: "api" },
    format,
    transports: [new winston.transports.Console()],
  });
}
