# FLOWCHART — Mermaid 備份

> 這是 [[CIS428 計劃看板.canvas]] 的純文字備份，方便在 VS Code 快速預覽。
> 在 VS Code 按 `Ctrl+Shift+V` 開啟預覽。

## 遊戲流程

```mermaid
flowchart TD
    subgraph S0["⓪ 前置"]
        N0["N0 世界生成中"]:::pending
    end

    subgraph S1["① 開場過場"]
        N1["N1 眼睛睜開濾鏡"]:::pending
        N2["N2 環境描述對話"]:::pending
        N3["N3 織界者現身"]:::pending
        N0 --> N1 --> N2 --> N3
    end

    subgraph S2["② 自由探索"]
        N4["N4 玩家可自由行動"]:::done
        N5["N5 建造模式入口"]:::done
        N3 --> N4 --> N5
    end

    subgraph S3["③ 建造循環"]
        N6["N6 選類別"]:::pending
        N7["N7 選設計"]:::pending
        N8["N8 確認放置"]:::done
        N9["N9 Submit 區塊"]:::done
        N5 --> N6 --> N7 --> N8 --> N9
        
    end

    subgraph S4["④ 結束"]
        N10["N10 織界者對話"]:::pending
        N11["N11 結束動畫（暫緩）"]:::todo
        N12["N12 遊戲結束"]:::pending
        N9 -->|"Submit"| N10 --> N12
    end

    classDef done fill:#2d5016,stroke:#4a7c1f,color:#fff
    classDef pending fill:#5c4813,stroke:#8a6d1f,color:#fff
    classDef todo fill:#4a1f1f,stroke:#7c2f2f,color:#fff
```

## 計劃層對應

```mermaid
flowchart LR
    subgraph GAME["遊戲節點"]
        N1["N1"]
        N2["N2"]
        N3["N3"]
        N4["N4"]
        N5["N5"]
        N6["N6"]
        N7["N7"]
        N8["N8"]
        N9["N9"]
        N10["N10"]
        N11["N11"]
        N12["N12"]
    end

    subgraph PLAN["計劃節點"]
        P1["P1 過場系統"]:::pending
        P2["P2 建造系統"]:::done
        P3["P3 結束系統"]:::pending
        P4["P4 角色系統"]:::done
        P5["P5 對話系統"]:::pending
        P6["P6 世界生成"]:::done
        P7["P7 UI 系統"]:::pending
        P8["P8 音效系統"]:::todo
        P9["P9 存檔系統"]:::todo
        P10["P10 交付物"]:::pending
    end

    P1 -.-> N1
    P1 -.-> N2
    P1 -.-> N3
    P2 -.-> N4
    P2 -.-> N5
    P2 -.-> N6
    P2 -.-> N7
    P2 -.-> N8
    P2 -.-> N9
    P3 -.-> N10
    P3 -.-> N11
    P3 -.-> N12
    P4 -.-> N3
    P4 -.-> N4
    P5 -.-> N2
    P5 -.-> N10
    P6 -.-> N4
    P7 -.-> N6
    P7 -.-> N9
    P7 -.-> N12

    classDef done fill:#2d5016,stroke:#4a7c1f,color:#fff
    classDef pending fill:#5c4813,stroke:#8a6d1f,color:#fff
    classDef todo fill:#4a1f1f,stroke:#7c2f2f,color:#fff
```

## 節點索引

### 遊戲流程節點

| ID | 名稱 | 狀態 |
|---|---|---|
| N0 | [[N0 世界生成中]] | 🟡 |
| N1 | [[N1 眼睛睜開濾鏡]] | 🟡 |
| N2 | [[N2 環境描述對話]] | 🟡 |
| N3 | [[N3 織界者現身]] | 🟡 |
| N4 | [[N4 玩家可自由行動]] | 🟢 |
| N5 | [[N5 建造模式入口]] | 🟢 |
| N6 | [[N6 選類別]] | 🟢 |
| N7 | [[N7 選設計]] | 🟡 |
| N8 | [[N8 確認放置]] | 🟢 |
| N9 | [[N9 Submit 區塊]] | 🟢 |
| N10 | [[N10 織界者對話]] | 🟡 |
| N11 | [[N11 結束動畫]] | ⏸️ |
| N12 | [[N12 遊戲結束]] | 🟡 |

### 計劃節點

| ID | 名稱 | 狀態 |
|---|---|---|
| P1 | [[P1 過場系統]] | 🟡 |
| P2 | [[P2 建造系統]] | 🟢 |
| P3 | [[P3 結束系統]] | 🟡 |
| P4 | [[P4 角色系統]] | 🟢 |
| P5 | [[P5 對話系統]] | 🟡 |
| P6 | [[P6 世界生成]] | 🟢 |
| P7 | [[P7 UI 系統]] | 🟡 |
| P8 | [[P8 音效系統]] | ⏸️ |
| P9 | [[P9 存檔系統]] | ⏸️ |
| P10 | [[P10 交付物]] | 🟡 |