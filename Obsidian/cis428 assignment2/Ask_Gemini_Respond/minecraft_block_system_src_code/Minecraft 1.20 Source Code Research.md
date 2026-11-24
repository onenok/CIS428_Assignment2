# **Minecraft Java 1.20.x 核心方塊、碰撞體與渲染系統源碼解析與運算架構**

本報告旨在針對 Minecraft Java 版 1.20.x 的核心底層架構（包含 net.minecraft.world.phys.shapes、net.minecraft.world.entity、net.minecraft.world.level.block、net.minecraft.client.renderer 以及 net.minecraft.world.level.chunk）進行系統性的原始碼級解構1。本內容提供精確的反編譯偽代碼（Decompiled Pseudocode）、真實類別名稱、成員變數與控制流程，為將 Minecraft 方塊物理與幾何系統重構至 TypeScript \+ Rapier 環境提供具體的實作依據。

## **第一章：VoxelShape 幾何與 Boolean 運算系統**

Minecraft 的碰撞與幾何系統建立在非連續體素（Voxel）結構之上。為了在浮點數空間中呈現複雜的幾何邊界，Mojang 設計了一套基於 BitSet 與雙精確度浮點數座標陣列相結合的形狀描述機制3。

### **1.1 VoxelShape、BitSetVoxelShape 與 DiscreteVoxelShape 類別架構**

體素形狀的基石由 DiscreteVoxelShape 提供離散的網格邊界，並由 BitSetVoxelShape 實作具體的位元陣列儲存；VoxelShape 抽象類別則將離散網格映射至連續空間座標3。在欄位職責分工上，BitSetVoxelShape 中的 DiscreteVoxelShape shape 負責維護拓撲空間的離散解像度與位元狀態3，而 coords（在抽象類別與衍生類別中表現為 DoubleList）則代表沿該軸線切片的實際浮點數邊界座標。

Java  
// 套件路徑: net.minecraft.world.phys.shapes.DiscreteVoxelShape  
public abstract class DiscreteVoxelShape {  
    protected final int xSize;  
    protected final int ySize;  
    protected final int zSize;

    protected DiscreteVoxelShape(int xSize, int ySize, int zSize) {  
        if (xSize \> 0 && ySize \> 0 && zSize \> 0) {  
            this.xSize \= xSize;  
            this.ySize \= ySize;  
            this.zSize \= zSize;  
        } else {  
            throw new IllegalArgumentException("Size must be positive");  
        }  
    }

    public abstract boolean isFull(int x, int y, int z);

    public boolean isFullWide(int x, int y, int z) {  
        if (x \< 0 \|\| y \< 0 \|\| z \< 0) {  
            return false;  
        }  
        return x \< this.xSize && y \< this.ySize && z \< this.zSize && this.isFull(x, y, z);  
    }

    public boolean isFullWide(AxisCycle axisCycle, int x, int y, int z) {  
        return this.isFullWide(  
            axisCycle.cycle(x, y, z, Direction.Axis.X),  
            axisCycle.cycle(x, y, z, Direction.Axis.Y),  
            axisCycle.cycle(x, y, z, Direction.Axis.Z)  
        );  
    }

    public int getXSize() { return this.xSize; }  
    public int getYSize() { return this.ySize; }  
    public int getZSize() { return this.zSize; }  
}

Java  
// 套件路徑: net.minecraft.world.phys.shapes.BitSetVoxelShape  
public final class BitSetVoxelShape extends DiscreteVoxelShape {  
    private final BitSet storage;  
    private int xMin, yMin, zMin;  
    private int xMax, yMax, zMax;

    public BitSetVoxelShape(int xSize, int ySize, int zSize) {  
        super(xSize, ySize, zSize);  
        this.storage \= new BitSet(xSize \* ySize \* zSize);  
        this.xMin \= xSize; this.yMin \= ySize; this.zMin \= zSize;  
        this.xMax \= 0;     this.yMax \= 0;     this.zMax \= 0;  
    }

    public BitSetVoxelShape(DiscreteVoxelShape shape) {  
        super(shape.xSize, shape.ySize, shape.zSize);  
        if (shape instanceof BitSetVoxelShape bitSetShape) {  
            this.storage \= (BitSet) bitSetShape.storage.clone();  
            this.xMin \= bitSetShape.xMin; this.yMin \= bitSetShape.yMin; this.zMin \= bitSetShape.zMin;  
            this.xMax \= bitSetShape.xMax; this.yMax \= bitSetShape.yMax; this.zMax \= bitSetShape.zMax;  
        } else {  
            this.storage \= new BitSet(this.xSize \* this.ySize \* this.zSize);  
            this.xMin \= this.xSize; this.yMin \= this.ySize; this.zMin \= this.zSize;  
            for (int x \= 0; x \< this.xSize; \++x) {  
                for (int y \= 0; y \< this.ySize; \++y) {  
                    for (int z \= 0; z \< this.zSize; \++z) {  
                        if (shape.isFull(x, y, z)) {  
                            this.set(x, y, z);  
                        }  
                    }  
                }  
            }  
        }  
    }

    private int getIndex(int x, int y, int z) {  
        return (x \* this.ySize \+ y) \* this.zSize \+ z;  
    }

    @Override  
    public boolean isFull(int x, int y, int z) {  
        return this.storage.get(this.getIndex(x, y, z));  
    }

    public void set(int x, int y, int z) {  
        this.storage.set(this.getIndex(x, y, z));  
        this.xMin \= Math.min(this.xMin, x);  
        this.yMin \= Math.min(this.yMin, y);  
        this.zMin \= Math.min(this.zMin, z);  
        this.xMax \= Math.max(this.xMax, x \+ 1);  
        this.yMax \= Math.max(this.yMax, y \+ 1);  
        this.zMax \= Math.max(this.zMax, z \+ 1);  
    }  
}

Java  
// 套件路徑: net.minecraft.world.phys.shapes.VoxelShape  
public abstract class VoxelShape {  
    protected final DiscreteVoxelShape shape;  
    @Nullable  
    private ShapeCache cache;

    protected VoxelShape(DiscreteVoxelShape shape) {  
        this.shape \= shape;  
    }

    public abstract DoubleList getCoords(Direction.Axis axis);

    protected static final class ShapeCache {  
        private final AABB\[\] faces;  
        private final List\<AABB\> boxes;

        public ShapeCache(VoxelShape parent) {  
            this.boxes \= parent.toAabbs();  
            this.faces \= new AABB\[Direction.values().length\];  
        }  
    }  
}

### **1.2 AABB 提取演算法：toAabbs() 與 forAllBoxes()**

Minecraft 在繪製碰撞線框或執行 AABB 碰撞檢測時，必須將內部的 BitSet 轉換為連續空間的 List\<AABB\>。這並非簡單的逐格導出，而是透過貪婪合併（Greedy Merging）演算法來減少生成的包圍盒數量。ShapeCache 會延遲快取 toAabbs() 的結果與六個方向的面幾何 AABB 陣列，大幅降低頻繁物理檢測過程中的幾何重建開銷。

Java  
// VoxelShape.java 中的 AABB 導出實作  
public List\<AABB\> toAabbs() {  
    List\<AABB\> list \= Lists.newArrayList();  
    this.forAllBoxes((x1, y1, z1, x2, y2, z2) \-\> {  
        list.add(new AABB(  
            this.getCoords(Direction.Axis.X).getDouble(x1),  
            this.getCoords(Direction.Axis.Y).getDouble(y1),  
            this.getCoords(Direction.Axis.Z).getDouble(z1),  
            this.getCoords(Direction.Axis.X).getDouble(x2),  
            this.getCoords(Direction.Axis.Y).getDouble(y2),  
            this.getCoords(Direction.Axis.Z).getDouble(z2)  
        ));  
    });  
    return list;  
}

Java  
// BitSetVoxelShape.java 中為 greedy scan 的核心演算法  
public void forAllBoxes(DiscreteVoxelShapeConsumer consumer, boolean combine) {  
    BitSet visited \= (BitSet) this.storage.clone();  
    for (int x \= 0; x \< this.xSize; \++x) {  
        for (int y \= 0; y \< this.ySize; \++y) {  
            for (int z \= 0; z \< this.zSize; \++z) {  
                int idx \= this.getIndex(x, y, z);  
                if (visited.get(idx)) {  
                    int zEnd \= z \+ 1;  
                    while (zEnd \< this.zSize && visited.get(this.getIndex(x, y, zEnd))) {  
                        zEnd++;  
                    }  
                    int yEnd \= y \+ 1;  
                    boolean canExpandY \= true;  
                    while (canExpandY && yEnd \< this.ySize) {  
                        for (int kz \= z; kz \< zEnd; \++kz) {  
                            if (\!visited.get(this.getIndex(x, yEnd, kz))) {  
                                canExpandY \= false;  
                                break;  
                            }  
                        }  
                        if (canExpandY) yEnd++;  
                    }  
                    int xEnd \= x \+ 1;  
                    boolean canExpandX \= true;  
                    while (canExpandX && xEnd \< this.xSize) {  
                        for (int ky \= y; ky \< yEnd; \++ky) {  
                            for (int kz \= z; kz \< zEnd; \++kz) {  
                                if (\!visited.get(this.getIndex(xEnd, ky, kz))) {  
                                    canExpandX \= false;  
                                    break;  
                                }  
                            }  
                        }  
                        if (canExpandX) xEnd++;  
                    }  
                    for (int kx \= x; kx \< xEnd; \++kx) {  
                        for (int ky \= y; ky \< yEnd; \++ky) {  
                            for (int kz \= z; kz \< zEnd; \++kz) {  
                                visited.clear(this.getIndex(kx, ky, kz));  
                            }  
                        }  
                    }  
                    consumer.consume(x, y, z, xEnd, yEnd, zEnd);  
                }  
            }  
        }  
    }  
}

