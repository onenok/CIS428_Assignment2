---
marp: true
theme: default
paginate: true
size: 16:9
---

<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700;900&family=JetBrains+Mono:wght@400;600&display=swap');

:root {
  --bg: #12161c;
  --fg: #cfd8e3;
  --head: #7cc4ff;
  --accent: #8ee06a;
  --muted: #7d8794;
  --line: #262d36;
}

section {
  background-color: var(--bg);
  color: var(--fg);
  font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
  font-size: 22px;
  line-height: 1.65;
  padding: 56px 64px 56px 76px;
  border-left: 6px solid var(--accent);
  box-sizing: border-box;
}

h1, h2 {
  font-weight: 900;
  color: var(--head);
  margin: 0 0 26px 0;
  letter-spacing: 0.01em;
}

h1 { font-size: 54px; line-height: 1.2; }
h2 { font-size: 36px; }

h3 { color: var(--fg); font-size: 25px; margin: 22px 0 8px 0; }

strong { color: var(--accent); font-weight: 700; }
em { color: var(--muted); font-style: normal; font-family: 'JetBrains Mono', monospace; font-size: 0.9em; }

ul, ol { padding-left: 26px; }
li { margin-bottom: 10px; }
li::marker { color: var(--accent); }

code {
  background: #1b2230;
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.86em;
}

pre {
  background: #1b2230;
  border-radius: 8px;
  padding: 16px 20px;
  font-size: 17px;
  line-height: 1.6;
}
pre code { background: none; padding: 0; color: var(--accent); }

blockquote {
  border-left: 3px solid var(--muted);
  margin: 14px 0 0 0;
  padding-left: 16px;
  color: var(--muted);
  font-size: 19px;
}

section.lead { display: flex; flex-direction: column; justify-content: center; }
section.lead h1 { margin-bottom: 14px; }
section.lead p { font-size: 24px; color: var(--muted); margin: 0; }

section.shot > * { max-width: 52%; }
section.shot h2 { font-size: 32px; }
section.shot li, section.shot p { font-size: 19px; line-height: 1.6; }
section.shot li { margin-bottom: 8px; }
</style>

<!-- _class: lead -->

![bg right:45% brightness:0.94](slides-img/loomkeeper.png)

# 織界者

Minecraft 的一個 what-if：如果世界生成是有人負責的

---

## Minecraft，但世界是誰生成的？

### 遊戲留下的空白

Minecraft 會生成地形，但**從沒說過是誰決定的**。

### 我們的 what-if

那個人存在 —— 而且只有一個。

- **織界者**獨自織著世界，沒有停過
- 你**早一格抵達**：這一塊還沒織完
- 他不扮演神。他是一個**過勞的同事**，把最後一塊交給你

> 這個設定不違背任何官方內容。這正是重點。

---

<!-- _class: shot -->

![bg right:45%](slides-img/loomkeeper.png)

## 1 · 抵達

你醒在一個從未生成完成的區塊裡。已經有人站在那裡。

- **沒有臉** —— 原本該是頭的位置只有一顆藍色核心
- 身體由他走過的生態域方塊拼成
- 下半身**仍在崩解**成散落的方塊
- 他不是魔王：他把工作交給你，然後回去繼續做

---

## 2 · 核心循環

刻意很短 —— 重點是這個機制，不是戰役。

```
抵達        看清楚這裡少了什麼
B           進入建造模式
右鍵 / 左鍵  放置 / 破壞            8 公尺距離
Z / Y       復原 / 重做
Ctrl+Enter  交出設計
            他轉向你、說話、這塊織完了
```

- **沒有配額、沒有計時、沒有失敗。** 想蓋多少就蓋多少
- **什麼都不放也能送出** —— 而且它有自己的一套回應

---

<!-- _class: shot -->

![bg right:45%](slides-img/build-ui.png)

## 3 · 建造

坑已經有牆、有地板、有採光。缺的東西由你決定。

