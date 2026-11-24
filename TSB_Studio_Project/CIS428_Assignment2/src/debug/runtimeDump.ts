/**
 * Runtime dump writer.
 *
 * Turns the collected dump files into something a human can get at, in three
 * falling steps so it works in every environment the game runs in:
 *
 *   1. always log a one-line summary plus the file names to the console
 *   2. log the full contents of small artifacts so they are copyable
 *   3. trigger a download when a DOM and `Blob` exist
 *
 * A headless test has neither `document` nor `Blob`, so it gets step 1 and can
 * inspect the returned {@link RuntimeDumpFile} list directly.
 */

/** One artifact in a runtime dump. */
export interface RuntimeDumpFile {
  /** File name as saved, e.g. `world-dump.txt`. */
  readonly name: string;
  /** MIME type, used for the download. */
  readonly mime: string;
  readonly content: string;
}

/** Where the dump went, so callers can report it. */
export interface RuntimeDumpResult {
  readonly files: readonly RuntimeDumpFile[];
  /** True when the browser download was actually triggered. */
  readonly downloaded: boolean;
  /** The summary line that was logged. */
  readonly summary: string;
}

/** Builds the one-line summary shown in the console. */
export function summarizeDump(files: readonly RuntimeDumpFile[]): string {
  const parts = files.map(file => `${file.name} (${file.content.length}b)`);
  return `[dump] ${files.length} file(s): ${parts.join(', ')}`;
}

/** Small artifacts are echoed in full so they survive a copy-paste of the log. */
const CONSOLE_ECHO_LIMIT = 20_000;

/**
 * Prefixes every file name with a `YYYYMMDD-HHMMSS` stamp.
 *
 * The dump is a browser download named by the game, so two dumps in the same session
 * land on the same names and the browser renames them `(1)`, `(2)`, ... — which loses
 * the one thing a comparison needs: when each one was taken.
 */
export function stampDumpFiles(
  files: readonly RuntimeDumpFile[],
  now: Date = new Date(),
): RuntimeDumpFile[] {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return files.map(file => ({ ...file, name: `${stamp}-${file.name}` }));
}

function download(file: RuntimeDumpFile): boolean {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return false;
  }

  const createObjectURL = URL.createObjectURL;
  if (typeof createObjectURL !== 'function') {
    return false;
  }

  const url = createObjectURL(new Blob([file.content], { type: file.mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can race the download in some browsers; a short delay is
  // the documented workaround and costs nothing.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Writes every artifact out and reports where they went. */
export function emitRuntimeDump(files: readonly RuntimeDumpFile[]): RuntimeDumpResult {
  const summary = summarizeDump(files);
  console.log(summary);

  for (const file of files) {
    if (file.content.length <= CONSOLE_ECHO_LIMIT) {
      console.log(`[dump] --- ${file.name} ---`);
      console.log(file.content);
    } else {
      console.log(`[dump] --- ${file.name} skipped in console (${file.content.length} chars) ---`);
    }
  }

  let downloaded = false;
  for (const file of files) {
    downloaded = download(file) || downloaded;
  }

  return { files, downloaded, summary };
}