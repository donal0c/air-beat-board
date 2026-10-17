# Air Beat Board: Triple A+ Plan

Target: A+ on visuals, functionality and code, without changing the wooden
board aesthetic. The board, tokens, amber chrome and dark side panels stay.
Everything below is about making that design *work* rather than replacing it.

Baseline (17 Oct 2026 review): Visual B+, Functionality C+, Code B-.

Rule for every phase: `node --check app.js` passes, no console errors, and the
manual QA list at the bottom is re-run before the phase is called done.

---

## Phase 0: Land the current work (half a day)

The hand-tracking removal (587 deleted lines) is uncommitted on `main`.
Nothing else should start on top of a dirty tree.

- [x] Commit the current working tree as "Remove hand tracking, add Session panel".
- [x] Add `.claude/launch.json` to the repo (or gitignore it, your call).
- [x] Create a `polish` branch from fresh `origin/main` for the phases below.

---

## Phase 1: Functionality to A+ (the blockers)

These are the bugs that stop it being an instrument. Do them first, in order.

### 1.1 Fix click-to-cycle on occupied cells

The `pointerdown` handler on the grid starts a drag on any token and the
drop lands on the same cell, so a cell can never be clicked past "first".

- [x] Add a drag threshold: record pointer origin on `pointerdown`, only call
      `startDrag` once the pointer moves more than 6px. Below that, let the
      `click` fire and cycle normally.
- [x] Drop onto the source cell is a no-op: do not touch state, do not push
      history, keep the message as is.
- [x] Use `setPointerCapture` on the grid so drags that leave the board still
      end cleanly.
- [x] Verify: click one cell four times, states go empty, first, second, both,
      empty. Drag still works. Undo stack grows only on real changes.

### 1.2 Fix BPM input

Clamping on every `input` event rewrites the field mid-keystroke.

- [x] Clamp and sync on `change` / blur / Enter, not on `input`.
- [x] Add arrow-key and scroll-wheel nudging on the field (1 per step, 5 with
      Shift) so the value is also adjustable without typing.
- [x] Verify: typing "95" lands on 95; typing "300" lands on 180 after blur.

### 1.3 Protect the board on kit change

Switching kits silently replaces the whole pattern.

- [x] Kit change only changes the *sound*. Loading the kit's pattern becomes
      an explicit action in the groove browser (Phase 1.6).
- [x] When any action replaces a non-empty board (groove load, clear), show
      an inline "Replaced the board. Undo" message with an actual Undo button
      in the message panel rather than a modal.

### 1.4 Undo / redo that covers everything

- [x] Replace the board-only history with a snapshot of `board + rows +
      globals` (one serialisable object, see Phase 3.1).
- [x] Add redo. Shortcuts: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z.
- [x] Debounce slider changes into one history entry per gesture.

### 1.5 Keyboard support

The cells are already buttons, so this is cheap.

- [x] Space: play/pause. Escape: stop and reset. Arrow keys move the selected
      cell. 1 to 4 set the selected cell state. M mutes the selected row.
- [x] Roving tabindex on the grid so Tab enters the board once and arrows
      move inside it.
- [x] Visible focus ring on cells (see Phase 2.2 for the design).
- [x] Make sure shortcuts do not fire while an input or select has focus.

### 1.6 Groove browser replaces "Seed pattern"

- [x] Small list in the Session panel: Backbeat, House, Lo-Fi, Breakbeat,
      Minimal, Afro Swing. Each is a 5x8 pattern in `grooves.js`.
- [x] "Mutate" button changes 2 to 4 cells while keeping kick and snare
      anchors. "Randomise row" per channel strip.
- [x] All of these push history and are undoable.

### 1.7 Clean up the two volume controls

- [ ] Channel strip "Vol" is the one level control. Inspector "Gain" is
      removed; its slot in the Sound grid is taken by "Solo" and "Choke".
- [ ] Solo on each strip alongside Mute, with the usual rule that any solo
      silences non-soloed rows.

### 1.8 Honest metering

- [ ] Replace the counter-based meter with an `AnalyserNode` on the master
      bus and a cheap RMS read in the rAF loop.
- [ ] Per-row hit flash in the channel strip driven from `scheduleStep`, so
      the strips pulse with the beat.

### 1.9 Save / load / share

- [ ] Autosave the full snapshot to `localStorage` on every history push.
      Restore on load, with a "Fresh board" link in the Session panel.
- [ ] Export / import JSON through the Session panel.
- [ ] 4 pattern slots (A to D) in the Session panel. Copy, clear, and switch
      on the next bar when playing.

---

## Phase 2: Visual to A+ (same wood, better signal)

Nothing here changes the palette, materials or layout concept. It fixes the
things the eye cannot currently read.

### 2.1 Playhead you can see

- [x] A light column that slides across the grid (one absolutely positioned
      element, `transform: translateX`). Deep burnt-orange with a 3px leading
      edge: plain amber has almost no luminance contrast on light maple, so
      the playhead and hit rings are darker than the wood, not brighter.
- [x] The step number of the current column lights up amber.
- [x] Hit cells get a short 120ms token "press" animation (scale 0.92 then
      back) plus the existing inset glow, so a hit is visible on the token
      itself, not only the cell background.
- [x] Drive the bar from the audio clock in the rAF loop (Phase 3.3) so it
      never drifts from the sound.

### 2.2 Selected cell and focus

- [x] Selected cell: thin brass inset ring (2px, `--amber` at 80%) plus a
      subtle lift on the token. The same treatment doubles as the keyboard
      focus ring.
- [x] Row label of the selected row gets the same brass tint.

### 2.3 Outside-length columns

