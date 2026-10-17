# Air Beat Board

Air Beat Board is a browser-based musical instrument built around a tactile 5-row by 8-column sequencer. It turns a wooden tabletop-style board into a playable rhythm and sample device with procedural sounds, local sample import, and row controls.

The app is deliberately static: no framework, no package manager, no build step. Open it from a local web server and it runs in the browser.

## Screenshots

![Air Beat Board desktop workspace](assets/screenshots/desktop-board.png)

![Air Beat Board playable board detail](assets/screenshots/instrument-panel.png)

## What It Does

- Creates a 5-channel beat board with 8 visible columns.
- Expands each visible column into 2 sixteenth-note sub-steps, producing a 16-step loop.
- Lets each cell be empty, first sub-step, second sub-step, or both sub-steps.
- Plays a built-in procedural kit using WebAudio.
- Supports local audio sample import with `decodeAudioData`.
- Provides per-row controls for volume, pitch, effect send, mute, and A/B sample slot selection.
- Provides global controls for play/stop, BPM, swing, loop length, kit, and master level.
- Supports mouse and touch as the primary interaction model.

## Interaction Model

The board has 5 rows and 8 columns.

- Rows are sound channels: Kick, Snare, Hat, Perc, and Bass.
- Columns are time positions.
- Each column contains two internal sixteenth-note steps.

Cell states:

| State | Visual | Playback |
| --- | --- | --- |
| Empty | No token | Silent |
| First | Brown token | Plays the first sixteenth in that column |
| Second | Dark token | Plays the second sixteenth in that column |
| Both | Stacked token | Plays both sixteenths in that column |

Click or tap a cell to cycle:

```text
empty -> first -> second -> both -> empty
```

You can also select a cell and use the Cell State buttons to set the state directly.

## Audio Engine

Air Beat Board uses WebAudio directly.

The audio engine includes:

- Lookahead sequencer scheduling.
- 16-step playback derived from the 5×8 board.
- Procedural kick, snare, hat, percussion, and bass voices.
- Built-in kit variations.
- Per-row volume.
- Per-row pitch.
- Per-row send into a delay-style effect return.
- Master output level and simple metering.
- Local sample import for replacing row A/B slots.

Audio starts only after a user action, such as pressing play, so it follows browser autoplay rules.

## Running Locally

From this directory:

```sh
python3 -m http.server 4174
```

Then open:

```text
http://localhost:4174/
```

A local server is required because the app loads JavaScript modules and uses browser APIs that work reliably from `localhost`.

## Browser Requirements

Recommended:

- A recent Chromium-based browser, Safari, or Firefox.
- Speakers or headphones.

## File Structure

```text
.
├── index.html
├── style.css
├── app.js            entry: DOM refs, wiring, meter loop
├── state.js          store, constants, notify/subscribe
├── actions.js        every user-level operation (the only state writers)
├── history.js        undo stack
├── audio/
│   ├── engine.js     AudioContext, master bus, lookahead scheduler
│   ├── voices.js     procedural voices and sample playback
│   └── kits.js       kit names, seed patterns, voicing tweaks
├── ui/
│   ├── board.js      grid, row labels, tray, drag and drop, playhead
│   └── panels.js     transport, session, inspector, channel strips
└── assets/
    ├── maple-panel.png
    └── studio-desk.png
```

## V1 Scope

Included in this version:

- Static browser app.
- Warm wooden board interface.
- Mouse and touch composition.
- Procedural built-in kit.
- Local sample import.
- Per-row channel controls.
- Responsive desktop and narrow-screen layouts.

Not included in this version:

- Live microphone recording.
- Account system.
- Cloud sample library.
- Project save/load.
- MIDI output.
- DAW plugin integration.

## Development Notes

There is no install step.

Useful checks:

```sh
for f in app.js state.js actions.js history.js audio/*.js ui/*.js; do node --check "$f"; done
```

Manual browser checks:

- Load the app over `localhost`.
- Press play and confirm audio starts.
- Click cells and confirm token states cycle correctly.
- Confirm the playhead advances through 16 internal steps.
- Change BPM, swing, length, kit, master level, row volume, row pitch, row send, mute, and sample slot controls.
- Import a local audio file and assign it to a row slot.

## Privacy

Audio files imported into the app stay local to the browser session. The app does not include any server-side upload path.

## License

No license has been selected yet. Treat the code and assets as private unless a license is added by the repository owner.
