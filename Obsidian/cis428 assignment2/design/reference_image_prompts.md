# 織界者參考圖生成 Prompt

兩階段流程：**先做平滑版概念圖（定比例）→ 再轉 voxel 版（定格數）**。

工具：Copilot 內建生圖 / Gemini（Imagen）

---

## 為什麼要分兩階段

直接叫 AI 生 voxel 版，它會把「方塊感」畫得很漂亮，但**比例是亂的**——因為 AI 對 voxel 的理解是「像素風貼圖」，不是「真的用格子堆出來的立體」。

先做平滑版，你可以一眼看出「頭是不是太大」「手臂是不是太長」。比例對了，再轉 voxel 才有意義。

---

## 階段 1：平滑版概念設定圖

### 主 Prompt（四視圖）

複製以下整段：

```
Character concept art sheet for a video game character called "The Loomkeeper".

LAYOUT: A single image divided into 4 equal panels arranged in a 2x2 grid, showing the SAME character from 4 angles:
- Top-left: front view
- Top-right: side view (facing right)
- Bottom-left: back view
- Bottom-right: three-quarter view

CHARACTER DESCRIPTION:
A tall, gaunt humanoid figure, approximately 2.5 meters tall (noticeably taller than a normal human). The character is a personification of a world-generation system.

HEAD: No face at all. The head is a single glowing cube core, like a luminous block of light. No eyes, no mouth, no features. The glow is soft cyan-blue.

TORSO: The upper body is made of stacked cubic blocks of different materials, as if the character is wearing the world itself. Shoulders are rough grey stone blocks. The chest is a grass block (green top, brown dirt sides). The upper arms are sandstone (pale tan). The blocks fit together with visible seams, like masonry.

ARMS: Long and thin, disproportionately slender. The forearms taper into narrow, pointed shapes resembling weaving shuttles. Faint glowing particles drift from the fingertips.

LOWER BODY: From the waist down, the body DISINTEGRATES. The hips are solid, but below that the body breaks apart into 8 separate floating cubic fragments. The fragments drift apart with visible gaps between them, getting sparser toward the bottom. The lowest fragments are small and scattered. The character appears to be dissolving.

COLOR PALETTE: Cool and muted. Dominant dark grey stone, with a bright cyan-blue glow from the head core. Accents of grass green, sandstone tan, and deep slate. Overall feeling: cold, tired, ancient.

MOOD: Weary but not sinister. A tired worker, not a villain. Calm, quiet, dignified.

STYLE: Clean digital concept art, semi-realistic rendering, soft studio lighting, neutral light grey background. No text, no labels, no watermark, no UI elements.

IMPORTANT: Keep the character's proportions IDENTICAL across all 4 panels. The head core should be small relative to the body (about 1/10 of total height). The legs should NOT be visible as legs — only floating fragments.
```

### 如果 AI 畫錯，用這些修正 Prompt

| 問題 | 修正 Prompt（接在原 prompt 後面） |
|---|---|
| 畫出臉了 | `The head has absolutely NO face. It is a featureless glowing cube. No eyes, no mouth, no nose.` |
| 下半身畫成正常的腿 | `The lower body has NO legs. Below the waist there are only 8 separate floating cubes with empty space between them.` |
| 太矮、像普通人 | `The character is 2.5 meters tall — significantly taller and thinner than a normal human. Elongated proportions.` |
| 太可愛 / 太卡通 | `Not cute, not chibi. Serious, dignified, slightly melancholic tone. Realistic proportions.` |
| 太邪惡 / 太恐怖 | `Not a villain. Not scary. A tired, gentle worker. Calm and quiet.` |
| 四視圖比例不一致 | `All 4 views must show the exact same character with identical proportions and identical block arrangement.` |
| 背景太花 | `Plain flat light grey background. No environment, no scenery, no props.` |

### 建議生 3–4 張再挑

AI 生圖是抽獎。同一個 prompt 生 4 張，挑一張比例最合理的。**不要試著用 prompt 修到完美**——挑最接近的，剩下的用 VoxEdit 自己調。

---

## 階段 2：轉為 voxel 版

### 方法 A：用參考圖（Gemini 支援圖片輸入）

把階段 1 挑好的圖上傳，然後用這個 prompt：

