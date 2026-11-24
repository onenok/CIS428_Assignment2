# ISSUE-007 可編輯範圍與基巖高度與世界邊界

- **狀態**：resolved
- **分類**：blocker
- **發現於**：Play 實機測試（三個 bug 同時回報）
- **建立日期**：2026-11-22

## 問題

三個獨立的 bug，但同一個根因家族：**邊界算式的 off-by-one，以及「世界最外圍」從來沒有被實作出來**。

### 1. 不該能動的 chunk 可以破壞／放置

回報的是 `0/-1`、`-1/0`、`-1/-1` 三個 chunk 可以編輯。實際比回報的更嚴重：可編輯範圍是 `-16..15`，也就是**橫跨 chunk −1 與 chunk 0 的四個 chunk 全部可編輯**（唯一不能動的是 `-1/-1` 的角落？不 —— 四個全都可以）。

### 2. 基巖在 y=2，應該在 y=0

### 3. 地面最外圍沒有阻擋，玩家會跌進虛空

計劃文件 `P6 世界生成` 有寫過「世界邊界牆」，但只有 Canvas 貼圖草稿，沒有實作。

## 影響

- 玩家可以在中心 chunk 之外挖洞／堆方塊，但外面的 chunk 沒有被 carve，地形高度不一致 → 挖穿後直接掉到 y=0 以外的空洞。
- 基巖在 y=2 意味著坑底下方還有兩層「不存在的空氣」，玩家挖到底會看到穿視。
- 走到地面邊緣會直接掉出世界，無法自行返回。

## 根因

### 1. `buildBoundsForRadius` 的 off-by-one

`src/build/placement.ts`：

```ts
// 修正前
const limit = (radiusChunks + 1) * chunkSize;
return { minX: -limit, maxX: limit - 1, minZ: -limit, maxZ: limit - 1, ... };
```

`radius = 0`、`chunkSize = 16` → `limit = 16` → `minX = -16`、`maxX = 15`。
但 radius 0 的**唯一** chunk 是 chunk `0`，範圍是 `0..15`。多出來的 `-1` 讓 X／Z 各自多跨一個 chunk，於是 `(0,-1)`、`(-1,0)`、`(-1,-1)` 都可編輯。

`src/voxel/coords.ts` 的 `isWithinEditableRegion` 用了同一個錯誤公式（`x >= -limit && x < limit`），所以兩處一致地錯 —— 這也是為什麼測試沒抓到：**舊測試把這個 bug 寫成了期望值**。

```ts
// 舊測試（綠燈但錯的）
assertDeepEqual(buildBoundsForRadius(0, 16), { minX: -16, maxX: 15, ... });
assertTrue(isWithinEditableRegion(-16, 0, -16));
```

> 教訓：測試綠不代表行為對。修 bug 時必須同時改掉把 bug 寫死的期望值。

### 2. `carveCenterDepth`

```ts
// 修正前（在 MyGameMode 內）
carveCenterDepth: 8   // surfaceY 10 - 8 = carvedFloorY 2
```

`blockIdForCarvedColumn` 把 `y === carvedFloorY` 放成 `BLOCK_BEDROCK`，所以基巖在 y=2。

### 3. 世界邊界從未實作

`applyFog` 之後就直接進 `BuildController`，場景裡沒有任何邊界物件。

## 決定

| 項目 | 決定 | 理由 |
|---|---|---|
| 可編輯範圍 | 方案 a：維持 16×16，鎖掉外側 8 個 chunk | 方案 b（開放 5×5 並延長基巖）會讓坑變成 80×80，失去「只有中心一個坑」的敘事 |
| 邊界距離 | 最外圈地面的邊緣（`x/z = −32 / 47` 的外側平面） | 對齊實際可站立區域，邊界就是地面的邊 |
| 邊界高度 | 世界最底到最高（y 0 → 256） | 沿用 Minecraft 的做法；玩家飛不起來也跳不過去 |

## 修正

### 1. 對稱的範圍算式

`src/build/placement.ts`：

```ts
const extent = radiusChunks * chunkSize;
return {
  minX: -extent,
  maxX: extent + chunkSize - 1,
  minZ: -extent,
  maxZ: extent + chunkSize - 1,
  minY: 0,
  maxY: 255,
};
```

`radius 0` → `0..15`；`radius 1` → `-16..31`（3×3）。

`src/voxel/coords.ts` 用同一種寫法：

```ts
const extent = editableRadiusChunks * CHUNK_SIZE;
return voxelX >= -extent && voxelX < extent + CHUNK_SIZE
  && voxelZ >= -extent && voxelZ < extent + CHUNK_SIZE;
```

外側那 8 個 chunk **保留實體方塊**（它們不是 editable，所以不會被 carve），因此最終只有 chunk `0` 有一個坑。

### 2. 基巖搬到 y = 0

新增 `src/world/gameplayWorld.ts`，把設定從 `MyGameMode` 搬出來（`MyGameMode` import 了 `ENGINE`，純單元測試無法載入）：

```ts
export const PIT_FLOOR_Y = DEFAULT_WORLD_GEN_CONFIG.minY;              // 0
export const GAMEPLAY_WORLD_GEN_CONFIG: WorldGenConfig = {
  ...DEFAULT_WORLD_GEN_CONFIG,
  carveCenterDepth: DEFAULT_WORLD_GEN_CONFIG.surfaceY - PIT_FLOOR_Y,   // 10
};
export function pitFloorIsWorldFloor(config = GAMEPLAY_WORLD_GEN_CONFIG): boolean {
  return carvedFloorY(config) === config.minY;
}
```

現在挖到底就是世界底，`pitFloorIsWorldFloor()` 有測試把這個不變量鎖住。

