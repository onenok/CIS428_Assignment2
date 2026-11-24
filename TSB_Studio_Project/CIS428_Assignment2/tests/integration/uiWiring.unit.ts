/**
 * UI wiring tests (layer 1).
 *
 * The widgets themselves are covered by their own suites; these tests cover the
 * bundle that `MyGameMode` builds and the visibility rules it applies per phase.
 */

import { describe, it } from '../../scripts/verify/harness.js';
import { assertEqual, assertTrue } from '../../scripts/verify/assert.js';
import {
  BUILD_UI_POSITIONS,
  CROSSHAIR_POSITION,
  setBuildUiVisible,
  setCrosshairVisible,
} from '../../src/ui/GameUiBundle.js';
import {
  HOTBAR_ANCHOR_STYLES,
  HOTBAR_POSITION,
  HOTBAR_ROOT_SELECTOR,
  HOTBAR_SLOT_COUNT,
  HOTBAR_SLOT_ROW_STYLES,
  HOTBAR_SLOTS_SELECTOR,
} from '../../src/ui/Hotbar.js';
import { PRESET_TABS_PER_ROW } from '../../src/ui/PresetTabs.js';
import { submitEnabled, submitBlockReason } from '../../src/ui/SubmitPrompt.js';
import { CROSSHAIR_INVERT_CLASS } from '../../src/ui/CrosshairReticle.js';
import { OVERLAY_ELEMENT_ID } from '../../src/ui/BlackOverlay.js';
import { DIALOGUE_BOX_POSITION, DIALOGUE_BOX_STYLES } from '../../src/ui/DialogueBox.js';
import {
  END_CARD_CREDITS,
  END_CARD_TITLE,
  buildEndCardSubtitle,
  buildSummaryLine,
} from '../../src/cinematic/EndCard.js';
import {
  PROTECTED_BLOCK_HINT,
  TOAST_PLACEMENT,
  TOAST_STYLES,
  TOAST_VISIBLE_SECONDS,
} from '../../src/ui/ToastHint.js';
import {
  CONFIRM_ACCEPT_KEY,
  CONFIRM_CANCEL_KEY,
  CONFIRM_DIALOG_FOOTER,
  CONFIRM_DIALOG_TITLE,
  CONFIRM_DIM_STYLES,
  CONFIRM_PANEL_PLACEMENT,
  CONFIRM_PANEL_STYLES,
  ConfirmDialog,
} from '../../src/ui/ConfirmDialog.js';

describe('I-D HUD layout', () => {
  it('anchors the hotbar to the bottom centre by hand', () => {
    // The engine's own `bottom-center` anchor never reaches this component:
    // `placesItself()` sees the `position: absolute` from inventory-bar.css plus
    // Chrome's used px values for the unset offsets, and skips the anchor. So the
    // styles are applied directly to `.ui-inventory-bar`.
    assertEqual(HOTBAR_POSITION, 'bottom-center');
    assertEqual(HOTBAR_ROOT_SELECTOR, '.ui-inventory-bar');
    assertEqual(HOTBAR_ANCHOR_STYLES.position, 'absolute');
    assertEqual(HOTBAR_ANCHOR_STYLES.bottom, '24px');
    assertEqual(HOTBAR_ANCHOR_STYLES.left, '0');
    assertEqual(HOTBAR_ANCHOR_STYLES.right, '0');
    assertEqual(HOTBAR_ANCHOR_STYLES['margin-left'], 'auto');
    assertEqual(HOTBAR_ANCHOR_STYLES['margin-right'], 'auto');
    assertEqual(HOTBAR_ANCHOR_STYLES.width, 'fit-content');
  });

  it('does not centre with a transform the engine could also use', () => {
    assertEqual('transform' in HOTBAR_ANCHOR_STYLES, false);
  });

  it('lays the hotbar slots out as a row', () => {
    // The engine ships no rule for `[data-inventory-bar-slots]`, so without this
    // the nine slots stack into a column down the left edge.
    assertEqual(HOTBAR_SLOT_ROW_STYLES.display, 'flex');
    assertEqual(HOTBAR_SLOTS_SELECTOR, '[data-inventory-bar-slots]');
  });

  it('puts the preset tabs at the top centre', () => {
    assertEqual(BUILD_UI_POSITIONS.tabs, 'top-center');
  });

  it('puts the submit prompt at the bottom right', () => {
    assertEqual(BUILD_UI_POSITIONS.prompt, 'bottom-right');
  });

    it('puts the crosshair in the centre', () => {
    assertEqual(CROSSHAIR_POSITION, 'center');
  });

  it('has nine hotbar slots', () => {
    assertEqual(HOTBAR_SLOT_COUNT, 9);
  });

  it('lays the preset tabs out five per row', () => {
    assertEqual(PRESET_TABS_PER_ROW, 5);
  });
});

