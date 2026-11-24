import { describe, it } from '../../scripts/verify/harness.js';
import { assertDeepEqual, assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import { InputLog } from '../../src/debug/InputLog.js';
import { emitRuntimeDump, stampDumpFiles, summarizeDump, type RuntimeDumpFile } from '../../src/debug/runtimeDump.js';

describe('InputLog: ring buffer', () => {
  it('keeps events in order with rounded timestamps', () => {
    const log = new InputLog(10);
    log.record('keyDown', 'Space', 12.7);
    log.record('action', 'flyUp', 20);
    assertDeepEqual(log.all.map(entry => entry.t), [13, 20]);
    assertDeepEqual(log.all.map(entry => entry.name), ['Space', 'flyUp']);
  });

  it('drops the oldest entry once full', () => {
    const log = new InputLog(2);
    log.record('keyDown', 'KeyA', 1);
    log.record('keyDown', 'KeyB', 2);
    log.record('keyDown', 'KeyC', 3);
    assertDeepEqual(log.all.map(entry => entry.name), ['KeyB', 'KeyC']);
    assertEqual(log.size, 2);
  });

  it('serialises one JSON object per line', () => {
    const log = new InputLog(4);
    log.record('keyUp', 'ControlLeft', 5);
    const lines = log.toJsonl().split('\n');
    assertEqual(lines.length, 1);
    assertDeepEqual(JSON.parse(lines[0]), { t: 5, kind: 'keyUp', name: 'ControlLeft' });
  });

  it('clears without changing capacity', () => {
    const log = new InputLog(4);
    log.record('keyDown', 'F4', 1);
    log.clear();
    assertEqual(log.size, 0);
    log.record('keyDown', 'F4', 2);
    assertEqual(log.size, 1);
  });
});

describe('runtimeDump: emission', () => {
  const files: RuntimeDumpFile[] = [
    { name: 'world-dump.txt', mime: 'text/plain', content: 'chunk (0,0)' },
    { name: 'input-log.jsonl', mime: 'application/x-ndjson', content: '{"t":1}' },
  ];

  it('summarises every file with its size', () => {
    const summary = summarizeDump(files);
    assertTrue(summary.includes('2 file(s)'), summary);
    assertTrue(summary.includes('world-dump.txt'), summary);
    assertTrue(summary.includes('input-log.jsonl'), summary);
  });

  it('returns the files unchanged outside a browser', () => {
    // The headless harness has no `document`/`Blob`, so the download step must
    // degrade to console-only instead of throwing.
    const result = emitRuntimeDump(files);
    assertEqual(result.files.length, 2);
    assertEqual(result.downloaded, false);
  });

    // Two dumps taken seconds apart are the whole point of the comparison, and the
    // browser download names them itself, so unnamed dumps overwrite each other.
    it('prefixes every file name with a sortable timestamp', () => {
      const stamped = stampDumpFiles(files, new Date(2026, 10, 20, 20, 24, 57));
      assertEqual(stamped[0].name, '20261120-202457-world-dump.txt');
      assertEqual(stamped[1].name, '20261120-202457-input-log.jsonl');
      assertEqual(stamped[0].content, 'chunk (0,0)', 'content must survive stamping');
    });

    it('pads every timestamp field to two digits', () => {
      const stamped = stampDumpFiles([files[0]], new Date(2026, 0, 2, 3, 4, 5));
      assertEqual(stamped[0].name, '20260102-030405-world-dump.txt');
    });
});