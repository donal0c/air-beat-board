import { beforeEach, describe, expect, it, vi } from "vitest";
import { state, resetState } from "../../state.js";
import { pushHistory, undo, redo, canUndo, canRedo, clearHistory, snapshot, restore } from "../../history.js";

beforeEach(() => {
  resetState();
  clearHistory();
});

describe("snapshot and restore", () => {
  it("captures board, rows, globals and slots by value", () => {
    state.board[0][0].state = "both";
    state.rows[1].muted = true;
    state.bpm = 140;
    state.slots[2] = { board: state.board.map((row) => row.map((cell) => ({ ...cell }))), groove: "house", length: 8 };
    const snap = snapshot();
    state.board[0][0].state = "empty";
    state.rows[1].muted = false;
    state.bpm = 90;
    state.slots[2] = null;
    restore(snap);
    expect(state.board[0][0].state).toBe("both");
    expect(state.rows[1].muted).toBe(true);
    expect(state.bpm).toBe(140);
    expect(state.slots[2].groove).toBe("house");
  });

  it("keeps the selection but clamps it to the board", () => {
    state.selected = { row: 4, col: 7 };
    restore(snapshot());
    expect(state.selected).toEqual({ row: 4, col: 7 });
  });
});

describe("undo and redo", () => {
  it("walks back and forward through pushes", () => {
    state.bpm = 100;
    pushHistory();
    state.bpm = 110;
    pushHistory();
    state.bpm = 120;

    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);
    expect(undo()).toBe(true);
    expect(state.bpm).toBe(110);
    expect(undo()).toBe(true);
    expect(state.bpm).toBe(100);
    expect(undo()).toBe(false);
    expect(redo()).toBe(true);
    expect(state.bpm).toBe(110);
    expect(redo()).toBe(true);
    expect(state.bpm).toBe(120);
    expect(redo()).toBe(false);
  });

  it("drops the redo stack when a new change is pushed", () => {
    state.bpm = 100;
    pushHistory();
    state.bpm = 110;
    undo();
    pushHistory();
    state.bpm = 130;
    expect(canRedo()).toBe(false);
    undo();
    expect(state.bpm).toBe(100);
  });

  it("collapses rapid pushes with the same coalesce key into one step", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1000);
    state.swing = 0.5;
    pushHistory({ coalesce: "swing" });
    state.swing = 0.52;
    now.mockReturnValue(1200);
    pushHistory({ coalesce: "swing" });
    state.swing = 0.6;
    now.mockReturnValue(1300);
    pushHistory({ coalesce: "swing" });
    state.swing = 0.7;

    expect(undo()).toBe(true);
    expect(state.swing).toBe(0.5);
    expect(undo()).toBe(false);
    now.mockRestore();
  });

  it("starts a new step for a different key or after the window", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    state.swing = 0.5;
    pushHistory({ coalesce: "swing" });
    state.swing = 0.6;
    now.mockReturnValue(5000);
    pushHistory({ coalesce: "swing" });
    state.swing = 0.7;
    pushHistory({ coalesce: "bpm" });
    state.bpm = 99;

    undo();
    expect(state.bpm).toBe(128);
    expect(state.swing).toBe(0.7);
    undo();
    expect(state.swing).toBe(0.6);
    undo();
    expect(state.swing).toBe(0.5);
    now.mockRestore();
  });
});
