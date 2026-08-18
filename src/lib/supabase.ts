import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);

// The anon key can only read. Every write goes through a security-definer
// function that checks the league PIN, so shipping this key to the browser is
// safe by design (see supabase/schema.sql).
export const supabase = createClient(url ?? "http://localhost", key ?? "public-anon-key", {
  realtime: { params: { eventsPerSecond: 20 } },
  auth: { persistSession: false },
});

/** Turn a Postgres error into something a human in a loud room can act on. */
export function readableError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return "Something went wrong.";
  if (e.code === "23505") return "That player is already drafted.";
  if (e.code === "28000") return "Wrong PIN.";
  if (e.message?.includes("Failed to fetch")) return "No connection. Retrying…";
  if (e.message) return e.message.replace(/^.*?:\s*/, "");
  return "Something went wrong.";
}

const isNetworkError = (err: unknown) => {
  const m = (err as { message?: string })?.message ?? "";
  return m.includes("Failed to fetch") || m.includes("NetworkError") || m.includes("timeout");
};

/** Retry dropped connections. A rejection from Postgres is final, not retried. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err)) throw err;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw lastError;
}

/** Calls an RPC and throws on a Postgres-level error so withRetry can see it. */
export async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
