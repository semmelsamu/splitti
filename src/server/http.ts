// Plumbing shared by all API endpoints: JSON answers, error answers in German,
// and the rule that the group token in the path is the only credential.

import type { APIContext, APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type Db, getDb, schema } from './db';

export type Group = typeof schema.groups.$inferSelect;

/** An error with an HTTP status and a message that may be shown to the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (message = 'Das gibt es in dieser Gruppe nicht.') =>
  new ApiError(404, 'not_found', message);

export const invalid = (message: string) => new ApiError(400, 'invalid', message);

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Wraps an endpoint: thrown errors become JSON answers instead of HTML error pages. */
export function route(handler: (context: APIContext) => Response | Promise<Response>): APIRoute {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      if (error instanceof ApiError) {
        return json({ error: error.code, message: error.message }, error.status);
      }
      if (error instanceof z.ZodError) {
        const message = error.issues[0]?.message ?? 'Die Eingabe ist ungültig.';
        return json({ error: 'invalid', message }, 400);
      }
      console.error(`[splitti] ${context.request.method} ${context.url.pathname}`, error);
      return json(
        { error: 'internal', message: 'Auf dem Server ist ein Fehler aufgetreten.' },
        500,
      );
    }
  };
}

export interface GroupContext extends APIContext {
  db: Db;
  group: Group;
  /** The member this device acts as, if it sent one that belongs to the group. */
  actorId: number | null;
}

/**
 * Wraps an endpoint below /api/groups/:token. Looks up the group by its token
 * and hands it to the handler; an unknown token is a 404. Everything the
 * handler touches must be checked against `group.id`.
 */
export function groupRoute(
  handler: (context: GroupContext) => Response | Promise<Response>,
): APIRoute {
  return route((context) => {
    const db = getDb();
    const token = context.params.token ?? '';
    const group = db.select().from(schema.groups).where(eq(schema.groups.token, token)).get();
    if (!group) throw notFound('Diese Gruppe gibt es nicht. Stimmt der Link?');

    let actorId: number | null = null;
    const header = Number(context.request.headers.get('x-splitti-member'));
    if (Number.isInteger(header) && header > 0) {
      const member = db
        .select({ id: schema.members.id })
        .from(schema.members)
        .where(and(eq(schema.members.id, header), eq(schema.members.groupId, group.id)))
        .get();
      actorId = member?.id ?? null;
    }

    return handler(Object.assign(context, { db, group, actorId }));
  });
}

/** Reads and validates a JSON body. */
export async function readJson<T>(request: Request, shape: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw invalid('Die Anfrage enthält kein gültiges JSON.');
  }
  return shape.parse(body);
}

/** A positive integer id from the path. */
export function idParam(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

export function nowIso(): string {
  return new Date().toISOString();
}
