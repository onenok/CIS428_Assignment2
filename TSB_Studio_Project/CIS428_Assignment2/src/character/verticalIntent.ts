/**
 * Vertical input arbitration.
 *
 * Space and Ctrl each carry two meanings, and which one applies depends on
 * whether the pawn is flying. Keeping that decision here — as a pure function —
 * means it can be tested without a world, a pawn or physics, and it means there
 * is exactly one place that knows the rules.
 *
 * The rules:
 *
 * | state    | Space                | Ctrl                |
  * |----------|----------------------|---------------------|
  * | grounded | jump (hold = bounce) | nothing (crouch TBD)|
  * | flying   | ascend (+1)          | descend (-1)        |
  * | flying, both held | hover (0)    | hover (0)           |
 *
 * Deliberate consequences:
 *   - Ctrl on the ground does nothing. It used to fall through to `flyDown`,
 *     which made the player descend while walking (bug 4).
 *   - Holding both keys in flight hovers instead of doing both (bug 5).
 *   - Ctrl never crouches while flying and Space never jumps while flying, so
 *     the two meanings cannot overlap (bug 7).
  *   - Jump follows the **hold**, not the press edge. Minecraft keeps bouncing
  *     while Space is held, and this game must feel the same. Calling `jump()`
  *     every frame is safe: `CharacterMovementNode.jump()` only fires when the
  *     pawn may actually jump, and otherwise records the press in its jump buffer
  *     (`jumpBufferTime`), which fires on the landing frame. That buffer is
  *     exactly the auto-bounce, so no edge detector is needed here.
 */

export interface VerticalIntentInput {
  /** True when the pawn's movement node is in flight mode. */
  isFlying: boolean;
  /** True while the primary vertical key (Space) is held. */
  primaryHeld: boolean;
  /** True while the secondary vertical key (Ctrl) is held. */
  secondaryHeld: boolean;
}

export interface VerticalIntent {
  /** -1 descend, 0 hover/none, +1 ascend. Fed to the movement node. */
  verticalInput: number;
   /** True while Space is held on the ground; the movement node decides if it can fire. */
  jump: boolean;
}

export function resolveVerticalIntent(input: VerticalIntentInput): VerticalIntent {
  if (!input.isFlying) {
     return { verticalInput: 0, jump: input.primaryHeld };
  }

  // Held together the keys cancel out, so the pawn hovers rather than doing both.
  const up = input.primaryHeld ? 1 : 0;
  const down = input.secondaryHeld ? 1 : 0;
  return { verticalInput: up - down, jump: false };
}