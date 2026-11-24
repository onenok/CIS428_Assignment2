
so, i know these method are for java

but what if i want to remake all of them in js engine?

like three.js

當前時間：2026-11-03 11:59

把 Minecraft 的這套系統（方塊狀態、碰撞箱 VoxelShape、實體移動與碰撞修正）搬到 JS 引擎（例如 Three.js）中是完全可行的，這也是許多網頁版 Minecraft Clone（如 mc-web 或自製 Voxel 引擎）的核心架構。

因為 JavaScript 是單執行緒且動態的，我們在設計時需要把 Java 的物件導向邏輯轉化為高效能的資料導向（Data-Oriented）或 TypedArray 結構。

以下是使用 JS 重新實現這套系統的完整架構設計：

1. 運行時資料儲存：用 TypedArray 取代 Java 物件
   在 Java 中我們用 PalettedContainer<BlockState></blockstate>，在 JS 中為了追求極致效能（避免垃圾回收 GC 壓力），我們用 Uint16Array 搭配一個全域的 ID 查詢表：

JavaScript
// 全域方塊狀態對應表 (Registry)
const BLOCK_STATE_REGISTRY = [
    { id: 'minecraft:air', collides: false, shape: null },
    { id: 'minecraft:stone', collides: true, shape: 'full' },
    { id: 'minecraft:brick_stairs[facing=west,shape=outer_right]', collides: true, shape: 'stairs_outer_west' }
];

// 每個 Chunk 區塊（例如 16x16x16）用一個整數陣列儲存運行時的狀態 ID
class ChunkSection {
    constructor() {
        // 16 * 16 * 16 = 4096 個方塊
        this.blockStates = new Uint16Array(4096);
    }

    setBlock(x, y, z, stateId) {
        const index = x + (y * 16) + (z * 256);
        this.blockStates[index] = stateId;
    }

    getBlock(x, y, z) {
        const index = x + (y * 16) + (z * 256);
        return this.blockStates[index];
    }
}
2. 碰撞箱系統：Three.js 的 Box3 與自定義 VoxelShape
Three.js 內建了 THREE.Box3（對應 Java 的 AABB / Box）。但如果要支援非完整方塊（如階梯、半磚），我們可以用多個 Box3 組合出一個簡單的 VoxelShape 類別：

JavaScript
import * as THREE from 'three';

class VoxelShape {
    constructor(boxes = []) {
        // boxes 是一個個相對於方塊原點 (0,0,0 到 1,1,1) 的 THREE.Box3 陣列
        this.boxes = boxes;
    }

    // 將形狀位移到世界座標系中的特定方塊位置 (x, y, z)
    toWorldBoxes(blockX, blockY, blockZ) {
        return this.boxes.map(box => {
            const worldBox = box.clone();
            worldBox.translate(new THREE.Vector3(blockX, blockY, blockZ));
            return worldBox;
        });
    }
}

// 建立一個階梯的碰撞形狀範例
const stairShape = new VoxelShape([
    new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.5, 1)), // 下半部
    new THREE.Box3(new THREE.Vector3(0, 0.5, 0.5), new THREE.Vector3(1, 1, 1)) // 上半部後方
]);
3. 實體移動與碰撞修正 (Swept AABB / 軸向分離演算法)
這裏是物理引擎的核心。當玩家（可以用一個 THREE.Box3 代表實體的碰撞箱）在世界中移動時，我們逐軸（Y -> X -> Z）進行檢測與修正，防止穿牆：

JavaScript
class PhysicsEngine {
    constructor(world) {
        this.world = world; // 包含所有 Chunk 的世界管理物件
    }

    // 修正實體移動向量
    moveEntity(entityBox, velocity) {
        let { x, y, z } = velocity;

        // 1. 收集周圍所有可能碰撞的方塊 Box
        const surroundingBoxes = this.getNearbyCollisionBoxes(entityBox.clone().expandByVector(new THREE.Vector3(Math.abs(x), Math.abs(y), Math.abs(z))));

        // 2. 依序在 Y 軸測試與修正
        if (y !== 0) {
            y = this.calculateAxisOffset(entityBox, surroundingBoxes, 'y', y);
            entityBox.translate(new THREE.Vector3(0, y, 0));
        }

        // 3. 依序在 X 軸測試與修正
        if (x !== 0) {
            x = this.calculateAxisOffset(entityBox, surroundingBoxes, 'x', x);
            entityBox.translate(new THREE.Vector3(x, 0, 0));
        }

        // 4. 依序在 Z 軸測試與修正
        if (z !== 0) {
            z = this.calculateAxisOffset(entityBox, surroundingBoxes, 'z', z);
            entityBox.translate(new THREE.Vector3(0, 0, z));
        }

        return new THREE.Vector3(x, y, z);
    }

    calculateAxisOffset(entityBox, obstacleBoxes, axis, movement) {
        for (const box of obstacleBoxes) {
            if (axis === 'y') {
                if (movement > 0 && entityBox.max.y <= box.min.y) {
                    const diff = box.min.y - entityBox.max.y;
                    if (movement > diff) movement = diff;
                } else if (movement < 0 && entityBox.min.y >= box.max.y) {
                    const diff = box.max.y - entityBox.min.y;
                    if (movement < diff) movement = diff;
                }
            }
            // X 與 Z 軸同理... (此處為簡化版邏輯)
        }
        return movement;
    }

    getNearbyCollisionBoxes(searchBox) {
        // 從 world 中找出與 searchBox 相交的所有方塊，並展開成對應的 THREE.Box3 陣列
        let boxes = [];
        // ...遍歷座標範圍內的方塊，若方塊 collides 為 true，則把 shape.toWorldBoxes() 加入 boxes
        return boxes;
    }
}
4. 點擊與選中 (Raycasting)
Three.js 內建了非常強大的 THREE.Raycaster，這點在 JS 中比寫 Minecraft 源代碼還要簡單：

JavaScript
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// 當玩家點擊畫面時
function handlePlayerClick(camera, scene) {
    raycaster.setFromCamera(mouse, camera);

    // 取得畫面上所有方塊 Mesh 的交點
    const intersects = raycaster.intersectObjects(scene.children);

    if (intersects.length > 0) {
        const intersection = intersects[0];
        console.log("選中的方塊座標:", intersection.point);
        console.log("點擊的面法向量:", intersection.face.normal);

        // 透過法向量可以計算出是要「破壞」還是「放置」相鄰方塊
    }
}
總結架構對照：
Minecraft Java 概念	Three.js / JS 實現方式
BlockState 註冊表	全域 JS 陣列 / Map
PalettedContainer	Uint16Array (效能極佳，無記憶體碎片)
VoxelShape / Box	自定義 VoxelShape 類別組合 THREE.Box3
實體物理碰撞檢測	自定義 AABB 軸向分離演算法 (PhysicsEngine)
視線選中與點擊	THREE.Raycaster
