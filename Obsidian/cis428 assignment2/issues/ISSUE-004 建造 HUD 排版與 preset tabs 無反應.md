# ISSUE-004 建造 HUD 排版與 preset tabs 無反應

- **狀態**：resolved（2026-11-21）
- **分類**：polish
- **發現於**：P7 / P8 建造 HUD 接線後的實機驗收
- **建立日期**：2026-11-21

## 原始回報

> 建造模式的介面最頂的介面和左側的介面的最左上疊在一起
> 並且目前沒有圖像只有文字 不清楚是因為demo版本未弄還是什麼
> 但即使是demo版本沒有膿圖片那些文字也超出了他所在的元素並且沒有至中
> 可能可以考慮根據文字大小長度移至適應他所在的那個元素
> 最頂的設計方案列表的按鈕按下是有按鈕的效果的但是沒有反應沒有顯示任何東西

## 三個抱怨，三種不同的病

| # | 抱怨 | 真正的原因 | 處理 |
|---|---|---|---|
| 1 | 頂部面板與左側面板左上角重疊 | 左側是 `ObjectiveBanner`（P6 任務提示），P9 之前已整個撤除 | 隨 P6 撤除自動解決，無需改動 |
| 2 | 只有文字、溢出、未置中 | **專案完全沒有 CSS 檔** —— `hotbar-slot-label`、`preset-tab-row` 這些 class 從來沒有任何樣式規則 | 改為 inline style + 等角方塊圖示 |
| 3 | preset tabs 按了沒反應 | `PresetTabs.onChange()` **從未被註冊**；而且整個 preset 功能只有資料層，沒有 UI 出口 | 補設計按鈕列 + 接上 `onDesignSelected` |

第 2 點的根因值得單獨記下來：整個專案只有 `index.html` 裡 `*` / `html` / `body` / `#game-container` 的 reset，`src/ui/` 九個模組全部靠 inline style 或引擎 `customStyles`。所以任何「我在 class 上寫了樣式」的假設都是錯的 —— 那些 class 只是給測試和 `querySelector` 用的名字。

## 影響

- 熱鍵欄（hotbar）看不出每格是什麼方塊，只能讀 9px 的字，還會被 56px 的格子裁掉。
- 玩家以為 preset 功能壞掉，實際上是「按鈕有回饋、什麼都沒發生」，這比報錯更糟 —— 沒有錯誤訊息可以查。

## 決定

### 方案 B：preset 只接一半

Preset 有完整的資料層（`PresetLibrary` 六個設計、`planApplyPreset()` 純函式、`rotatePreset()`，全部有測試），但**遊戲裡沒有任何呼叫點**。要真正「蓋出設計」需要決定：放置位置怎麼選、要不要預覽、要不要吃方塊數量、失誤怎麼取消。這些是建造系統的第二輪設計，不該混進一個 UI 排版修復。

所以這一輪只做：

- tabs 切換 → 設計列換內容
- 點設計 → 高亮 + toast 說明 `stamping not implemented yet`
- **不真的蓋方塊**

`planApplyPreset()` 保持零呼叫點，等第二輪接。

### 已批准的草圖

`design/prototypes/ISSUE-004-建造HUD.svg`（四個區塊：全螢幕 HUD、tabs 兩態、hotbar 前後 2× 放大、圖示顏色來源）。確認時追加的三個決定：

| 項目 | 決定 |
|---|---|
| 溢出處理 | `overflow=scroll` —— 加左右箭頭翻頁，而不是縮小或換行 |
| 點擊回饋 | `click=highlight` —— 該鈕 primary 邊框 + toast |

## 修法（2026-11-21）

### 0. 排版：`position` 選項對 `InventoryBar` 永遠無效

這是原本「頂部面板與左側面板重疊」的真正原因，也是整個 issue 最難查的一段，值得完整記錄。