```
Convert this character into a voxel art style, as if built from cubic blocks in a voxel editor like MagicaVoxel or VoxEdit.

SCALE — the character is exactly 80 voxels tall from the top of the head to the lowest fragment. Use this as the master measurement and derive everything else from it:

- Head core: 8 voxels tall, 8 wide, 8 deep (a small cube, about 1/10 of total height)
- Torso: 16 voxels tall, 12 wide, 8 deep
- Upper arm: 14 voxels long, 4 wide, 4 deep
- Forearm + hand: 10 voxels long, 4 wide, 4 deep, tapering to 2 voxels at the tip
- Waist: 4 voxels tall, 8 wide, 8 deep
- Lower body fragments: 8 separate clusters, each roughly 4-6 voxels across, spread over the bottom 16 voxels of the figure
- Gaps between fragments: 2-4 voxels of empty space, increasing toward the bottom

REQUIREMENTS:
- Every surface must be made of visible cubic voxels. No smooth curves anywhere.
- Keep the EXACT same silhouette, proportions, and pose as the reference image.
- Keep the same 4-view layout (front, side, back, three-quarter).
- The head core should be a small cluster of glowing voxels.
- The torso blocks should read as distinct voxel clusters with clear grid alignment.
- The lower body must be 8 separate floating voxel clusters with visible gaps.
- Use a limited color palette (8-12 colors maximum), flat shading per voxel face.
- Slight ambient occlusion between voxels to show depth.

STYLE: Clean voxel art, isometric-friendly, game asset reference sheet. Neutral grey background. No text, no labels.

CRITICAL: The voxel grid must be consistent across the whole character. All voxels must be the same size. The head must be small relative to the body — if the head looks large, the proportions are wrong.
```

> **注意**：AI 對「80 voxels tall」的理解通常不精確，它不會真的去數格子。這些數字的作用是**引導比例關係**（頭小、身體長、手臂細），不是要求它精準執行。真正的格數對照還是要在 VoxEdit 裡自己做。

### 方法 B：純文字（沒有參考圖功能時）

```
Voxel art character reference sheet for "The Loomkeeper".

LAYOUT: 4 panels in a 2x2 grid — front view, side view, back view, three-quarter view. Same character in all 4.

SCALE: The character is exactly 80 voxels tall from the top of the head to the lowest fragment. All other measurements derive from this.

CHARACTER: A tall gaunt humanoid made entirely of cubic voxels, about 2.5 meters tall.

HEAD: A small cube of glowing cyan voxels. No face. 8 voxels tall, 8 wide, 8 deep — about 1/10 of the total height.

TORSO: Stacked voxel blocks, 16 voxels tall, 12 wide, 8 deep — grey stone voxels at the shoulders, green-topped grass voxels at the chest, pale sandstone voxels on the upper arms. Visible grid seams between blocks.

ARMS: Thin, only 4 voxels thick. Upper arm 14 voxels long, forearm 10 voxels long tapering to 2 voxels at the tip. Small glowing voxel particles near the hands.

WAIST: 4 voxels tall, 8 wide, 8 deep. The transition between the solid torso and the fragments.

LOWER BODY: Below the waist, the body breaks into 8 SEPARATE floating voxel clusters, each roughly 4-6 voxels across, spread over the bottom 16 voxels of the figure. Gaps of 2-4 voxels of empty space between them, increasing toward the bottom. The clusters get smaller and sparser toward the bottom. No legs.

PALETTE: Dark grey, cyan glow, grass green, sandstone tan. Cool and muted.

STYLE: Clean voxel art, flat per-face shading, consistent voxel size across the entire character, neutral grey background, no text.

CRITICAL: All voxels must be the same size. The character must look like it was built in a voxel editor, not like a pixel-art drawing. The head must be small relative to the body — if the head looks large, the proportions are wrong.
```

> **注意**：AI 對「80 voxels tall」的理解通常不精確，它不會真的去數格子。這些數字的作用是**引導比例關係**（頭小、身體長、手臂細），不是要求它精準執行。真正的格數對照還是要在 VoxEdit 裡自己做。

---

## 階段 2 的替代方案：自己數格

如果 AI 生的 voxel 版比例還是不對（很常見），**不要繼續跟 AI 纏鬥**。改用這個做法：

1. 把階段 1 的平滑版圖開在旁邊
2. 在 VoxEdit 裡照著 `voxedit_modeling_guide.md` 的數字建模
3. 每做完一個部位，跟平滑版圖對照「形狀對不對」

**平滑版圖的價值在於「形狀對照」，不在於「格數對照」。** 格數用文件裡的數字，形狀用圖。

---

## 階段 3：部位拆分圖

### 為什麼需要拆分圖

建模時你是**一個部位一個部位做**的（先軀幹、再頭、再手臂）。整張四視圖縮在螢幕角落，細節根本看不清楚。

拆分圖讓你做某個部位時，能有一張**該部位的大圖**擺在旁邊對照。

### 重要前提：AI 不能真的「切開」圖片

AI 生圖**無法裁切既有圖片**。所謂「拆分」實際上是**照著描述重新生成該部位的特寫**。

