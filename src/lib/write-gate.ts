import { HttpError } from "./http-error";
let active = 0,
  exclusive = false;
export const maintenanceActive = () => exclusive;
export async function trackWrite(operation: () => Promise<Response>) {
  if (exclusive)
    return Response.json(
      { error: "Backup or recovery is in progress. Retry shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  active++;
  try {
    return await operation();
  } finally {
    active--;
  }
}
export async function exclusiveWrite<T>(
  operation: () => Promise<T>,
  ownRequest = true,
): Promise<T> {
  if (exclusive)
    throw new HttpError(409, "Another maintenance operation is running.");
  exclusive = true;
  try {
    const until = Date.now() + 15_000;
    while (active > (ownRequest ? 1 : 0)) {
      if (Date.now() > until)
        throw new HttpError(
          409,
          "A write is still running. Retry when uploads finish.",
        );
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return await operation();
  } finally {
    exclusive = false;
  }
}