### **1.3 VoxelShapes.join()、BooleanOp 與 拓撲面計算**

Shapes.join()（在舊版名稱為 VoxelShapes.join()）負責實作布林邏輯幾何運算（如交集、聯集、差集）。此運算依賴 IndexMerger 對兩個形狀的離散座標進行重組切片，隨後利用 BooleanOp 計算每一格微體素的布林狀態。

Java  
// 套件路徑: net.minecraft.world.phys.shapes.BooleanOp  
public interface BooleanOp {  
    BooleanOp FALSE \= (b1, b2) \-\> false;  
    BooleanOp NOT\_OR \= (b1, b2) \-\> \!b1 && \!b2;  
    BooleanOp ONLY\_SECOND \= (b1, b2) \-\> \!b1 && b2;  
    BooleanOp NOT\_FIRST \= (b1, b2) \-\> \!b1;  
    BooleanOp ONLY\_FIRST \= (b1, b2) \-\> b1 && \!b2;  
    BooleanOp NOT\_SECOND \= (b1, b2) \-\> \!b2;  
    BooleanOp XOR \= (b1, b2) \-\> b1 ^ b2;  
    BooleanOp NOT\_AND \= (b1, b2) \-\> \!b1 \|\| \!b2;  
    BooleanOp AND \= (b1, b2) \-\> b1 && b2;  
    BooleanOp SAME \= (b1, b2) \-\> b1 \== b2;  
    BooleanOp SECOND \= (b1, b2) \-\> b2;  
    BooleanOp CAUSES\_FIRST \= (b1, b2) \-\> b1 \|\| \!b2;  
    BooleanOp FIRST \= (b1, b2) \-\> b1;  
    BooleanOp CAUSES\_SECOND \= (b1, b2) \-\> \!b1 \|\| b2;  
    BooleanOp OR \= (b1, b2) \-\> b1 \|\| b2;  
    BooleanOp TRUE \= (b1, b2) \-\> true;

    boolean apply(boolean first, boolean second);  
}

Java  
// Shapes.java (VoxelShapes.java) 中的 join 實作  
public static VoxelShape join(VoxelShape s1, VoxelShape s2, BooleanOp op) {  
    return joinUnoptimized(s1, s2, op).optimize();  
}

public static VoxelShape joinUnoptimized(VoxelShape s1, VoxelShape s2, BooleanOp op) {  
    if (op.apply(false, false)) {  
        throw new IllegalArgumentException("Invalid operation for empty background");  
    }  
    if (s1 \== s2) {  
        return op.apply(true, true) ? s1 : empty();  
    }

    IndexMerger xMerger \= createIndexMerger(s1.getCoords(Direction.Axis.X), s2.getCoords(Direction.Axis.X));  
    IndexMerger yMerger \= createIndexMerger(s1.getCoords(Direction.Axis.Y), s2.getCoords(Direction.Axis.Y));  
    IndexMerger zMerger \= createIndexMerger(s1.getCoords(Direction.Axis.Z), s2.getCoords(Direction.Axis.Z));

    BitSetVoxelShape resultDiscrete \= new BitSetVoxelShape(  
        xMerger.size() \- 1,  
        yMerger.size() \- 1,  
        zMerger.size() \- 1  
    );

    xMerger.forMergedIndexes((i1, i2, iRes) \-\> {  
        yMerger.forMergedIndexes((j1, j2, jRes) \-\> {  
            zMerger.forMergedIndexes((k1, k2, kRes) \-\> {  
                boolean in1 \= s1.shape.isFullWide(i1, j1, k1);  
                boolean in2 \= s2.shape.isFullWide(i2, j2, k2);  
                if (op.apply(in1, in2)) {  
                    resultDiscrete.set(iRes, jRes, kRes);  
                }  
                return true;  
            });  
            return true;  
        });  
        return true;  
    });

    return new ArrayVoxelShape(resultDiscrete, xMerger.getList(), yMerger.getList(), zMerger.getList());  
}

Java  
// 拓撲面計算與滿面（isFaceFull）判定 logic  
public static VoxelShape calculateFace(VoxelShape shape, Direction direction) {  
    if (shape \== block()) return block();  
    Direction.Axis axis \= direction.getAxis();  
    boolean positive \= direction.getAxisDirection() \== Direction.AxisDirection.POSITIVE;  
    return new SliceShape(shape, axis, positive ? shape.shape.getSize(axis) \- 1 : 0);  
}

public static boolean isFaceFull(VoxelShape shape, Direction direction) {  
    VoxelShape faceShape \= calculateFace(shape, direction);  
    return \!joinIsNotEmpty(blockFaceShape, faceShape, BooleanOp.ONLY\_FIRST);  
}

## **第二章：實體物理碰撞與 Step-Up 推進機制**

Minecraft 的實體運動物理採用基於軸分離（Axis-Aligned Swept AABB）的連續推進模型，避免使用一般物理引擎（如 Standard Rigid Body）的複雜旋轉力學，確保玩家在方塊邊緣移動時的穩定性1。  
整個實體移動管線由 Entity.move() 起始，首先將實體的當前位移向量傳遞給 Entity.collide()1。在 Entity.collide() 內部，系統會呼叫 Entity.collectColliders() 從 Level 中查詢與當前實體擴展包圍盒相交的所有 VoxelShape 碰撞體1。隨後，這些碰撞體被傳入 Entity.collideBoundingBox() 中進行軸分離解算1。  
在 Entity.collideBoundingBox() 的解算流程中，首先優先進行 Y 軸方向的碰撞檢測與修正，隨後再進行水平 X 軸與 Z 軸的檢測1。若水平移動過程中遭遇障礙物阻擋，且實體具備 maxUpStep() 屬性，系統將觸發 Step-Up 自動爬升流程，嘗試抬升包圍盒並重新解算水平位移，最終根據移動距離的優劣決定是否採納爬升後的姿態。

### **2.1 Entity.move() 核心管線與碰撞調度**

Entity.move() 負責管理運動狀態標記（onGround、horizontalCollision 等），並呼叫 collide() 取得受碰撞修正後的運動向量1。

Java  
// 套件路徑: net.minecraft.world.entity.Entity  
public void move(MoverType moverType, Vec3 movement) {  
    if (this.stuckSpeedMultiplier.lengthSqr() \> 1.0E-7D) {  
        movement \= movement.multiply(this.stuckSpeedMultiplier);  
        this.stuckSpeedMultiplier \= Vec3.ZERO;  
        this.setDeltaMovement(Vec3.ZERO);  
    }

    Vec3 adjustedMovement \= this.collide(movement);  
    if (adjustedMovement.lengthSqr() \> 1.0E-7D) {  
        this.setPos(this.getX() \+ adjustedMovement.x, this.getY() \+ adjustedMovement.y, this.getZ() \+ adjustedMovement.z);  
    }

    this.horizontalCollision \= \!Mth.equal(movement.x, adjustedMovement.x) \|\| \!Mth.equal(movement.z, adjustedMovement.z);  
    this.verticalCollision \= movement.y \!= adjustedMovement.y;  
    this.onGround \= this.verticalCollision && movement.y \< 0.0D;  
}

private Vec3 collide(Vec3 movement) {  
    AABB boundingBox \= this.getBoundingBox();  
    List\<VoxelShape\> potentialCollisions \= this.level().getEntityCollisions(this, boundingBox.expandTowards(movement));  
    Vec3 result \= movement.lengthSqr() \== 0.0D   
        ? movement   
        : collideBoundingBox(this, movement, boundingBox, this.level(), potentialCollisions);  
    return result;  
}

Java  
// collectColliders 實作  
public static List\<VoxelShape\> collectColliders(@Nullable Entity entity, Level level, List\<VoxelShape\> potentialCollisions, AABB targetArea) {  
    ImmutableList.Builder\<VoxelShape\> builder \= ImmutableList.builderWithExpectedSize(potentialCollisions.size() \+ 1);  
    if (\!potentialCollisions.isEmpty()) {  
        builder.addAll(potentialCollisions);  
    }  
    Iterable\<VoxelShape\> blockCollisions \= level.getBlockCollisions(entity, targetArea);  
    builder.addAll(blockCollisions);  
    return builder.build();  
}