這代表：

- 拆分圖的細節會跟原圖**不完全一致**（AI 會自己補細節）
- 但**風格與配色會一致**（因為 prompt 裡有指定）
- 用途是「看清楚這個部位大概長什麼樣」，不是「精準複製」

如果你要**精準的裁切**，那要用截圖工具自己切——見本節最後的說明。

---

### 拆分圖 1：頭部核心

```
Extreme close-up of a glowing cubic head core, voxel art style.

SUBJECT: A single cube made of glowing cyan-blue voxels, approximately 8 voxels tall, 8 wide, 8 deep. Completely featureless — no eyes, no mouth, no face of any kind. The cube emits a soft cyan glow that bleeds onto the surrounding surfaces.

DETAILS: The cube's edges are slightly irregular, made of individual voxels rather than a perfect smooth box. A few voxels on the surface are brighter than others, creating a subtle internal light pattern. Below the cube, a short neck of dark grey stone voxels connects it to the shoulders.

LIGHTING: The glow is the primary light source. It casts a cool cyan rim light on the stone neck below. Dark neutral background.

STYLE: Clean voxel art, flat per-face shading, consistent voxel size, no text, no labels.

CRITICAL: No facial features whatsoever. This is a light source, not a face.
```

### 拆分圖 2：軀幹

```
Close-up of a humanoid torso made of voxel blocks, voxel art style.

SUBJECT: A blocky torso approximately 16 voxels tall, 12 wide, 8 deep. It is assembled from distinct clusters of differently-textured voxels, as if the character is wearing the world itself.

MATERIAL ZONES:
- Shoulders: rough grey stone voxels, slightly darker, with visible cracks
- Chest: a grass block pattern — bright green voxels on top, brown dirt voxels below
- Lower torso: dark grey stone voxels, more uniform
- Upper arms (visible at the edges): pale tan sandstone voxels

DETAILS: Clear seams between the different material zones, like masonry. The voxel grid is visible across the whole surface. No smooth transitions — every material change is a hard voxel edge.

LIGHTING: Soft neutral studio lighting from the front. Slight ambient occlusion in the crevices between voxel clusters.

STYLE: Clean voxel art, flat per-face shading, consistent voxel size, neutral grey background, no text, no labels.
```

### 拆分圖 3：手臂

```
Close-up of a single humanoid arm made of voxel blocks, voxel art style.

SUBJECT: A long, thin arm, disproportionately slender compared to the torso. Upper arm is 14 voxels long and only 4 voxels thick. Forearm is 10 voxels long, tapering from 4 voxels down to 2 voxels at the tip.

MATERIALS: The upper arm is pale tan sandstone voxels. The forearm transitions to darker grey stone voxels. The hand area is dark, almost black, with a pointed, shuttle-like shape — like a weaving tool, not a human hand.

DETAILS: Small glowing cyan voxel particles drift from the tip of the arm, like sparks or dust. The arm is shown from the side so the taper is clearly visible. No fingers — the hand is a single pointed form.

LIGHTING: Soft neutral lighting. The cyan particles provide a small secondary glow at the tip.

STYLE: Clean voxel art, flat per-face shading, consistent voxel size, neutral grey background, no text, no labels.

CRITICAL: The arm must look thin and elongated. No human fingers. The hand is a pointed shuttle shape.
```

### 拆分圖 4：下半身碎片

```
Close-up of floating voxel fragments below a solid waist, voxel art style.

SUBJECT: 8 separate clusters of voxels floating in vertical arrangement below a solid blocky waist. Each cluster is roughly 4-6 voxels across. They are NOT connected to each other — there is clear empty space between them.

ARRANGEMENT: The clusters are spread over a vertical span of about 16 voxels. The gaps between them increase toward the bottom — the top clusters are close together, the bottom ones are far apart and smaller. The lowest fragments are tiny, only 1-2 voxels.

MATERIALS: The fragments are made of the same materials as the body — grey stone, brown dirt, a few with green grass tops. They look like pieces that broke off.

DETAILS: Faint cyan glow particles drift between the fragments. The background behind the fragments is dark, suggesting void or empty space.

LIGHTING: Soft lighting from above. The fragments cast small shadows on each other.

STYLE: Clean voxel art, flat per-face shading, consistent voxel size, dark neutral background, no text, no labels.

CRITICAL: Exactly 8 separate clusters. Clear gaps between all of them. No legs, no continuous body — only disconnected floating pieces.
```

---

## 階段 4：視角判讀（你現有的圖已足夠）

### 你現有的四視圖是完整的

原本我誤判了——仔細看之後，`Designer.png` 與 `Designer (1).png` 的四格**確實是四個不同視角**：

