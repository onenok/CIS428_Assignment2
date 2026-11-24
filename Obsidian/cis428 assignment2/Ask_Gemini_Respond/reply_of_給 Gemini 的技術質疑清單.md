
你點出的這 8 點質疑全部命中核心痛點。這幾份文件的確過於簡化或直接搬運了 Java 版的理想化架構，忽略了在 JavaScript / Three.js / Rapier 環境下的實際效能、記憶體管理與邊界條件。

以下逐一針對你的 8 個技術質疑給予明確確認與修正：

1. Uint16Array 存全域 stateId 是否會溢位？我的 palette 方案是否正確？
   答案：你的理解完全正確。

解析：原版 Minecraft 的 BlockState 組合在擴充模組或完整 Vanilla 內容下輕易突破 65,536 種。全域 Uint16Array 絕對會發生靜默截斷導致崩潰。標準的做法就是你寫的「Chunk 區塊級 Local Palette + 區塊內資料陣列」，每個 section 維護自己的小 palette（通常小於 256 或 65535），這樣資料陣列永遠不會超出範圍。

2. 合併 geometry 的前提下，intersectObjects 能否處理非完整方塊？
   答案：不行，intersectObjects 在這裡完全無用。

解析：正如你所說，合併後的 BufferGeometry 只是一個巨大的網格。用 Three.js內建 raycaster 打上去只會拿到三角形交點，無法辨識「這是哪一格的哪一個非完整形狀（如半磚上半部）」。

正確做法：放棄 intersectObjects 用於方塊選中，改用 DDA Voxel Raycast (Amanatides & Woo 演算法)。沿著視線向量步進每個穿過的格子，對命中的格子直接調用其 outlineShape 的 Box 進行精確 AABB 測試。這也是所有高效能 Voxel 遊戲的標準作法。

3. THREE.Box3[] 的 GC 壓力是否如我所說？Float32Array 是否更好？
   答案：你的理解完全正確。

解析：在 JS 中，高頻率（每幀、每實體、每方塊）在 Hot Loop 裡面 new 物件或呼叫 .clone() 絕對會導致 V8 記憶體頻繁回收，引發微卡頓（Stuttering）。

正確做法：全面改用扁平化的 Float32Array（例如將 Box 表示為 [minX, minY, minZ, maxX, maxY, maxZ]）。碰撞檢測和位移直接透過純數字運算完成，零物件配置、零 GC 壓力。

4. Rapier voxel collider + cuboid collider 能否共存於同一 body？
   答案：可以，而且這是最佳解。

解析：Rapier 的靜態剛體（Static Body）支援複合碰撞箱（Compound Colliders）。你可以把整塊 Chunk 的完整方塊合併成少數幾個大型 Cuboid（以減少物理引擎負擔），而樓梯、半磚等非完整方塊則以獨立的精確 Cuboid 直接附加到同一個 Static Body 上。

至於實體移動：絕對保留 Rapier 的 KinematicCharacterController。自己寫 Swept AABB 要處理斜坡、自動上階梯、滑牆等細節工程量極大，直接讓 Rapier 處理物理動力與滑動，方塊形狀交由自定義 Box 匹配。

5. getNearbyCollisionBoxes() 的邊界處理怎麼寫才正確？
   答案：必須擴大範圍並處理浮點數邊界。

正確做法：

JavaScript
const minX = Math.floor(searchBox.min.x);
const maxX = Math.floor(searchBox.max.x + 0.00001); // 加上微小偏移避免剛好落在整數邊界被漏掉
const minY = Math.floor(searchBox.min.y);
const maxY = Math.floor(searchBox.max.y + 0.00001);
const minZ = Math.floor(searchBox.min.z);
const maxZ = Math.floor(searchBox.max.z + 0.00001);
這樣才能確保實體跨越方塊邊界時，周圍所有可能碰撞到的方塊都被精確抓出來。

6. 樓梯的跨 chunk 鄰居更新，Minecraft 實際怎麼做？
   答案：Minecraft 使用一個全域的方塊更新佇列 (Block Update Queue)。

解析：當某個方塊改變時，它會向四周 6 個方向發送 neighborhoodChanged。如果鄰居在另一個 Chunk，該 Chunk 若已載入，就直接將更新請求塞入對應 Chunk 的更新佇列或觸發重算；若未載入則暫存或忽略。

在你的 JS 引擎中：當修改 (x, y, z) 時，若座標處於 Chunk 邊界（例如 x = 15），必須自動計算隔壁 Chunk 的座標並標記其需要重新計算形狀與 Mesh 頂點（dirty = true）。

7. Uint16Array 不壓縮 vs bit 壓縮，在這個規模下哪個合理？
   答案：直接用 Uint16Array 不壓縮是絕對理性的選擇。

解析：

一個 16×256×16 的 Chunk Section 只有 4096 格。

4096 × 2 bytes = 8 KB（如果是整個 256 高度的 Column 也才 128 KB）。

在現代客戶端記憶體中，這點開銷完全可以忽略不費。位元壓縮（Bit-packing）帶來的程式碼複雜度與位元運算開銷，在 JS 裡完全得不償失。

8. VoxelShape 是否應該預先計算並快取？
   答案：是的，必須全數預先計算並快取。

解析：所有方塊狀態（BlockState）對應的 outlineShape 與 collisionShape（即其內含的 Float32Array 箱子列表）在遊戲啟動、註冊方塊時就應該靜態生成完畢。運行時只有「唯讀查表」，絕對不能在玩家移動或點擊時動態去 union() 或計算幾何形狀。
