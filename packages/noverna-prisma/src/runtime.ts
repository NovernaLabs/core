import { performance as nodePerformance } from 'node:perf_hooks';

export function ensurePrismaRuntime(): void {
  const globals = globalThis as { performance?: unknown };
  globals.performance ??= nodePerformance;
}
