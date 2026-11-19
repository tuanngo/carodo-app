const QUARTER = 15 * 60 * 1000;

/**
 * A contract 0.29.0 `DriveInput` that ended `endedAgoMs` before now (30 minutes by default, so
 * others already see it: released at the next quarter hour) and 25 minutes long, as the app
 * sends it: the end floored to the quarter hour, durations in minutes, distance in 100 m, the local
 * day and hour in UTC. Overrides replace fields.
 */
export function driveInput(
  options: { endedAgoMs?: number; durationMin?: number; revision?: number; distanceM?: number } = {},
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const durationMin = options.durationMin ?? 25;
  const ended = Date.now() - (options.endedAgoMs ?? 30 * 60 * 1000);
  const endedAt = ended - (ended % QUARTER);
  const start = new Date(ended - durationMin * 60_000);
  return {
    revision: options.revision ?? 1,
    endedAt: new Date(endedAt).toISOString(),
    localDate: start.toISOString().slice(0, 10),
    localStartHour: start.getUTCHours(),
    partOfDay: "morning",
    distanceM: options.distanceM ?? 12_000,
    movingDurationS: (durationMin - 1) * 60,
    elapsedDurationS: durationMin * 60,
    vehicle: { make: "Kia", model: "K3" },
    weather: "clear",
    shape: { version: 1, points: Array.from({ length: 8 }, (_, i) => [i / 7, (i % 3) / 2]) },
    ...overrides,
  };
}
