import { build } from 'esbuild';
await build({ entryPoints: ['src/main.ts'], bundle: true, minify: true,
  sourcemap: true, target: 'es2022', outfile: 'dist/app.js', logLevel: 'info' });
