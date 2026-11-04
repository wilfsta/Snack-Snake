import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * The published page may only load its own files: no injected scripts, no third-party content.
 * Build only: the development server injects inline code that this would block.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' }],
  };
}

/**
 * Builds sw.js (the offline cache, see src/sw.js) with this build's file list and a cache name
 * unique to it, so a new version replaces the old cache instead of adding to it.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = readdirSync('public');
      const files = [...Object.keys(bundle), ...publicFiles]
        .filter((f) => f !== 'index.html' && !f.endsWith('.map') && f !== 'og-image.png')
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f);
      for (const f of publicFiles) hash.update(readFileSync(`public/${f}`));
      const html = bundle['index.html'];
      if (html?.type === 'asset') hash.update(html.source);
      const template = readFileSync('src/sw.js', 'utf8');
      hash.update(template);
      const source = template
        .replace("'snack-snake-__BUILD__'", `'snack-snake-${hash.digest('hex').slice(0, 12)}'`)
        .replace('= __FILES__;', `= ${JSON.stringify(files)};`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the build works at any address (e.g. https://<user>.github.io/Snack-Snake/).
  base: './',
  plugins: [contentSecurityPolicy(), serviceWorker()],
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