describe('I-D HUD visibility', () => {
  it('toggles every build widget together', () => {
      const calls: string[] = [];
      const fake = (name: string) => ({
        component: {
          show: () => calls.push(`show:${name}`),
          hide: () => calls.push(`hide:${name}`),
        },
      });
            // The hint is not driven through its `component`: leaving build mode goes
            // through `ToastHint.hide()`, which also clears the auto-hide countdown.
            const toast = {
              ...fake('toast'),
              hide: () => calls.push('hide:toast'),
            };

      const bundle = {
        hotbar: fake('hotbar'),
        tabs: fake('tabs'),
        prompt: fake('prompt'),
        crosshair: fake('crosshair'),
              toast,
              // The confirm dialog is deliberately absent from the build set: it is
              // opened by an explicit action, so `setBuildUiVisible` must not touch it.
              confirm: {
                show: () => calls.push('show:confirm'),
                hide: () => calls.push('hide:confirm'),
              },
      } as never;

      setBuildUiVisible(bundle, true);
            assertEqual(calls.join(','), 'show:hotbar,show:tabs,show:prompt');

      calls.length = 0;
      setBuildUiVisible(bundle, false);
            // The hint is hidden on the way out as well: it only ever explains a build
            // action, so it must not survive leaving build mode.
            assertEqual(calls.join(','), 'hide:hotbar,hide:tabs,hide:prompt,hide:toast');
    });

    it('toggles the crosshair on its own', () => {
      const calls: string[] = [];
      const bundle = {
        crosshair: {
          show: () => calls.push('show'),
          hide: () => calls.push('hide'),
        },
      } as never;

      setCrosshairVisible(bundle, true);
      setCrosshairVisible(bundle, false);
      assertEqual(calls.join(','), 'show,hide');
    });
});

describe('I-D submit prompt state', () => {
  it('is disabled outside build mode', () => {
    assertEqual(submitEnabled(false, 5), false);
  });

  it('is disabled with no blocks placed', () => {
    assertEqual(submitEnabled(true, 0), false);
  });

  it('is enabled in build mode with at least one block', () => {
    assertEqual(submitEnabled(true, 1), true);
  });

  it('explains why it is blocked', () => {
      assertTrue((submitBlockReason(false, 0) ?? '').length > 0);
      assertTrue((submitBlockReason(true, 0) ?? '').length > 0);
      assertEqual(submitBlockReason(true, 3), null);
  });
});

describe('I-D toast hint', () => {
  it('keeps the hint off the crosshair', () => {
    assertEqual(TOAST_PLACEMENT.position, 'absolute');
    assertTrue(Number.parseInt(TOAST_PLACEMENT.bottom, 10) > 96, 'sits above the hotbar');
  });

  it('only uses customStyles properties the engine allows', () => {
    const blocked = ['position', 'z-index', 'pointer-events', 'backdrop-filter', 'filter'];
    for (const property of blocked) {
      assertEqual(property in TOAST_STYLES, false);
    }
  });

  it('has a message for blocked edits', () => {
    assertTrue(PROTECTED_BLOCK_HINT.length > 0);
    assertTrue(TOAST_VISIBLE_SECONDS > 0, 'a hint that never hides is a banner');
  });
});

