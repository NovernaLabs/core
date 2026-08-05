import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@noverna/persistence-prisma',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
