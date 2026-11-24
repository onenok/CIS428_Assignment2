# Design — 設計文件

> 引擎無關的設計文件。這些是「活的」文件，會隨討論更新。

## 檔案

| 檔案 | 說明 | 狀態 |
|---|---|---|
| [正式遊戲效果規格.md](正式遊戲效果規格.md) | 玩家體驗規格（13 節驗收條件） | 🟢 可直接沿用 |
| [character_design.md](character_design.md) | 織界者角色 IP 設計 | 🟢 可直接沿用 |
| [reference_image_prompts.md](reference_image_prompts.md) | 參考圖生成 prompt | 🟡 參考用 |
| [上帝視角相機設計.md](上帝視角相機設計.md) | 上帝視角（God View）編輯器相機設計與實作計劃 | 🟡 待實作 |
| [跳躍與飛行修正計劃.md](跳躍與飛行修正計劃.md) | 跳躍失效與 flyDown 不觸發的根因分析與修正 | 🟡 待實作 |
| [F3輸入監看計劃.md](F3輸入監看計劃.md) | F3 面板新增 Input 區塊（按住的鍵 / 滑鼠 / 最近動作） | 🟢 已實作 |

## 與計劃的關係

```
requirements/     ← 老師要什麼（不可變）
      ↓
design/           ← 玩家要體驗到什麼（引擎無關）
      ↓
plan/             ← 怎麼用 TSB Studio 實作（引擎相關）
      ↓
issues/           ← 實作時遇到的問題
```

## 相關

- [[README]]（requirements/）
- [[README]]（issues/）
- [[CIS428 計劃總覽]]