
minecraft block 碰撞箱 system 實現方式源代碼

當前時間：2026-11-03 10:58

在 Minecraft (Java Edition / Fabric 或 Mojang對應版本) 中，方塊的碰撞箱（Collision Box）系統主要由 VoxelShape、AABB（AxisAlignedBB，即 Box）以及方塊自身的 getCollisionShape 方法共同構成。

以下是核心源代碼的實現邏輯與架構拆解：

1. 方塊層級的碰撞箱定義 (Block 類別)
   每個方塊透過覆寫 getCollisionShape 來決定它在世界中的實體碰撞範圍。預設情況下，完整方塊會回傳一個充滿整個格子的 VoxelShape。

Java
public class Block extends AbstractBlock implements ItemConvertible {

    // 決定實體無法穿過的碰撞箱
    @Override
    public VoxelShape getCollisionShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
        return state.getOutlineShape(world, pos, context);
    }

    // 決定方塊的外觀/選中框（通常與碰撞箱相同或相近）
    @Override
    public VoxelShape getOutlineShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
        return this.shape; // 該方塊快取的 VoxelShape
    }
}
2. 建立與組合形狀 (VoxelShape 與 VoxelShapes)
Minecraft 使用 VoxelShape 來支援非完整方塊（如半磚、樓梯、柵欄），它是由多個微型方塊（Voxel）或自定義 AABB 組合而成的精確幾何體。

Java
// 建立一個高 8 像素的半磚碰撞箱 (座標範圍 0~16)
protected static final VoxelShape HALF_SLAB_SHAPE = Block.createCuboidShape(0.0, 0.0, 0.0, 16.0, 8.0, 16.0);

// 複合形狀的組合方式 (聯集 Union)
public static final VoxelShape COMPLEX_SHAPE = VoxelShapes.union(
    Block.createCuboidShape(0.0, 0.0, 0.0, 16.0, 2.0, 16.0), // 底座
    Block.createCuboidShape(4.0, 2.0, 4.0, 12.0, 16.0, 12.0)  // 柱子
);
3. 世界層級的碰撞檢測與實體移動 (World 與 Entity)
當實體（玩家、生物、掉落物）在世界中移動時，物理引擎會調用 World 的碰撞檢測，找出實體當前位置周圍所有可能相交的方塊 VoxelShape，並透過軸向分離（Axis-by-Axis）來修正移動向量。

Java
// 實體移動與碰撞修正的核心邏輯簡化版 (Entity.move 實現原理)
public static Vec3d adjustMovementForCollisions(@Nullable Entity entity, Vec3d movement, Box entityBox, World world, List<VoxelShape></voxelshape> collisions) {
    double x = movement.x;
    double y = movement.y;
    double z = movement.z;

    if (entityBox == null) {
        return movement;
    }

    // 1. 依據 Y 軸修正移動量
    if (y != 0.0) {
        y = VoxelShapes.calculateMaxOffset(Direction.Axis.Y, entityBox, collisions, y);
        entityBox = entityBox.offset(0.0, y, 0.0);
    }

    // 2. 依據 X 軸修正移動量
    if (x != 0.0) {
        x = VoxelShapes.calculateMaxOffset(Direction.Axis.X, entityBox, collisions, x);
        entityBox = entityBox.offset(x, 0.0, 0.0);
    }

    // 3. 依據 Z 軸修正移動量
    if (z != 0.0) {
        z = VoxelShapes.calculateMaxOffset(Direction.Axis.Z, entityBox, collisions, z);
    }

    return new Vec3d(x, y, z);
}
4. 效能優化：快取與邊界盒快速篩選 (VoxelShapes.calculateMaxOffset)
為了避免每一格都進行精確的 Voxel 計算：

粗篩 (Broad Phase)：先利用實體當前位置擴大一個移動範圍的 AABB (Box)，只提取出與該 AABB 相交的周圍方塊。