| 位置 | 視角 | 判讀依據 |
|---|---|---|
| **左上** | 正面 | 兩臂對稱、草方塊綠色在上緣 |
| **左下** | 背面 | 手臂位置左右相反、草方塊綠色邊緣在另一側 |
| **右上** | 側視圖 | 身體明顯變窄、只看到一隻手臂 |
| **右下** | 3-4 視角 | 同時看到正面與側面 |

**所以不需要重做四視圖。** 這兩張圖可以直接用於建模對照。

### 建模時各視角用來確認什麼

| 視角 | 用來確認 |
|---|---|
| 正面 | 寬度——軀幹 12 格寬、手臂 4 格粗、頭部 8 格寬 |
| **側面** | **深度——軀幹 8 格深、腰部 8 格深** |
| 背面 | 背部材質分佈、碎片排列是否對稱 |
| 3-4 視角 | 整體立體感、碎片的前後錯落 |

**側面是最關鍵的**，因為深度資訊只能從側面看出來。建模時把側面圖擺在旁邊，拉軀幹深度時對照。

### 從你的圖上讀到的實際比例

對照 `voxedit_modeling_guide.md` 的規格，你的圖大致符合：

| 部位 | 文件規格 | 圖上觀察 | 是否一致 |
|---|---|---|---|
| 頭部核心 | 8×8×8，約總高 1/10 | 明顯小於軀幹，約 1/10 | ✅ |
| 軀幹 | 16 高 × 12 寬 | 比頭部高約 2 倍 | ✅ |
| 手臂 | 4 格粗，細於軀幹 | 明顯細長 | ✅ |
| 腰部 | 4 高 × 8 寬 | 有明顯過渡段 | ✅ |
| 下半身碎片 | 8 個獨立叢集 | 數量大約 8–10 個 | ⚠️ 略多 |

**唯一要注意的是碎片數量**——圖上數起來可能超過 8 個。建模時以**文件寫的 8 個**為準，因為骨架綁定時每個碎片都要一個節點，太多會很麻煩。

---

## 替代方案：自己裁切

如果 AI 生的拆分圖細節不對，或你就是要**原圖的精準裁切**，用這個做法：

| 工具 | 做法 |
|---|---|
| **Windows 剪取工具** | `Win + Shift + S` → 框選要的部位 → 存檔 |
| **小畫家** | 開圖 → 選取 → 剪下 → 新檔貼上 → 存檔 |
| **PowerShell** | 見下方腳本 |

PowerShell 批次裁切（把四視圖切成四張）：

```powershell
Add-Type -AssemblyName System.Drawing

$src = "c:\Users\honok\Desktop\cis428\assignment2\images\Designer (1).png"
$img = [System.Drawing.Image]::FromFile($src)
$w = [int]($img.Width / 2)
$h = [int]($img.Height / 2)

$names = @("front", "side", "back", "threequarter")
$coords = @(@(0,0), @($w,0), @(0,$h), @($w,$h))

for ($i = 0; $i -lt 4; $i++) {
    $rect = New-Object System.Drawing.Rectangle($coords[$i][0], $coords[$i][1], $w, $h)
    $crop = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($crop)
    $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $out = "c:\Users\honok\Desktop\cis428\assignment2\images\loomkeeper_$($names[$i]).png"
    $crop.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $crop.Dispose()
    Write-Host "Saved: $out"
}
$img.Dispose()
```

這會把 `Designer (1).png` 切成四張。**但注意**：因為原圖四格都是正面，切出來的還是四個正面——裁切不會變出側面。

---

## 存檔位置

生好的圖存到 `assignment2/images/`，命名規則見該資料夾的 `README.md`。

建議命名：

| 檔案 | 內容 |
|---|---|
| `loomkeeper_part_head.png` | 頭部核心特寫 |
| `loomkeeper_part_torso.png` | 軀幹特寫 |
| `loomkeeper_part_arm.png` | 手臂特寫 |
| `loomkeeper_part_fragments.png` | 下半身碎片特寫 |
| `loomkeeper_turnaround_v2.png` | 修正版四視圖 |

---

## 最後提醒

**參考圖是輔助，不是聖旨。**

AI 生的圖一定會有地方不對——手指數量、碎片數量、比例。遇到衝突時：

1. **比例** → 以 `voxedit_modeling_guide.md` 的數字為準（80 voxel 總高）
2. **風格與氛圍** → 以參考圖為準
3. **細節** → 以你自己的判斷為準

建模時真正重要的是「一眼認得出這是織界者」——無臉的發光核心、生態域方塊身體、解體的下半身。這三個特徵有做出來，其他都可以妥協。