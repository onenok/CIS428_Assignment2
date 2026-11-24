# P7 UI 系統

> 狀態：🟡 待討論
> 對應遊戲節點：[[N6 選類別]]、[[N7 選設計]]、[[N9 Submit 區塊]]、[[N12 遊戲結束]]
> 相關文件：`level_plans/05_build_mode_genesys.md` §5.11

## 目標

實作所有 UI：快捷欄、調色盤、Submit 按鈕、類別分頁、設定面板。

## UI 元件清單

| 元件 | 引擎內建 | 用途 |
|---|---|---|
| 快捷欄 | `InventoryBar` | 9 種材質快速切換 |
| 調色盤 | `InventoryGrid` | 完整材質選擇（E 鍵開啟） |
| **Submit 按鈕** | `Button` | **提交區塊設計** |
| 類別分頁 | `Card` + `mountChild(Button)` | 設計庫分頁（數量浮動 + 「全部」） |
| 設定面板 | 自訂 HTML | 按鍵自訂、相機模式 |
| 準心 | `Crosshair`（繼承） | 第一人稱瞄準，Minecraft 反色十字 |
| 提示訊息 | `CenterMessage` | 放置失敗、完成提示 |

**注意**：原本的 `ProgressBar`（3/3 進度）已移除 —— 改為 Submit 機制。

## 快捷欄

```typescript
const bar = new ENGINE.InventoryBar(world.uiManager, {
  slotCount: 9,
  slotSize: 56,
  slotGap: 4,
});
await bar.initialize();

bar.setItems([
  { id: 'stone',    icon: '🪨', label: '石頭' },
  { id: 'dirt',     icon: '🟫', label: '泥土' },
  { id: 'grass',    icon: '🟩', label: '草' },
  { id: 'sand',     icon: '🟨', label: '沙' },
  { id: 'wood',     icon: '🪵', label: '木頭' },
  { id: 'brick',    icon: '🧱', label: '磚' },
  { id: 'snow',     icon: '⬜', label: '雪' },
  { id: 'water',    icon: '💧', label: '水' },
  { id: 'obsidian', icon: '⬛', label: '黑曜石' },
]);
```

**注意**：`InventoryBar` **無內建點擊事件**，需手動接：

```typescript
bar.getElement()?.querySelectorAll('.ui-inventory-bar-slot').forEach((el, i) => {
  el.addEventListener('click', () => selectBlock(i));
});
```

### 選中狀態

`InventoryBar` **沒有「選中」概念**（只有 `filled` / `empty` / `hover` / `cooldown`），需自己加 `selected` class：

```typescript
let selectedIndex = 0;

function selectBlock(index: number): void {
  const slots = bar.getElement()?.querySelectorAll('.ui-inventory-bar-slot');
  slots?.forEach(s => s.classList.remove('selected'));
  slots?.[index]?.classList.add('selected');
  selectedIndex = index;
  buildController.setSelectedBlockId(items[index].id);
}

// 初始化時選中第 0 格
selectBlock(0);
```

樣式（Demo 後再調）：

```css
.ui-inventory-bar-slot.selected {
  border-color: #ffffff;
  border-width: 2px;
}
```

**分階段**：先做功能（點擊切換 `selectedBlockId`），樣式 Demo 後再調。

## Submit 按鈕

```typescript
const submitBtn = new ENGINE.Button(world.uiManager, {
  label: '提交區塊',
  variant: 'primary',
  size: 'large',
});
await submitBtn.initialize();
submitBtn.setOnClick(() => buildController.onSubmit());
```

**位置**：建造模式 UI 右下角，隨時可見。

**快捷鍵**：`KeyBindings.submitDesign`（**`Ctrl+Enter`**）

> 原本規劃 `Enter`，但太容易誤按（尤其對話框也用 Enter）。改為 `Ctrl+Enter`，`Alt+Enter` 可作為備用。

`matchesBinding()` 已用 `Boolean(e.ctrlKey) || Boolean(e.metaKey)`，所以 `Ctrl+Enter` 和 `Cmd+Enter` 都會觸發。

## 類別分頁

**實作方式：`Card` + `mountChild(Button)`**（不用 `InventoryGrid`，也不寫全新元件）。

