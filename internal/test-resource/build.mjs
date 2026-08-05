import { buildFivemResource } from '@noverna/bundler';

await buildFivemResource({
  root: import.meta.dirname,
  client: 'src/client.ts',
  server: 'src/server.ts',
  outdir: 'dist',
  watch: process.argv.includes('--watch'),
  production: false,
});
