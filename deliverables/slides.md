---
marp: true
theme: default
paginate: true
size: 16:9
---

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@400;600&display=swap');

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
  font-family: 'Inter', sans-serif;
  font-size: 22px;
  line-height: 1.55;
  padding: 56px 64px 56px 76px;
  border-left: 6px solid var(--accent);
  box-sizing: border-box;
}

h1, h2 {
  font-weight: 800;
  color: var(--head);
  margin: 0 0 26px 0;
  letter-spacing: -0.02em;
}

h1 { font-size: 56px; line-height: 1.15; }
h2 { font-size: 38px; }

h3 { color: var(--fg); font-size: 25px; margin: 22px 0 8px 0; }

strong { color: var(--accent); font-weight: 600; }
em { color: var(--muted); font-style: normal; font-family: 'JetBrains Mono', monospace; font-size: 0.9em; }

ul, ol { padding-left: 26px; }
li { margin-bottom: 10px; }
li::marker { color: var(--accent); }

/* Marp's `default` theme centres tables with `margin: auto`, which shrinks them to their
   content and fades the body text. Scope every table rule to `section` with a matching
   specificity so ours wins. */
section table {
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  font-size: 19px;
}
section table thead th {
  text-align: left;
  color: var(--head);
  border-bottom: 2px solid var(--line);
  padding: 8px 12px;
  font-weight: 700;
}
section table tbody td {
  color: var(--fg);
  border-bottom: 1px solid var(--line);
  padding: 8px 12px;
}

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
  font-size: 16px;
  line-height: 1.5;
}
pre code { background: none; padding: 0; color: var(--accent); }

blockquote {
  border-left: 3px solid var(--muted);
  margin: 14px 0 0 0;
  padding-left: 16px;
  color: var(--muted);
  font-size: 19px;
}

footer {
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  position: absolute;
  right: 64px;
  bottom: 26px;
}

section.lead { display: flex; flex-direction: column; justify-content: center; }
section.lead h1 { margin-bottom: 14px; }
section.lead p { font-size: 24px; color: var(--muted); margin: 0; }

/* Screenshot slides: the game image owns the right 45%, text keeps the dark left column.
   Constrain the children rather than padding the section — padding and Marp's own split
   background both shrink the content box, and together they squeezed the text to a third
   of the slide. 52% leaves a small gutter before the image starts at 55%. */
section.shot > * { max-width: 52%; }
section.shot h2 { font-size: 34px; }
section.shot li, section.shot p { font-size: 19px; line-height: 1.5; }
section.shot li { margin-bottom: 8px; }
</style>

<!-- _class: lead -->

![bg right:45% brightness:0.94](slides-img/loomkeeper.png)

# The Loomkeeper

A Minecraft what-if in The Sandbox Studio

<!--
講稿（20s）：
「Minecraft 一定會生成世界，但它從來沒說——是誰決定的。這個作品補上那段空白。」
-->

---

## Minecraft, but who generates it?

### The gap

Minecraft generates terrain. It never says **who decides**.

### The what-if

That someone exists — and there is only one of them.

- **The Loomkeeper** weaves worlds, alone, without end
- You arrive **one chunk early**: this one is not finished
- He does not play god. He is a **tired colleague** handing you the last piece

> Nothing in it contradicts the official setting. That is the point.

<!--
講稿（35s）：
「遊戲會生成地形，但沒說誰決定。我們補上：那個人存在，而且只有一個，他已經加班很久了。
　你比他早一格抵達，所以這塊還沒織完。他沒有扮演神，他只是把最後一塊交給你，然後回去工作。」
-->

---

<!-- _class: shot -->

![bg right:45%](slides-img/loomkeeper.png)

## 1 · Arrive

You wake inside a chunk that never finished generating. Somebody is already standing in it.

- **No face** — one blue core where a head should be
- Body assembled from the biomes he has walked through
- His lower half is **still dissolving** into loose blocks
- He is not a boss: he hands you the job and goes back to work

<!--
講稿（30s）：
「這是原創角色。沒有臉，只有一顆藍色核心；身體由他走過的生態域方塊組成；
　下半身還在崩解成漂浮碎塊。他不是魔王，他是把工作交給你然後回去加班的同事。」
-->

---

## 2 · The core loop

Short on purpose — the point is the mechanic, not a campaign.

```
arrive      look around: what is missing?
B           enter build mode
RMB / LMB   place / break            8 m reach
Z / Y       undo / redo
Ctrl+Enter  submit the design
            he turns, speaks, the chunk is finished
```

- **No quota, no timer, no failure.** Build as much or as little as you want.
- Submitting **nothing** is allowed — it gets its own answer.

<!--
講稿（35s）：
「核心循環刻意很短。抵達、看清楚少了什麼、按 B 建造、右鍵放左鍵拆、Z 復原 Y 重做、
　Ctrl+Enter 送出。沒有配額、沒有計時、沒有失敗。什麼都不放也能送出，而且它有自己的回應。」
-->

---

<!-- _class: shot -->

![bg right:45%](slides-img/build-ui.png)

## 3 · Build

The pit is already walled, floored and lit. What is missing is yours to decide.

- Right click places, left click breaks, **8 m reach**
- **Undo / redo** — one entry per gesture, so a 200-block undo is one step
- Nine block types in the hotbar, plus six preset designs
- Every edit rebuilds the chunk **once**, not once per block

