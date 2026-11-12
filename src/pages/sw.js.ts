import type { APIRoute } from 'astro';
import source from '../sw/service-worker.js?raw';

// The service worker as a file of its own at /sw.js. Rendered once at build
// time, with the build time as version: every build gets a fresh cache.
export const prerender = true;

const version = new Date()
  .toISOString()
  .replace(/[^0-9]/g, '')
  .slice(0, 14);

export const GET: APIRoute = () =>
  new Response(source.replaceAll('__VERSION__', version), {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
  });
