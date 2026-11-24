
i want to know about how it store in runtime, i mean when the game processing.

also u said 紅磚階梯面向西方且上下顛倒，在存檔中會被儲存為：minecraft:stone_stairs[facing=west,half=bottom,shape=straight]

and how about the stairs at 外角落 that connect to two other stairs at like north and east?

當前時間：2026-11-03 11:54

一、Runtime（運行時）記憶體中的儲存與處理機制
當遊戲正在執行（Runtime）時，Minecraft 絕對不可能去讀寫硬盤的字串（如 [facing=west,half=bottom]），因為字串解析和查找的效能極差。記憶體中的處理機制採用了以下設計：

全域整數 ID 對應表 (IdMapper / 註冊表快取)

遊戲啟動時，會把所有可能的「方塊 + 屬性組合」（例如所有方塊與其 facing、half、shape 的排列組合）全部生成出來，並為每一個獨一無二的組合分配一個全域整數 ID (int)。

在程式碼運行時，所有檢測與狀態判斷都直接透過這個 int 數值進行，達到極高速度。

區塊分段容器 (PalettedContainer<BlockState></blockstate>)

在記憶體中，每個 16x16x16 的 Chunk Section 都會維護一個記憶體容器。

該容器包含一個區域調色盤 (Local Palette)（將區塊內用到的 BlockState 物件對應到小整數索引）以及一個位元壓縮陣列 (long[])。

每個坐標
(x,y,z) 只需要佔用幾個 bit 的空間來存儲該整數索引。

不可變物件參考 (Immutable Objects / Flyweight 模式)

BlockState 本身是一個不可變（Immutable）物件。當遊戲需要取得某個方塊的狀態時，容器解包後直接回傳該 BlockState 物件的記憶體參考，開發者呼叫 state.get(StairsBlock.FACING) 時，底層只是一個簡單的陣列查詢或位元運算，完全沒有字串開銷。

二、外轉角（Outer Corner）階梯的狀態儲存方式
當你提到像紅磚階梯處於外角落（Outer Corner），並與其他面向北、東的階梯連接時，Minecraft 的 StairsBlock 會透過鄰居更新（Neighbor Update）機制動態計算它的 shape 屬性。

它的 shape 屬性共有 5 種：straight（直線）、inner_left、inner_right、outer_left、outer_right。

實際儲存狀態範例：
如果該階梯面向西方，且剛好處於向外凸出的角落（連接了北邊與東邊的階梯），其在運行時與存檔中的狀態會被計算並儲存為：

Java
minecraft:brick_stairs[facing=west,half=bottom,shape=outer_right]
(或者是 outer_left，這取決於轉角的旋轉方向與相對位置)

它是怎麼被算出來的？
鄰居偵測：當你放置或破壞周圍的階梯時，該方塊會觸發 getStateForNeighborUpdate。

形狀判定邏輯：遊戲會去檢查它左右兩側相鄰方塊是不是同類階梯、以及它們的 facing 朝向。如果發現相鄰的兩個階梯朝向互相垂直、且背對或面向特定夾角，就會自動將自己的 shape 從 straight 切換成 outer_left 或 outer_right。

渲染與碰撞箱同步改變：一旦 shape 變成 outer_right，該方塊的 VoxelShape（碰撞箱）與渲染模型就會自動變成帶有 L 型缺口的形狀，讓實體可以完美貼合轉角的物理邊界。
