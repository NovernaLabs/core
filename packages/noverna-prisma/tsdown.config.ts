import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2024',
  platform: 'node',
  fixedExtension: false,
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
  outDir: 'dist',
  deps: {
    neverBundle: ['@noverna/core', '@prisma/client'],
  },
});
