# ISSUE-008 跳躍連跳、方形碰撞箱與奔跑

- **狀態**：resolved
- **分類**：blocker
- **發現於**：實機試玩（ISSUE-007 收尾後）
- **建立日期**：2026-11-22

## 問題

三個互不相關、但都屬於「手感」的缺陷同時回報：

1. **跳躍只在按下的那一瞬間觸發。** 按住 Space 走動時只會跳一次，放開再按才會跳第二次。Minecraft 是按住就一直彈。
2. **碰撞箱是膠囊（capsule），不是方盒。** 引擎 `CharacterPawn.createCollision()` 預設用 `CapsuleGeometry(0.45, 0.9)`，等於直徑 0.9、高 1.8 的圓柱加半球蓋。腳底是圓的，站在方塊邊緣會滑掉；肩膀也是圓的，1 格寬的縫隙擠不過去。
3. **沒有奔跑。** 走路只有一個速度，長距離移動很慢。

## 影響

- 跳躍：需要連續跳過地形（例如爬上多層階梯）時要連點 Space，操作感與 Minecraft 完全相反。
- 碰撞箱：voxel 遊戲的所有關卡設計都是「整格」思維，圓底碰撞箱讓「站在方塊邊緣」「走進 1 格通道」這兩個最基本動作變得不可靠 —— 而這正是建造遊戲每天要做幾百次的動作。
- 奔跑：80 × 80 的世界沒有快速移動手段，試玩的時間有大量耗在走路上。

## 根因

### 1. 跳躍

`src/character/verticalIntent.ts` 的 `resolveVerticalIntent` 把「按住」轉成「邊緣」：

```ts
const jump = input.primaryHeld && !input.wasPrimaryHeld;
```

`wasPrimaryHeld` 由 `MyGameMode` 每幀記錄上一幀的按鍵狀態。這個設計的假設是「引擎的 `jump()` 每幀呼叫會連跳」，但實際上不是。

### 2. 碰撞箱

`CharacterPawn.createCollision()` 是引擎的 extension point，我們從來沒有覆寫它，所以吃了預設的膠囊。

查證引擎 bundle（`genesys.min.mjs`）：

```js
createCollision(){
  let e = .9/2;
  return Fn.create({
    name: "Collision",
    geometry: new Ag(e, 1.8 - e*2),   // CapsuleGeometry(0.45, 0.9)
    selfHidden: !0,
    physicsOptions: { enabled: !0, contributeToParentCollider: !0 },
  })
}
```

`Ag` = `THREE.CapsuleGeometry`，`Fn` = `ENGINE.MeshNode`（不是 `CollisionShapeNode`）。

### 3. 奔跑

`BasePawnMovementNode` 本來就有 `speedMultipliers: Map<string, number>` 與 `effectiveSpeedModifier` getter，引擎文件自己的例子就是 `sprint 1.5`。我們沒有用。

而且 `FlyingMovementNode` 的飛行分支寫的是 `this.maxSpeed * this.speedModifier`，**漏掉了 `speedMultipliers`** —— 如果只加 multiplier 而不修這行，飛行時奔跑會靜默失效。

## 決定

