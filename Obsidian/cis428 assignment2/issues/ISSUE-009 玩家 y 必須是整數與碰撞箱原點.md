# ISSUE-009 玩家站立時 `y` 必須是整數（碰撞箱原點在底面中心）

- **狀態**：resolved（使用者實機確認可用，2026-11-22；出生高度是**繞過引擎**的做法，留一條技術債）
- **分類**：polish / 物理
- **發現於**：P4 實機驗收（使用者要求「站著時 y 應該要是整數」）
- **建立日期**：2026-11-22
- **相關**：[[ISSUE-006 開場下墜陷入地面]]、[[ISSUE-008 跳躍連跳與方形碰撞箱與奔跑]]

## 問題

使用者的要求只有一句：**站在地板上時，pawn 的 `y` 應該是整數**。

Minecraft 慣例：實體碰撞箱的原點在**底面中心**（= 腳底），方塊頂面在整數，所以站著 `y = 11.0`。
引擎（`DefaultCharacterPawn`）的慣例相反：膠囊**中心**在原點，腳底在 `y - 0.9`，所以站著永遠是 `11.90`。

## 結論（先講結果）

| 項目 | 現況 |
|------|------|
| 碰撞箱 `Collision` 局部位置 | `(0, +0.9, 0)`，佔 `[原點, 原點 + 1.8]` |
| pawn 原點 | 腳底（底面中心） |
| `PLAYER_EYE_HEIGHT` | `1.62`（從腳底量） |
| 視覺模型 | `position.y += 0.9`（模型以自身中心建模） |
| 出生高度 | `MyGameMode.resolveSpawnGround()` 直接回傳 `地面頂端 + 1`，讓重力落地 |
| 實測 | pawn `y = 11.000 ~ 11.009`，`grounded: true`，地面頂面 `11.0` ✅ |

## 走過的路（失敗紀錄）

| 版本 | 做法 | 實測 pawn `y` | 結果 |
|------|------|--------------|------|
| A | collider 下移 `-0.9`（原點在頂面），出生點 `-0.9` 補償 | 9.80 | ❌ 陷地 1.2 |
| B | 完全還原成置中 collider | 9.90 | ❌ 陷地 1.1（連原本正常的版本也陷，代表問題在出生流程本身） |
| C | collider 上移 `+0.9`，出生點用引擎 raycast 減半身高並 clamp 到地面 | 9.97 → 10.0 | ❌ 仍低一整格 |
| D | 同 C，但出生點硬寫 `11.02` | 11.01 | ✅ |
| E | 出生點 `地面頂端 + 0.02` | 10.001 | ❌ 差 1 |
| F | **出生點 `地面頂端 + 1`（讓它掉下來）** | **11.000 ~ 11.009** | ✅ 採用 |

### 兩個沒解開的疑點（技術債）

1. **貼齊地面會停在低一格**
   D（`11.02`，離地 2 cm）→ `11.01` ✅；E（`11.02` 同樣值但由 `GROUND_TOP_Y + 0.02` 算出）→ `10.001` ❌。
   兩者的差別只有「數字怎麼來的」，卻差一整格，代表**不是**單純的浮點誤差，而是某條路徑上 spawn 結果被覆寫或沒被採用。
   F 改成離地 1 m 後就穩定，所以目前用「掉落」繞過——掉落會走完整的碰撞掃掠，落地結果可信。

2. **引擎的 `resolveSpawnGround()` 會回報低一整格的地板**
   反編譯後邏輯是從 marker `+2` 往下射線 8 m、取 `normal.y > 0.7` 且 `≤ marker.y` 的最高命中，回傳 `hit.y + 1.8/2 + 0.02`。
   但在 chunk collider 尚未註冊時它打到的不是地表，換算成腳底約 `9.98`（低一整格），pawn 因此生在土裡。它為此有一條 `no walkable floor` 的 warning，但這次不是打空、是**打錯**，warning 不會出現。

> 也就是說：不能信任引擎在「第一次出生」時的射線結果，無論它有沒有警告。

## 為什麼出生要離地 1 m 而不是貼齊

`character controller` **只用掃掠（sweep）解重疊，不做 penetration recovery 的瞬時推出**。
一出生就貼齊（或陷進去）等於開局就在重疊狀態，控制器會用極慢的速度把人往上推（實測約 0.6 cm/s），玩家只會覺得「卡在土裡，跳一下才好」。
離地 1 m 出生，第一帧就是自由落體 → 一次完整的向下掃掠 → 精準停在方塊頂面。

## 目前的程式碼位置

| 檔案 | 內容 |
|------|------|
| `src/character/MyCharacterPawn.ts` | `PLAYER_EYE_HEIGHT = 1.62`、`PLAYER_ROOT_MARKER_SIZE = 0.2`、`createCollision()` 的 `position: (0, +0.9, 0)`、`setupVisualNode()` 抬 `+0.9` |
| `src/game/MyGameMode.ts` | `SPAWN_DROP_HEIGHT = 1`、`GROUND_TOP_Y`、覆寫 `resolveSpawnGround()` |
| `tests/character/playerStack.engine.ts` | 「puts the collider on top of the origin so the pawn y is the feet」 |
| `tests/character/characterSetup.engine.ts` | `eyeHeight === 1.62` |

洋紅色的 pawn 原點標記（`RootMarker`）預設 `visible = false`，只在 F3+B 開啟碰撞顯示時
由 `MyGameMode.toggleCollisionDebug()` 呼叫 `setRootMarkerVisible()` 打開，再按一次關掉。
理由是它會出現在每一張截圖裡面。

## 之後要修的話

1. 先查清楚疑點 1：為什麼「貼齊地面」的 spawn 會落在低一格，而「掉落 1 m」不會。猜測方向是 `findUnoccupiedSpawnPosition()` 或 `restartPlayerAtPlayerStart()` 在 chunk 載入後又跑了一次。
2. 疑點 2 解掉後，`resolveSpawnGround()` 可以改回「用引擎的射線 + clamp 到 marker 高度」，這樣把 `Player Start` 搬到高台或坑底時也能正確出生。目前是**固定地面高度**，玩家若把 marker 搬到別的高度，出生仍會拉到 `GROUND_TOP_Y`.
3. 落地那一帧會有 1 m 的視覺下墜（約 0.45 秒）。若要消除，可在 `beginPlay` 後等到第一次 `grounded` 再 `possess` 相機，或改用引擎的「世界就緒才 spawn」（見 [[ISSUE-006 開場下墜陷入地面]] 的選項 D）。

## 相關

- `src/character/MyCharacterPawn.ts`
- `src/game/MyGameMode.ts`
- [[P4 角色系統]]