import { defineConfig } from 'vitest/config';

// Unit tests for the calculation core, the receipt parser and the server logic.
// They need neither a browser nor a running server.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
