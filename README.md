# The Loomkeeper 織界者 — CIS428 Assignment 2

A first-person voxel building game made with **The Sandbox Studio / Genesys.js 20.0.1**.

> ### 📦 Downloads
> **[Releases → big_files](https://github.com/onenok/CIS428_Assignment2/releases/tag/big_files)**
>
> | Asset | Size |
> |---|---|
> | `Loomkeeper.-.Gameplay.full.11min.mp4` — full gameplay recording, 11:00, 1080p60, unedited | 186.5 MiB |
> | `CIS428_Assignment2.zip` — report (.docx), slides (.pptx), zh-Hant slides (.pdf), 3:58 gameplay video | 108.5 MiB |
>
> The files GitHub cannot hold in a repository (over 100 MiB) live there; everything
> else is in this repo.

> **The pitch:** Minecraft generates terrain, but has never said *who decides*. This is the
> what-if where that someone exists — and there is exactly one. The Loomkeeper is still
> weaving this world block by block, and you arrive one chunk too early, before this piece
> is finished. He is not a god and not a villain; he is an exhausted colleague who hands
> you the last piece and goes back to work.

---

## What is in this repository

| Path | What it is |
|---|---|
| [`deliverables/The Loomkeeper - Report.docx`](deliverables/) | Written report — character backstory, IP relationship, technical write-up |
| [`deliverables/The Loomkeeper - Slides.pptx`](deliverables/) | Presentation deck (11 slides) |
| `deliverables/Loomkeeper - Gameplay (timelapse).mp4` | Gameplay video, 3:58 — build phase at 16× speed |
| `deliverables/Loomkeeper - Gameplay (timelapse, compressed).mp4` | Same edit, smaller file for quick download |
| [Releases → `big_files`](https://github.com/onenok/CIS428_Assignment2/releases/tag/big_files) | **Full 11-minute recording** and the submission zip (too large for the repo) |
| `TSB_Studio_Project/CIS428_Assignment2/` | **The game** — a The Sandbox Studio / Genesys.js project |
| `TSB_Studio_Project/CIS428_Assignment2/src/` | TypeScript source |
| `TSB_Studio_Project/CIS428_Assignment2/tests/` | Test suite (949 assertions / 219 suites / 54 files) |
| `Obsidian/cis428 assignment2/` | Design notes and decision log — requirements, plan, per-issue write-ups, review records |

Everything else in the working folder (build caches, editor state, raw art, scratch notes)
is intentionally excluded by the whitelist in [`.gitignore`](.gitignore).

---

## Run the game

The game is a The Sandbox Studio project. Open
`TSB_Studio_Project/CIS428_Assignment2/` in **The Sandbox Studio** and press Play — the
scene, the game mode and every asset are already wired up
(`CIS428_Assignment2.genesys-project` is the project file).

The gameplay video in `deliverables/` is a full 3:58 recording of that build running, if
Studio is not available.

### Controls

| Key | Action |
|---|---|
| `B` | Enter / leave build mode |
| Right click / Left click | Place / break a block (8 m reach) |
| `Z` / `Y` | Undo / redo (one gesture = one undo step) |
| `Ctrl + Enter` | Submit the design |
| `F3` | Debug overlay (`F3+B` collider boxes, `F3+C` free camera) |

There is **no quota, no timer and no fail state** — place as much or as little as you like,
and submitting an empty plot gets its own response.

---

## Build from source

Requires Node.js and pnpm.

```bash
cd TSB_Studio_Project/CIS428_Assignment2
pnpm install
pnpm build      # type-check + generate the game bundle into .dist/
pnpm test       # run the full test suite
pnpm dev        # local dev server (inside the Studio toolchain)
```

---

## How it works, in one paragraph

The world is **25 chunks of 16×16 columns, y = 0–255**, built on top of the engine's
`VoxelChunkNode.setVoxel()` rather than on mesh nodes. Each chunk owns a single
`BufferGeometry` that is rebuilt only when it is dirty; faces are emitted only where a
neighbour is air, a `NeighborSampler` culls the shared plane between adjacent chunks, and
indices are bucketed by material slot so a whole block type draws in one call. Edits are
pushed onto a per-chunk undo stack one batch at a time, so undoing 200 blocks is one step.
Progress through the game is a seven-state `GameFlow` machine with an explicit transition
table and no engine imports, which is why the whole flow can be tested without a renderer.
