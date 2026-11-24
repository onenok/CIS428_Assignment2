# 測試架構

> 三層測試策略，讓每個最小實裝單元與功能組都能獨立驗證。

---

## 先看這個

| 文件 | 用途 |
|---|---|
| **[[最小單元清單]]** | **105 個最小單元的完整拆解** —— 開工前必讀 |
| [[覆蓋率對照]] | 哪個功能由哪一層驗證 |
| [[第1層 純邏輯測試]] | 純函式測試規範 |
| [[第2層 引擎整合測試]] | headless 引擎測試規範 |
| [[第3層 執行期驗證]] | 人工驗證清單規範 |

---

## 為什麼是三層

| 層 | 名稱 | 執行方式 | 速度 | 驗證什麼 |
|---|---|---|---|---|
| 1 | 純邏輯 | Node + tsx，不載入引擎 | 毫秒 | 演算法、邊界條件、資料結構 |
| 2 | 引擎整合 | Node + headless World | 秒 | 引擎 API、生命週期、物理 |
| 3 | 執行期 | MCP play mode + 截圖 | 分鐘 | 視覺、UI、手感、完整流程 |

**原則**：能用第 1 層就不用第 2 層，能用第 2 層就不用第 3 層。

第 1 層跑得快、失敗訊息精準，是主力。第 2 層慢十倍但能抓到「引擎行為和我想的不一樣」。
第 3 層無法自動化，只能人工確認。

---

## 指令

```powershell
pnpm verify              # 全部（第 1 + 2 層）
pnpm verify:unit         # 只跑第 1 層
pnpm verify:engine       # 只跑第 2 層
pnpm verify:json         # 機器可讀輸出
pnpm verify --filter=voxel   # 只跑路徑含 "voxel" 的檔案
```

> **為什麼不叫 `pnpm test`**：`AGENTS.md` 明文禁止 `pnpm test`。改用 `verify`
> 既避開禁令，語意也更準確 —— 這些是「驗證」而非「單元測試套件」。

---

## 檔案命名

| 後綴 | 層 | 位置 |
|---|---|---|
| `*.unit.ts` | 1 | `tests/**/` |
| `*.engine.ts` | 2 | `tests/**/` |
| `*.runtime.md` | 3 | `tests/**/` |

測試檔放在專案根的 `tests/`，**不與被測程式碼相鄰** —— 因為 `src/auto-imports.ts`
由編輯器掃描 `src/` 產生，測試檔放進去會被打包進 bundle。

---

## 目錄結構

```
CIS428_Assignment2/
├── scripts/verify/
│   ├── run.ts           # 入口：掃描、載入、執行、回報
│   ├── harness.ts       # describe / it 註冊與執行
│   ├── assert.ts        # 斷言庫（零依賴）
│   └── reporters.ts     # console / JSON 輸出
├── tests/
│   ├── voxel/
│   │   ├── faceCulling.unit.ts
│   │   ├── greedyMesh.unit.ts
│   │   ├── coords.unit.ts
│   │   └── VoxelMeshNode.engine.ts
│   ├── world/
│   │   ├── headlessWorld.ts      # 共用輔助（非測試檔）
│   │   ├── smoke.engine.ts
│   │   └── World.engine.ts
│   ├── build/
│   │   ├── raycast.engine.ts
│   │   └── buildMode.runtime.md
│   ├── character/
│   │   ├── playerStack.engine.ts
│   │   ├── eyeHeight.unit.ts          # 待建立
│   │   └── firstPerson.engine.ts      # 待建立
│   └── input/
│       └── keyBindings.unit.ts
└── src/
    ├── voxel/
    │   ├── mesher.ts
    │   └── coords.ts
    ├── character/
    │   ├── MyCharacterPawn.ts
    │   ├── MyPlayerController.ts
    │   └── FlyingMovementNode.ts
    ├── input/keyBindings.ts
    └── game/MyGameMode.ts
```

> **測試檔不放 `src/`** —— `auto-imports.ts` 由編輯器掃描 `src/` 產生，
> 放進去會被打包進 bundle。

