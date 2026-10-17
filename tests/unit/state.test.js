import { beforeEach, describe, expect, it } from "vitest";
import {
  state, resetState, cellTriggersStep, describeState, boardIsEmpty, clamp, STATE_ORDER, MAX_STEPS
} from "../../state.js";

beforeEach(() => resetState());

describe("cellTriggersStep", () => {
  it("fires first-state cells on the even sixteenth only", () => {
    state.board[0][2].state = "first";
    expect(cellTriggersStep(0, 4)).toBe(true);
    expect(cellTriggersStep(0, 5)).toBe(false);
  });

  it("fires second-state cells on the odd sixteenth only", () => {
    state.board[1][0].state = "second";
    expect(cellTriggersStep(1, 0)).toBe(false);
    expect(cellTriggersStep(1, 1)).toBe(true);
  });

  it("fires both-state cells on both sixteenths", () => {
    state.board[2][7].state = "both";
    expect(cellTriggersStep(2, 14)).toBe(true);
    expect(cellTriggersStep(2, 15)).toBe(true);
  });

  it("never fires empty cells, out-of-range steps or steps past the loop length", () => {
    state.board[3][0].state = "both";
    state.board[3][7].state = "both";
    expect(cellTriggersStep(3, 0)).toBe(true);
    expect(cellTriggersStep(3, -1)).toBe(false);
    expect(cellTriggersStep(3, MAX_STEPS)).toBe(false);
    state.length = 8;
    expect(cellTriggersStep(3, 14)).toBe(false);
    expect(cellTriggersStep(4, 0)).toBe(false);
  });
});

describe("helpers", () => {
  it("describes every state in musical words", () => {
    expect(STATE_ORDER.map(describeState)).toEqual([
      "empty", "first sixteenth", "second sixteenth", "both sixteenths"
    ]);
  });

  it("knows when the board is empty", () => {
    expect(boardIsEmpty()).toBe(true);
    state.board[4][3].state = "first";
    expect(boardIsEmpty()).toBe(false);
  });

  it("clamps inclusively", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-2, 0, 1)).toBe(0);
    expect(clamp(0.4)).toBe(0.4);
  });
});