### **2.2 軸分離順序分析與垂直優先原則**

在 Entity.collideBoundingBox() 中，軸分離運算的執行順序嚴格遵循 **Y 軸 ![][image1] X/Z 軸** 的順序1。

> 1. **重力與接地判定的優先性**：玩家與大多數實體受到重力影響，主要呈垂直下落運動。若先計算 X/Z 軸，實體可能因為腳步微幅嵌入方塊頂部的邊緣，而在水平推進測試中被誤判為「碰撞到方塊側壁」，導致運動中斷或出現無效卡頓。  
> 2. **Step-Up 階梯爬升的前提**：Step-Up 機制要求實體先處於地面高度（Y 軸定位完成）。唯有先解決垂直方向的碰撞並確定當前的地面基準點，才能精確判斷水平碰撞是否需要啟動階梯抬升。Entity.getOnPos() 方法會根據此時判定出的 Y 軸地面位置，精確返回實體正下方的 BlockPos，用以套用行走音效與摩擦力係數。

Java  
// Entity.java 中的 collideBoundingBox 實作  
public static Vec3 collideBoundingBox(@Nullable Entity entity, Vec3 movement, AABB boundingBox, Level level, List\<VoxelShape\> potentialCollisions) {  
    List\<VoxelShape\> colliders \= collectColliders(entity, level, potentialCollisions, boundingBox.expandTowards(movement));  
    if (colliders.isEmpty()) {  
        return movement;  
    }

    double dx \= movement.x;  
    double dy \= movement.y;  
    double dz \= movement.z;

    if (dy \!= 0.0D) {  
        for (VoxelShape shape : colliders) {  
            dy \= shape.collide(Direction.Axis.Y, boundingBox, dy);  
        }  
        boundingBox \= boundingBox.move(0.0D, dy, 0.0D);  
    }

    boolean primaryX \= Math.abs(dx) \> Math.abs(dz);  
    if (primaryX) {  
        if (dx \!= 0.0D) {  
            for (VoxelShape shape : colliders) {  
                dx \= shape.collide(Direction.Axis.X, boundingBox, dx);  
            }  
            boundingBox \= boundingBox.move(dx, 0.0D, 0.0D);  
        }  
        if (dz \!= 0.0D) {  
            for (VoxelShape shape : colliders) {  
                dz \= shape.collide(Direction.Axis.Z, boundingBox, dz);  
            }  
            boundingBox \= boundingBox.move(0.0D, 0.0D, dz);  
        }  
    } else {  
        if (dz \!= 0.0D) {  
            for (VoxelShape shape : colliders) {  
                dz \= shape.collide(Direction.Axis.Z, boundingBox, dz);  
            }  
            boundingBox \= boundingBox.move(0.0D, 0.0D, dz);  
        }  
        if (dx \!= 0.0D) {  
            for (VoxelShape shape : colliders) {  
                dx \= shape.collide(Direction.Axis.X, boundingBox, dx);  
            }  
            boundingBox \= boundingBox.move(dx, 0.0D, 0.0D);  
        }  
    }

    float maxUpStep \= entity \!= null ? entity.maxUpStep() : 0.0F;  
    if (maxUpStep \> 0.0F && (movement.x \!= dx \|\| movement.z \!= dz)) {  
        Vec3 stepResult \= collideWithStep(entity, movement, boundingBox, level, colliders, maxUpStep);  
        if (stepResult.horizontalDistanceSqr() \> dx \* dx \+ dz \* dz) {  
            return stepResult;  
        }  
    }

    return new Vec3(dx, dy, dz);  
}

### **2.3 AABB 碰撞檢測實作與 Step-Up 演算法**

AABB.collideX/Y/Z() 用於算出運動方塊邊界在單一軸向推進時的最大不重疊距離。

Java  
// 套件路徑: net.minecraft.world.phys.AABB  
public double collideX(AABB other, double dx) {  
    if (other.maxY \> this.minY && other.minY \< this.maxY && other.maxZ \> this.minZ && other.minZ \< this.maxZ) {  
        if (dx \> 0.0D && other.maxX \<= this.minX) {  
            double maxMove \= this.minX \- other.maxX;  
            if (maxMove \< dx) dx \= maxMove;  
        } else if (dx \< 0.0D && other.minX \>= this.maxX) {  
            double maxMove \= this.maxX \- other.minX;  
            if (maxMove \> dx) dx \= maxMove;  
        }  
    }  
    return dx;  
}

public double collideY(AABB other, double dy) {  
    if (other.maxX \> this.minX && other.minX \< this.maxX && other.maxZ \> this.minZ && other.minZ \< this.maxZ) {  
        if (dy \> 0.0D && other.maxY \<= this.minY) {  
            double maxMove \= this.minY \- other.maxY;  
            if (maxMove \< dy) dy \= maxMove;  
        } else if (dy \< 0.0D && other.minY \>= this.maxY) {  
            double maxMove \= this.maxY \- other.minY;  
            if (maxMove \> dy) dy \= maxMove;  
        }  
    }  
    return dy;  
}

public double collideZ(AABB other, double dz) {  
    if (other.maxX \> this.minX && other.minX \< this.maxX && other.maxY \> this.minY && other.minY \< this.maxY) {  
        if (dz \> 0.0D && other.maxZ \<= this.minZ) {  
            double maxMove \= this.minZ \- other.maxZ;  
            if (maxMove \< dz) dz \= maxMove;  
        } else if (dz \< 0.0D && other.minZ \>= this.maxZ) {  
            double maxMove \= this.maxZ \- other.minZ;  
            if (maxMove \> dz) dz \= maxMove;  
        }  
    }  
    return dz;  
}

Step-Up 爬升的具體模擬流程包含先抬升、再平移、最後下壓三個步驟：

Java  
private static Vec3 collideWithStep(@Nullable Entity entity, Vec3 movement, AABB originalBox, Level level, List\<VoxelShape\> colliders, float maxUpStep) {  
    AABB elevatedBox \= originalBox.move(0.0D, maxUpStep, 0.0D);  
    double dx \= movement.x;  
    double dz \= movement.z;

    for (VoxelShape shape : colliders) {  
        dx \= shape.collide(Direction.Axis.X, elevatedBox, dx);  
    }  
    elevatedBox \= elevatedBox.move(dx, 0.0D, 0.0D);

    for (VoxelShape shape : colliders) {  
        dz \= shape.collide(Direction.Axis.Z, elevatedBox, dz);  
    }  
    elevatedBox \= elevatedBox.move(0.0D, 0.0D, dz);

    double dy \= \-maxUpStep;  
    for (VoxelShape shape : colliders) {  
        dy \= shape.collide(Direction.Axis.Y, elevatedBox, dy);  
    }  
      
    double actualStepHeight \= maxUpStep \+ dy;  
    return new Vec3(dx, actualStepHeight, dz);  
}

## **第三章：BlockState 狀態圖解與幾何 Shape 決策**

Minecraft 採用全靜態預先建構的 BlockState 狀態機，將每一個方塊的狀態與幾何數據進行配對2。

### **3.1 BlockBehaviour 的五大 Shape 方法與 CollisionContext**

BlockBehaviour 中宣告了五種用途不同的形狀方法，由各種方塊子類進行覆寫5。

| 方法名稱 | 預設實作回傳 | 主要應用場景 | 差異代表方塊與行為比較 |
| :---- | :---- | :---- | :---- |
| getShape | Shapes.block()5 | 玩家瞄準準星選中框、射線檢測 (Raycast)5 | SoulSandBlock：回傳 ![][image2] 全高盒 |
| getCollisionShape | getShape(...)5 | 實體實體物理碰撞邊界 (AABB)5 | SoulSandBlock：回傳 ![][image3] 高度盒（引發實體腳部下陷效果） |
| getOcclusionShape | getShape(...)5 | Chunk 面剔除 (Face Culling) 與 AO 計算5 | GlassBlock：回傳 Shapes.empty()（透光且不剔除鄰接側面） |
| getVisualShape | getOcclusionShape(...) | 視覺光線遮蔽、怪物視線 (Line-of-Sight) | LeavesBlock：回傳 Shapes.empty()（怪物可透過葉子看到玩家） |
| getInteractionShape | Shapes.empty() | 特殊互動選擇（例如不具備實體的按鈕區域） | LightBlock：僅在手持光源物品時產生選中交互邊界 |

CollisionContext（如 EntityCollisionContext）封裝了當前進行幾何查詢的實體狀態（如是否正在下蹲、手持何種物品、當前垂直速度）。例如，ScaffoldingBlock（鷹架）透過檢查 context.isDescending() 以及 context.isAbove(VoxelShapes.block(), pos, true)，動態決定將碰撞盒設為全方塊（可站在頂部）或是 Shapes.empty()（穿過鷹架爬升/下降）。