describe('I-D submit confirmation dialog', () => {
  it('asks a question, not an order', () => {
    assertTrue(CONFIRM_DIALOG_TITLE.endsWith('?'));
    assertTrue(CONFIRM_DIALOG_TITLE.length > 0);
  });

  it('promises that cancelling keeps the build', () => {
    assertTrue(CONFIRM_DIALOG_FOOTER.toLowerCase().includes('stay'));
  });

  it('labels the two keys', () => {
    assertEqual(CONFIRM_ACCEPT_KEY, 'Enter');
    assertEqual(CONFIRM_CANCEL_KEY, 'Esc');
  });

  it('centres the panel without needing to know its size', () => {
    assertEqual(CONFIRM_PANEL_PLACEMENT.left, '50%');
    assertEqual(CONFIRM_PANEL_PLACEMENT.top, '50%');
    assertEqual(CONFIRM_PANEL_PLACEMENT.transform, 'translate(-50%, -50%)');
  });

  it('matches the approved prototype width', () => {
    assertEqual(CONFIRM_PANEL_STYLES.width, '480px');
  });

  it('dims the world but stays under the ending fade', () => {
    const dim = Number.parseInt(CONFIRM_DIM_STYLES['z-index'], 10);
    const panel = Number.parseInt(CONFIRM_PANEL_PLACEMENT['z-index'], 10);
    const overlay = 9999;
    assertTrue(dim > 1000, 'must cover the HUD container at 1000');
    assertTrue(panel > dim, 'the panel must not be dimmed by its own layer');
    assertTrue(panel < overlay, 'the ending fade still has to win');
  });

  it('starts hidden and tracks its own visibility without a document', () => {
    const dialog = ConfirmDialog.create();
    assertEqual(dialog.isVisible, false);
    dialog.show();
    assertEqual(dialog.isVisible, true);
    dialog.hide();
    assertEqual(dialog.isVisible, false);
    dialog.destroy();
  });
});

describe('I-D overlay and end card constants', () => {
  it('uses a dedicated overlay element id', () => {
    assertEqual(OVERLAY_ELEMENT_ID, 'cis428-black-overlay');
  });

  it('uses the invert crosshair class', () => {
    assertEqual(CROSSHAIR_INVERT_CLASS, 'crosshair-invert');
  });

  it('has an end card title', () => {
    assertTrue(END_CARD_TITLE.length > 0);
  });

    it('keeps the end card subtitle multi-line so the credits do not run together', () => {
      // `CenterMessage` writes the subtitle with `textContent`, so the newlines are
      // only preserved when the element inherits `white-space: pre-line`.
      const lines = buildEndCardSubtitle(7).split('\n');
      for (const credit of END_CARD_CREDITS) {
        assertTrue(lines.includes(credit), `credit missing from the card: ${credit}`);
      }
      // The card is terminal, so the credits are the last thing on it — no control
      // hint follows them. Nothing exits play from a script, and a line telling the
      // player to press a key that does nothing is worse than no line at all.
      const tail = lines.slice(lines.length - END_CARD_CREDITS.length);
      assertEqual(tail.join('|'), END_CARD_CREDITS.join('|'));
    });

    it('reports how many blocks were placed', () => {
      assertTrue(buildEndCardSubtitle(12).includes('You placed 12 blocks.'));
      assertTrue(buildEndCardSubtitle(1).includes('You placed 1 block.'));
    });

    it('never prints "0 blocks" when the count is lost', () => {
      assertEqual(buildSummaryLine(0).includes('0 block'), false);
      assertEqual(buildSummaryLine(-3).includes('0 block'), false);
    });
});

describe('I-D dialogue box', () => {
  it('sits at the bottom centre, not over the world', () => {
    assertEqual(DIALOGUE_BOX_POSITION, 'bottom-center');
  });

  it('only uses customStyles properties the engine allows', () => {
    // `sanitizeCssCustomStyles` silently drops blocked properties, so a typo
    // here would show up as an unstyled box rather than as an error.
    const blocked = ['position', 'z-index', 'pointer-events', 'backdrop-filter', 'filter'];
    for (const property of blocked) {
      assertEqual(property in DIALOGUE_BOX_STYLES, false);
    }
  });

  it('is wide enough to read a sentence', () => {
    assertTrue(DIALOGUE_BOX_STYLES['max-width'].includes('760px'));
  });
});