import { beforeEach, describe, expect, it } from "vitest";
import { state, resetState } from "../../state.js";
import { serialize, deserialize, FORMAT_VERSION } from "../../storage.js";
import { patternFromGroove, encodePattern } from "../../grooves.js";

beforeEach(() => resetState());

describe("serialize / deserialize", () => {
  it("round-trips the session except audio buffers", () => {
    state.board = patternFromGroove("breakbeat");
    state.groove = "breakbeat";
    state.bpm = 150;
    state.swing = 0.6;
    state.length = 12;
    state.kit = "club";
    state.master = 0.5;
    state.rows[2].muted = true;
    state.rows[3].solo = true;
    state.rows[4].choke = true;
    state.rows[1].slot = "b";
    state.rows[1].samples.b = { duration: 1 };
    state.rows[1].sampleNames.b = "clap.wav";
    state.rows[0].drive = 0.4;
    state.slots[1] = { board: patternFromGroove("house"), groove: "house", length: 8 };
    state.activeSlot = 1;

    const doc = JSON.parse(JSON.stringify(serialize()));
    expect(doc.app).toBe("air-beat-board");
    expect(doc.version).toBe(FORMAT_VERSION);
    expect(doc.board).toEqual(encodePattern(patternFromGroove("breakbeat")));

    resetState();
    deserialize(doc);
    expect(encodePattern(state.board)).toEqual(doc.board);
    expect(state.groove).toBe("breakbeat");
    expect(state.bpm).toBe(150);
    expect(state.swing).toBeCloseTo(0.6);
    expect(state.length).toBe(12);
    expect(state.kit).toBe("club");
    expect(state.master).toBe(0.5);
    expect(state.rows[2].muted).toBe(true);
    expect(state.rows[3].solo).toBe(true);
    expect(state.rows[4].choke).toBe(true);
    expect(state.rows[1].slot).toBe("b");
    expect(state.rows[1].samples.b).toBeNull();
    expect(state.rows[1].sampleNames.b).toBe("clap.wav");
    expect(state.rows[0].drive).toBeCloseTo(0.4);
    expect(state.slots[1].groove).toBe("house");
    expect(state.slots[1].length).toBe(8);
    expect(state.activeSlot).toBe(1);
  });

  it("rejects documents that are not sessions", () => {
    expect(() => deserialize({ foo: 1 })).toThrow(/Not an Air Beat Board/);
    expect(() => deserialize({ app: "air-beat-board" })).toThrow(/no board/);
    expect(() => deserialize({ app: "air-beat-board", board: ["x"] })).toThrow(/no board/);
  });

  it("clamps and falls back on bad values instead of crashing", () => {
    deserialize({
      app: "air-beat-board",
      board: ["x.......", "", "", "", ""],
      bpm: "900",
      swing: 9,
      length: 99,
      kit: "vinyl",
      groove: "zzz",
      master: -3,
      rows: ["nope", { drive: "loud", slot: "z" }],
      slots: "none",
      activeSlot: 42
    });
    expect(state.board[0][0].state).toBe("first");
    expect(state.bpm).toBe(180);
    expect(state.swing).toBeCloseTo(0.72);
    expect(state.length).toBe(16);
    expect(state.kit).toBe("warm");
    expect(state.groove).toBe("backbeat");
    expect(state.master).toBeGreaterThanOrEqual(0);
    expect(state.rows[1].drive).toBe(0);
    expect(state.rows[1].slot).toBe("a");
    expect(state.slots.every((slot) => slot === null)).toBe(true);
    expect(state.activeSlot).toBe(0);
  });
});
