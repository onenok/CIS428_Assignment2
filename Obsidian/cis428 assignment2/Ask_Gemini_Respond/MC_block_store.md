
after v1.13(?) 扁平化, how MC store block id or class?

當前時間：2026-11-03 11:21

自從 Minecraft 1.13 引入扁平化（The Flattening）之後，Mojang 徹底拋棄了長年使用的數字 ID（Numeric IDs，例如 1:0 代表石頭、35:14 代表紅羊毛），改為使用命名空間字串（Namespaced IDs）與 BlockState（方塊狀態）系統。

以下是 1.13 之後 Minecraft 如何在內存與硬盤中管理及儲存方塊 ID、類別與世界數據的核心機制：

1. 方塊身分識別：從數字 ID 轉為 Identifier (ResourceLocation)
   程式碼與世界中的識別方式：
   現在每個方塊在程式碼和存檔中都是透過一個唯一的命名空間 ID 來識別，例如 minecraft:stone、minecraft:oak_log。

類別（Class）與實例的對應：

遊戲啟動時，所有方塊都會被註冊到全域註冊表（Registries.BLOCK / BuiltInRegistries.BLOCK）中。

每種方塊依然對應一個 Java 類別（例如 StoneBlock、DoorBlock），但硬盤存檔中絕不會直接儲存 Java 類別名稱（因為跨平台或代碼混淆會出問題）。存檔只記錄字串 ID（如 minecraft:chest），遊戲再透過註冊表反查並實例化對應的行為。

2. 方塊狀態 (BlockState) 與屬性
   以往的數字 ID 需要靠 metadata（附加值 0~15）來分身（例如顏色、方向），這導致 ID 嚴重不夠用。扁平化後，狀態被拆解為獨立的屬性（Properties）：

範例：紅磚階梯面向西方且上下顛倒，在存檔中會被儲存為：
minecraft:stone_stairs[facing=west,half=bottom,shape=straight]

這讓方塊的變化不再受限於 16 種 metadata，理論上可以支援無限種狀態組合。

3. 世界存檔中是如何儲存的？（Palette 盤色機制）
   在世界存檔（.mca 區塊檔案中的 NBT 結構）裡，區塊（Chunk）的每一個 16x16x16 的分段（Section）採用了 PalettedContainer（調色盤容器） 來極度壓縮空間：

Palette（調色盤列表）：
記錄該區塊分段中實際出現過的所有方塊狀態清單。

例如：索引 0 是 minecraft:air，索引 1 是 minecraft:stone，索引 2 是 minecraft:oak_log[axis=y]。

BlockStates（壓縮長整型陣列 / Long Array）：
每個方塊不需要存佔空間的字串，只需要存一個指向調色盤的索引編號（例如用幾個 bit 來存）。整個分段的方塊位置會被緊密壓縮成一串 long[] 陣列。

這樣的設計不僅打破了舊版 4096 個 ID 的上限，還大幅減少了世界存檔的體積。
