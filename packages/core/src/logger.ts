import winston from "winston";

export type Logger = winston.Logger;

export interface LoggerOptions {
  /** Which part is logging, for example "api" or "worker". Printed on every line. */
  service: string;
  /** How much is logged. */
  level: "error" | "warn" | "info" | "debug";
  /** "readable": one short line for a person. "json": one structured line for a log service. */
  style: "readable" | "json";
}

const { combine, timestamp, json, colorize, printf } = winston.format;

// Readable style: one short line a person can read.
//   14:03:07 info request finished service=api requestId=a1b2 method=GET path=/v1/health status=200 durationMs=3
const readableLine = printf((info) => {
  const { timestamp: time, level, message, stack, ...rest } = info;
  const fields = Object.entries(rest)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");
  const line = [time, level, message, fields].filter(Boolean).join(" ");
  return stack ? `${line}\n${String(stack)}` : line;
});

/**
 * Builds the logger for one part of the product. Lines go to standard output
 * only; the app never writes log files. Rule for all code: log IDs, never CV
 * text, email content, names, contact details or secret keys.
 */
export function createLogger(options: LoggerOptions): Logger {
  const format =
    options.style === "json"
      ? combine(timestamp(), json())
      : combine(colorize(), timestamp({ format: "HH:mm:ss" }), readableLine);

  return winston.createLogger({
    level: options.level,
    defaultMeta: { service: options.service },
    format,
    transports: [new winston.transports.Console()],
  });
}
