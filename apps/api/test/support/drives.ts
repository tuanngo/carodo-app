/**
 * A contract 0.28.1 `DriveInput` that ended `endedAgoMs` before now (25 minutes long), with its
 * local day and hour in UTC: what the app sends for a car drive. Overrides replace fields.
 */
export function driveInput(
  options: { endedAgoMs?: number; durationMs?: number; revision?: number; distanceM?: number } = {},
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const durationMs = options.durationMs ?? 25 * 60 * 1000;
  const endedAt = Date.now() - (options.endedAgoMs ?? 10 * 60 * 1000);
  const startedAt = endedAt - durationMs;
  const start = new Date(startedAt);
  return {
    revision: options.revision ?? 1,
    startedAt: start.toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    localDate: start.toISOString().slice(0, 10),
    localStartHour: start.getUTCHours(),
    partOfDay: "morning",
    distanceM: options.distanceM ?? 12_000,
    movingDurationS: durationMs / 1000 - 60,
    elapsedDurationS: durationMs / 1000,
    vehicle: { make: "Kia", model: "K3" },
    weather: "clear",
    shape: { version: 1, points: Array.from({ length: 8 }, (_, i) => [i / 7, (i % 3) / 2]) },
    ...overrides,
  };
}