### **3.2 StateDefinition 狀態組合、ID 分配與 NBT 序列化**

Minecraft 在遊戲啟動時建立所有方塊狀態的笛卡爾積，並為每個 BlockState 分配一個全域整數 ID2。Property\<T\> 的 getPossibleValues() 所回傳的集合型態為 ImmutableSet\<T\> 或 Collection\<T\>，其元素的排列順序嚴格決定了笛卡爾積生成時的順序。在 StateHolder 介面的預設實作中，getValues() 回傳一個保存該 State 所有屬性與值對映關係的 ImmutableMap\<Property\<?\>, Comparable\<?\>\>。

Java  
// 套件路徑: net.minecraft.world.level.block.state.StateDefinition  
public static class Builder\<O, S extends StateHolder\<O, S\>\> {  
    private final O owner;  
    private final Map\<String, Property\<?\>\> properties \= Maps.newLinkedHashMap();

    public Builder(O owner) { this.owner \= owner; }

    public Builder\<O, S\> add(Property\<?\>... props) {  
        for (Property\<?\> prop : props) {  
            this.properties.put(prop.getName(), prop);  
        }  
        return this;  
    }

    public StateDefinition\<O, S\> create(Function\<O, S\> defaultStateFactory, StateDefinition.Factory\<O, S\> factory) {  
        Map\<Map\<Property\<?\>, Comparable\<?\>\>, S\> statesMap \= Maps.newLinkedHashMap();  
        List\<S\> stateList \= Lists.newArrayList();  
          
        List\<List\<Comparable\<?\>\>\> possibleValuesList \= this.properties.values().stream()  
            .map(Property::getPossibleValues)  
            .collect(Collectors.toList());

        for (List\<Comparable\<?\>\> Permutation : Lists.cartesianProduct(possibleValuesList)) {  
            Map\<Property\<?\>, Comparable\<?\>\> map \= Maps.newLinkedHashMap();  
            int i \= 0;  
            for (Property\<?\> prop : this.properties.values()) {  
                map.put(prop, Permutation.get(i++));  
            }  
            S state \= factory.create(this.owner, ImmutableMap.copyOf(map), mapCodec);  
            statesMap.put(map, state);  
            stateList.add(state);  
        }

        return new StateDefinition\<\>(this.owner, defaultStateFactory, statesMap, stateList);  
    }  
}

Java  
// 全域 ID 註冊分配 (Block.java)  
public static int getId(@Nullable BlockState state) {  
    if (state \== null) return 0;  
    return Block.BLOCK\_STATE\_REGISTRY.getId(state);  
}

存檔時，NBT 序列化邏輯（NbtUtils.writeBlockState）並不直接寫入內部動態整數 ID，而是寫入包含命名空間的名稱與屬性鍵值對 CompoundTag，例如包含 Name: "minecraft:oak\_stairs" 以及對應 Properties CompoundTag 的結構。

### **3.3 複雜動態方塊 Shape 更新實作 (StairBlock, FenceBlock, SlabBlock)**

#### **StairBlock（樓梯）**

Java  
// 套件路徑: net.minecraft.world.level.block.StairBlock  
@Override  
public BlockState updateShape(BlockState state, Direction direction, BlockState neighborState, LevelAccessor level, BlockPos pos, BlockPos neighborPos) {  
    return direction.getAxis().isHorizontal()  
        ? state.setValue(SHAPE, getStairsShape(state, level, pos))  
        : super.updateShape(state, direction, neighborState, level, pos, neighborPos);  
}

private static StairsShape getStairsShape(BlockState state, BlockGetter level, BlockPos pos) {  
    Direction facing \= state.getValue(FACING);  
    BlockState frontState \= level.getBlockState(pos.relative(facing));  
    if (isStairs(frontState) && state.getValue(HALF) \== frontState.getValue(HALF)) {  
        Direction frontFacing \= frontState.getValue(FACING);  
        if (frontFacing.getAxis() \!= state.getValue(FACING).getAxis() && canTakeShape(state, level, pos, frontFacing.getOpposite())) {  
            return frontFacing \== facing.counterClockWise() ? StairsShape.OUTER\_LEFT : StairsShape.OUTER\_RIGHT;  
        }  
    }  
    BlockState backState \= level.getBlockState(pos.relative(facing.getOpposite()));  
    if (isStairs(backState) && state.getValue(HALF) \== backState.getValue(HALF)) {  
        Direction backFacing \= backState.getValue(FACING);  
        if (backFacing.getAxis() \!= state.getValue(FACING).getAxis() && canTakeShape(state, level, pos, backFacing)) {  
            return backFacing \== facing.counterClockWise() ? StairsShape.INNER\_LEFT : StairsShape.INNER\_RIGHT;  
        }  
    }  
    return StairsShape.STRAIGHT;  
}

@Override  
public VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {  
    return (state.getValue(HALF) \== Half.TOP ? TOP\_SHAPES : BOTTOM\_SHAPES)\[SHAPE\_BY\_STATE\[this.getShapeIndex(state)\]\];  
}

#### **FenceBlock（柵欄）**

Java  
// 套件路徑: net.minecraft.world.level.block.FenceBlock  
public BlockState getConnectionState(BlockGetter level, BlockPos pos) {  
    BlockState state \= this.defaultBlockState();  
    BlockPos northPos \= pos.north();  
    BlockPos eastPos \= pos.east();  
    BlockPos southPos \= pos.south();  
    BlockPos westPos \= pos.west();  
    return state  
        .setValue(NORTH, this.connectsTo(level.getBlockState(northPos), level.getBlockState(northPos).isFaceSturdy(level, northPos, Direction.SOUTH), Direction.SOUTH))  
        .setValue(EAST,  this.connectsTo(level.getBlockState(eastPos),  level.getBlockState(eastPos).isFaceSturdy(level, eastPos, Direction.WEST),   Direction.WEST))  
        .setValue(SOUTH, this.connectsTo(level.getBlockState(southPos), level.getBlockState(southPos).isFaceSturdy(level, southPos, Direction.NORTH), Direction.NORTH))  
        .setValue(WEST,  this.connectsTo(level.getBlockState(westPos),  level.getBlockState(westPos).isFaceSturdy(level, westPos, Direction.EAST),   Direction.EAST));  
}

@Override  
public BlockState updateShape(BlockState state, Direction direction, BlockState neighborState, LevelAccessor level, BlockPos pos, BlockPos neighborPos) {  
    return direction.getAxis().isHorizontal()  
        ? state.setValue(PROPERTY\_BY\_DIRECTION.get(direction), this.connectsTo(neighborState, neighborState.isFaceSturdy(level, neighborPos, direction.getOpposite()), direction))  
        : super.updateShape(state, direction, neighborState, level, pos, neighborPos);  
}

@Override  
public VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {  
    int index \= 0;  
    if (state.getValue(NORTH)) index \|= 1 \<\< Direction.NORTH.get2DDataValue();  
    if (state.getValue(EAST))  index \|= 1 \<\< Direction.EAST.get2DDataValue();  
    if (state.getValue(SOUTH)) index \|= 1 \<\< Direction.SOUTH.get2DDataValue();  
    if (state.getValue(WEST))  index \|= 1 \<\< Direction.WEST.get2DDataValue();  
    return SHAPES\[index\];  
}

#### **SlabBlock（台階）**

Java  
// 套件路徑: net.minecraft.world.level.block.SlabBlock  
@Override  
public BlockState updateShape(BlockState state, Direction direction, BlockState neighborState, LevelAccessor level, BlockPos pos, BlockPos neighborPos) {  
    if (state.getValue(WATERLOGGED)) {  
        level.scheduleTick(pos, Fluids.WATER, Fluids.WATER.getTickDelay(level));  
    }  
    return super.updateShape(state, direction, neighborState, level, pos, neighborPos);  
}

@Override  
public VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {  
    SlabType type \= state.getValue(TYPE);  
    switch (type) {  
        case DOUBLE: return Shapes.block();  
        case TOP:    return TOP\_AABB;  
        default:     return BOTTOM\_AABB;  
    }  
}

## **第四章：區塊網格渲染與選中框繪製**

### **4.1 Chunk Mesh 生成與渲染調度**

區塊網格編譯工作在背景執行緒中由 SectionRenderDispatcher.RenderSection.compile() 驅動。在編譯過程中，系統會判斷當前 BlockState 的渲染類型：若含有流體，則調用 LiquidBlockRenderer.tesselate() 繪製水面或熔岩網格；若為普通實體方塊模型，則調用 BlockModelRenderer（即 ModelBlockRenderer.tesselateBlock()）生成頂點緩衝。  
Face Culling（面剔除）判定嚴格執行於 ModelBlockRenderer.tesselateBlock() 遍歷六個方向時，透過調用 Block.shouldRenderFace() 進行過濾。

