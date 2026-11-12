// @ts-check
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// One Node process serves the app shell, the static assets and the JSON API.
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
    // Receipt photos are the only large uploads.
    bodySizeLimit: 25 * 1024 * 1024,
  }),
  integrations: [react()],
  server: { host: true, port: 3000 },
  // The group token in the path is the only credential and there are no cookies,
  // so there is nothing a cross-site request could ride on. The origin check would
  // only break uploads behind the HTTPS reverse proxy (see docs/DECISIONS.md).
  security: { checkOrigin: false },
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
