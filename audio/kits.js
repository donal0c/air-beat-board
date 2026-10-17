// Built-in kits: a display name, a seed pattern (5 rows x 8 columns of cell
// states) and the voicing tweaks the procedural voices apply.

export const KITS = {
  warm: {
    name: "Warm Studio",
    lift: 1,
    bassRoot: 40,
    pattern: [
      ["both", "empty", "first", "empty", "first", "empty", "first", "empty"],
      ["empty", "empty", "second", "empty", "empty", "empty", "second", "empty"],
      ["first", "first", "first", "first", "first", "first", "first", "first"],
      ["empty", "second", "empty", "empty", "first", "empty", "empty", "second"],
      ["first", "empty", "empty", "second", "empty", "first", "empty", "empty"]
    ]
  },
  lofi: {
    name: "Lo-Fi Room",
    lift: 0.82,
    bassRoot: 43,
    pattern: [
      ["first", "empty", "empty", "second", "first", "empty", "empty", "empty"],
      ["empty", "empty", "first", "empty", "empty", "second", "first", "empty"],
      ["first", "empty", "both", "empty", "first", "empty", "second", "empty"],
      ["empty", "second", "empty", "empty", "empty", "first", "empty", "second"],
      ["first", "empty", "second", "empty", "first", "empty", "empty", "empty"]
    ]
  },
  club: {
    name: "Club Utility",
    lift: 1.12,
    bassRoot: 36,
    pattern: [
      ["both", "empty", "both", "empty", "both", "empty", "both", "empty"],
      ["empty", "empty", "first", "empty", "empty", "empty", "first", "empty"],
      ["both", "both", "both", "both", "both", "both", "both", "both"],
      ["empty", "first", "empty", "second", "empty", "first", "empty", "second"],
      ["first", "empty", "empty", "first", "empty", "empty", "second", "empty"]
    ]
  }
};

export function patternFromKit(key) {
  return KITS[key].pattern.map((row) => row.map((cellState) => ({ state: cellState })));
}
