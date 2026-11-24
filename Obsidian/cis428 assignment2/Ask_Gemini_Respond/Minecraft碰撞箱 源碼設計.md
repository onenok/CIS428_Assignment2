
在 Minecraft 的源碼設計中，這兩者的核心衝突在於：動態的空間查詢效率（實體） 與 極致的記憶體優化（方塊）。

1. 資料結構與記憶體儲存 (Data Structure)

實體 (Entity) 的處理：

• 獨立的 AABB 物件：每個實體常駐於記憶體，並擁有一個獨立的 AABB（Axis-Aligned Bounding Box）物件實例（源碼中由 Entity.getBoundingBox() 回傳），使用精準的 double 浮點數座標。
• 空間劃分（Spatial Partitioning）：因為實體會任意移動，遊戲將牠們註冊在以區塊為單位的 Section/Chunk 實體列表。當實體移動跨越邊界時，Tick 結束前必須從舊列表移除並註冊到新列表，以利周圍查詢。

方塊 (Block) 的處理：

• 享元模式（Flyweight Pattern）：世界中有數十億個方塊，如果每個方塊都 new 一個 AABB 物件，記憶體會瞬間崩潰。因此，方塊物件本身不儲存幾何實例，也不儲存座標。
• 按狀態共享（VoxelShape）：碰撞箱的形狀是寫在 Block 類別或 BlockState 裡面的靜態定義（通常是 net.minecraft.util.shape.VoxelShape，允許由多個長方體組合成複雜幾何，如樓梯）。
• 動態虛擬生成：當代碼需要某方塊的碰撞箱時，必須呼叫 blockState.getCollisionShape(world, blockPos, context)，傳入該方塊的 BlockPos（int 整數網格座標），臨時「虛擬」計算出一個基於該座標偏移植後的 AABB，用完即丟。

2. 碰撞偵測演算法 (Collision Detection Logic)

方塊永遠是被動的，實體才是主動的

在物理引擎中，方塊不具備「主動檢查有沒有撞到人」的邏輯。所有的碰撞計算，完全是由實體的移動觸發。當實體呼叫 Entity.move(MoverType, Vec3d velocity) 準備移動時，執行流程如下：
java
// 核心邏輯偽程式碼：實體移動時的方塊碰撞處理
Vec3d allowedMovement = entity.move(requestedVelocity) {
    AABB currentBox = this.getBoundingBox();
    // 1. 將目前的碰撞箱沿著速度方向擴展，劃定一個「預期移動邊界」
    AABB movementBox = currentBox.expandTowards(requestedVelocity);

    // 2. 根據這個範圍的座標，主動向世界獲取周邊所有方塊的 VoxelShape
    List<VoxelShape></voxelshape> blockCollisions = world.getBlockCollisions(this, movementBox);

    // 3. 透過這些方塊的形狀，修正實體的速度向量（防止穿牆、計算 Step Height 階梯拾級而上）
    Vec3d fixedVelocity = collideWithShapes(requestedVelocity, blockCollisions);

    // 4. 更新實體自身的 AABB 座標
    this.setBoundingBox(currentBox.offset(fixedVelocity));

    return fixedVelocity;
}
請謹慎使用程式碼。

實體與實體之間的交叉檢查 (O(N²))

當處理實體與實體（例如玩家撞到殭屍、村民推擠）時，使用的是每 tick 雙向輪詢：
• 遊戲會單獨呼叫 Entity.tick()，透過 world.getEntitiesByClass() 撈出該實體 AABB 周圍的其他實體。
• 接著雙向呼叫 entityA.pushWith(entityB)。
• 這種計算的複雜度是 O(N²)（N 為周圍實體數），這也是為什麼密集養雞場會造成伺服器 TPS 嚴重下降（Entity Lag），而堆積大量方塊卻完全不會。

3. API 設計與類別對比 (Class Overview)

比較維度	實體碰撞箱 (Entity Hitbox)	方塊碰撞箱 (Block Hitbox)
核心類別	net.minecraft.util.math.AABB	net.minecraft.util.shape.VoxelShape
幾何限制	只能是單一個簡單的長方體。	可以由多個長方體組合成複雜形狀（如樓梯、圍欄）。
生命週期	隨實體物件常駐在記憶體中，每一幀更新。	呼叫方法時依據 BlockPos 臨時計算，用完即丟。
座標系統	精準的浮點數（double：X, Y, Z）。	相對網格的整數座標（int）加上相對偏移植。
觸發時機	每個實體獨立的 tick() 執行。	由實體的移動函數主動拉取方塊數據。

總結 Coding 視角

• Entity 碰撞：代碼架構追求的是即時性與自由度，允許它每一幀座標都在變，代價是必須消耗 CPU 去動態維護實體列表與進行 O(N²) 的物理推擠。
• Block 碰撞：代碼架構追求的是記憶體極致優化，方塊本身不帶有空間幾何實例，只有在實體撞過來的那一刻，世界才會根據方塊的狀態與座標，臨時幻化出一個碰撞邊界來擋住實體。
