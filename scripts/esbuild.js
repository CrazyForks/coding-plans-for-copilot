const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const outDir = 'out';

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log('Usage: node ./scripts/esbuild.js [--production] [--watch]');
  console.log('Builds the Node.js and browser extension entry points into out/.');
  process.exit(0);
}

function collectFilesWithSuffix(rootDir, suffix) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const results = [];
  const pending = [rootDir];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }

      if (entry.isFile() && entryPath.endsWith(suffix)) {
        results.push(entryPath);
      }
    }
  }

  return results.sort();
}

function createNodeEntryPoints() {
  return ['src/extension.node.ts', 'src/test/runTest.ts', ...collectFilesWithSuffix(path.join('src', 'test'), '.test.ts')];
}

function createNodeBuildOptions() {
  return {
    entryPoints: createNodeEntryPoints(),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outdir: outDir,
    outbase: 'src',
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
    sourcesContent: false,
    logLevel: 'info',
  };
}

function createWebBuildOptions() {
  return {
    entryPoints: ['src/extension.web.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2020',
    outdir: outDir,
    outbase: 'src',
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
    sourcesContent: false,
    logLevel: 'info',
  };
}

async function main() {
  // Keep copied runtime assets (for example out/i18n/*.json) in watch mode.
  // The watch task runs `copy-i18n` before this script, so deleting out/
  // here would remove those files and cause runtime lookup failures.
  if (!watch) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  const contexts = await Promise.all([
    esbuild.context(createNodeBuildOptions()),
    esbuild.context(createWebBuildOptions()),
  ]);

  if (watch) {
    await Promise.all(contexts.map((context) => context.watch()));
    console.log('esbuild node and web watches started');
    return;
  }

  await Promise.all(contexts.map((context) => context.rebuild()));
  await Promise.all(contexts.map((context) => context.dispose()));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
