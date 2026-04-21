import { createClient, type Client, type InValue } from "@libsql/client";

let _client: Client | null = null;

export function getDb(): Client {
  if (_client) return _client;

  const url = process.env.TURSO_DATABASE_URL ?? "file:./unitime.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;

  _client = createClient({ url, authToken });
  return _client;
}

export async function dbAll<T = Record<string, unknown>>(
  sql: string,
  args: InValue[] = [],
): Promise<T[]> {
  const res = await getDb().execute({ sql, args });
  return res.rows as unknown as T[];
}

export async function dbGet<T = Record<string, unknown>>(
  sql: string,
  args: InValue[] = [],
): Promise<T | undefined> {
  const rows = await dbAll<T>(sql, args);
  return rows[0];
}

export async function dbRun(
  sql: string,
  args: InValue[] = [],
): Promise<{ lastInsertRowid: bigint | undefined; rowsAffected: number }> {
  const res = await getDb().execute({ sql, args });
  return {
    lastInsertRowid: res.lastInsertRowid,
    rowsAffected: res.rowsAffected,
  };
}

export async function dbTransaction<T>(
  fn: (tx: {
    execute: (sql: string, args?: InValue[]) => Promise<void>;
  }) => Promise<T>,
): Promise<T> {
  const tx = await getDb().transaction("write");
  try {
    const result = await fn({
      execute: async (sql, args = []) => {
        await tx.execute({ sql, args });
      },
    });
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