<!--
講稿（40s）：
「坑已經有牆有地板有採光，缺的是你自己決定的東西。右鍵放、左鍵拆、八公尺距離。
　復原重做一次手勢算一筆。九種方塊加上六個範本設計。每次編輯只重建一次 chunk。」
-->

---

<!-- _class: shot -->

![bg right:45%](slides-img/house-done.png)

## 4 · Finish

Ctrl + Enter, and the run ends.

- He **turns to face you** and says three lines
- The scroll rises, the screen fades, the end card arrives
- **You placed 667 blocks** — counted from the chunk, not scripted
- The card credits the character and the toolchain

<!--
講稿（40s）：
「按 Ctrl+Enter 交出設計。他會轉向你說三句話，然後捲軸升起、畫面淡出、結束卡出現。
　結束卡上的方塊數量是真的從 chunk 數出來的，不是寫死的。」
-->

---

## Why Studio, not GameMaker

GameMaker could not place **a single block**.

### GameMaker

- Its building vocabulary is **pre-authored objects**
- You swap and move them; you cannot place one voxel
- The closest result was a row of fixed statues to choose between

### In Studio

- **`VoxelChunkNode.setVoxel()`** — place and break single voxels, undoably
- Own **`BufferGeometry`** per chunk, one draw call per block type
- Own **undo stack**: one entry per edit batch, not per block
- **`tickPrePhysics`** on any node for frame logic

> We traded **total control** for **total responsibility** — and wrote the whole voxel layer ourselves.

<!--
講稿（45s）：
「第一版是 GameMaker。放棄只有一個原因：它沒辦法放下一顆方塊，它的建築語彙是預先做好的物件。
　Studio 有 Genesys.js 腳本層，方塊格變成遊戲自己的。代價是整個 voxel 層要自己寫。
　這是最大的決定：用完全的控制權換完全的責任。」
-->

---

## Under the hood (1/2) — the voxel layer

**25 chunks of 16×16 columns, y = 0–255.** No engine mesh nodes: one `BufferGeometry` per chunk, rebuilt only when dirty.

1. **Face culling** — a face exists only if its neighbour is air. Solid stone emits its shell and nothing else.
2. **`NeighborSampler`** — also culls the plane two chunks share, or both would draw the same wall twice.
3. **Material groups** — indices bucketed per slot, so one draw call per block type rather than per block.
4. **Dirty batching** — a 200-block undo is one rebuild.

**First person in four steps:** eye height 1.62 m, hide own body, separate arm on the camera pivot, near plane 0.1. The arm keeps the ordinary depth test — disabling it does nothing here, because the terrain is drawn by a separate pass.

<!--
講稿（40s）：
「二十五個 chunk，每個只有一個 BufferGeometry，髒了才重建。三件事讓它跑得動：
　面剔除、跨 chunk 的共用平面也剔、以及材質分組——一種方塊一次 draw call。
　第一人稱四步：眼高、隱藏本體、手臂獨立、近裁面。手臂要保留深度測試，
　因為地形是另一個 render pass，關掉沒用。」
-->

---

## Under the hood (2/2) — flow, and what broke

**Seven phases, one explicit transition table.** `GameFlow` imports no engine code, so a test drives the whole run.

```
boot → intro → explore ⇄ building → submitting
                          accepted ↓      ↓ rejected
                        ending → ended   building
```

- `submit` runs through **`evaluateSubmit()`**, so an empty design is **rejected** — that rejection is what makes the blank-submission answer possible.
- Three fixes worth naming: the first-person arm was painted over by terrain (keep the depth test — it is nearer than any wall); chunk borders drew the same plane twice (cull against the neighbour); Ctrl could not cancel an ascent (one vertical intent, last press wins).

<!--
講稿（35s）：
「流程是七個階段加一張轉移表，GameFlow 沒有任何引擎 import，所以整段流程可以用測試跑完。
　送出走 evaluateSubmit，空設計會被拒絕——這個拒絕正是白卷彩蛋存在的原因。
　三個修過的坑：手臂被地形蓋掉、chunk 邊界重複畫同一個平面、Ctrl 取消不了上升。」
-->

---

## What is next

**Shipped:** the chunk is buildable, breakable, undoable, submittable, and the ending reacts to what you placed. **949 assertions · 219 suites · 54 files.**

**Not shipped — and we are not pretending otherwise:**

- **Preset stamping** — six designs, planner written and tested; the wire into the chunk is the next commit
- **God view** — the debug free camera exists; a proper top-down build camera does not
- **Textures** are procedurally generated placeholders
- **The Loomkeeper has no animation** — the export ships no clips
- **No audio**

<!--
講稿（30s）：
「目前 949 個斷言、219 個 suite、54 個檔案，全綠。還沒做完的我直接講：
　preset 有六個設計，規劃器寫好也測過，但接進 chunk 是下一個 commit；
　God view 沒出貨；貼圖是佔位圖；角色沒有動畫；沒有音效。」
-->

---

<!-- _class: lead -->

# Demo & Q&A

<!--
講稿：直接進遊戲示範：走到缺口、按 B、放幾顆方塊、復原一次、Ctrl+Enter 送出、結束卡。
-->