### 3. 世界邊界牆

三個新檔案，刻意把「純數學」與「引擎物件」分開：

| 檔案 | 職責 |
|---|---|
| `src/world/borderSpec.ts` | 純幾何 + 淡出數學，零依賴，全部可單元測試 |
| `src/world/worldBorderTexture.ts` | 程序化灰階斜線遮罩（`buildBorderPixels` 純函式，`makeBorderTexture` 需 DOM） |
| `src/world/WorldBorder.ts` | 4 個 `MeshNode` + 材質 + `tickPrePhysics` 捲動與淡出 |

**幾何**：`borderWallSpecs` 產生 4 面牆，中心落在邊界平面上（不是推到外面），這樣玩家還是可以站在最外側那一格，牆讀起來是「地面的邊」而不是一個提早一米的隱形圍欄。X 牆跨滿 Z、Z 牆跨滿 X，角落自然重疊（可忽略的兩張三角形）。

**為什麼是 box 而不是 voxel**：一面牆 80 × 256 米，用 voxel 是 20k 格／面，而且每次 chunk 重建都要重算 collider。用 box 就是 12 個三角形 + 一個 box collider。

**顏色**：貼圖保持白色／灰階，藍色來自 `material.color = 0x20a0ff`。這跟 Minecraft 用同一張 `forcefield.png` 染成藍／綠／紅是同一個原理 —— 把藍色烤進貼圖會變成「藍 × 藍」而變暗。

**貼圖**：16×16 的斜線遮罩反推自使用者提供的 PNG（`alpha = A[(x + y) % 8]`，`A = [171,156,126,60,0,0,0,0]`）。

## 過程中修掉的兩個「看得見但不對」

實機驗證時必須看截圖，因為這兩個問題單元測試抓不到。

### 1. 加法混合在明亮天空上直接消失

第一版用 `THREE.AdditiveBlending`。加法只會讓背後的東西**變亮**，而這個世界的天空接近白色 → 白色 + 藍色 = 白色，牆在天空上完全飽和。
截圖上的表現是：斜線只在穿過草地的地方看得見。

改成一般 alpha 混合（`transparent: true` + `depthWrite: false`），顏色就一定會出現在畫面上，不管背後是什麼。

### 2. 霧會洗掉邊界

`applyFog` 設的是 `scene.fog`，three.js 只對 `material.fog !== false` 的材質套霧。世界只有 80 米寬，但霧的 `far` 設得很近，整面牆會被混成一片平霧。

材質上加 `fog: false`，淡出改由 `borderAlphaForDistance` 自己做（可控範圍，而且可以逐面牆不同）。

> 這兩個必須一起修：只關霧但保留加法混合，牆在天空上還是看不到；只改混合但留著霧，牆會被洗成一片。

### 3. 可見度與鋸齒

修好混合後牆很明顯，但**太弱**（第一版 opacity ramp 是 171/156/126/60，而且 `near/far = 24/64` 讓站在世界中央的玩家看到只剩 60%），而且 16×16 貼圖只有 4 級漸層 → 45 度邊緣有明顯階梯。

- `BORDER_BAND_ALPHAS` 改 `[255, 245, 228, 205, 176, 142, 104, 62]`（8 級，前緣接近不透明）
- `BORDER_TILE_SIZE` 16 → 32（漸層步數加倍）
- `BORDER_FADE_NEAR/FAR` 24/64 → 40/100

## 驗證

### 自動

`pnpm verify` → **883 / 883**（原基線 868，新增 14 個 border 案例）

| 測試檔 | 狀態 | 說明 |
|---|---|---|
| `tests/world/worldBorder.unit.ts` | 新增 14 案例 | extent 對齊 voxel、4 面牆、邊界平面、跨軸長度、`distanceFrom`、從底到頂、淡出端點／中點／單調、貼圖週期性、ramp、白色 RGB、`PIT_FLOOR_Y === WORLD_MIN_Y`、`editableRadius === 0` |
| `tests/build/placement.unit.ts` | 改 | `radius 0` 期望 `0..15`；新增 `radius 1` 對稱案例；越界改測 `x: -1` / `z: -1` |
| `tests/voxel/coords.unit.ts` | 改 | `-16` / `-1` 改為應被拒絕；`radius 1` 加測 `-16` 通過、`-17` 拒絕 |
| `tests/preset/applyPreset.unit.ts` | 改 | `origin.z` 由 `-2` 改 `2`（原值在修正後真的越界） |

### 實機（Play 模式 raycast）

| 檢查 | 指令 | 結果 |
|---|---|---|
| 基巖在 y=0 | 從 `(8, 30, 8)` 往下 raycast | 命中 `y = 1` → 方塊佔 `0..1` → 方塊座標 `y = 0` ✅ |
| 邊界牆有碰撞 | 從 `(-30.9, 12.5, -31.2)` 往 `-X` | 命中 `BorderWall_west` 於 `x = -31.75` ✅ |
| 同上，往 `-Z` | 命中 `BorderWall_north` 於 `z = -31.75` ✅ |
| 玩家被牆擋住 | `getPlayerPawns` | 停在 `(-30.9, 11.9, -31.2)`，貼著牆不再前進 ✅ |
| 視覺 | 4 張截圖 `border-a..e` | 牆從 y=0 到 256，天空上可見斜線；地面以下的部分被地面遮住（正確）✅ |

## 相關

- 計劃節點：[[P6 世界生成]]
- 前置：[[ISSUE-005 方塊座標與引擎座標差 0.5]]（voxel cell 與世界米數的換算，邊界牆沿用同一套）
- 前置：[[ISSUE-004 建造 HUD 排版與 preset tabs 無反應]]