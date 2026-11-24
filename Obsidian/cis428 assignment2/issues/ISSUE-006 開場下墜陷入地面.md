# ISSUE-006 開場玩家在 chunk collider 出現前就下墜，陷入地面 3–4 格

- **狀態**：resolved（2026-11-21）
- **分類**：polish
- **發現於**：P4 實機驗收（移動 `PlayerStart` 後按 Play）
- **建立日期**：2026-11-21

## 問題

按 Play 時，玩家 pawn 先出現，chunk 的 collider 才註冊完成。玩家在這段空窗期自由下墜，等地形出現時人已經在 `y` 上比地面低 3–4 格，於是卡在土裡。

NPC 沒有這個問題 —— `Loomkeeper` 是 `KinematicPositionBased`，不受重力影響。

使用者目前的處理：把 `PlayerStart` 的 Y 再往上調，讓下墜距離變長，抵達地面時 collider 已經存在。

## 影響

- 開場會看到玩家先「掉進地裡」，是 demo 第一個畫面。
- 調整 Y 是**用時間換正確性**：機器慢一點、chunk 多一點（未來擴大半徑）就會失效，而且失效時不會報錯，只會穿地。

## 引擎已有的機制（值得注意）

`ENGINE.PlayerStart` 有一個 `snapToGround` 屬性（預設 `false`）：

```ts
// PlayerStart.ts:53
public snapToGround: boolean = false;
```

開啟後 `GameMode.adjustSpawnPositionForPlayerStart()` 會呼叫 `resolveSpawnGround()`：從 marker 位置**向下射線**（Character collision profile、可走面 normal.y > 0.7），把膠囊底部放到地面上，再 `SPAWN_GROUND_CLEARANCE` 抬一點。`GameBuilder.createPlayerStart()` 預設就開著。

`resolveSpawnGround()` 裡有 `physicsEngine.syncSceneQueries()` 這一行，正是為了「初次出生時 broadphase 還沒建好」而加的。

## 選項

| 選項 | 說明 | 代價 |
|---|---|---|
| A. 現況：把 `PlayerStart` Y 調高 | 使用者已做 | 零程式，但靠競速，機器慢就穿地 |
| B. 在 `onBeforeBeginPlay()` 把場景 `PlayerStart.snapToGround` 設為 `true` | 一行；用引擎自己的地面查詢取代重力硬摔 | 小。若射線打空（collider 仍未註冊）行為等於現在 + 一條 `[GameMode] ... no walkable floor` 警告，無回歸 |
| C. 在 `MyGameMode` 覆寫 `findPlayerStart()` / `adjustSpawnPositionForPlayerStart()`，自訂出生流程 | 可完全控制（例如延後 possess 到世界就緒） | 中。要改 `GameMode` 的受保護方法，得確認 19.0.1 的簽名 |
| D. 世界生成完成前不 possess pawn | 最乾淨的語意 | 大。要動 `spawnPlayerControllerForClient` 的時序，風險高 |

## 決定

**採用 B**，並在實作時發現 B 單獨用不會生效，必須同時把 marker 的 Y 拉近地面。兩個改動一起才是完整的修法。

## 修法（2026-11-21）

### 1. `PlayerStart.snapToGround = true`

在 TSB Studio 的 `Player Start` 節點上勾選（`category: Spawn`，可從 `getEditableProperties` 看到），並存檔。

**為什麼不用重力硬摔**：`resolveSpawnGround()` 在射線之前先呼叫 `physicsEngine.syncSceneQueries()`，這正是為了「初次出生時 broadphase 還沒建好」而存在的。用引擎自己的地面查詢，等於把「等一個 physics step」換成「自己同步一次查詢」。

### 2. `PlayerStart.position.y` 由 `20` 降為 `12`

**這是原本計畫漏掉的關鍵。** snapToGround 不是瞬移，是**探針**：

```
origin = position.y + SPAWN_GROUND_PROBE_UP(2)
maxDistance = SPAWN_GROUND_PROBE_DISTANCE(8)
→ 只能打到 [y - 6, y + 2] 的地板
```

marker 在 `y = 20` 時探測範圍是 `14..22`，地面在 `11` → **打空**，印出 `no walkable floor ... spawning at the marker position` 然後退回原本的自由落體。也就是說「只勾 snapToGround」會得到「加了警告但一樣穿地」的結果。

降到 `y = 12` 後範圍是 `6..14`，命中 `11`，落點 `11 + 1.8/2 + 0.02 = 11.92`。

**副作用是好的**：即使 snapToGround 完全失效，fallback 的位置也從「空中 9 格」變成「地面上 0.08 格」，最壞情況從「陷入地面 3–4 格」降級為「幾乎沒有下墜」。

### 3. 回歸測試

`tests/integration/playerStartAnchor.unit.ts` 直接解析 `assets/default.genesys-scene`，斷言三件事：

1. 場景裡有 `PlayerStart`
2. 它的 `snapToGround` 是 `true`
3. 它的 Y 讓探針能打到 `GROUND_SURFACE_Y`

第 3 點是真正的守門員：**若有人再把 marker 往上搬（這正是先前的暫時方案），測試會紅並印出探測範圍與地面的落差**。已實測：`y = 20` 時 fail、`y = 12` 時 pass。

### 仍未覆蓋

- 這只是把競速消除；若未來 chunk 數量大到 generation 本身跨好幾帧，pawn 仍可能在**沒有地板**的地方出生。那時要改用選項 D（世界就緒才 possess）。
- 玩家若把 marker 搬到坑口正上方（地面 `y = 3`），探針由 `12` 只到 `6`，同樣打空。測試會紅。要支援就得改 `resolveSpawnGround()`（覆寫成掃掠或加長探測距離）。

## 相關

- `src/character/npcSpawn.ts`（NPC 不受影響的原因）
- [[流程接線實作計劃]] §8 R15