- 右鍵放置、左鍵破壞，**最遠 8 公尺**
- **復原 / 重做** —— 一次手勢算一筆，所以復原 200 顆方塊是一步
- 快捷欄有九種方塊，加上六個範本設計
- 每次編輯只重建一次區塊，**不是每顆方塊重建一次**

---

<!-- _class: shot -->

![bg right:45%](slides-img/house-done.png)

## 4 · 完成

Ctrl + Enter，這一輪就結束了。

- 他**轉向你**，只說三句話
- 捲軸升起、畫面淡出、結束卡出現
- **你放了 667 顆方塊** —— 從區塊裡數出來的，不是寫死的
- 結束卡上署名角色與使用的工具鏈

---

## 為什麼用 Studio，而不是 GameMaker

GameMaker **連一顆方塊都放不下去**。

### GameMaker 的限制

- 它的建築語彙是**預先做好的物件**
- 你只能替換和搬移，無法放置單一方塊
- 最接近的做法，是排一排固定雕像讓你選

### Studio 做得到

- **`VoxelChunkNode.setVoxel()`** —— 可放置、可破壞，而且可復原
- 每個區塊自己的 **`BufferGeometry`**，一種方塊一次 draw call
- 自己的**復原堆疊**：一次編輯批次一筆，不是一顆方塊一筆
- 任何節點都能用 **`tickPrePhysics`** 寫每幀邏輯

> 我們用**完全的控制權**換來**完全的責任** —— 整個 voxel 層都是自己寫的。

---

## 技術細節（1/2）：voxel 層

**25 個區塊、每個 16×16 直柱、高度 y = 0–255。** 完全不用引擎的 mesh 節點：每個區塊只有一個 `BufferGeometry`，髒了才重建。

1. **面剔除** —— 只有鄰居是空氣時才產生面。整塊實心石頭只畫外殼
2. **`NeighborSampler`** —— 連兩個區塊共用的那個平面也剔除，否則兩邊會各畫一次同一道牆
3. **材質分組** —— 索引按 slot 分桶，所以是「一種方塊一次 draw call」，不是「一顆方塊一次」
4. **批次重建** —— 復原 200 顆方塊只重建一次

**第一人稱四步驟：** 眼睛高度 1.62 m、隱藏自己的身體、手臂掛在相機 pivot 上、近裁面 0.1。手臂要**保留深度測試** —— 關掉沒有用，因為地形是另一個 render pass 畫的。

---

## 技術細節（2/2）：流程，以及踩過的坑

**七個階段、一張明確的轉移表。** `GameFlow` 沒有 import 任何引擎程式碼，所以整段流程可以用測試跑完。

```
boot → intro → explore ⇄ building → submitting
                          accepted ↓      ↓ rejected
                        ending → ended   building
```

- `submit` 會走 **`evaluateSubmit()`**，所以空白的設計會被**拒絕** —— 這個拒絕正是「白卷彩蛋」能存在的原因
- 三個值得提的修正：第一人稱手臂被地形蓋掉（要保留深度測試，因為手臂比任何牆都近）；區塊邊界把同一個平面畫了兩次（要連鄰居一起剔除）；Ctrl 取消不了正在進行的上升（改成單一垂直意圖，最後按下的贏）

---

## 接下來

**已完成：** 區塊可以建造、破壞、復原、送出，而且結局會依你放下的東西反應。**949 個斷言 · 219 個 suite · 54 個檔案。**

**還沒做 —— 我們不假裝它做完了：**

- **Preset 套用** —— 六個設計、規劃器寫好也測過了；接進區塊是下一個 commit
- **God view** —— 除錯用的自由相機有，但正式的上而下建造相機沒有
- **貼圖** —— 程序生成的佔位圖
- **織界者沒有動畫** —— 匯出的檔案裡沒有任何動畫片段
- **沒有音效**

---

<!-- _class: lead -->

# 示範 & 提問
