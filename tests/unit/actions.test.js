import { beforeEach, describe, expect, it } from "vitest";
import { state, resetState, subscribe } from "../../state.js";
import { clearHistory, canUndo } from "../../history.js";
import { encodePattern, patternFromGroove } from "../../grooves.js";
import * as actions from "../../actions.js";

const sig = () => encodePattern(state.board).join("/");

beforeEach(() => {
  resetState();
  clearHistory();
});

describe("cells", () => {
  it("cycles empty, first, second, both, empty", () => {
    const seen = [];
    for (let i = 0; i < 4; i += 1) {
      actions.cycleCell(0, 1);
      seen.push(state.board[0][1].state);
    }
    expect(seen).toEqual(["first", "second", "both", "empty"]);
  });

  it("selects the cell it changes and records history", () => {
    actions.setCell(3, 5, "both");
    expect(state.selected).toEqual({ row: 3, col: 5 });
    expect(canUndo()).toBe(true);
    actions.undo();
    expect(state.board[3][5].state).toBe("empty");
  });

  it("notifies subscribers once per action", () => {
    let calls = 0;
    const off = subscribe(() => { calls += 1; });
    actions.cycleCell(0, 0);
    off();
    expect(calls).toBe(1);
  });
});

describe("dropToken", () => {
  it("moves a token and stacks onto an occupied cell", () => {
    actions.setCell(0, 0, "first");
    actions.dropToken({ type: "cell", row: 0, col: 0 }, "first", 0, 3);
    expect(state.board[0][0].state).toBe("empty");
    expect(state.board[0][3].state).toBe("first");
    actions.dropToken({ type: "tray" }, "first", 0, 3);
    expect(state.board[0][3].state).toBe("both");
  });

  it("treats a drop on the source cell as a no-op with no history entry", () => {
    actions.setCell(2, 2, "second");
    clearHistory();
    actions.dropToken({ type: "cell", row: 2, col: 2 }, "second", 2, 2);
    expect(state.board[2][2].state).toBe("second");
    expect(canUndo()).toBe(false);
  });
});

describe("globals", () => {
  it("clamps BPM on commit and ignores nonsense", () => {
    actions.setBpm("300");
    expect(state.bpm).toBe(180);
    actions.setBpm("9");
    expect(state.bpm).toBe(70);
    actions.setBpm("banana");
    expect(state.bpm).toBe(70);
    actions.setBpm(95.4);
    expect(state.bpm).toBe(95);
  });

  it("does not record history when the value is unchanged", () => {
    actions.setBpm(128);
    actions.setLength(16);
    actions.setSlot(0, "a");
    expect(canUndo()).toBe(false);
  });

  it("changes the kit without touching the board", () => {
    actions.loadGroove("house");
    const before = sig();
    actions.setKit("club");
    expect(state.kit).toBe("club");
    expect(sig()).toBe(before);
    actions.setKit("nope");
    expect(state.kit).toBe("club");
  });
});

describe("grooves", () => {
  it("offers undo when a groove replaces a non-empty board", () => {
    actions.loadGroove("minimal");
    expect(state.message.undo).toBe(false);
    actions.loadGroove("house");
    expect(state.message.undo).toBe(true);
    expect(sig()).toBe(encodePattern(patternFromGroove("house")).join("/"));
    actions.undo();
    expect(sig()).toBe(encodePattern(patternFromGroove("minimal")).join("/"));
    expect(state.groove).toBe("minimal");
  });

  it("mutate and reset are undoable and reset returns to the template", () => {
    actions.loadGroove("backbeat");
    const template = sig();
    actions.mutateBoard();
    expect(sig()).not.toBe(template);
    actions.resetGroove();
    expect(sig()).toBe(template);
    actions.undo();
    expect(sig()).not.toBe(template);
    actions.undo();
    expect(sig()).toBe(template);
  });
});

describe("pattern slots", () => {
  it("duplicates into the next free slot and switches when stopped", () => {
    actions.loadGroove("house");
    const house = sig();
    actions.duplicateSlot();
    expect(state.activeSlot).toBe(1);
    expect(state.slots[0]).not.toBeNull();
    expect(sig()).toBe(house);

    actions.setCell(0, 1, "both");
    const edited = sig();
    actions.selectSlot(0);
    expect(state.activeSlot).toBe(0);
    expect(sig()).toBe(house);
    actions.selectSlot(1);
    expect(sig()).toBe(edited);
    actions.selectSlot(2);
    expect(sig()).toBe(encodePattern(state.board).join("/"));
    expect(state.board.every((row) => row.every((cell) => cell.state === "empty"))).toBe(true);
  });

  it("queues the switch for the next bar while playing", () => {
    actions.loadGroove("house");
    const house = sig();
    state.playing = true;
    actions.selectSlot(3);
    expect(state.pendingSlot).toBe(3);
    expect(state.activeSlot).toBe(0);
    expect(sig()).toBe(house);
    actions.launchPendingSlot();
    expect(state.pendingSlot).toBeNull();
    expect(state.activeSlot).toBe(3);
    expect(state.slots[0].groove).toBe("house");
  });
});

describe("rows", () => {
  it("mute, solo and choke toggle and are undoable", () => {
    actions.toggleMute(1);
    actions.toggleSolo(2);
    actions.toggleChoke(2);
    expect(state.rows[1].muted).toBe(true);
    expect(state.rows[2].solo).toBe(true);
    expect(state.rows[2].choke).toBe(true);
    actions.undo();
    actions.undo();
    actions.undo();
    expect(state.rows[1].muted).toBe(false);
    expect(state.rows[2].solo).toBe(false);
    expect(state.rows[2].choke).toBe(false);
  });

  it("writes inspector params for the selected row only", () => {
    actions.selectCell(3, 0);
    actions.setSelectedRowParam("drive", 40);
    actions.setSelectedRowParam("pitch", -5);
    actions.setSelectedRowParam("bogus", 1);
    expect(state.rows[3].drive).toBeCloseTo(0.4);
    expect(state.rows[3].pitch).toBe(-5);
    expect(state.rows[0].drive).toBe(0);
  });
});
