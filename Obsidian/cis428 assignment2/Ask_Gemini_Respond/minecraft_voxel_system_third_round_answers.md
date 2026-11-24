# Minecraft Voxel & Collision System - Third Round Solutions (TSB Studio / Three.js / Rapier)

這份文件針對你在第三輪提出的 6 個核心問題（問題 10 至 15）及架構連帶影響（`HitLike` 與 `cell` 欄位調整）給出工程實務上的精確解答與可直接運用的 TypeScript 程式碼。

---

### 問題 10：`getHitNormal()` 的 `else if` 鏈在角落命中時會出錯

* **結論**：**你的推論完全正確。** 靠「命中點貼近哪個面」的 `else if` 鏈在斜射角落時會發生碰撞面抖動或判定錯誤。
* **正確做法**：法向量應該在執行 **Slab Method (AABB 射線相交測試)** 時，由**最後進入的軸 (`hitAxis`)** 與**射線方向的正負號**直接決定，不需要事後去猜測點在哪個面上。
* **實作程式碼**：

```ts
function getHitNormal(dir: readonly [number, number, number], hitAxis: number): Vector3 {
    const normal = new Vector3(0, 0, 0);
    if (hitAxis === 0) normal.x = -Math.sign(dir[0]);
    else if (hitAxis === 1) normal.y = -Math.sign(dir[1]);
    else if (hitAxis === 2) normal.z = -Math.sign(dir[2]);
    return normal;
}
```

---

### 問題 11：DDA 起點在方塊內部且射線朝外時，應該命中嗎？

* **結論**：**不應該命中。** 當相機/起點在方塊內部，且射線方向是「向外離開」時，玩家不應該可以破壞或互動該方塊。
* **處理方式**：
  * 在檢查起點所在的格子時，若 slab 測試的 `hitAxis < 0`（代表起點就在 box 內部），我們必須檢查射線是否正朝著離開該 AABB 的方向前進。
  * **最穩健的做法**：如果起點在方塊內部，直接略過該格（不回傳命中），讓 DDA 繼續往外推進到下一個格子。這樣能完美解決玩家被卡在牆內時的視線穿透與錯誤破壞問題。

---

### 問題 12：`testRayAgainstShape()` 的 slab method 實作是否正確？

* **結論**：**你的 slab 邏輯結構非常標準且效能極高，但需注意 `hitAxis < 0`（起點在 box 內）的處理。**
* **確認與修正點**：配合問題 11 的結論，當 `hitAxis < 0` 時直接回傳 `null`（代表起點在內部且朝外不命中），即可完美規避內部起點的誤判。

---

### 問題 13：`dir[axis] === 0` 時怎麼處理？

* **結論**：**你的處理方式完全正確。**
* **實作邏輯**：當 `Math.abs(d) < 1e-8`，代表射線完全平行於該軸。此時只要檢查起點的該軸座標 `o` 是否落在方塊的夾縫區間 `[lo, hi]` 內。如果不在區間內直接回傳 `null`。

---

### 問題 14：`maxT` 應該是多少？

* **結論**：**`maxT = reach`（例如 8 公尺），且 DDA 步進時若累計距離超過該值即終止。**
* **解析**：確保玩家無法選中超出建造距離（Reach）遠處的方塊。

---

### 問題 15：`VoxelShape` 的 `Float32Array` 佈局，`length / 6` 是否可靠？

* **結論**：**加上 constructor 驗證非常必要且足夠。**
* **實作建議**：

```ts
export class VoxelShape {
    constructor(public readonly boxes: Float32Array) {
        if (boxes.length % 6 !== 0) {
            throw new Error(`VoxelShape: boxes.length (${boxes.length}) must be a multiple of 6.`);
        }
    }
    get boxCount(): number {
        return this.boxes.length / 6;
    }
}
```

---

### 架構連帶影響：關於 `HitLike` 與 `cell` 欄位的遷移

* **結論**：**你的推論 100% 正確。**
* **平滑遷移建議**：
  1. 定義專屬的 `VoxelRaycastHit` 介面，明確包含 `cell` 座標：
     ```ts
     export interface VoxelRaycastHit {
         readonly cell: { readonly x: number; readonly y: number; readonly z: number };
         readonly hitLocation: Vector3;
         readonly hitNormal: Vector3;
         readonly distance: number;
     }
     ```
  2. 讓自研的 DDA Raycaster 回傳 `VoxelRaycastHit | null`。
  3. 在 `BuildController` 中平順適配，確保既有的 649 個測試中，涉及放置與破壞的邏輯能直接對應到正確的格子座標。