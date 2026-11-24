/**
 * Reporters: turn `TestResult[]` into console output or JSON.
 */

import type { TestResult } from './harness.js';

const COLOR = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  bold: '\u001b[1m',
};

function supportsColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}

function paint(text: string, color: keyof typeof COLOR): string {
  return supportsColor() ? `${COLOR[color]}${text}${COLOR.reset}` : text;
}

export interface Summary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export function summarize(results: readonly TestResult[]): Summary {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
  };
}

export function reportConsole(results: readonly TestResult[]): Summary {
  const summary = summarize(results);
  const byFile = new Map<string, TestResult[]>();

  for (const result of results) {
    const list = byFile.get(result.file);
    if (list) list.push(result);
    else byFile.set(result.file, [result]);
  }

  for (const [file, fileResults] of byFile) {
    console.log(`\n${paint(file, 'cyan')}`);
    for (const result of fileResults) {
      const duration = `${result.durationMs.toFixed(1)}ms`;
      if (result.status === 'passed') {
        console.log(`  ${paint('✓', 'green')} ${result.name} ${paint(duration, 'dim')}`);
      } else if (result.status === 'skipped') {
        console.log(`  ${paint('-', 'yellow')} ${result.name} ${paint('(skipped)', 'dim')}`);
      } else {
        console.log(`  ${paint('✗', 'red')} ${result.name} ${paint(duration, 'dim')}`);
        const message = result.error?.message ?? 'unknown error';
        for (const line of message.split('\n')) {
          console.log(`      ${paint(line, 'red')}`);
        }
        if (result.error?.stack) {
          const frames = result.error.stack.split('\n').slice(1, 4);
          for (const frame of frames) {
            console.log(`      ${paint(frame.trim(), 'dim')}`);
          }
        }
      }
    }
  }

  console.log('');
  const parts = [
    `${summary.total} total`,
    paint(`${summary.passed} passed`, 'green'),
    summary.failed > 0 ? paint(`${summary.failed} failed`, 'red') : `${summary.failed} failed`,
    summary.skipped > 0 ? paint(`${summary.skipped} skipped`, 'yellow') : `${summary.skipped} skipped`,
    paint(`${summary.durationMs.toFixed(0)}ms`, 'dim'),
  ];
  console.log(`${paint('Summary:', 'bold')} ${parts.join(' · ')}`);

  return summary;
}

export function reportJson(results: readonly TestResult[]): Summary {
  const summary = summarize(results);
  const payload = {
    summary,
    results: results.map((result) => ({
      suite: result.suite,
      name: result.name,
      file: result.file,
      layer: result.layer,
      status: result.status,
      durationMs: Number(result.durationMs.toFixed(3)),
      error: result.error ? { name: result.error.name, message: result.error.message } : undefined,
    })),
  };
  console.log(JSON.stringify(payload, null, 2));
  return summary;
}