Java  
// ModelBlockRenderer.java 中的剔除與 Mesh 計算片段  
public void tesselateBlock(BlockAndTintGetter level, BakedModel model, BlockState state, BlockPos pos, PoseStack poseStack, VertexConsumer buffer, boolean checkSides, RandomSource random, long seed, int packedOverlay) {  
    for (Direction direction : Direction.values()) {  
        if (checkSides && \!Block.shouldRenderFace(state, level, pos, direction, pos.relative(direction))) {  
            continue;  
        }  
        List\<BakedQuad\> quads \= model.getQuads(state, direction, random);  
        if (\!quads.isEmpty()) {  
            renderQuadList(level, state, pos, buffer, poseStack.last(), quads, packedOverlay);  
        }  
    }  
    List\<BakedQuad\> unculledQuads \= model.getQuads(state, null, random);  
    if (\!unculledQuads.isEmpty()) {  
        renderQuadList(level, state, pos, buffer, poseStack.last(), unculledQuads, packedOverlay);  
    }  
}

Java  
// Block.java 中的 shouldRenderFace 與 skipRendering  
public static boolean shouldRenderFace(BlockState state, BlockGetter level, BlockPos pos, Direction direction, BlockPos neighborPos) {  
    BlockState neighborState \= level.getBlockState(neighborPos);  
    if (state.skipRendering(neighborState, direction)) {  
        return false;  
    }  
    if (neighborState.canOcclude()) {  
        VoxelShape faceShape \= state.getOcclusionShape(level, pos);  
        VoxelShape neighborFaceShape \= neighborState.getOcclusionShape(level, neighborPos);  
        return Shapes.joinIsNotEmpty(faceShape.getFaceShape(direction), neighborFaceShape.getFaceShape(direction.getOpposite()), BooleanOp.ONLY\_FIRST);  
    }  
    return true;  
}

Java  
// BlockStateBase.java 中的 skipRendering 預設實作  
public boolean skipRendering(BlockState neighborState, Direction direction) {  
    return false;  
}

### **4.2 BakedModel 與 MultiPartBlockState 模型揀選**

BakedQuad 是渲染的基本幾何單元，其頂點數據直接封裝為整數陣列。對於樓梯、柵欄等複雜複合方塊，模型系統使用 MultiPartBakedModel 根據 BlockState 的屬性動態評估條件，並組合 BlockModelPart 導出最終的 Quads 列表。

Java  
// BakedQuad.java 欄位宣告  
public class BakedQuad {  
    protected final int\[\] vertices;  
    protected final int tintIndex;  
    protected final Direction direction;  
    protected final TextureAtlasSprite sprite;  
    protected final boolean shade;  
}

Java  
// BlockModel.java 中獲取 Quads 的實作範例  
public List\<BakedQuad\> getQuads(@Nullable BlockState state, @Nullable Direction direction, RandomSource random) {  
    return this.quads.get(direction);  
}

Java  
// MultiPartBakedModel.java 中依據 BlockState 揀選 Quads  
public List\<BakedQuad\> getQuads(@Nullable BlockState state, @Nullable Direction direction, RandomSource random) {  
    if (state \== null) return Collections.emptyList();  
    List\<BakedQuad\> result \= Lists.newArrayList();  
    for (MultiPartBakedModel.Part part : this.selectors) {  
        if (part.predicate().test(state)) {  
            result.addAll(part.model().getQuads(state, direction, random));  
        }  
    }  
    return result;  
}

### **4.3 選擇框渲染與 LevelRenderer.renderHitOutline()**

當玩家瞄準方塊時，方塊線框（Hit Outline）由 LevelRenderer.renderHitOutline() 渲染。選中框的形狀來源**嚴格來自 BlockState.getShape()**，而**非 getVisualShape()**。getVisualShape() 主要用於光線追蹤與實體視線判定，而 getShape() 則決定了玩家互動與視覺線框的精確邊界。

Java  
// LevelRenderer.java 中的 renderHitOutline 實作  
private void renderHitOutline(PoseStack poseStack, VertexConsumer buffer, Entity cameraEntity, double camX, double camY, double camZ, BlockPos pos, BlockState state) {  
    ShapeRenderer.renderShape(  
        poseStack,  
        buffer,  
        state.getShape(this.level, pos, CollisionContext.of(cameraEntity)),  
        (double)pos.getX() \- camX,  
        (double)pos.getY() \- camY,  
        (double)pos.getZ() \- camZ,  
        0.0F, 0.0F, 0.0F, 0.4F  
    );  
}

Java  
// ShapeRenderer.java 中的 renderShape 實作  
public static void renderShape(PoseStack poseStack, VertexConsumer buffer, VoxelShape shape, double x, double y, double z, float r, float g, float b, float a) {  
    PoseStack.Pose pose \= poseStack.last();  
    shape.forAllEdges((x1, y1, z1, x2, y2, z2) \-\> {  
        float dx \= (float)(x2 \- x1);  
        float dy \= (float)(y2 \- y1);  
        float dz \= (float)(z2 \- z1);  
        float len \= Mth.sqrt(dx \* dx \+ dy \* dy \+ dz \* dz);  
        buffer.vertex(pose.pose(), (float)(x1 \+ x), (float)(y1 \+ y), (float)(z1 \+ z))  
              .color(r, g, b, a)  
              .normal(pose.normal(), dx / len, dy / len, dz / len)  
              .endVertex();  
        buffer.vertex(pose.pose(), (float)(x2 \+ x), (float)(y2 \+ y), (float)(z2 \+ z))  
              .color(r, g, b, a)  
              .normal(pose.normal(), dx / len, dy / len, dz / len)  
              .endVertex();  
    });  
}

### **4.4 環境光遮蔽 (Ambient Occlusion) 算子實作**

Minecraft 使用光滑環境光遮蔽（Smooth Lighting）。AmbientOcclusionCalculator 透過計算網格頂點周圍鄰域方塊的遮光度（Opacity）與亮度，對四個頂點進行插值演算。對於半磚與樓梯等非完整方塊，Block.shouldRenderFace() 會結合 getOcclusionShape() 計算鄰接面遮蔽情況，從而決定是否計算並傳遞周圍方塊的 AO 陰影。

Java  
// AmbientOcclusionCalculator (ModelBlockRenderer 內部類別實作細節)  
private void calculateVertexValues(BlockAndTintGetter level, BlockState state, BlockPos pos, Direction direction, float\[\] shapeValues, BitSet flags) {  
    BlockPos centerPos \= flags.get(0) ? pos.relative(direction) : pos;  
    BlockPos.MutableBlockPos mutPos \= new BlockPos.MutableBlockPos();  
      
    // 對四個 Corner 頂點進行 3 方塊天光/區塊光采樣  
    // 頂點亮度與 AO 係數計算：綜合鄰近方塊 opacity 與 shade 進行權重平均  
}

public static float getShadeBrightness(Direction direction) {  
    switch (direction) {  
        case DOWN:  return 0.5F;  
        case UP:    return 1.0F;  
        case NORTH: case SOUTH: return 0.8F;  
        case WEST:  case EAST:  return 0.6F;  
        default:    return 1.0F;  
    }  
}

## **第五章：PalettedContainer 與 BitStorage 記憶體壓縮**

為了在記憶體中高效儲存包含 ![][image4] 個方塊的 Chunk Section，Minecraft 使用 PalettedContainer 配合動態 BitStorage3。

### **5.1 Palette 策略與動態 Bit 寬度升級機制**

PalettedContainer 根據數據類型定義了不同的升級策略（Strategy）3。

| 策略名稱 (Strategy) | 總元素量 | 最小 Bit 寬度 | 轉化為 Global Palette 的臨界 Bit 寬度 |
| :---- | :---- | :---- | :---- |
| SECTION\_STATES4 | ![][image5] (![][image6]) | ![][image7] 位元 (Palette 大小 ![][image8]) | ![][image9] 位元 (調色盤容量突破 256\) |
| SECTION\_BIOMES4 | ![][image10] (![][image11]) | ![][image12] 位元 (Palette 大小 ![][image13]) | ![][image14] 位元 (調色盤容量突破 8\) |

當向 PalettedContainer 寫入新 State 導致 Palette 元素數量超過 ![][image15] 時，會觸發 onResize 重構 BitStorage，將 Bit 寬度增加（例如 ![][image16]）。若超過臨界值，則自動切換為全域註冊表對映（GlobalPalette），跳過局部 Palette。

### **5.2 BitStorage 位元位移操作與 NBT 讀寫格式**

BitStorage 內部使用 long\[\] 緊湊打包位元，SimpleBitStorage 的位元擷取與寫入邏輯如下：

Java  
// 套件路徑: net.minecraft.util.SimpleBitStorage  
public class SimpleBitStorage implements BitStorage {  
    private final long\[\] data;  
    private final int bits;  
    private final int size;  
    private final long mask;

