// The wooden board: row labels, the 5x8 grid, the token tray, drag and drop
// and the playhead. Cells are created once and patched on every notify.

import { state, ROWS, COLS, STEPS_PER_COL, describeState, cellTriggersStep, subscribe } from "../state.js";
import { cycleCell, selectCell, dropToken, setMessage } from "../actions.js";

const DRAG_THRESHOLD_PX = 6;
const TRAY_TOKENS = 12;

export function initBoard(refs) {
  const cells = [];
  const tokens = [];
  const rendered = [];
  let rowLabels = [];
  let stepNumbers = [];
  let lastPlayCol = -1;
  let lastSelectedRow = -1;
  let lastOutsideFrom = -1;

  // ---------------------------------------------------------- build once

  refs.rowLabels.innerHTML = ROWS.map((row, index) => `
    <div class="row-label" data-row-label="${index}">
      <strong>${index + 1}</strong>
      <span></span>
      <em>${row.label}</em>
    </div>
  `).join("");
  rowLabels = [...refs.rowLabels.querySelectorAll("[data-row-label]")];

  stepNumbers = [...refs.stepNumbers.querySelectorAll("span")];

  refs.beatGrid.innerHTML = "";
  const playhead = document.createElement("div");
  playhead.className = "playhead";
  playhead.setAttribute("aria-hidden", "true");
  refs.beatGrid.appendChild(playhead);
  for (let row = 0; row < ROWS.length; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.dataset.testid = `cell-${row}-${col}`;
      cell.tabIndex = -1;
      const token = document.createElement("span");
      token.className = "token empty";
      token.dataset.tokenCell = `${row}-${col}`;
      cell.appendChild(token);
      refs.beatGrid.appendChild(cell);
      cells.push(cell);
      tokens.push(token);
      rendered.push("");
    }
  }

  refs.tokenTray.innerHTML = Array.from({ length: TRAY_TOKENS }, (_, index) => `
    <button type="button" class="token ghost-token" data-token-index="${index}" aria-label="Drag beat token"></button>
  `).join("");

  // ---------------------------------------------------------- rendering

  const cellIndex = (row, col) => row * COLS + col;

  function renderCells() {
    const { row: selRow, col: selCol } = state.selected;
    for (let row = 0; row < ROWS.length; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const index = cellIndex(row, col);
        const cellState = state.board[row][col].state;
        const selected = row === selRow && col === selCol;
        const outside = col * STEPS_PER_COL >= state.length;
        const key = `${cellState}|${selected ? 1 : 0}|${outside ? 1 : 0}`;
        if (rendered[index] === key) continue;
        rendered[index] = key;

        const cell = cells[index];
        cell.classList.toggle("selected", selected);
        cell.tabIndex = selected ? 0 : -1;
        cell.classList.toggle("outside-length", outside);
        cell.setAttribute("aria-label", `${ROWS[row].label} column ${col + 1}, ${describeState(cellState)}`);
        tokens[index].className = `token ${cellState}`;
      }
    }

    if (selRow !== lastSelectedRow) {
      rowLabels.forEach((label, row) => label.classList.toggle("selected", row === selRow));
      lastSelectedRow = selRow;
    }

    const outsideFrom = Math.ceil(state.length / STEPS_PER_COL);
    if (outsideFrom !== lastOutsideFrom) {
      stepNumbers.forEach((span, col) => span.classList.toggle("outside", col >= outsideFrom));
      lastOutsideFrom = outsideFrom;
    }
  }

  /** Move the playhead highlight to `step` (-1 clears it). */
  function renderPlayhead(step) {
    const playCol = step >= 0 ? Math.floor(step / STEPS_PER_COL) : -1;

    if (lastPlayCol >= 0 && lastPlayCol !== playCol) {
      for (let row = 0; row < ROWS.length; row += 1) {
        cells[cellIndex(row, lastPlayCol)].classList.remove("play-col", "play-hit");
      }
    }
    if (playCol >= 0) {
      for (let row = 0; row < ROWS.length; row += 1) {
        const cell = cells[cellIndex(row, playCol)];
        cell.classList.add("play-col");
        const hit = cellTriggersStep(row, step);
        if (hit && cell.classList.contains("play-hit")) {
          // Same cell hit on consecutive sixteenths: restart the press.
          cell.classList.remove("play-hit");
          void cell.offsetWidth;
        }
        cell.classList.toggle("play-hit", hit);
      }
      playhead.style.transform = `translateX(${playCol * 100}%)`;
    }
    refs.beatGrid.classList.toggle("playing", playCol >= 0);
    if (lastPlayCol !== playCol) {
      stepNumbers.forEach((span, col) => span.classList.toggle("active", col === playCol));
    }
    lastPlayCol = playCol;

    rowLabels.forEach((label, row) => {
      label.classList.toggle("active", step >= 0 && cellTriggersStep(row, step));
    });
  }

  function render() {
    renderCells();
    renderPlayhead(state.currentStep);
  }

  // --------------------------------------------------------------- drag

  let pendingDrag = null;
  let drag = null;
  let suppressGridClick = false;

  const cellAt = (element) => element?.closest?.(".cell") ?? null;

  function startDrag(data) {
    const proxy = document.createElement("div");
    proxy.className = "drag-proxy";
    proxy.innerHTML = `<span class="token ${data.tokenState}"></span>`;
    document.body.appendChild(proxy);
    document.body.classList.add("dragging");
    drag = { ...data, proxy };
    try {
      data.captureEl?.setPointerCapture(data.pointerId);
    } catch {
      // Capture is a nicety; the document listeners still finish the drag.
    }
    moveDrag(data.x, data.y);
  }

  function moveDrag(x, y) {
    if (!drag) return;
    drag.proxy.style.left = `${x - 27}px`;
    drag.proxy.style.top = `${y - 27}px`;
  }

  function finishDrag(x, y, cancelled) {
    if (!drag) return;
    const current = drag;
    drag = null;
    current.proxy.remove();
    document.body.classList.remove("dragging");
    try {
      current.captureEl?.releasePointerCapture(current.pointerId);
    } catch {
      // Already released.
    }

    // The click that follows this pointerup belongs to the drag, not the
    // cell. Clear the flag on the next tick so a swallowed click never sticks.
    suppressGridClick = true;
    setTimeout(() => {
      suppressGridClick = false;
    }, 0);

    if (cancelled) {
      setMessage("Drag cancelled.");
      return;
    }
    const target = cellAt(document.elementFromPoint(x, y));
    if (!target) {
      setMessage("Token released outside the board.");
      return;
    }
    dropToken(current.source, current.tokenState, Number(target.dataset.row), Number(target.dataset.col));
  }

  function armDrag(evt, captureEl, source, tokenState) {
    if (evt.button !== 0 && evt.pointerType === "mouse") return;
    pendingDrag = { pointerId: evt.pointerId, x: evt.clientX, y: evt.clientY, captureEl, source, tokenState };
  }

  // A press on a token only arms a drag. The drag starts once the pointer
  // travels past the threshold; a plain click falls through to the grid
  // click handler and cycles the cell as normal.
  refs.beatGrid.addEventListener("pointerdown", (evt) => {
    const token = evt.target.closest(".token");
    const cell = cellAt(evt.target);
    if (!token || !cell || token.classList.contains("empty")) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    armDrag(evt, refs.beatGrid, { type: "cell", row, col }, state.board[row][col].state);
  });

  refs.tokenTray.addEventListener("pointerdown", (evt) => {
    if (!evt.target.closest(".ghost-token")) return;
    armDrag(evt, refs.tokenTray, { type: "tray" }, "first");
  });

  document.addEventListener("pointermove", (evt) => {
    if (pendingDrag && pendingDrag.pointerId === evt.pointerId) {
      const distance = Math.hypot(evt.clientX - pendingDrag.x, evt.clientY - pendingDrag.y);
      if (distance < DRAG_THRESHOLD_PX) return;
      const data = pendingDrag;
      pendingDrag = null;
      if (data.source.type === "cell") selectCell(data.source.row, data.source.col);
      startDrag(data);
    }
    if (drag && drag.pointerId === evt.pointerId) moveDrag(evt.clientX, evt.clientY);
  });

  const endPointer = (evt) => {
    if (pendingDrag && pendingDrag.pointerId === evt.pointerId) {
      pendingDrag = null;
      return;
    }
    if (drag && drag.pointerId === evt.pointerId) {
      finishDrag(evt.clientX, evt.clientY, evt.type === "pointercancel");
    }
  };
  document.addEventListener("pointerup", endPointer);
  document.addEventListener("pointercancel", endPointer);

  refs.beatGrid.addEventListener("click", (evt) => {
    if (suppressGridClick) {
      suppressGridClick = false;
      return;
    }
    if (drag) return;
    const cell = cellAt(evt.target);
    if (!cell) return;
    cycleCell(Number(cell.dataset.row), Number(cell.dataset.col));
  });

  /** Move keyboard focus to the selected cell (roving tabindex). */
  function focusSelectedCell() {
    const { row, col } = state.selected;
    cells[cellIndex(row, col)].focus({ preventScroll: true });
  }

  subscribe(render);
  render();

  return { renderPlayhead, focusSelectedCell };
}
