/**
 * Verify runner entry point.
 *
 * Discovers `tests` tree: `*.unit.ts` (layer 1) and `*.engine.ts` (layer 2),
 * imports each file so it registers its suites, then executes them.
 *
 * Usage:
 *   pnpm verify                 # all layers
 *   pnpm verify --layer=unit    # layer 1 only
 *   pnpm verify --layer=engine  # layer 2 only
 *   pnpm verify --json          # machine-readable output
 *   pnpm verify --filter=voxel  # only files whose path contains "voxel"
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { clearSuites, getSuites, runSuites, setCurrentFile, type TestLayer } from './harness.js';
import { reportConsole, reportJson } from './reporters.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '../..');
const TESTS_ROOT = path.join(PROJECT_ROOT, 'tests');

interface Options {
  layers: TestLayer[];
  json: boolean;
  filter?: string;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { layers: ['unit', 'engine'], json: false };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--layer=')) {
      const value = arg.slice('--layer='.length);
      if (value !== 'unit' && value !== 'engine') {
        throw new Error(`Unknown layer "${value}". Expected "unit" or "engine".`);
      }
      options.layers = [value];
    } else if (arg.startsWith('--filter=')) {
      options.filter = arg.slice('--filter='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage: pnpm verify [options]',
          '',
          'Options:',
          '  --layer=unit|engine   Run only the given layer (default: both)',
          '  --filter=<text>       Only run test files whose path contains <text>',
          '  --json                Emit machine-readable JSON',
          '  --help, -h            Show this help',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument "${arg}". Use --help for usage.`);
    }
  }

  return options;
}

async function findTestFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      found.push(...(await findTestFiles(full)));
    } else if (entry.name.endsWith('.unit.ts') || entry.name.endsWith('.engine.ts')) {
      found.push(full);
    }
  }

  return found;
}

function layerOf(file: string): TestLayer {
  return file.endsWith('.engine.ts') ? 'engine' : 'unit';
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  let files = await findTestFiles(TESTS_ROOT);
  files = files.filter((file) => options.layers.includes(layerOf(file)));
  if (options.filter) {
    const needle = options.filter.toLowerCase();
    files = files.filter((file) => file.toLowerCase().includes(needle));
  }
  files.sort();

  if (files.length === 0) {
    console.log('No test files found.');
    console.log(`  searched: ${path.relative(PROJECT_ROOT, TESTS_ROOT)}/**/*.{unit,engine}.ts`);
    console.log(`  layers:   ${options.layers.join(', ')}`);
    if (options.filter) console.log(`  filter:   ${options.filter}`);
    process.exit(0);
  }

  clearSuites();

  const importFailures: { file: string; error: Error }[] = [];
  for (const file of files) {
    const relative = path.relative(PROJECT_ROOT, file).replace(/\\/g, '/');
    setCurrentFile(relative);
    try {
      await import(pathToFileURL(file).href);
    } catch (error) {
      importFailures.push({ file: relative, error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  const suites = getSuites();
  const results = await runSuites();

  for (const failure of importFailures) {
    results.push({
      suite: '<import>',
      name: `failed to import ${failure.file}`,
      file: failure.file,
      layer: layerOf(failure.file),
      status: 'failed',
      durationMs: 0,
      error: failure.error,
    });
  }

  const summary = options.json ? reportJson(results) : reportConsole(results);

  if (!options.json) {
    console.log(`  ${suites.length} suite(s) across ${files.length} file(s)`);
  }

  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('verify runner crashed:', error);
  process.exit(1);
});