`InventoryGrid` 的模板寫死標題與插槽容器，沒有分頁標籤的位置，且 `columns`/`rows` 固定，不適合類別數量浮動的設計庫。詳見 [[P2 建造系統#類別分頁 UI 實作方式]]。

### 架構

```typescript
const card = new ENGINE.Card(world.uiManager, {
  title: '設計庫',
  position: 'center',
});
await card.initialize();

const body = card.getElement()?.querySelector('[data-card-body]');

// 分頁列（頂部）
const tabsRow = document.createElement('div');
tabsRow.className = 'preset-tabs';
body?.appendChild(tabsRow);

// 網格（每行 5 個）
const grid = document.createElement('div');
grid.className = 'preset-grid';
body?.appendChild(grid);

// 動態生成分頁（第一項固定「全部」）
const tabButtons: ENGINE.Button[] = [];
for (const cat of [{ id: 'all', name: '全部' }, ...PRESET_CATEGORIES]) {
  const btn = await card.mountChild(ENGINE.Button, {
    label: cat.name,
    variant: 'ghost',
    size: 'small',
    onClick: () => switchCategory(cat.id),
  }, tabsRow);
  tabButtons.push(btn);
}
```

### 為什麼用 `Card` + `mountChild(Button)`

| 檢查項 | 結果 |
|---|---|
| 能達成目標 | ✅ 分頁用 `Button`，網格自己寫 CSS |
| override 複雜度 | 🟢 低（只用公開 API） |
| 依賴內部實作 | 🟢 無（`data-card-body` 是模板公開屬性） |
| 浪費現有功能 | 🟢 用到 `Card` 容器 + `Button` 樣式 + `mountChild` 生命週期 |

`mountChild()`（`BaseUIComponent.ts:335`）是引擎提供的組合機制，自動處理 `position: 'none'`、`initialize()`、DOM 搬移、`destroy()` 追蹤。

### 分頁生成邏輯

```typescript
// 第一項固定是「全部」
const tabs = [
  { id: 'all', name: '全部' },
  ...PRESET_CATEGORIES
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(c => ({ id: c.id, name: c.name })),
];

// 純粹的設計庫分頁，不是任務
// 玩家可自由切換、混搭
```

### 切換行為

| 動作 | 行為 |
|---|---|
| 點擊分頁 | 只切換選中分頁的 `variant`（`ghost` ↔ `primary`）與 `.preset-grid` 內容，**不重建整個面板** |
| 選「全部」 | 合併所有類別的設計 |
| 選某類別 | 只顯示該類別的設計 |

### 版面配置

| 項目 | 值 |
|---|---|
| 分頁位置 | **頂部**（`.preset-tabs` 在 `.preset-grid` 之前） |
| 網格每行 | **5 個** |
| 分頁樣式 | `Button` 的 `ghost` variant；選中時切 `primary` |

### CSS（~15 行）

```css
.preset-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(5, 64px);
  gap: 8px;
}
```

### 樣式要點（flat design）

- 無陰影、無漸層、無圓角（或極小圓角）
- 分頁標籤：底線指示當前項，不用背景色塊
- 設計卡片：細邊框，hover 時邊框變色
- 實裝時不用 emoji，用平面圖示資源

## 準心

**Minecraft 風格反色十字**（`mix-blend-mode: difference`）。

### 原理

| 背景色 | 計算 | 結果 |
|---|---|---|
| 純黑 `#000` | 白 − 0 | 白 |
| 純白 `#fff` | 白 − 白 | 黑 |
| 綠色草地 | 白 − 綠 | 紫紅（反相） |

一張純白十字 + `difference` 混合模式，自動融入任何背景。

### 為什麼要繼承 `Crosshair`

引擎 `Crosshair` 有 3 個限制：

| 限制 | 說明 |
|---|---|
| `customStyles` 不允許 `mix-blend-mode` | `sanitizeCssCustomStyles.ts` 的 allowlist 只含視覺/排版屬性 |
| `CrosshairStyle` 沒有「十字」變體 | 只有 `dot` / `scope` / `x` / `bracket` / `circle` / `sniper` |
| `renderShape()` 是 `private` | 不能覆寫 |

但 `getAssetPaths()` 和 `onInitialize()` 都是 `protected`，可以覆寫。

### 實作

```typescript
class MinecraftCrosshair extends ENGINE.Crosshair {
  protected override getAssetPaths() {
    return {
      templatePath: '@engine/assets/ui/templates/crosshair.html',   // 沿用引擎模板
      stylesPath: '@project/assets/ui/minecraft-crosshair.css',     // 自訂 CSS
    };
  }

  protected override async onInitialize(): Promise<void> {
    // 不呼叫 super，直接畫十字
    const shape = this.layout?.querySelector('[data-crosshair-shape]');
    if (shape) {
      shape.innerHTML = `
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="8">
          <line x1="50" y1="10" x2="50" y2="40" />
          <line x1="50" y1="60" x2="50" y2="90" />
          <line x1="10" y1="50" x2="40" y2="50" />
          <line x1="60" y1="50" x2="90" y2="50" />
        </svg>`;
    }
  }
}
```

### 自訂 CSS

```css
.ui-crosshair {
  mix-blend-mode: difference;
}
.ui-crosshair-shape {
  color: #ffffff;   /* 純白，difference 混合後自動反色 */
}
```

### 使用

```typescript
const crosshair = new MinecraftCrosshair(world.uiManager, {
  size: 20,
  style: 'dot',   // 佔位，實際由 onInitialize 覆寫
});
await crosshair.initialize();
crosshair.show();   // 只在第一人稱顯示
```

### 準心與視角的連動

| 視角 | 準心 | 選格方式 |
|---|---|---|
| 第一人稱 | ✅ 顯示 | 準心射線（5 格） |
| 上帝視角 | ❌ 隱藏 | 滑鼠游標射線 |

切換視角時同步 `crosshair.show()` / `crosshair.hide()`。詳見 [[P4 角色系統#雙視角切換]]。

## UI 規範（必須遵守）

| 規則 | 說明 |
|---|---|
| 容器 | 加到 `world.gameContainer`，**不可**加到 `document.body` |
| 動態文字 | 用 `setLabel`/`setMessage`/`setTitle`/`textContent` |
| **禁用** | `innerHTML`/`setHTML`/`iconHtml` |
| 優先 | `BaseUIComponent` widgets |
| **風格** | **平面 UI（flat design）** —— 不可用 emoji 當最終圖示 |

## 平面 UI 規範

> 文件中的 emoji（`⬛` `🏛️` `✨`）只是**示意 placeholder**。
> 實裝時必須替換為平面 UI 資源。

| 項目 | 規範 |
|---|---|
| 圖示 | SVG 或圖示集，**不用 emoji** |
| 陰影 | 避免（或極輕微） |
| 漸變 | 避免 |
| 圓角 | 統一（建議 4px 或 6px） |
| 顏色 | 純色，用 CSS 變數管理 |
| 動畫 | 短促（150–200ms），只做 `opacity` / `color` / `transform` |

### 建議的 CSS 變數

```css
:root {
  --ui-bg: rgba(20, 20, 24, 0.92);
  --ui-border: rgba(255, 255, 255, 0.12);
  --ui-text: rgba(255, 255, 255, 0.92);
  --ui-text-dim: rgba(255, 255, 255, 0.55);
  --ui-accent: #5B8C3E;
  --ui-radius: 6px;
  --ui-transition: 160ms ease;
}
```

### 圖示佔位策略

| 階段 | 做法 |
|---|---|
| 現在（無平面 UI 資源） | 用 emoji 當 placeholder，**僅供辨識** |
| 實裝時 | 替換為 SVG 或圖示集 |
| 最終設計 | 之後再定，可能與 emoji 語意不完全對應 |

## 待確認

- [x] 快捷欄位置（底部中央）？ **是，底部中央**
- [x] 調色盤要不要分頁（9 種以上時）？ **9 種用 `InventoryBar` 單排，不分頁**
- [x] 類別分頁用 `InventoryGrid` 還是自訂 HTML？ **`Card` + `mountChild(Button)`**
- [x] 準心樣式？ **Minecraft 反色十字**（`mix-blend-mode: difference`）
- [x] 快捷欄選中狀態？ **自己加 `selected` class**，先做功能，樣式 Demo 後調
- [x] Submit 快捷鍵？ **`Ctrl+Enter`**（`Enter` 太容易誤按）
- [x] 分頁位置與網格每行數量？ **頂部，每行 5 個**
- [ ] 設定面板要不要做？
- [ ] 進度條位置（右上角）？

## 風險

| 風險 | 緩解 |
|---|---|
| UI 遮住遊戲畫面 | 半透明 + 可隱藏（F1） |
| 快捷欄點擊與建造衝突 | 點 UI 時 `setInputEnabled(false)` 或檢查 `event.target` |
| 中文字型不一致 | 統一 `font-family` |