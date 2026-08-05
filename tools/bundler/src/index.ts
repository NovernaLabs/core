import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { ModuleFormat, Plugin } from "rolldown";
import { build } from "tsdown";

export interface FivemBuildOptions {
  root?: string;
  client?: string;
  server?: string;
  outdir?: string;
  watch?: boolean;
  production?: boolean;
  define?: Record<string, string>;
  clientTsconfig?: string;
  serverTsconfig?: string;
}

export async function buildFivemResource(
  options: FivemBuildOptions = {},
): Promise<void> {
  const root = resolve(options.root ?? process.cwd());
  const outDir = resolve(root, options.outdir ?? "dist");
  const production = options.production ?? !options.watch;

  if (options.client === undefined && options.server === undefined) {
    throw new Error(
      "buildFivemResource: neither `client` nor `server` entry point was given.",
    );
  }

  await rm(outDir, { recursive: true, force: true });

  const shared = {
    outDir,
    target: "es2024",
    dts: false,
    clean: false,
    treeshake: true,
    minify: production,
    sourcemap: production ? false : ("inline" as const),
    report: false,
    watch: options.watch ?? false,
    define: {
      "process.env.NODE_ENV": production ? '"production"' : '"development"',
      ...options.define,
    },
  };

  const singleFile = { codeSplitting: false };

  const builds: Promise<unknown>[] = [];

  if (options.client !== undefined) {
    builds.push(
      build({
        ...shared,
        entry: { client: resolve(root, options.client) },
        cwd: root,
        platform: "browser",
        format: ["iife"] satisfies ModuleFormat[],
        outputOptions: { entryFileNames: "[name].js" },
        tsconfig: pickTsconfig(
          root,
          options.clientTsconfig,
          "tsconfig.client.json",
        ),
        deps: { alwaysBundle: [/.*/] },
        plugins: [rejectNodeBuiltins()],
      }),
    );
  }

  if (options.server !== undefined) {
    builds.push(
      build({
        ...shared,
        entry: { server: resolve(root, options.server) },
        cwd: root,
        platform: "node",
        format: ["iife"] satisfies ModuleFormat[],
        tsconfig: pickTsconfig(
          root,
          options.serverTsconfig,
          "tsconfig.server.json",
        ),
        outputOptions: {
          entryFileNames: "[name].js",
          globals: (id: string) => `require(${JSON.stringify(id)})`,
        },
        ...singleFile,
        deps: {
          alwaysBundle: [/.*/],
          neverBundle: [/^node:/],
        },
      }),
    );
  }

  await Promise.all(builds);
}

function pickTsconfig(
  root: string,
  explicit: string | undefined,
  fallback: string,
): string | boolean {
  if (explicit !== undefined) return resolve(root, explicit);
  const candidate = resolve(root, fallback);
  return existsSync(candidate) ? candidate : true;
}

function rejectNodeBuiltins(): Plugin {
  return {
    name: "reject-node-builtins",
    resolveId(source: string) {
      if (!source.startsWith("node:")) return null;
      throw new Error(
        `Client bundles cannot use Node built-ins ("${source}"). Move this code to the server ` +
          "side, or into a shared module that does not touch the runtime.",
      );
    },
  };
}
