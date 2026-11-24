# Minecraft Voxel & Collision System Implementation (TSB Studio / Three.js / Rapier)

這份文件針對你在第二輪提出的 9 個實作問題給出確定性結論與對應的 TypeScript 程式碼實作。

---

### 問題 1：16×256×16 chunk 需要分層 palette 嗎？
* **結論**：**不需要強制分層，單一 Palette 絕對夠用。**
* **解析**：因為你的 `data` 是 `Uint16Array`（上限 65535），而整個 16x256x16 總共也才 65536 格。即使整棟建築用了幾百種方塊，Palette 也不會超過 65535。
* **唯一考量**：如果你未來需要依據高度來做「局部 Mesh 重新生成（Mesh Chunking）」或「區段遮蔽裁剪（Culling）」，切成 16 個 16x16x16 的 Section 會比較好管理。但如果目前效能允許，維持單一 `VoxelVolume` 最簡單。

---

### 問題 2：Palette 增長時要不要重新打包？
* **結論**：**不需要。**
* **解析**：因為你每格固定使用 16-bit (`Uint16Array`) 儲存索引，無論 Palette 裡面有 10 個項目還是 30,000 個項目，資料陣列的寬度與記憶體佈局完全不變，省去動態重新打包的複雜度。

---

### 問題 3：DDA raycast 的起點在方塊內部怎麼處理？
* **結論**：**先檢查起點所在格子，若有形狀則直接命中（距離 0）；若無則進入 DDA 步進。**
* **實作邏輯**：
```ts
const startX = Math.floor(origin.x);
const startY = Math.floor(origin.y);
const startZ = Math.floor(origin.z);

// 1. 檢查起點是否在有碰撞/選中框的格子內
const stateId = volume.getBlock(startX, startY, startZ);
if (stateId !== 0) {
    const shape = getBlockShape(stateId);
    const hit = testRayAgainstShape(origin, direction, shape, startX, startY, startZ);
    if (hit) return hit; // 距離為 0 或極小
}

// 2. 若不在內部，才開始標準 DDA 步進
// ... Amanatides & Woo DDA 演算法 ...
```

---

### 問題 4：DDA raycast 遇到「同一格有多個 AABB」怎麼選？
* **結論**：**對該格子的所有 AABB 進行精確測試，取距離最近（`t` 最小）的那一個。**
* **解析**：DDA 只負責告訴你「射線穿過了哪幾個格子（按順序）」。一旦進到某個有形狀的格子，必須把該方塊所有子 AABB（例如樓梯的上下兩塊）拿出來跟射線做相交測試，選出距離最近的交點。

---

### 問題 5：`hitNormal` 怎麼從 AABB 算出來？
* **結論**：**透過比較交點座標與 AABB 的 `min`/`max` 邊界來判定。**
* **實作程式碼**：
```ts
function getHitNormal(point: Vector3, box: Float32Array): Vector3 {
    const EPS = 1e-4;
    const [minX, minY, minZ, maxX, maxY, maxZ] = box;
    const normal = new Vector3(0, 0, 0);

    if (Math.abs(point.x - minX) < EPS) normal.set(-1, 0, 0);
    else if (Math.abs(point.x - maxX) < EPS) normal.set(1, 0, 0);
    else if (Math.abs(point.y - minY) < EPS) normal.set(0, -1, 0);
    else if (Math.abs(point.y - maxY) < EPS) normal.set(0, 1, 0);
    else if (Math.abs(point.z - minZ) < EPS) normal.set(0, 0, -1);
    else if (Math.abs(point.z - maxZ) < EPS) normal.set(0, 0, 1);

    return normal;
}
```

---

### 問題 6：非完整方塊的 `placementCell` 怎麼算？（關鍵問題）
* **結論**：**你的懷疑完全正確，用 `hitLocation + nudge` 處理非完整方塊會出錯。正確做法是「直接使用當前命中的格子座標加上法向量」。**
* **實作程式碼**：
```ts
// 正確的放置格計算方式：
// 命中的格子座標 (hitCell) 是 DDA 記錄到的當前 voxel 座標 (x, y, z)
function getPlacementCell(hitCell: {x: number, y: number, z: number}, hitNormal: Vector3) {
    return {
        x: hitCell.x + hitNormal.x,
        y: hitCell.y + hitNormal.y,
        z: hitCell.z + hitNormal.z
    };
}
```
* 只要有了 DDA 傳回來的「命中格子座標」，要放新方塊永遠就是 `hitCell + hitNormal`，完全不需要去管擊中點的浮點數座標，完美避開半磚、樓梯表面的誤差。

---

### 問題 7：`breakCell` 和 `placementCell` 的計算方式是否應該不同？
* **結論**：**是的，兩者邏輯完全對稱但方向相反。**
* **破壞方塊 (`breakCell`)**：直接就是 DDA 當前命中的格子：
  ```ts
  const targetBreakCell = hitCell; // 就是射線打到的那一格
  ```
* **放置方塊 (`placementCell`)**：是命中格子往法向量外推一格：
  ```ts
  const targetPlaceCell = { x: hitCell.x + hitNormal.x, y: hitCell.y + hitNormal.y, z: hitCell.z + hitNormal.z };
  ```

---

### 問題 8：鄰居更新佇列的執行時機？
* **結論**：**在單機 JS 環境下，建議採用「同步立即更新 + 遞迴深度保護（Recursion Guard）」。**
* **解析**：因為沒有獨立的 Game Tick 迴圈，當玩家放置樓梯時，直接觸發該格及 6 個鄰居的形狀重算。為了防止連鎖更新造成無窮迴圈（例如 A 觸發 B，B 又觸發 A），加一個簡單的計數器或 Set 記錄本次操作已更新過的格子即可。

---

### 問題 9：`Float32Array` 還是 `Float64Array`？
* **結論**：**全面使用 `Float32Array`。**
* **解析**：方塊內的座標範圍嚴格在 `[0, 1]` 之間，`Float32` 提供大約 7 位有效數字的精度，對於 Voxel 遊戲來說綽綽有餘。記憶體佔用減半且對 V8 記憶體配置極為友善。
```ts
// VoxelShape 定義範例 (扁平化 Float32Array)
class VoxelShape {
    constructor(public boxes: Float32Array) {} // 每 6 個數字代表一個 AABB [minX, minY, minZ, maxX, maxY, maxZ]
}
```