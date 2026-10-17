# Air Beat Board Polish Plan

Goal: turn Air Beat Board from a promising tech demo into a more polished, tactile browser instrument.

Use the checkboxes below as the progress tracker.

## Product Direction

- [x] Remove hand tracking from the primary product surface.
- [x] Replace the left camera panel with a focused Session panel.
- [x] Keep the wooden sequencer board as the visual and interaction center of the app.
- [ ] Preserve the app as a static, no-build browser project unless a later feature truly needs a build step.

## Session And Project Flow

- [ ] Add local save/load for the current board, kit, tempo, length, swing, row settings, slots, and imported sample names.
- [ ] Add JSON export/import so a pattern can be shared or restored across browsers.
- [ ] Add 4-8 pattern slots for storing multiple loops in one session.
- [ ] Add duplicate, clear, and launch-on-next-bar behavior for pattern slots.
- [ ] Add clear unsaved-change feedback when switching or replacing a pattern.

## Groove And Composition Depth

- [ ] Replace the current single Seed pattern action with a small groove browser.
- [ ] Add named groove templates for each kit, such as Backbeat, House, Lo-Fi, Breakbeat, Minimal, Afro Swing, and Odd Meter.
- [ ] Add a controlled mutate action that changes a few cells while preserving the groove identity.
- [ ] Add per-row randomize actions for users who want variation without replacing the whole pattern.
- [ ] Add a way to reset a row or whole pattern back to the selected groove template.

## Sampling And Audio Capture

- [ ] Keep local audio import and make the selected row/slot target clearer before import.
- [ ] Add microphone recording into the selected row slot.
- [ ] Add a short pre-record countdown or armed state so recording feels intentional.
- [ ] Add simple trim behavior for recorded/imported samples.
- [ ] Add resampling or loop capture as a later stretch item after microphone recording feels solid.

## Performance Controls

- [ ] Promote the selected row sound controls so they feel like instrument hardware, not a hidden inspector.
- [ ] Add solo alongside mute on each row.
- [ ] Add per-row meters or hit flashes in the channel strip.
- [ ] Make A/B slot state clearer, including whether each slot is built-in, empty, imported, or recorded.
- [ ] Add a small performance mode that hides editing chrome and emphasizes board, transport, mutes, and slots.

## Board Interaction Polish

- [ ] Fix the token tray mismatch: either render 30 available tokens or remove the misleading count.
- [ ] Add stronger hover, drag-over, and drop-target feedback for cells.
- [ ] Add keyboard shortcuts for play/stop, undo, selected cell movement, and cell state changes.
- [ ] Add redo to pair with the existing undo.
- [ ] Make outside-length columns more clearly inactive while keeping the visual board intact.

## Learning And Onboarding

- [ ] Add optional play cards for small guided tasks: build a backbeat, flip hats, add a bass offbeat, mute for a drop.
- [ ] Add a minimal first-run hint that teaches the four cell states without becoming a tutorial wall.
- [ ] Add contextual messages that explain musical outcomes, not implementation details.
- [ ] Add a compact reference for token states: empty, first sixteenth, second sixteenth, both.

## Layout And Visual Design

- [ ] Remove the permanent camera column and rebalance the desktop layout around the board.
- [ ] Move session actions, import, save/load, and groove browser into a quieter side panel or drawer.
- [ ] Reduce competing panel chrome so the wooden board feels more premium.
- [ ] Rework the top transport into fewer, clearer controls.
- [ ] Improve mobile layout so the board appears first, with transport and inspector controls in bottom drawers.

## Reliability And Architecture

- [x] Remove the startup dependency on MediaPipe when hand tracking is removed.
- [ ] Split `app.js` into focused modules if implementation work starts to exceed the current file comfortably.
- [ ] Add a lightweight state serialization layer before building save/load and pattern slots.
- [ ] Add a small manual QA checklist for desktop, tablet, and mobile interaction flows.
- [ ] Keep `node --check app.js` passing after each implementation slice.

## Suggested Implementation Order

- [ ] Phase 1: Remove hand tracking and replace the left panel with Session basics.
- [ ] Phase 2: Add save/load, JSON export/import, and pattern slots.
- [ ] Phase 3: Add groove browser, mutate, and per-row randomization.
- [ ] Phase 4: Add microphone recording and improve sample slot UX.
- [ ] Phase 5: Polish performance controls, keyboard shortcuts, mobile layout, and visual hierarchy.