| 項目 | 決定 | 理由 |
|---|---|---|
| 跳躍觸發 | `jump = primaryHeld`（按住即跳），移除 `wasPrimaryHeld` | `CharacterMovementNode.jump()` 本身已安全：只有「站地上／coyote 視窗內／還有空中跳」才真正起跳，其餘情況寫進 `jumpBufferTime`（0.1s）的 buffer，落地那一幀自動執行。這個 buffer 就是 Minecraft 的按住連跳，所以不需要自己做邊緣偵測 |
| 碰撞箱 | 覆寫 `createCollision()`，用 `BoxGeometry(0.6, 1.8, 0.6)` | Minecraft 玩家碰撞箱就是 0.6 × 1.8 × 0.6。引擎的 `colliderDescFromCompoundPart` 對非膠囊／圓錐／圓柱／球幾何會落到 `kind:"box"` 分支，用 `geometry.boundingBox` 尺寸建立 cuboid，所以 BoxGeometry 直接就是方盒碰撞 |
| 碰撞節點類別 | 用 `ENGINE.CollisionShapeNode` | 它是引擎文件標明的「幾何只用來定義 collider」節點，`beginPlay` 會強制 `selfHidden = !isEditor`，即使日後有人把 `selfHidden` 打開也不會露出綠框 |
| 奔跑鍵 | Shift（`ShiftLeft` / `ShiftRight`） | 與 Minecraft 一致；Ctrl 已綁給「下降／蹲」的垂直軸，Space 已綁跳躍／上升 |
| 奔跑實作 | `speedMultipliers.set('sprint', 1.5)` | 用 map 而非乘 `maxSpeed`：多個來源（未來的減速地形、負重）會相乘而不是互相覆蓋。1.5 對應 Minecraft 走 4.317 m/s → 跑 5.612 m/s |
| 飛行時奔跑 | 生效（順手修 `effectiveSpeedModifier`） | 原本漏乘 multipliers 是既有 bug，不修的話「空中奔跑」會沒有反應且沒有錯誤訊息 |

## 修正

### 1. `src/character/verticalIntent.ts`

```ts
export function resolveVerticalIntent(input: VerticalIntentInput): VerticalIntent {
  if (!input.isFlying) {
    return { verticalInput: 0, jump: input.primaryHeld };
  }
  ...
}
```

`VerticalIntentInput` 移除 `wasPrimaryHeld`。模組註解改成「hold = bounce」並說明為什麼每幀呼叫 `jump()` 不需要自己做邊緣偵測。

### 2. `src/game/MyGameMode.ts`

- 刪除 `wasPrimaryVerticalHeld` 欄位與它的賦值／傳參
- `updateVerticalInput()` 的 doc 表格由 `jump (edge)` 改為 `jump (hold = bounce)`

### 3. `src/character/MyCharacterPawn.ts`

```ts
export const PLAYER_COLLISION_WIDTH = 0.6;
export const PLAYER_COLLISION_HEIGHT = 1.8;

protected override createCollision(): ENGINE.SceneNode | null {
  return ENGINE.CollisionShapeNode.create({
    name: 'Collision',
    geometry: new THREE.BoxGeometry(
      PLAYER_COLLISION_WIDTH,
      PLAYER_COLLISION_HEIGHT,
      PLAYER_COLLISION_WIDTH,
    ),
    selfHidden: true,
    physicsOptions: { enabled: true, contributeToParentCollider: true },
  });
}
```

盒中心與原膠囊中心都在 pawn 原點，所以 `eyeHeight = 0.7` 不需要改（0.7 < 0.9 = 盒半高，眼睛仍在身體內）。

### 4. `src/input/keyBindings.ts`

```ts
readonly sprint: KeyBinding;
...
sprint: ['ShiftLeft', 'ShiftRight'],
```

### 5. `src/character/MyPlayerController.ts`

新增 `isSprintHeld`，並在四個地方維護（與 `isPrimaryVerticalHeld` 完全同一套生命週期）：

| 位置 | 動作 |
|---|---|
| `handleKeyDown` / `matchesBinding('sprint', e)` | 設 `true`，記 inputTrace，`return true` 吞掉 |
| `handleKeyUp` / `matchesBindingRelease('sprint', e.code)` | 設 `false` |
| `handleWindowBlur` | 設 `false`（焦點丟失時 keyup 永遠不會到） |
| `tickPrePhysics`（`inputLock.isLocked` 分支） | 設 `false` |

`return true` 很重要：引擎 `DefaultPlayerController` 的 `dashKeys = ['ShiftLeft','ShiftRight']` 會餵 GSS 的 `InputDash` tag，吞掉才不會同時觸發。

### 6. `src/character/FlyingMovementNode.ts`

