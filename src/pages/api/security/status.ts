import type { APIRoute } from 'astro';
import { securitySyncHealth } from '@/lib/security';

export const GET: APIRoute = () => {
  let status: ReturnType<typeof securitySyncHealth>;
  try {
    status = securitySyncHealth();
  } catch {
    status = 'unavailable';
  }
  return Response.json({ status }, {
    status: status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
};
