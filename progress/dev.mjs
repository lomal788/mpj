import { context } from 'esbuild';
import { spawn } from 'node:child_process';
const ctx = await context({entryPoints: ['src/main.ts'], bundle: true,
  sourcemap: true, target: 'es2022', outfile: 'dist/app.js', logLevel: 'info'});
await ctx.watch();
const python = spawn('python', ['-B', 'scanner/watch.py', ...process.argv.slice(2)], {stdio: 'inherit'});
let closing = false;
async function close() { if (closing) return; closing = true; python.kill(); await ctx.dispose(); }
process.on('SIGINT', close);
process.on('SIGTERM', close);
python.on('exit', async code => { await close(); process.exitCode = code ?? 0; });
