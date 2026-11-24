請問Minecraft關於player瞄準方塊的部分是怎樣實現的?

在《Minecraft》中，玩家瞄準（Targeting / Picking）方塊的機制是透過 3D 體素射線檢測（Voxel Raycasting） 實作的。整個處理流程從視線起點生成到最終求交判定可分為以下核心步驟：

射線生成與距離設定 (GameRenderer.pick / Entity.pick)   

起點 (From)：取玩家當前的眼睛世界座標（player.getEyePosition(partialTick)）。

方向向量 (Look Vector)：根據玩家視角的 Pitch（俯仰角）與 Yaw（偏航角）計算出三維視線單位向量（player.getViewVector(partialTick)）。

終點 (To)：起點 + 方向向量 × 瞄準距離（Reach Distance，生存模式預設為 
4.5 格互動距離 / 
3.0 格攻擊距離，創造模式為 
5.0 格）。

體素網格穿越演算法 (BlockGetter.clip 與 3D DDA)   

遊戲呼叫 level.clip(ClipContext)。其中 ClipContext 傳入 ClipContext.Block.OUTLINE，指定使用方塊選取框（Outline Shape）進行檢測。   

底層採用 3D DDA (Digital Differential Analyzer)（即 Fast Voxel Traversal 演算法，在源碼中為 BlockGetter.traverseBlocks()）。該演算法能以極高效能沿著射線行經的三維網格，逐一推進並檢查途經的 BlockPos，避免無謂搜尋遠處方塊。   

與 VoxelShape 精確求交 (VoxelShape.clip)   

當 3D DDA 遍歷到某個網格座標時，系統取得該座標的 BlockState 並呼叫其 getShape() 獲取邊界 VoxelShape。   

射線起點與終點會被轉換為該方塊的相對局部座標，並與 VoxelShape 中解包出的 AABB 進行 Ray-AABB 相交檢測。   

一旦射線穿過方塊 AABB，系統會計算出精確的相交切入點座標（Vec3）與被擊中的方塊朝向面（Direction，如 UP, NORTH 等），並封裝回傳 BlockHitResult。   

實體過濾與距離比對   

在完成方塊射線檢測後，GameRenderer.pick() 會以方塊相交點的距離作為上限，進一步掃描該射線範圍內是否有實體（Entity）的包圍盒與射線相交。   

若實體距離比方塊更近，則最終瞄準目標更新為 EntityHitResult；否則保留 BlockHitResult。   

渲染與互動響應

最終獲得的 BlockHitResult 會被寫入全域狀態（如 Minecraft.hitResult）。   

渲染管線的 LevelRenderer.renderHitOutline() 讀取該命中點的 BlockPos 與 getShape()，在方塊表面繪製出黑色線框；當玩家按下左鍵（破壞）或右鍵（放置/互動）時，伺服器與客戶端皆依據此 BlockHitResult 的座標與命中面執行動作。   