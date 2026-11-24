/**
 * Ending card.
 *
 * The last thing the player sees: the closing line, a one-line build summary, and
 * the credits. Built on `CenterMessage` because it already provides the centred hero
 * layout and the fade-in, so the only custom part is the copy and the multi-line
 * subtitle.
 *
 * `CenterMessage` sets `subtitle.textContent`, so newlines only survive if the
 * element inherits `white-space: pre-line`. The engine's stylesheet does not set
 * it, so `createEndCard()` passes it through `customStyles`, which applies to the
 * layout root and inherits down to the subtitle.
 */

import * as ENGINE from '@gnsx/genesys.js';

/** Closing line. Shown large. */
export const END_CARD_TITLE = 'The Chunk Is Woven';

/** One-line coda under the title, before the statistics. */
export const END_CARD_SUBTITLE = 'The Loomkeeper goes back to work.';

/**
 * Credits, one per line.
 *
 * Kept as an array so the rows stay greppable; `buildEndCardSubtitle()` joins them.
 */
export const END_CARD_CREDITS: readonly string[] = [
  'CIS428 Metaverse Technology — Assignment 2',
  'Original character: The Loomkeeper',
  'Existing IP: Minecraft — unofficial, non-commercial student work',
  'Built with The Sandbox Studio and Genesys.js',
];

/**
 * The build summary line.
 *
 * The blank-submit branch never reaches the ending — `evaluateSubmit()` sends an
 * empty design back to building — so zero is only reachable if the count is lost.
 * The wording covers it rather than printing "You placed 0 blocks".
 */
export function buildSummaryLine(placedBlocks: number): string {
  if (!Number.isFinite(placedBlocks) || placedBlocks <= 0) {
    return 'You left the chunk to the Loomkeeper.';
  }
  return placedBlocks === 1
    ? 'You placed 1 block.'
    : `You placed ${placedBlocks} blocks.`;
}

/**
 * Assembles the subtitle: coda, blank line, summary, blank line, then the credits.
 *
 * The card is terminal — the run is over and the only way out is the editor's own
 * Stop button — so it carries no control hint. An earlier version promised "Press
 * Escape to return to the editor", but `cancel` is a no-op in the `ended` phase and
 * there is no script API for leaving play, so the line was removed rather than left
 * as an instruction that does nothing.
 */
export function buildEndCardSubtitle(placedBlocks: number): string {
  return [
    END_CARD_SUBTITLE,
    '',
    buildSummaryLine(placedBlocks),
    '',
    ...END_CARD_CREDITS,
  ].join('\n');
}

/** Builds the end card component. */
export async function createEndCard(ui: ENGINE.UIManager): Promise<ENGINE.CenterMessage> {
  // `white-space` inherits, so setting it on the layout root is what makes the
  // newlines in the subtitle render as line breaks instead of collapsing to spaces.
  const card = new ENGINE.CenterMessage(ui, { customStyles: { 'white-space': 'pre-line' } });
  await card.initialize();
  return card;
}

/** Shows the end card with the player's build summary. */
export function showEndCard(card: ENGINE.CenterMessage, placedBlocks = 0): void {
  card.show({
    title: END_CARD_TITLE,
    subtitle: buildEndCardSubtitle(placedBlocks),
    duration: 0,
  });
}

/** Hides the end card. */
export function hideEndCard(card: ENGINE.CenterMessage): void {
  card.hide();
}