```ts
export const SPRINT_SPEED_MULTIPLIER = 1.5;
const SPRINT_MULTIPLIER_KEY = 'sprint';

public setSprinting(sprinting: boolean): void {
  if (sprinting) {
    this.speedMultipliers.set(SPRINT_MULTIPLIER_KEY, SPRINT_SPEED_MULTIPLIER);
  } else {
    this.speedMultipliers.delete(SPRINT_MULTIPLIER_KEY);
  }
}

public get isSprinting(): boolean {
  return this.speedMultipliers.has(SPRINT_MULTIPLIER_KEY);
}
```

飛行分支：`this.maxSpeed * this.speedModifier` → `this.maxSpeed * this.effectiveSpeedModifier`。

### 7. `src/game/MyGameMode.ts` 新增 `updateSprintInput()`

```ts
private updateSprintInput(): void {
  const pawn = this.getPlayerPawn();
  const controller = this.localController;
  if (!pawn) return;
  const sprinting = !!controller && inputLock.isUnlocked && controller.isSprintHeld;
  if (pawn.isSprinting !== sprinting) {
    pawn.setSprinting(sprinting);
    runtimeInputLog.record('action', `sprint:${sprinting}`, performance.now());
  }
}
```

在 `tickPrePhysics` 中緊接 `updateVerticalInput()` 之後呼叫。每幀寫入而非只在邊緣寫入：`setSprinting` 是幂等的，模式切換／失焦／放開鍵最後都收斂到同一條判斷式。

## 驗證

### 自動化

| 檢查 | 結果 |
|---|---|
| `tsc --noEmit` | ✅ 0 錯 |
| `verify`（全套） | ✅ **894 / 894**（修正前 883，新增 11 個） |

新增測試：

| 檔案 | 案例 |
|---|---|
| `tests/character/verticalIntent.unit.ts` | 「按下即跳」「按住仍跳」（取代舊的邊緣語意兩案） |
| `tests/character/playerStack.engine.ts` | 碰撞幾何是 `BoxGeometry` 且尺寸 0.6 / 1.8 / 0.6 |
| 同上 | 眼睛高度 < 盒半高（相機不會穿出身體） |
| 同上 | 盒寬 < 1，所以 1 格通道可通行 |
| 同上 | 初始不奔跑、`effectiveSpeedModifier === 1` |
| 同上 | `setSprinting(true)` → multiplier 1.5；`false` → 回 1 |
| 同上 | `setSprinting` 幂等（連呼叫兩次不會變 2.25） |
| 同上 | Shift 按下 → 經過 `updateSprintInput` → `pawn.isSprinting === true` |
| 同上 | 失焦後 sprint 被清除 |
| 同上 | `inputLock` 鎖定時 sprint 無效 |
| 同上 | 沒有 pawn 時 `updateSprintInput` 不拋錯 |
| `tests/input/keyBindings.unit.ts` | sprint 綁 ShiftLeft / ShiftRight，且不與 flyUp / flyDown 衝突 |

### 實機

| 項目 | 方法 | 結果 |
|---|---|---|
| 碰撞箱腳底 | Play 中 `getPlayerPawns` → `position[1] = 11.9013`，`groundY`（raycast 打到玩家自身盒頂）`= 12.8015` → 盒半高恰為 0.9 | ✅ |
| 著地高度 | 腳底 11.0013 vs 地表 top face 11.0（HUD 顯示 `Surface Y: 10 (top face 11.0)`） | ✅ |
| 畫面正常 | `captureScreenshot`（`sprint-verify-1`） | ✅ chunk、邊界牆、HUD 都正常 |

## 附帶清理

- 刪除場景中 `Player Start` 底下的 `Cube`（使用者當初放來確認出生點位置的視覺標記，已無用途），並存檔 `default.genesys-scene`。

## 相關

- 計劃節點：[[P4 角色系統]]、[[P6 世界生成]]
- 前一個 issue：[[ISSUE-007 可編輯範圍與基巖高度與世界邊界]]
- 引擎參考：`CharacterPawn.d.ts`（`createCollision` extension point）、`BasePawnMovementNode.d.ts`（`speedMultipliers` / `effectiveSpeedModifier`）、`CharacterMovementNode.d.ts`（`jump()` / `jumpBufferTime`）、`CollisionShapeNode.d.ts`