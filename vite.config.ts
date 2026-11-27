import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5316, strictPort: true },
  preview: { port: 5416, strictPort: true },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: { target: 'es2022', assetsInlineLimit: 0 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
