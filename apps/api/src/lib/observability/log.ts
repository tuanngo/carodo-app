/**
 * One structured JSON line per event (AGENTS.md, rule 7). Fields are what the caller passes and
 * nothing else: never a coordinate, a token, a challenge, a ciphertext, an IP address or any
 * `request.cf` value but `colo` and `country` (P5, ADR 0002).
 */

export type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