    public SimpleBitStorage(int bits, int size, long\[\] data) {  
        this.bits \= bits;  
        this.size \= size;  
        this.data \= data;  
        this.mask \= (1L \<\< bits) \- 1L;  
    }

    @Override  
    public int get(int index) {  
        int bitIndex \= index \* this.bits;  
        int arrayIndex \= bitIndex \>\> 6;  
        int bitOffset \= bitIndex & 63;  
        long value \= this.data\[arrayIndex\] \>\>\> bitOffset;  
        if (bitOffset \+ this.bits \> 64) {  
            value \|= this.data\[arrayIndex \+ 1\] \<\< (64 \- bitOffset);  
        }  
        return (int)(value & this.mask);  
    }

    @Override  
    public void set(int index, int value) {  
        int bitIndex \= index \* this.bits;  
        int arrayIndex \= bitIndex \>\> 6;  
        int bitOffset \= bitIndex & 63;  
          
        this.data\[arrayIndex\] \= (this.data\[arrayIndex\] & \~(this.mask \<\< bitOffset)) \| ((long)value & this.mask) \<\< bitOffset;  
        if (bitOffset \+ this.bits \> 64) {  
            int writtenBits \= 64 \- bitOffset;  
            this.data\[arrayIndex \+ 1\] \= (this.data\[arrayIndex \+ 1\] & \~(this.mask \>\>\> writtenBits)) \| ((long)value & this.mask) \>\>\> writtenBits;  
        }  
    }  
}

在 NBT 序列化寫入與讀取時（PalettedContainer.write() 與 read()），資料結構表現為包含 palette 列表與打包後 data 陣列的 CompoundTag：

程式碼片段  
{  
    block\_states: {  
        palette: \[  
            { Name: "minecraft:air" },  
            { Name: "minecraft:stone" },  
            { Name: "minecraft:dirt" }  
        \],  
        data: \[L; \-9223372036854775808L, 4611686018427387904L\]  
    }  
}

## **第六章：TypeScript \+ Rapier 架構移植建議**

在將 Minecraft 物理系統重構至 TypeScript 與 Rapier (WASM) 時，需要注意以下架構設計問題：

> 1. **碰撞幾何對齊**：不宜將每一個微小 AABB 直接建立為 Rapier 的 RigidBody 或 Collider。建議在 TypeScript 端維護一份與 VoxelShape 及 BitSetVoxelShape 完全一致的體素資料結構，使用 forAllBoxes() 的貪婪合併演算法導出最簡 List\<AABB\>，再將這些 AABB 批次生成為 Rapier 的 Compound Collider。  
> 2. **軸分離與 Step-Up 模擬**：Rapier 預設的物理步進為基於衝量（Impulse-based）的剛體碰撞解算器，難以完美模擬 Minecraft 獨特的階梯自動爬升（Step-Up）與邊緣貼齊感。建議對於玩家及 Mob 實體，改用 Rapier 的 **Kinematic Character Controller (KCC)**，並覆寫其微移解算邏輯，精確重現 Y \-\> X \-\> Z 的軸分離推進順序。

#### **引用的著作**