`BaseUIComponent.applyPositioning()` 只在兩個條件都成立時才寫入 anchor 樣式：

```js
if (this.requestedPosition !== position || this.placesItself(templateRoot)) return;
```

而 `placesItself()` 的實作是：

```js
if (style.position !== 'absolute' && style.position !== 'fixed') return false;
return [style.top, style.right, style.bottom, style.left]
    .some(offset => offset !== '' && offset !== 'auto');
```

`inventory-bar.css` 自己就對 `.ui-inventory-bar` 寫了 `position: absolute`（但沒有給 offset）。而 Chrome 對**已定位元素**的 `top`/`left`（未指定時）回報的是 **used px 值**（例如 `0px`），不是 `auto`。於是 `placesItself()` 看到「已定位 + 有 offset」→ 判定元件會自己定位 → **anchor 整段跳過**。

結果：`bottom-center` 這個 class 有加上去，inline 樣式卻一條都沒有，元件留在靜態位置（左上角），正好壓在 Presets 面板上。

`Card` 與 `Message` 之所以正常，只是因為它們的 CSS **沒有** `position` 規則，`placesItself()` 第一行就 return false。

**修法**：不使用引擎的 `position` 選項，直接把 `bottom-center` 的 anchor 樣式寫到 `.ui-inventory-bar` 元素本身（`HOTBAR_ANCHOR_STYLES`），並用 `margin: auto` 置中而非 `transform` —— 後者與格子的 hover transform 撞同一個屬性。

同一個漏洞還有第二個症狀：`[data-inventory-bar-slots]` 這個 wrapper **引擎完全沒有 CSS**，`display: block` 讓九個 slot 疊成一直列。已由 `HOTBAR_SLOT_ROW_STYLES` 設成 `flex` row。

### 1. `src/ui/blockIcon.ts`（新增）

圖示不另外做美術資產，而是**由 placeholder 貼圖的顏色表推導**：`faceMaterialsFor(blockId)` 取 top / side 的 material key，查 `PLACEHOLDER_SPECS.base`，再套等角明暗（頂 ×1.15、左 ×0.8、右 ×0.62，clamp 0–255），輸出三個 `<polygon>` 的 SVG。

好處是 hotbar 不可能與世界脫節 —— 改一個方塊的 base RGB，貼圖和圖示一起變。玻璃另外給 `opacity: 0.55`，否則會跟石頭長得一樣。

### 2. `src/ui/Hotbar.ts`

- `renderHotbarSlot()` 寫進 `.item-content`（引擎的內容容器），而不是 slot 本身；內容是 `flex column` + `overflow: hidden`，圖示 32×32、label 9px 單行 ellipsis。
- **順手修掉一個潛在 bug**：`clearHotbarSlot()` 原本 `slotElement.textContent = ''`，在真實 DOM 會把引擎自己的 `.ui-inventory-bar-cooldown` 和 `.ui-inventory-bar-hotkey`（格子序號）一起刪掉。現在只清 `.item-content`。
- **選中效果從來沒生效過**：`applySelection()` 用 `[data-slot-index]` 找格子，但引擎寫的是 `data-slot`（`InventoryBar.js:74`）。selector 永遠找不到元素，`selected` class 從未加上去。已改成 `HOTBAR_SLOT_SELECTOR = '.ui-inventory-bar-slot[data-slot]'`。
- 選中樣式只用 `outline` + `filter: brightness()`，**不碰 `background`** —— 格子底色來自引擎主題，覆蓋掉會把整條 hotbar 壓平。

### 3. `src/ui/PresetTabs.ts`

