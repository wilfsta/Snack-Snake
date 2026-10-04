import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works at any address (e.g. https://<user>.github.io/Snack-Snake/).
  base: './',
  server: {
    // Listen on all interfaces so phones/tablets on the same Wi-Fi can open the dev server.
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
