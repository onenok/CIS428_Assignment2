# Issue 追蹤

> 邊做邊改的工作模式。每個 issue 一個 `.md` 檔案。

## 為什麼用 issue

計劃文件（`Obsidian/` 內的節點與計劃）是**地圖**，不是施工圖。
真正開工時會遇到計劃想不到的問題 —— 這些問題記在這裡，不阻塞進度。

## 檔案命名

```
ISSUE-001 簡短標題.md
ISSUE-002 簡短標題.md
```

編號連續遞增，不重複使用。

## 分類

| 標籤 | 意思 | 處理時機 |
|---|---|---|
| `blocker` | 不解決就寫不下去 | **立刻處理** |
| `content` | 台詞、文案、數值 | 先放 placeholder，最後統一填 |
| `polish` | 音效、粒子、過渡效果 | Demo 完成後 |
| `question` | 需要使用者決定 | 累積幾個一起問 |

## 狀態

| 狀態 | 意思 |
|---|---|
| `open` | 未處理 |
| `in-progress` | 處理中 |
| `resolved` | 已解決 |
| `wontfix` | 決定不做（含「查證後不是問題」） |

## 模板

```markdown
# ISSUE-XXX 簡短標題

- **狀態**：open
- **分類**：blocker / content / polish / question
- **發現於**：Demo 階段 X / 檔案路徑
- **建立日期**：YYYY-MM-DD

## 問題

發生什麼事、預期什麼、實際什麼。

## 影響

不解決會怎樣。

## 選項

| 選項 | 說明 | 代價 |
|---|---|---|
| A | | |
| B | | |

## 決定

（待填）

## 相關

- 計劃節點：[[P2 建造系統]]
```

## 索引

| 編號 | 標題 | 分類 | 狀態 |
|---|---|---|---|
| [[ISSUE-001 核心架構待確認彙整]] | 核心架構待確認彙整 | question | ✅ resolved |
| [[ISSUE-004 建造 HUD 排版與 preset tabs 無反應]] | 建造 HUD 排版、無圖示、方案按鈕無反應 | polish | ✅ resolved |
| [[ISSUE-005 方塊座標與引擎座標差 0.5]] | 方塊座標與引擎座標差 0.5 | question | ⛔ wontfix（不是問題：與 Minecraft 一致） |
| [[ISSUE-006 開場下墜陷入地面]] | 開場玩家在 collider 出現前下墜、陷入地面 | polish | ✅ resolved（`snapToGround` + Y=12） |
| [[ISSUE-007 可編輯範圍與基巖高度與世界邊界]] | 可編輯範圍 off-by-one、基巖在 y=2、沒有世界邊界 | blocker | ✅ resolved |
| [[ISSUE-008 跳躍連跳與方形碰撞箱與奔跑]] | 跳躍只在邊緣觸發、碰撞箱是膠囊、沒有奔跑 | blocker | ✅ resolved |