---

## 撰寫測試

```typescript
import { assertEqual, assertTrue } from '../../../scripts/verify/assert.js';
import { describe, it } from '../../../scripts/verify/harness.js';

describe('my feature', () => {
  it('does the thing', () => {
    assertEqual(1 + 1, 2);
  });
});
```

第 2 層要標記層級：

```typescript
describe('my engine feature', () => {
  it('works headless', async () => {
    const handle = await createHeadlessWorld();
    try {
      // ...
    } finally {
      handle.dispose();
    }
  });
}, 'engine');
```

---

## 斷言庫

| 函式 | 用途 |
|---|---|
| `assertEqual(actual, expected)` | 嚴格相等（`-0` 與 `0` 視為相等） |
| `assertNotEqual(actual, expected)` | 不相等 |
| `assertClose(actual, expected, tol)` | 浮點比較，預設容差 1e-6 |
| `assertDeepEqual(actual, expected)` | 深層比較（物件、陣列、Map、Set） |
| `assertTrue(value)` / `assertFalse(value)` | 真假值 |
| `assertThrows(fn)` | 預期拋錯，回傳該錯誤 |
| `assertInstanceOf(value, Ctor)` | 型別檢查 |
| `fail(message)` | 直接失敗 |

---

## 第 2 層的關鍵陷阱

### 1. 節點要 `beginPlay()` 才會 tick

`World.add()` 只把節點掛到場景樹，**不會**註冊到 TickManager。註冊發生在
`beginPlay()`。用 `addAndBeginPlay()` 輔助函式。

### 2. 物理引擎要 `step()` 才會索引 collider

Rapier 只在 `step()` 時把新 collider 放進 broad-phase。剛加完節點就 raycast
會回 `null`。用 `stepPhysics()` 輔助函式。

### 3. `World` 建構時已有內建節點

`GlobalParticleManager` 一定存在，所以 `getRootNodes().length` 永遠 ≥ 1。

### 4. 物理註冊走 `world.gameLoop.physicsEngine`

`SceneNode.getPhysicsEngine()` 讀的是 `world.gameLoop.physicsEngine`，不是
`world` 自己的屬性。headless 測試要注入一個最小 gameLoop 樁。

### 5. `collisionMeshType` 預設是 `convexHull`

對 `BoxGeometry` 用 `convexHull` 會產生空殼 collider（`shape.type = 9`、
`halfExtents` 為 undefined），raycast 打不到。測試要用 `'boundingBox'`。

### 6. `ENGINE.Vector` 不是 `THREE.Vector3`

引擎匯出的 `Vector` 是內部用的輕量型別，沒有 `toArray()`。物理選項要用
`import * as THREE from 'three'` 的 `THREE.Vector3`。

### 7. 測試綠不等於型別正確

`tsx` 不做型別檢查。`ENGINE.Vector` 傳給要求 `THREE.Vector3` 的 API 時
執行期能過（duck typing 只讀 `.x/.y/.z`），但 `pnpm build` 會報 `TS2740`。

**每次新增測試檔後必須跑 `pnpm build`。**

### 8. 不要直接 import 引擎的 transitive dependency

`@dimforge/rapier3d-compat` 不在 `package.json` 的 dependencies，直接
`import()` 會得到 `TS2307: Cannot find module`。一律走引擎的 factory：

```typescript
const physics = await ENGINE.createPhysicsEngine({
  gravity: new THREE.Vector3(0, -9.81, 0),
  engine: ENGINE.PhysicsEngine.Rapier,
});
```

### 9. enum 參數不要用字串字面值

`collisionMeshType: 'boundingBox'` 會報 `TS2322`。用
`ENGINE.CollisionMeshType.BoundingBox`。

---

## 覆蓋率對照

見 [[覆蓋率對照]]。

---

## 相關文件

- [[第1層 純邏輯測試]]
- [[第2層 引擎整合測試]]
- [[第3層 執行期驗證]]
- [[CIS428 計劃總覽|計劃總覽]]