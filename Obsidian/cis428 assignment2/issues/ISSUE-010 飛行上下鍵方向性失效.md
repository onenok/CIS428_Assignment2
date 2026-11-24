# ISSUE-010 飛行時「先下降再按 Space」無法停止下降（方向性單向）

- **狀態**：resolved（2026-11-22，實機確認「Ctrl 下降中按 Space 會停住」）
- **分類**：`blocker`（操作手感直接壞掉，玩家會以為卡住）
- **發現於**：P4 實機驗收
- **建立日期**：2026-11-22
- **相關**：[[ISSUE-008 跳躍連跳與方形碰撞箱與奔跑]]

## 症狀（使用者原話）

> flyup not work when flydown-ing first, but flydown work when flyup-ing
>
> 我 flying up 的時候可以按 Ctrl 停在空中；
> 但 flying down 的時候，按 Space 不會停止下降。

也就是同一個組合鍵，**只有一個方向能成立**。

## 原因

`matchesBinding()` 有一條規則：**綁定不是 Ctrl 組合鍵的動作，事件就不能帶 `ctrlKey`**
（存在的目的是讓 Ctrl+Z 不要同時觸發普通 `Z`）。

而 `Space` 的兩個動作（`toggleFlight` / `flyUp`）都不在 Ctrl 組合鍵清單裡，所以在
`Ctrl 已按著` 的狀態下按 Space：

1. 事件帶 `ctrlKey: true`
2. `hasModifier = true`，`wantsModifier = false`
3. `matchesBinding('toggleFlight', e)` → **false**
4. `MyPlayerController.handleKeyDown()` 直接落到 `super.handleKeyDown()`
5. `isPrimaryVerticalHeld` **永遠沒被設成 true**
6. `resolveVerticalIntent()` 收到 `{ up: 0, down: 1 }` → `verticalInput = -1` → 繼續下降

反方向之所以「正常」，是因為 Ctrl 的 key code **本身就是修飾鍵**，走的是
`MODIFIER_CODES` 那條例外，不受這條規則影響 —— 於是形成單向的不對稱。

`matchesBindingRelease()` 早就為了「放開 Space 時 Ctrl 還按著」而繞過修飾鍵檢查
（ISSUE 歷史上的「停止上升」bug），但**按下**這條路一直沒修。

## 修法

在 `src/input/keyBindings.ts` 新增 `MODIFIER_AGNOSTIC_ACTIONS = { toggleFlight, flyUp }`：

```ts
if (MODIFIER_CODES.has(e.code) || MODIFIER_AGNOSTIC_ACTIONS.has(action)) {
  return !e.altKey;
}
```

理由：飛行鍵本來就是**同一個和弦**（Space 上升、Ctrl 下降、同時按＝懸停），
按下順序不該影響結果。Alt 仍然被擋掉，保留給 god-view 的 orbit 組合鍵。

## 驗證

| 測試 | 內容 |
|------|------|
| `tests/input/keyBindings.unit.ts` | 「accepts Space pressed while Ctrl is already held」、「accepts Ctrl pressed while Space is already held」、「still rejects the chord on Alt」、「still rejects a chorded action on a plain key」 |
| `tests/character/playerStack.engine.ts` | 「closes the flight chord in either order (Ctrl held, then Space)」——走真正的 `handleKeyDown` |

全套 `899/899` 通過（原 895，新增 4）。

## 遺留

- 這條規則的**真正目的**（Ctrl+Z 不要觸發 Z）現在只靠 `wantsModifier !== hasModifier`，
  新動作預設仍然安全；但未來若新增「Ctrl 組合鍵動作」，記得一起加進 `MODIFIER_ACTIONS`。
- Alt 仍一律擋掉，所以 `Alt+Space` 不會上升。目前沒有用到，先保留。