import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/*/index.ts'],
  format: ['esm'],
  target: 'es2024',

  platform: 'neutral',
  dts: true,
  sourcemap: true,

  minify: false,
  treeshake: true,
  clean: true,
  outDir: 'dist',
});