- [x] Darken more (around 45% instead of 26%), add a faint diagonal grain
      hatch, and dim the step number. Still wood, clearly "off".

### 2.4 Mobile layout (375px to 820px)

- [ ] Board first. Grid scales to fit width using `aspect-ratio` and
      `min()`, no clipping. Row labels become single letters (K S H P B) on
      the narrow breakpoint.
- [ ] Transport becomes a sticky bottom bar: play, stop, BPM, kit.
- [ ] Session, Inspector and Row strips become three tabs in a bottom
      drawer. No 2300px page.
- [ ] Minimum 44px touch targets on cells and strip buttons.

### 2.5 Small polish

- [ ] Token tray shows the true count of free tokens (or drop the count).
- [ ] "Muted" label fits: use a fixed-width button with a state dot instead
      of changing the text.
- [ ] Hover and drag-over on cells: slight lightening of the wood and a
      dashed inset ring on a valid drop target.
- [ ] First-run hint: a one-line strip under the board explaining the four
      token states, dismissed forever on first click.
- [x] `prefers-reduced-motion` turns off glow pulses and the press animation.
- [ ] Run Lighthouse accessibility; aim for 100. Contrast on `--dim` text
      and the step numbers will need a nudge.

---

## Phase 3: Code to A+ (same stack, real structure)

Still static, still no build step. ES modules only.

### 3.1 Module split

```
app.js            entry: wires modules, init
state.js          single store, snapshot(), restore(), subscribe()
history.js        undo/redo on snapshots
audio/engine.js   AudioContext, bus, scheduler
audio/voices.js   kick, snare, hat, perc, bass, sample
audio/kits.js     kit definitions
grooves.js        groove templates, mutate, randomiseRow
ui/board.js       grid render, playhead, drag
ui/panels.js      session, inspector, channel strips, transport
ui/keyboard.js    shortcuts and roving focus
storage.js        localStorage, JSON export/import
```

- [x] Every UI module takes `refs` and `store` as arguments; no module reads
      `document` globals at import time.
- [x] `state.js` exposes `notify()`/`subscribe()`; `actions.js` is the only
      writer and calls notify after each mutation. All renders go through
      subscribers.

### 3.2 Render without rebuilding

- [x] Create the 40 cell buttons once. On state change, patch only the cells
      whose state or selection changed (diff previous snapshot).
- [x] Row strips and inspector patch values, never `innerHTML`, after init.

### 3.3 Scheduler and visuals

- [x] Keep the lookahead scheduler. Replace per-step `setTimeout` visuals
      with a queue of `{ step, time }` drained in the rAF loop against
      `ac.currentTime`. Clear the queue on stop.
- [x] Reuse the distortion curve per drive value (cache by rounded amount)
      instead of allocating a `Float32Array` per hit.
- [ ] Hard-stop any voice longer than 2s so imported samples cannot pile up.

### 3.4 CSS

- [ ] Move the magic sizes (cell size, token size, board padding) into
      custom properties at `:root` and override them per breakpoint, so the
      three media queries shrink to a handful of lines each.
- [ ] Drop the hand-rolled `?v=` cache-bust from `index.html`; use normal
      caching headers from the host instead.
- [ ] Split into `base.css`, `board.css`, `panels.css`, `responsive.css`
      and link all four. No build step needed.

### 3.5 Tests

- [ ] `tests/` with Vitest run via `npx vitest` (dev-only; still no build
      for the app itself).
- [ ] Unit: `cellTriggersStep`, state cycling, history push/undo/redo,
      snapshot round-trip, groove mutate invariants, swing offset maths.
- [ ] Browser: one Playwright spec that loads the page, clicks a cell four
      times and asserts the four states, drags a token, presses Space and
      asserts the playhead moves. Reuse `.playwright-mcp` setup.
- [ ] `npm test` and `node --check` in a tiny GitHub Actions workflow.

### 3.6 Hygiene

- [ ] JSDoc types on the store shape and the voice function signatures.
- [ ] README: update the interaction model (threshold drag, shortcuts,
      slots, save/load) and retake the two screenshots.
- [ ] Remove `POLISH_PLAN.md` once this plan supersedes it, or merge the
      unchecked items here.

---

## Suggested order

1. Phase 0 (commit) then 1.1, 1.2, 1.3: the three bugs that break trust.
2. 3.1 and 3.2 (module split, patch rendering) before adding any new
   feature, so 1.4 to 1.9 land on the new structure.
3. 2.1 to 2.3 (playhead, selection, length) together: one visual slice.
4. 1.4 to 1.9 in order; each one is a self-contained PR.
5. 2.4 mobile, then 2.5 polish, then 3.4 CSS.
6. 3.5 tests alongside each slice, never as a final catch-up.

Rough effort: 4 to 6 focused days.

---

## Manual QA list (run before closing any phase)

Desktop 1440, tablet 768, phone 375:

- Press Space: audio starts, playhead bar visible and in sync.
- Click one empty cell four times: empty, first, second, both, empty.
- Drag a tray token onto a cell; drag a cell token to another cell; drop a
  token back on its own cell (no change, no history entry).
- Type 95 in BPM; type 300 and blur; both land where expected.
- Change kit while playing: sound changes, board does not.
- Load a groove, mutate, undo twice, redo once.
- Mute and solo rows; Sound tab changes drive, tone, decay, pan, pitch, send.
- Set length 8: columns 5 to 8 clearly off, playhead wraps at column 4.
- Import a WAV into Snare slot B, switch slot, hear it.
- Reload the page: board and settings restore.
- Export JSON, clear, import JSON: board restores.
- Phone: no horizontal scroll, whole grid visible, drawers open and close.
- Lighthouse accessibility 100, no console errors.
