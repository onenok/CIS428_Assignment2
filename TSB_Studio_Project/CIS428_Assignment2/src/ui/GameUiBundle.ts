/**
 * The gameplay HUD, as one bundle.
 *
 * The widgets are the reticle, the hotbar, the preset tab strip, the submit
 * prompt, the dialogue box and the toast hint — plus the submit confirmation
 * dialog, which is not part of the build HUD but shares the same lifecycle.
 * `MyGameMode` needs them all together and needs to show/hide them as a group,
 * so creating and tearing them down is collected here instead of being spread
 * across the game mode.
 *
 * Every widget is created through its own factory (`Hotbar.create`,
 * `PresetTabs.create`, ...) so the bundle adds no behaviour of its own — it only
 * owns the lifecycle and the visibility rules.
 */

import * as ENGINE from '@gnsx/genesys.js';

import { ConfirmDialog } from './ConfirmDialog.js';
import { CrosshairReticle, crosshairReticleOptions } from './CrosshairReticle.js';
import { DialogueBox } from './DialogueBox.js';
import { Hotbar } from './Hotbar.js';
import { PresetTabs, PRESET_TABS_POSITION } from './PresetTabs.js';
import { HOTBAR_POSITION } from './Hotbar.js';
import { SubmitPrompt } from './SubmitPrompt.js';
import { ToastHint } from './ToastHint.js';

/** The gameplay widgets. */
export interface GameUiBundle {
  readonly crosshair: CrosshairReticle;
  readonly hotbar: Hotbar;
  readonly tabs: PresetTabs;
  readonly prompt: SubmitPrompt;
  readonly dialogue: DialogueBox;
  readonly toast: ToastHint;
  readonly confirm: ConfirmDialog;
}

/**
 * Where each build-mode widget sits on screen.
 *
 * The hotbar and the preset panel are placed by their own modules, so this map is
 * the single place to read where things are — and the reason a "position" string
 * alone is not enough: the engine only anchors a component when the caller passes
 * the position, never from the component's own default.
 */
export const BUILD_UI_POSITIONS = {
  hotbar: HOTBAR_POSITION,
  tabs: PRESET_TABS_POSITION,
  prompt: 'bottom-right',
} as const;

/** The reticle always sits dead centre. */
export const CROSSHAIR_POSITION = 'center' as const;

/**
 * Creates and initializes every gameplay widget.
 *
 * The reticle is always visible; the other widgets start hidden and are
 * revealed by {@link setBuildUiVisible} when the player enters build mode.
 */
export async function createGameUi(ui: ENGINE.UIManager): Promise<GameUiBundle> {
  const crosshair = new CrosshairReticle(ui, crosshairReticleOptions());
  await crosshair.initialize();

  // Each widget paints as soon as it is created, and the awaits between them yield whole
  // frames — so hiding the bundle only at the end left the hotbar, tabs and prompt visible
  // for the length of this function. That is exactly the intro's blink, which is why the
  // build HUD appeared at the start and vanished a couple of seconds in. Hide each one the
  // moment it exists.
  const hotbar = await Hotbar.create(ui);
  setVisible(hotbar.component, false);
  const tabs = await PresetTabs.create(ui);
  setVisible(tabs.component, false);
  const prompt = await SubmitPrompt.create(ui);
  setVisible(prompt.component, false);
  const dialogue = await DialogueBox.create(ui);
  const toast = await ToastHint.create(ui);
    const confirm = ConfirmDialog.create();

    const bundle: GameUiBundle = { crosshair, hotbar, tabs, prompt, dialogue, toast, confirm };
  setBuildUiVisible(bundle, false);
  return bundle;
}

  /**
   * Shows or hides the build-mode widgets. The reticle is unaffected.
   *
   * The confirm dialog is not in this set: it is opened by an explicit action and
   * hides itself, and leaving build mode must not close a dialog the player is
   * still reading.
   */
export function setBuildUiVisible(bundle: GameUiBundle, visible: boolean): void {
  setVisible(bundle.hotbar.component, visible);
  setVisible(bundle.tabs.component, visible);
  setVisible(bundle.prompt.component, visible);

  // The hint only ever explains a build action, so it must not outlive the mode
  // that can trigger it.
  if (!visible) bundle.toast.hide();
}

/** Shows or hides the reticle. */
export function setCrosshairVisible(bundle: GameUiBundle, visible: boolean): void {
  setVisible(bundle.crosshair, visible);
}

/** Destroys every widget in the bundle. */
export function destroyGameUi(bundle: GameUiBundle): void {
  bundle.crosshair.destroy();
  bundle.hotbar.component.destroy();
  bundle.tabs.component.destroy();
  bundle.prompt.component.destroy();
  bundle.dialogue.hintComponent.destroy();
  bundle.dialogue.component.destroy();
  bundle.toast.component.destroy();
    bundle.confirm.destroy();
}

function setVisible(component: ENGINE.BaseUIComponent<any>, visible: boolean): void {
  if (visible) {
    component.show();
  } else {
    component.hide();
  }
}