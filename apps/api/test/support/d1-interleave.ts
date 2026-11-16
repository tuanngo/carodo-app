/**
 * A D1 binding that lets another request land between two of a service's round trips: `between`
 * runs once, right after the service's `after`-th call to D1 returns (a `first`, `run`, `all`,
 * `raw` or `batch`). A race in production is two Workers interleaving at an `await`; this replays
 * one such interleaving deterministically. `between` uses the real binding, not this one.
 */
export function interleaved(db: D1Database, after: number, between: () => Promise<unknown>): D1Database {
  let calls = 0;
  const real = new WeakMap<object, D1PreparedStatement>();

  async function step<T>(call: Promise<T>): Promise<T> {
    const value = await call;
    calls += 1;
    if (calls === after) await between();
    return value;
  }

  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    const proxy = {
      bind: (...values: unknown[]) => wrap(statement.bind(...values)),
      first: (column?: string) => step(column === undefined ? statement.first() : statement.first(column)),
      run: () => step(statement.run()),
      all: () => step(statement.all()),
      raw: (options?: { columnNames?: false }) => step(statement.raw(options)),
    };
    real.set(proxy, statement);
    return proxy as unknown as D1PreparedStatement;
  }

  return {
    prepare: (sql: string) => wrap(db.prepare(sql)),
    batch: (statements: D1PreparedStatement[]) => step(db.batch(statements.map((s) => real.get(s) ?? s))),
  } as unknown as D1Database;
}