- tabs 下方新增設計列：左箭頭 ‹ ／ 可橫向捲動的 strip ／ 右箭頭 ›。
- 箭頭與 strip 是**純 DOM `button`**，不是 `ENGINE.Button`：需要 `overflow-x: auto` 與 `scrollLeft`，而引擎按鈕不暴露這些。
- 一顆設計按鈕兩行：名稱（ellipsis）+ `N blocks`。
- `select()` 切分類後 `renderDesigns()` 重建列，並清掉選取（設計不屬於新分類）。
- 新增 `onDesignSelected()`、`getActiveDesignId()`、`getVisibleDesigns()`、`selectDesign()`（再點同一個 = 取消）。
- 箭頭在 `scrollWidth <= clientWidth` 時隱藏；`clientWidth === 0`（尚未 layout）視為「未量測」而保持顯示。

### 4. `src/game/MyGameMode.ts`

`buildUi()` 之後註冊 `tabs.onDesignSelected()`，點設計時 `toast.show('{name} · {n} blocks · stamping not implemented yet')`。這一步是「按了有反應」的實際出口 —— 沒有它，前面的高亮仍然只是「按鈕有效果但沒反應」。

## 回歸測試

| 檔案 | 守住什麼 |
|---|---|
| `tests/ui/blockIcon.unit.ts`（新增） | 顏色由 base RGB 推導、三面不同、clamp、玻璃透明、SVG 三個 polygon |
| `tests/ui/hotbar.unit.ts` | 圖示在 label 之上、label ellipsis、**不往 slot 直接 append**、重繪不疊加、清除不動引擎子節點、selector 是 `data-slot` |
| `tests/ui/presetTabs.unit.ts` | All 列出全部設計、分類只列自己、strip 寬度確實小於全部設計（箭頭有意義）、選中樣式與預設不同 |
| `tests/integration/uiWiring.unit.ts` | `HOTBAR_ANCHOR_STYLES` 六條 anchor 樣式齊全、**不含 `transform`**、slots wrapper 是 flex row |

驗證：`tsc --noEmit` 0 錯、`verify` **868/868**（原基線 843）、`turbo:build` 通過，實機截圖確認 hotbar 在底部正中、Presets 在頂部正中。

## 排查過程（三次誤判，值得記住）

| 次 | 當時的結論 | 為何錯 |
|---|---|---|
| 1 | 左側面板是已刪除的 `ObjectiveBanner` | 停在那個假設上，沒看畫面就先下結論。**左邊那條其實就是 hotbar 的九個格子疊成直列** |
| 2 | `applyPositioning()` 因為 `requestedPosition !== position` 而跳過 | 傳了 `position` 之後仍然沒動 → 這個條件不是主因 |
| 3 | `setPosition()` 會清掉 anchor，改用直接寫 style | 方向對了，但當時寫在 **layout wrapper**（`.ui-layout`）上，而 CSS 定位的是內層 **`.ui-inventory-bar`** |

最終靠**使用者提供的 DOM** 一次定位：同一份 DOM 裡 `ui-card top-center` 有完整 inline 定位樣式、`ui-message bottom-right` 也有，唯獨 `ui-inventory-bar bottom-center` 只有 `--ui-slot-size` 兩條自訂屬性 —— 「class 有、樣式沒有」直接指向 `placesItself()`。

教訓：**先要 DOM，不要連猜三輪。** 引擎把實際樣式寫在 DOM 上，那是比原始碼推論更硬的證據。

## 仍未覆蓋

- preset 仍然**不會蓋方塊**（方案 B 的刻意範圍外）。接上時要決定放置錨點、預覽、方塊消耗與取消路徑。
- 引擎的 `.ui-inventory-bar-hotkey` 序號徽章仍蓋在格子右下角，與新的圖示視覺上偏擠；沒有樣式可調（引擎寫死 `textContent`），要改得覆寫 `updateDisplay()`。
- 準心「白色且太小」是另一個獨立問題，使用者只描述現況，未要求修。

## 相關

- 草圖：`design/prototypes/ISSUE-004-建造HUD.svg`
- `src/preset/PresetLibrary.ts`、`src/preset/applyPreset.ts`（第二輪才會接）
- [[流程接線實作計劃]] §6 P7 / §10


