import type { APIRoute } from 'astro';

// Unknown API paths must not fall through to the app shell.
export const ALL: APIRoute = () =>
    Response.json(
        { error: 'not_found', message: 'Diesen Endpunkt gibt es nicht.' },
        { status: 404 },
    );