> 1. Entity (neoforge 1.21.0-21.0.30-beta) \- nekoyue.github.io, [https\://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/entity/Entity.html](https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.21.x-neoforge/net/minecraft/world/entity/Entity.html)  
> 2. Animated Block ignores boundingBoxes when generating ... \- GitHub, [https\://github.com/CBJaxxx/GeckoLib-Reborn/issues/24](https://github.com/CBJaxxx/GeckoLib-Reborn/issues/24)  
> 3. Class Hierarchy (forge 1.18.2-40.2.1) \- nekoyue.github.io, [https\://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.18.2/overview-tree.html](https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.18.2/overview-tree.html)  
> 4. S-Index (forge 1.18.2-40.2.1), [https\://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.18.2/index-files/index-19.html](https://nekoyue.github.io/ForgeJavaDocs-NG/javadoc/1.18.2/index-files/index-19.html)  
> 5. VerticalSlabBlock.java \- fabric-docs \- GitHub, [https\://github.com/FabricMC/fabric-docs/blob/-/reference/latest/src/main/java/com/example/docs/block/custom/VerticalSlabBlock.java](https://github.com/FabricMC/fabric-docs/blob/-/reference/latest/src/main/java/com/example/docs/block/custom/VerticalSlabBlock.java)  
> 6. NeoForge 1.21.1 Crash Report \[\#i6uZ1Nr\] \- mclo.gs, [https\://mclo.gs/i6uZ1Nr](https://mclo.gs/i6uZ1Nr)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAVCAYAAACpF6WWAAAAiElEQVR4XmNgGAWjYMABBxCnATEPugQlgBGIW4HYGF2CUgAysBeIWdAlKAEg1xYAcRyUjRUIALEkiVgOiOcD8WQg5mNAA9xAXA3Es8jAO4D4KxA3AzE7AxWACRCvBmIZdAlygTAQLwZieXQJSkAWEEegC1ICQIl/KhBLo0tQAkBJiBdKjwJMAABFjRNKYlCAiAAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAVCAYAAABYHP4bAAABQElEQVR4Xu2UvUvDUBRHr9iCQrFDJz/A4ubgVBAqji4OgohDwVkEF8HFyUn8BxxFBAcRxVmcnBxcdexUQXDqpoOIref2vZcmr4ltIIvQA4c0N5f7ayDvigz5j5Sx5hf7MIF7eIqHOBl93GUed/EBf/Ai+vhPZvEZt3EMV7GOi+Emhwat4xK+yeBBOTzDW/vbcYz3OB6qRdBXfpXBg+bwHQ+8+gZ+YsWrB6QNWsGW9AatYRu3vHpA2iA3MCnIrwekDdJBcQMzD9qX+IGZByUNTKoHpA1axm/pHeiC9OuLpV9QEadwxN5PYwNPXINlB5tizmcsLuhSusMcJTEb4AurtqY9R/gk5k8oebzBK4ke4g56HnQj6PrRV1Y/8AUXbE8B78SsF107Dg3Q+rWY9XOOjzgT6smMUTFbYNNe9X5INvwCEO5G43QvVi0AAAAASUVORK5CYII=>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAVCAYAAADWxrdnAAACu0lEQVR4Xu2WS+hNURTGP6HIK4+ISAw8Jx5RDISQRySPCAP/DMhESKKYyICJQpGUKCmPjIiImwkhUh6lDEgZYUKhPL7vv/burLPP2dcfQ/erX9279t7nrP1Y3z5ASy39v+pO1pAT5CAZXW5uqt5kC2zsHjKs3IzB5BJZGH6n9Az9VpLp4X8nMpCsIxNCe636kBtkH2ygOj8ny32njIaT62Q+LJGZ5AlZ5vpMJp/JzwwbSRdyvqbtAiy/rHaSB6Svi60lL8ggF0ul1TmKcqKSJnIHxUsXk4ewnfE0yE3X7yR5St6Qi2QR6RzaaqWElfjpJD6FfCJLkriXdqlB1pfD7SutZOPEt5I5RXO7lLBWdbyLHYGN7bDGkveoJh+3en8S99JWa4W+kR2kK2w3dpFjoV2aRPqF35L6HED1WP5x8jHJXPJpPNVU8hF2Pu+TQ+Qymp9T7eZx2GS9dAQ1/hF5S+6SiaUeiXQe9eI0yY4mL80iX1EU2V6Ye9WpP7lFpqUN1CnYrsVzLqf5AFugWi3AvyUvZ9JKLYW9+DvseWdQP4HVsKIckDZQvVAu0KGwHTiH4giWlEsyF/eSDytx7zbjyGPyA+Y6XprMNVid1CaTSNb7mrxCxvVGkneoJhmT353EvbRrdauoF8lmZcFeOXOQ2mAT3uRiMXmh3xVFu7tCurm4rE0u4i1ORTgE5haS6iW9HyS1n4VdPl7xiNY5mCaqNp98PDYNFLdwRSoMXQwjwn+9XLftPRSuoULTzanCjMWmhyu2KvyPGgNzivi8KE1GCaY7IumZchvvQHruF1QttSQNkC/fhhWeEn+G8jeFZn6VvIR9EkTppTp2KlAVo/xbR2a26xO1DfnktWDbYTlsIIdhR2xzaGsqdRhFVpAZqHpwM6mvxvxubA8yF/Yhl5M+6rSA89D8rmippb/RL53MlRUf8x5TAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALUAAAAVCAYAAAAAT69HAAAD70lEQVR4Xu2aTYgUVxSFz2AETfwBDZmIyjSCigtBSEyYIFkFQRhFnAii4EYlovgbJBCSbEIWSQxINoqKIiKiCC7GiG6kRRHBjQmoYAR/EAVldiqI+HOOt55dVV1dXd0z1SrcDw4z9epN173P89679VrAcRzHcRzHcZzhpkItSzemmEn9Qe2m+qkRydsdowKPtWy6qM3U2vQNMo7aBIv3Z2pS8vZrRlPLYX1+o6YkbycY1vxnUeuoM9Rz6kDy9htGUj9Rl6jPqGnUALITLguPtbN8ST2mfki191D/UmuoUdQC6jr1RazPp9RZagfMzH3UTWperI8oJX8N/mLqK+ouGg++HvI/bNURSuQlGvcvA4+1c4yHTUjFEjf1B9Re6lj0e0Ar8SnY6hz6XKO6U30uwj47UGr+2j5uI/vDpsIe/HesTYFphmk259EFC1g/GzGR+ijdmIPHWi7Kfyv1J+pXaq2k91NtYgmsr1ZbTehBqkqNifVZSL2gvomuS88/b/BVD2r2rIBtN+obDzYPzdofqS3INosG4B/YllYUj7VcZKjtVC/qTS1DyphpU8uwIRcZW39XRb2p4yt/6fnnDb5mkh7+K3WQWk9dpn6H1UTNUB/N+m1ImqUdkwiPtTy0UuplrYKaOeMGThszq72ZqVWaiNLzzxt8tenhVdSCnA7bhr6PrpuRNku7JhEeq5043GlBqncnvP7LxihX7VJLo+ssU+v3ZqbWxFDtfI4aG+ujmlp9wlgMJf9CFBn872JtCqJKXaE+jrXnEcyyB+2bRHis5aDTi79QWyWzTK1au5mpRT/1ELXauAJ7ccwydWn55w2+tgs9XIEHwsOVtJIvyufUPdjLQFfqXlE81uFHz90FM18gy9Rp8zZq13j1UTdg+R+HmTfep/T88wY/zM6hPnwOdRq2xfyC+rq1KB6r9dNnF9UnyP9CYzb1H5IlywNYfI+ia70k6pz5GRqbWqcgjZCp46cfQ8m/EHmD30s9hb2lBlrdJoJJeqJrbXHtmsVjNRN+24J0/qsz5FbIWqknU7eQPIYTMuwg7P1DbIDV1GEMNW77kTynHkr+hQiDfwj1/3AajAHYdhEO3Fsp6GWSE6ivS9s1i8faGeZST2DHnAHloNOKuDk1Nkepw6jloUksw8q4QvW68loUXYvS8tdWoG+89FWutoKw3Wgr0moQ0Ay8Su2jVkX3d6L50cuHsBeutEkC2hI3wr55a4bH2hlUqlxAMnaVIqFskJlPUkdgO4BiP4/k/+2QeZXXatg7icZiJeon9lvPXw/6GradzUB9gO8SHmu5aIKrPFHM+plVr3fD6uX5yP8W9n3M33Ecx3EcR7wC6hie4JdAVzIAAAAASUVORK5CYII=>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAAVCAYAAADb2McgAAACfElEQVR4Xu2VTahNURTHl6IIScpHkZeUJEW+UlJPGCGFEmWkSCgUkYGSRCkZKB8lA2MjIwYXJWEoBpRIKWIglOTj/7P2fm+fdc65T2Zy//Wru9ded++119p7HbOeevo3NE5cEXPjhDRLnBYXxRYxqjr9W9iYw+eEmFqdHtAwsUScE+fF8mQbUjgdFp/FgjC3QTwR88QYcVzcND9U1mRxW5w1D26NeCGWFT5otHkirovZYo54JFaVTm3iZB+sHuQ08UxsLWzjxUOxO42Hi8viqZiUncyzed8GD0MiOMSdwrZf/BSH0rhV/OGSeZlikAQXbWx2TXTMM0tG3hfjrLXih1iZxqzBWjsGPDzrHGZGYauJDTkNJeU0MSDuTbShq+KN+eJ5847VgyyzdEx8M78C+E0RI9NcVy0WZ8QIaw6SYKIt2ocKkqtAMDfM/U6KC+bJ4Srtsi4PhzJT4r40jkGyYSfYssogWYe7d1eMLXwoI0Him9fKQXOPUb/4KNalcUVEvk9sKmwxSF7irWDLihnmurwzf4Coz/whxSDLO4oo+UvzLNdKP98Gy5wVg0QxmDY7h6btPDfflBbDA8l3su3AOUjgd0U7xavAJ/NF35qXbqJ5yeLCiCBfW3vDRgRZZo4yx7W6BtmkpkxyV75btUT5EZQl2mN+sOlpTGZp2mWf3Cy+WrXBdy13k46IL2JRYZsgHpi3j6yZ5llk0ywySwBL05iuQYsqHwSVeWzVxt1vXR5OKbJEiSk1kLl75ouiheafuINio/nX5pRV7zOb8OncLo6aH2Kb1VvLijRHG9qbfh+wut9fiYu/Wqw3/1Q2iU8ivRE//Nv0J2v19H/pF/nAoLCinJ93AAAAAElFTkSuQmCC>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB0AAAAVCAYAAAC6wOViAAABmklEQVR4Xu3VPShFYRzH8b9Q3spAXoq8FFKEDGIwWQyKGLxkMhAbZbJJYmNRkpKUwSZG3V1JioRFKbsYDOL795zjnsM5zz1xdUt+9RnOeZ7O/z6vV+SPpAxzWEQn0vzNyU8R9lCFAhxj0NfjF1KBG/QhDzEseDuEpVIS/7o6LGMd/Uj3N7+nAVdo+dzgph6TOMILtvzNH8kUs146ba2oxj4mPH1ysIJLjIplTbVoLzpwJ+FF9ePXYmZD041XCe6fjUPMiqWwphS3EvyRcjEFVz3v8sWMvM15LsEwcp1n/c45Cp3nwNiK6jrrqEaQJaavbhZvxvGAJjGj28GBmP6hsRXVEWrReWxjCqdYErPWGt29u+jBEE7Q7LSFxlZU32nRmMRHWIN7zDjPGt3Jel6LJf5jrIlSVKfQjXsWE66bLbaiG2KK6tS5cYs+iTlC34qt6LSkoGg7nsXsXjdJnV7d6rrlvdHDrrePTnOG8y5oI0VOl5ibSK9AnUL1iDM0evrpzXWBTYw57WsScZf+JFpA/ycHUCtfZ+Q/qc0bhONV5A1x8ysAAAAASUVORK5CYII=>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAWCAYAAAD5Jg1dAAAAlUlEQVR4XmNgGLqAH4jnA7EuugQyYATiSiD+CsTGaHIowByI3zEQUAiycjYQz2LAoxBkZREQBwNxOQMehWZA3AvErAx4FIKsBFmnAOVTphDktkIgDkUSw6rQkAHhNhjAqjADiB+h4S9A/B+IXwHxYSAWg6tGA1hNxAaqgPgbEJuiS8CACwPEOpC1IPwXiI8x4LF6MAEA258livNidPEAAAAASUVORK5CYII=>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACoAAAAVCAYAAAAw73wjAAABu0lEQVR4Xu2WvyuFURjHH2EQkYgURZRYKGQVUQaRIhmMjEZEmQwSJVluGUyUP4DBIBZRMpBJFixiUIz4fnu83fO+3fO+5/5QhvdTn+Gec7rne57z416RmJiYfDgO6wPtJkVwEibgCqz1d6dHKVyCp7Ax0BeEEw/BTfgEP2CHb0SSFngNF0QDjsELWGUOcqECrsEz2CtaoSgYdBD2wGWxB2WYG9GQebAYHot9fEoa4I5oBbtFvygT5sQ+MfteRavq0QfnRRcbSjM8+LVVMg/oYQtaBs/hpeiuUVY4dMcYhlU7FK0iq5krbEFZRVaTYbfhItyCt7DdGOdjGL7DUcm+gkFsQfmZ7V+i8xLOvQrvJOTmZ3JpXIgKygpWGu18Lb7hjNGWEu8Z4paw0tkGtgVtE93FE1hitHtBd422UPhUzMIrOCUOt9CCLWg1vJccBPUohBOigRmcC0gHW9ACuCd668uNduett8EjwKNwBJsCfWEw6CfsCnaAfvgiyUU4XaZcwqrvwzfR6ng+ww1jHHeL9+EBTos+T4+w0xjzr6iDI3BAIo4WV8bDXeNg5K/HX8JfAv7FcnFdNHBMKn4AvCZduiYxMxUAAAAASUVORK5CYII=>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAVCAYAAAAnzezqAAABbklEQVR4Xu2UvytGURjHHzEog8GAIj8KWSwGZTEpBhYmJH+ALIrFYJEYRcqPZDEwqbf8GpRsjMRgN4jNKD5f597r3kvcy31N76c+9b7Pc+655zznPsesQIH80oKLuIYjWBZN55cB3MVWrMEJvMC68CCfUs+sqMRDcy/2KcJlnA3FAhrxBBewIpb7De14i02x+DRuxGIBWmEbHuAmNkTTqdCG7vEOu7xYOR5jvz/oO/Tx7Hnqd1q0mSl89dzCfZz0colRFVSNM+ywdA8X45x9LOIBuy3dHAHVuGLJF6L8uLmSd5rbvRbxgqOhcanQx7mK51gfTX1CO73CWu+/qjGEz3hjrksSo92rfU4t2e6FvvSleBB68Mlcl/yIzn8dc+a6I8mLfbbNnX8c3QuX5i6nL8mqFdVq1xY9Ks09hjtYEoq/o6TKqzKr3Cr7X9CZqw0fcQaHzbX0EVaFxgX04rxlcwuG0Xx9OIjNlu4YC/wPbwVUOHoplIrUAAAAAElFTkSuQmCC>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAVCAYAAACpF6WWAAABW0lEQVR4Xu2UMSvFYRTGH2EQJREpckcmivIBxKZEFh8AswWxKsQkCxaD+BCGWxaxGMgkkSxiUBYDnqfz/jn3vf3fGGz3qd/wP+95n84577kXqOi/VUemyA5ZIR2lx2UaI+tx0KuHXJBFmNkkOSOtPsmpQG7IfhT/li5ewgyrSD05Jm+k3+VlqiV75BMJ03nyDKs20xBZgI0klrrYJA/IMW0kp+ScNAdUebVPcirAZt5N7pBjqupUpYy3yRLZIlekz+VJanuDDJJ2JEw1M83ug4yHmOa6Rq5RugETZC6c/8pUlbW4+CjsIWbCdxfZhY1LSpr2kldSJA0unpnqUg1ZhbWdKWnaBtu3IvJN9XAn5N7xGM7fw/esXTOpikPY6ze5eNx+rGSl0jB5ws+i5z2Ul+La0wNYfpm0KsvklkzDVkoXBnxSkH5tR7C21Yl4QdS+VyfsT2IEdrmiv+sLqnlM6vS1QngAAAAASUVORK5CYII=>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAUCAYAAABvVQZ0AAABD0lEQVR4Xu3SsUtCURTH8SPZmkvoGLg3SKaEq0NLg4i7m02CQkThroNtgmCBY3+Bq4sgudc/4CI42GJtUd/Du9p79z1BX4NLP/gM953zzruX+0T2lAMU0MQtjrzl3XKNG0RQxgti7oZd0sBQnB1dYYakp2ND9It9nNoFcXbWQRdRq+aLNt/hA2dWLYcJBkhYtcBksZDgYatc4hUndsEdPd4jeuIdprvVAWmz1udar5i1L/pCHUVxrt497BhveDLrc7wjb9a+ZPCAQ/EP0w9V0cIFntE2vZ5oYw0l1zN72NZJye+OVgk9TP/sqWWJb8wxQnzdHSKhdxaUe3yKc2uho1etR9Mjqi+M5Y/H/M/m/ACOlTJpOKac8AAAAABJRU5ErkJggg==>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAWCAYAAAD5Jg1dAAAAVUlEQVR4XmNgGJpAAYgj0AVhQBOIs4B4HxD/BeKFqNIIAFIYAMRWQPyEAY9CGJAE4ocMowpxANopXArEjGhyYODCAIk6UDz/h+IvQHwJiHWR1A1qAACsYBvJG7Z1TAAAAABJRU5ErkJggg==>

[image13]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAVCAYAAAAnzezqAAABZUlEQVR4Xu2UPyhFURjAP6FIpMifKIlSJoM/i0kGZVAYDLKxGi3KZJJJGUR2lJHBhMEkg9VAShkoZTLw+zr3vnfuefe5591LUe9Xv+575/tu53z3nPOJlCnze1TiJG4HzmJtJKNEGnAVz7HHiblU4xauicldxHe8xS4rz4sm3MALHBNTWRITeIYd1tg8fuIuVlnjRenGPTEVj2BFNPwtK5KfLKQTH/EOW63xAvrwMLBfSps4ZBBvcMkaa8f7QP0dQSfRKk/EVK3V/zSj+IHHWOPEZArfcFrSVZyEHsp9fMVhJ5YjzWHzZQafcNwNxBFetysxXybrQrTiaxxyA0nU4bKYlxckXRPRyS+xN/iv10+vY2MuwwPdvzkxC9EF6cJ80IZzFDxDmnEH660xb3QrdEtOJV9RMdrE9I8XfLB8xgPxbERZCBtRnOtW3t9B91nbo3aoJFsk+80oYEDM4fBxU2Ja6b/lCxF0P+yFglbpAAAAAElFTkSuQmCC>

[image14]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAVCAYAAAAnzezqAAABYElEQVR4Xu2UzypFURSHl1CKokgpcinJxETyAgozKSNmHsHAE0jKhPxJGBhRpkqhlLyA8gLMECYY4vu1z3HPPpfr3HPPLYP71dc57bXbf9Zee5tVqVI5anAE13ATp7HR61FB6nAVF7ET+/ASb7A70u+bhsCsGMAnPMWmoG0GP81lpIBePMNlbI3F0tCP93ht+fGmzC1gN+wUR2c2iCe4hz1+uGRaLL97jb2OH+YW8ifawVGg/stBk4/hM65gvR8ujrKgbKiAVNEarBRG8Q4fcBvb/HByOnDD0i+kFpfwxdyiUqFi2sIrzPmhRAzju7mr2B6LFUW7VwFdWPLdq5h13fQN0Ti3+IZDkfZf0fnv4LG5gZJMHLJv7srpG6JJNbneB70TP5LVVVzARxyPtM2aW5SOUS+lhyZWepVmpVvpKodmPMBznMN5fMXDIFbAhLkqzeIVDNGmcjgZ2OVFq/wXvgCG5jf+2bLVVwAAAABJRU5ErkJggg==>

[image15]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACMAAAAVCAYAAADM+lfpAAAB30lEQVR4Xu2UPShGYRTHj1DkK5kUhSiKDMJCsYjBYpUSA2UQknwNlBFZJGWQbIheBjEoSskoRi8pZTAoNvH/v+e57n2ve/UqLsq/ft17z/NxznPOea7IH1QxuAAHIDV6KKIcMG2egagShMQ7mHJwCErMdxrosYe/XhVgU7yDcasUzLqNn1E2GAeLYAIURg9HgtkDvWADTIJ0kAQGja0MVIMzcCm6VxNIBB1gCiyJ+vFVlaijWtGU74AXMADizBwGcwryzHej6DxmimXZNnOoZrBs3ina50X3ygT9jrEoJYumn5HHG1sWOAGPYjtwl4mZPAc1xsYxv2DyQVj0AjCzzKinuOkVeBDNiqUR0exYp/AKJixaBr9gEkCReeaCLtFG3xJNwjuxnnNgV9SBpSHRYPik6IilYEkoNumxqBO/YGjvNvY2M8b1qxLt60PxJGvgGdQZGzdcAWOgFeyLZoUNzCzegXXRnuIVPxLtuXqzNgQ6RTM9KuojJvFGsF94G5g5p9hX7Cmrv/zEdSnmnXPZvMwUg49ZGaKnZhaszX5EPM0CmBGfBgtKViDDYpeAtW94mxGQWE82W595t8Sr2OL4/nbReTt4Ajfg2sG96E8tMFk/Pf5T3NyCAnvqv/71u/QKo7lWdCAbZwoAAAAASUVORK5CYII=>

[image16]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADUAAAAVCAYAAADmSqZGAAABv0lEQVR4Xu2WzSsFURjGX6HIZ0jJ5irJRpGvLOykLJRIKWuyIhbEf4CsicXNQtkrWdkoWfkPRGJjoRR24nl6Zzj3uGbOXHdci/nVr+6cc+be88x5z7kjkpCQ8BfUwDTssDsKBOcxCRthEayEg3DaHBQEb1qFL7Db6isUU/Dd8hZ2moOC6IeP8r9CjcIrzwu4AKszRgTAstuDuxJPqFo4C0vsjhAYasVudIFltwQnRL8gjlDlcAc22x0h5ByqD27BUokvFBmHi3ZjCAy1D09ES/AazsBic5ANy44ll/Ku4wzFh7YOh+yOABjqFNZ5163wDi6LVtg32MgnxyPTxzUU762HTRFth8eik2JJhlHm6cPfPRAN1mK0f9IlX2Xn4xqK/xuboqsc1XP4JA5l9AMsRx7tI3YHmRM9802fRW94gGeik88n3FcM5nIst8F7eCSZq+qHYmk64bpSucD9wAlxH7vAOXAuZii//CLNcQ2+wl6745dwMhtwwO4IgOEZIGW08TNPQa62uW2ywhOJJee/iryJ1n6+yq8Bbou+u0WhB16KPux5eAMPxX21Y4UHQpXd6EgFHIZjoiuV9ShPSCgwHwo3Wg95d/TTAAAAAElFTkSuQmCC>