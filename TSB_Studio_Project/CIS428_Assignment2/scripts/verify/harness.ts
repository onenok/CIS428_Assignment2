/**
 * Test harness: registration (`describe` / `it`) and execution.
 *
 * Tests are plain functions registered into a module-level registry. The runner
 * imports each test file (which registers its cases as a side effect) and then
 * executes the collected suites.
 */

export type TestLayer = 'unit' | 'engine';

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
  /** Set when the case is declared with `it.skip`. */
  skipped?: boolean;
}

export interface TestSuite {
  name: string;
  layer: TestLayer;
  file: string;
  cases: TestCase[];
}

export interface TestResult {
  suite: string;
  name: string;
  file: string;
  layer: TestLayer;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: Error;
}

const suites: TestSuite[] = [];
let currentSuite: TestSuite | null = null;
let currentFile = '<unknown>';

/** Called by the runner before importing a test file. */
export function setCurrentFile(file: string): void {
  currentFile = file;
  currentSuite = null;
}

export function describe(name: string, fn: () => void, layer: TestLayer = 'unit'): void {
  const suite: TestSuite = { name, layer, file: currentFile, cases: [] };
  suites.push(suite);

  const previous = currentSuite;
  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = previous;
  }
}

export function it(name: string, fn: () => void | Promise<void>): void {
  if (!currentSuite) {
    throw new Error(`it("${name}") was called outside of a describe() block (file: ${currentFile})`);
  }
  currentSuite.cases.push({ name, fn });
}

it.skip = function skip(name: string): void {
  if (!currentSuite) {
    throw new Error(`it.skip("${name}") was called outside of a describe() block (file: ${currentFile})`);
  }
  currentSuite.cases.push({ name, fn: () => undefined, skipped: true });
};

export function getSuites(): readonly TestSuite[] {
  return suites;
}

export function clearSuites(): void {
  suites.length = 0;
  currentSuite = null;
}

export async function runSuites(filter?: (suite: TestSuite) => boolean): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const suite of suites) {
    if (filter && !filter(suite)) continue;

    for (const testCase of suite.cases) {
      const startedAt = performance.now();
      const base = {
        suite: suite.name,
        name: testCase.name,
        file: suite.file,
        layer: suite.layer,
      };

      if (testCase.skipped) {
        results.push({ ...base, status: 'skipped', durationMs: 0 });
        continue;
      }

      try {
        await testCase.fn();
        results.push({ ...base, status: 'passed', durationMs: performance.now() - startedAt });
      } catch (error) {
        results.push({
          ...base,
          status: 'failed',
          durationMs: performance.now() - startedAt,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
  }

  return results;
}