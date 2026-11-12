import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { getDb } from '../../server/db';

// Liveness probe for Docker: answers only if the database is reachable and migrated.
export const GET: APIRoute = () => {
  try {
    getDb().run(sql`select 1`);
    return Response.json({ status: 'ok' });
  } catch (error) {
    console.error('health check failed', error);
    return Response.json({ status: 'error' }, { status: 503 });
  }
};
