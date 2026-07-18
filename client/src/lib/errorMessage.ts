/**
 * tRPC's TRPCClientError extends Error and carries the server's TRPCError
 * message (e.g. "たこ焼きの在庫が不足しています") as `.message` when the
 * server threw a known error. Falling back to a generic string only for
 * errors with no message (network failures, non-Error throws) means the
 * cashier actually sees why an action failed instead of always getting the
 * same unhelpful toast.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
