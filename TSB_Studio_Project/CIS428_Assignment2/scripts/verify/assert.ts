/**
 * Minimal assertion library for the project's verify runner.
 *
 * Deliberately dependency-free: the project may not add a test framework
 * (AGENTS.md forbids `pnpm test`), so assertions are hand-rolled here.
 */

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

function format(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value);
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function fail(message: string): never {
  throw new AssertionError(message);
}

export function assertTrue(actual: unknown, message = 'expected value to be truthy'): void {
  if (!actual) fail(`${message} (received ${format(actual)})`);
}

export function assertFalse(actual: unknown, message = 'expected value to be falsy'): void {
  if (actual) fail(`${message} (received ${format(actual)})`);
}

export function assertEqual<T>(actual: T, expected: T, message = 'values are not equal'): void {
  // `Object.is` distinguishes -0 from 0, which is never what a test wants.
  const equal = Object.is(actual, expected) || (typeof actual === 'number' && typeof expected === 'number' && actual === expected);
  if (!equal) {
    fail(`${message}\n  expected: ${format(expected)}\n  actual:   ${format(actual)}`);
  }
}

export function assertNotEqual<T>(actual: T, expected: T, message = 'values should differ'): void {
  if (Object.is(actual, expected)) {
    fail(`${message} (both are ${format(actual)})`);
  }
}

/** Floating-point comparison. Default tolerance is 1e-6. */
export function assertClose(
  actual: number,
  expected: number,
  tolerance = 1e-6,
  message = 'numbers are not close enough',
): void {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    fail(`${message}\n  expected: ${format(expected)}\n  actual:   ${format(actual)}`);
  }
  const delta = Math.abs(actual - expected);
  if (delta > tolerance) {
    fail(`${message}\n  expected: ${expected} (±${tolerance})\n  actual:   ${actual}\n  delta:    ${delta}`);
  }
}

export function assertDeepEqual(actual: unknown, expected: unknown, message = 'values are not deeply equal'): void {
  if (!deepEqual(actual, expected)) {
    fail(`${message}\n  expected: ${format(expected)}\n  actual:   ${format(actual)}`);
  }
}

export function assertThrows(fn: () => unknown, message = 'expected function to throw'): Error {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  return fail(message);
}

export function assertInstanceOf<T>(
  actual: unknown,
  ctor: new (...args: never[]) => T,
  message = 'value is not an instance of the expected class',
): void {
  if (!(actual instanceof ctor)) {
    fail(`${message}\n  expected instance of: ${ctor.name}\n  actual: ${format(actual)}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  // Treat -0 and 0 as equal: they are numerically identical and the distinction
  // is never meaningful for coordinates.
  if (typeof a === 'number' && typeof b === 'number' && a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key))) return false;
    }
    return true;
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}