import { buildFivemResource } from '@noverna/bundler';

await buildFivemResource({
  root: import.meta.dirname,
  client: 'src/client/client.ts',
  server: 'src/server/server.ts',
  outdir: 'dist',
  watch: process.argv.includes('--watch'),
  production: false,
});