精篩 (Narrow Phase)：使用 VoxelShapes.calculateMaxOffset 透過點陣/區間演算法計算實體 Box 與 VoxelShape 的最大無碰撞位移。

does the block's 碰撞箱 == where player can select it?

不是的。 方塊的碰撞箱（Collision Box）與玩家能夠選中/點擊它的範圍（Selection / Outline Box）在源代碼中是完全獨立的兩個概念，由不同的方法來控制。

雖然在絕大多數「完整方塊」（如石頭、泥土）中這兩者剛好重合，但在架構上它們是可以完全分開配置的。

1. 核心方法與職責分工
   在 Minecraft 的 AbstractBlock / Block 類別中，決定這兩種行為的是不同的方法：

物理碰撞 (getCollisionShape)：

職責：專門給物理引擎（如 Entity.move）使用，用來計算實體（玩家、生物）能不能穿過去、會不會被擋住。

選中與互動 (getOutlineShape / getRaycastShape)：

職責：專門給客戶端的視線射線檢測（Raycast）使用，決定玩家的準星對準哪裡、哪裡會浮現黑色的框線（Outline），以及能不能點擊互動或破壞。

2. 常見的「不相等」情境
   由於它們獨立運作，開發者（或原版遊戲）常故意讓它們不一樣：

有選中框但沒有碰撞箱（例如：花朵、草叢、火把、紅石粉、鐵軌）：

getCollisionShape 回傳 VoxelShapes.empty()（實體可以完全穿過去，不會被絆倒）。

getOutlineShape 回傳一個體積範圍（玩家依然可以將準星對準它、破壞它或收集它）。

自定義非對稱家具 / 模型（例如：細腳桌子、花盆、網狀裝飾）：

為了讓玩家操作手感更好，可以把 getOutlineShape 做得稍微大一點或寬鬆一點，避免玩家很難點到細小的物件；而物理碰撞箱則維持精準貼合模型。

3. 源代碼層面的體現
   在原版 Block 類別的預設實作中，它們剛好指向同一個形狀變數（這也是為什麼大部分時候看起來一樣）：

Java
public class Block extends AbstractBlock {

    // 1. 決定碰撞（預設等於 outlineShape）
    @Override
    public VoxelShape getCollisionShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
        return state.getOutlineShape(world, pos, context);
    }

    // 2. 決定選中框與射線檢測
    @Override
    public VoxelShape getOutlineShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
        return this.shape;
    }
}
如果你在寫 Mod（例如 Fabric / NeoForge），想讓某個方塊「看得見、點得到、但走得過去（穿透）」，只需單獨覆寫 getCollisionShape 讓它回傳空形狀即可：

Java
@Override
public VoxelShape getCollisionShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
    return VoxelShapes.empty(); // 實體可穿透，但保留 Outline 讓玩家能選中
}
so in General situation, 物理碰撞 = 選中框 or VoxelShapes.empty()?

當前時間：2026-11-03 11:09

在一般情況下（預設情況下），物理碰撞等於選中框（即 getOutlineShape）。

這可以從 Minecraft 源代碼的預設繼承關係中直接看到：

Java
@Override
public VoxelShape getCollisionShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
    return state.getOutlineShape(world, pos, context); // 預設直接回傳選中框
}
因此，如果你在寫 Mod 時建立一個新方塊，只要你沒有特別去覆寫 getCollisionShape，它的物理碰撞箱就會自動等於它的選中框。

實際應用時的兩種分流：
絕大多數「實體方塊」（石頭、木頭、磚塊、箱子等）

狀態：物理碰撞 = 選中框（沿用預設）。玩家摸得到、站得上去，也能點到它。

需要穿透的「裝飾/特殊方塊」（花草、藤蔓、紅石線、部分非完整裝飾）

狀態：物理碰撞 = VoxelShapes.empty()（被開發者手動覆寫）。

目的：外觀上有選中框讓玩家可以點擊、破壞或互動，但玩家走過去時不會被卡住（可穿透）。
