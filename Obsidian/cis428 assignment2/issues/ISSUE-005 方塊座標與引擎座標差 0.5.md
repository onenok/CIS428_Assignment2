# ISSUE-005 方塊座標與引擎座標差 0.5

- **狀態**：wontfix（不是問題，不做）
- **分類**：question → 結案
- **發現於**：P4 實機驗收（使用者於 `PlayerStart` 位置放一顆對齊引擎座標的 cube 來比對）
- **建立日期**：2026-11-21
- **結案日期**：2026-11-21

## 結論

**這個 issue 不成立，不需要做任何改動。**

專案目前的慣例 —— voxel cell `(x, y, z)` 佔據 `[x, x+1) × [y, y+1) × [z, z+1)`、中心在 `C + 0.5` —— **和 Minecraft 完全一致**。Minecraft 的方塊座標也是最小角（block position），方塊中心在 `+0.5`。

使用者於 2026-11-21 自行推翻原本的期待：

> 我發現我搞錯了，issue-005 是不存在的。in minecraft 也是中間 x 0.5, z 0.5 的

因此：

- **不改** 幾何、碰撞、`placement.ts`、`PlacementPreview`、`SelectionBox`、`VoxelChunkNode.position`
- **不改** `GROUND_SURFACE_Y`（維持 `surfaceY + 1 = 11`）
- **不改** 場景 `LoomkeeperSpawn` 的 y=11
- 出生落點維持 `11.92`

## 保留的記錄：當初為什麼會覺得差 0.5

使用者在 `PlayerStart` 的位置放了一顆與引擎座標完全對齊的 cube，發現它和自己腦中「cell 座標」的印象差了半格。原因是兩個空間的語義不同：

| 空間 | 原點語義 |
|---|---|
| 引擎 `SceneNode.position` | 物件**中心** |
| voxel cell `(x, y, z)` | 方塊**最小角**，中心在 `+0.5` |

兩者換算關係（**這就是正式慣例，之後照這個用**）：

```text
engine position of cell centre = cell + 0.5
cell of an engine position        = Math.floor(position)
```

要把一個引擎物件（粒子、音源、NPC、cube）放到 cell `C` 的正中央，`position` 就填 `C + 0.5`。這不是補償、不是 bug，是兩套座標的正常換算。

## 對後續開發的影響

沒有。P4–P9 全部驗收通過，正是因為專案內部（幾何、碰撞、破壞、放置）全部使用同一套慣例。

未來若要在 voxel 座標與引擎座標之間換算，直接用 `src/voxel/coords.ts` 的既有函式：

| 函式 | 用途 |
|---|---|
| `worldToVoxel(x, y, z)` | 引擎座標 → cell（`Math.floor`） |
| `voxelToWorld(x, y, z)` | cell → 引擎座標的**最小角** |
| `voxelCenter(x, y, z)` | cell → 引擎座標的**中心**（`+0.5`，也就是節點該放的位置） |

## 相關

- [[流程接線實作計劃]] §8 R14（標記為「不需處理」）
- `src/voxel/chunkCollision.ts` 檔頭記錄的舊事故：早期誤傳 `offset: (0.5,0.5,0.5)` 造成玩家站在地面上 0.51 的位置 —— 那是**真的**錯，因為 collider 的 grid 座標本來就是 cell 座標，不該再加 offset
