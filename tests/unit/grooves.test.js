import { describe, expect, it } from "vitest";
import { ROWS, COLS, STATE_ORDER } from "../../state.js";
import {
  GROOVES, getGroove, patternFromGroove, encodePattern, decodePattern, mutateBoard, randomiseRow, resetRow
} from "../../grooves.js";

const signature = (board) => encodePattern(board).join("/");

describe("templates", () => {
  it("are all 5 rows by 8 columns of valid states", () => {
    expect(GROOVES.length).toBeGreaterThanOrEqual(6);
    for (const groove of GROOVES) {
      expect(groove.pattern).toHaveLength(ROWS.length);
      for (const row of groove.pattern) {
        expect(row).toHaveLength(COLS);
        for (const cell of row) expect(STATE_ORDER).toContain(cell.state);
      }
    }
  });

  it("falls back to the first groove for unknown ids", () => {
    expect(getGroove("nope").id).toBe(GROOVES[0].id);
  });

  it("hands out fresh copies, never the template itself", () => {
    const a = patternFromGroove("house");
    const b = patternFromGroove("house");
    a[0][0].state = "empty";
    expect(b[0][0].state).toBe("first");
    expect(getGroove("house").pattern[0][0].state).toBe("first");
  });
});

describe("pattern codec", () => {
  it("round-trips every state", () => {
    const board = patternFromGroove("afro");
    expect(decodePattern(encodePattern(board))).toEqual(board);
  });

  it("reads junk as empty cells", () => {
    const board = decodePattern(["xq", 42, null]);
    expect(board).toHaveLength(ROWS.length);
    expect(board[0][0].state).toBe("first");
    expect(board[0][1].state).toBe("empty");
    expect(board[1].every((cell) => cell.state === "empty")).toBe(true);
  });
});

describe("mutateBoard", () => {
  it("changes 2 to 4 cells and keeps the kick and snare anchors", () => {
    for (let trial = 0; trial < 50; trial += 1) {
      const board = patternFromGroove("backbeat");
      const before = encodePattern(board);
      const changed = mutateBoard(board);
      const after = encodePattern(board);
      let diff = 0;
      for (let r = 0; r < ROWS.length; r += 1) {
        for (let c = 0; c < COLS; c += 1) if (before[r][c] !== after[r][c]) diff += 1;
      }
      expect(changed).toBeGreaterThanOrEqual(2);
      expect(changed).toBeLessThanOrEqual(4);
      expect(diff).toBe(changed);
      expect(board[0][0].state).toBe("both");
      expect(board[1][2].state).toBe("second");
      expect(board[1][6].state).toBe("second");
    }
  });
});

describe("randomiseRow", () => {
  it("only touches the given row and keeps the kick downbeat", () => {
    for (let trial = 0; trial < 30; trial += 1) {
      const board = patternFromGroove("minimal");
      const before = signature(board).split("/");
      randomiseRow(board, 0);
      const after = signature(board).split("/");
      expect(board[0][0].state).not.toBe("empty");
      expect(after.slice(1)).toEqual(before.slice(1));
    }
  });
});

describe("resetRow", () => {
  it("restores one row from the template", () => {
    const board = patternFromGroove("house");
    randomiseRow(board, 2);
    resetRow(board, 2, "house");
    expect(encodePattern(board)[2]).toBe(encodePattern(patternFromGroove("house"))[2]);
  });
});
