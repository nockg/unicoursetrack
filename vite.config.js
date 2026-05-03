import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
    sourcemap: false,
  },
  resolve: {
    alias: {
      // Allows bare '@supabase/supabase-js' import to work from the npm package
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    globals: true,
  },
});
