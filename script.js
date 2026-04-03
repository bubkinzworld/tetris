const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const DROP_INTERVAL_MS = 650;

const COLORS = ["#ff6b6b", "#57d6ff", "#7cffb2", "#ffd166", "#c792ff", "#ff9f68"];

const SHAPES = [
  [[0, 0], [-1, 0], [1, 0], [2, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [-1, 0], [1, 0], [1, 1]],
  [[0, 0], [-1, 0], [1, 0], [-1, 1]],
  [[0, 0], [1, 0], [0, 1], [-1, 1]],
  [[0, 0], [-1, 0], [0, 1], [1, 1]],
  [[0, 0], [-1, 0], [1, 0], [0, 1]],
];

const boardElement = document.getElementById("board");
const scoreElement = document.getElementById("score");
const linesElement = document.getElementById("lines");
const startButton = document.getElementById("startButton");
const musicButton = document.getElementById("musicButton");
const leftButton = document.getElementById("leftButton");
const rightButton = document.getElementById("rightButton");
const rotateButton = document.getElementById("rotateButton");
const downButton = document.getElementById("downButton");
const dropButton = document.getElementById("dropButton");

let cells = [];
let board = [];
let activePiece = null;
let score = 0;
let linesCleared = 0;
let dropTimer = null;
let audioContext = null;
let musicNodes = null;
let musicEnabled = false;
let touchStartX = 0;
let touchStartY = 0;
let touchTracking = false;

const MUSIC_SEQUENCE = [
  659.25, 493.88, 523.25, 587.33,
  523.25, 493.88, 440.0, 440.0,
  523.25, 659.25, 587.33, 523.25,
  493.88, 523.25, 587.33, 659.25,
];

function createEmptyBoard() {
  return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));
}

function updateMusicButton() {
  musicButton.textContent = musicEnabled ? "Pause Music" : "Play Music";
}

function stopMusic() {
  if (!musicNodes) {
    return;
  }

  clearInterval(musicNodes.intervalId);
  musicNodes.oscillators.forEach((oscillator) => oscillator.stop());
  musicNodes.masterGain.disconnect();
  musicNodes = null;
}

function startMusic() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    musicButton.disabled = true;
    musicButton.textContent = "Music Unavailable";
    return;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  if (musicNodes) {
    return;
  }

  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.05;
  masterGain.connect(audioContext.destination);

  const melodyGain = audioContext.createGain();
  melodyGain.gain.value = 0.8;
  melodyGain.connect(masterGain);

  const bassGain = audioContext.createGain();
  bassGain.gain.value = 0.45;
  bassGain.connect(masterGain);

  const melodyOscillator = audioContext.createOscillator();
  melodyOscillator.type = "square";
  melodyOscillator.connect(melodyGain);

  const bassOscillator = audioContext.createOscillator();
  bassOscillator.type = "triangle";
  bassOscillator.connect(bassGain);

  melodyOscillator.start();
  bassOscillator.start();

  let step = 0;
  const applyStep = () => {
    const frequency = MUSIC_SEQUENCE[step % MUSIC_SEQUENCE.length];
    const bassFrequency = frequency / 2;
    const now = audioContext.currentTime;

    melodyOscillator.frequency.setValueAtTime(frequency, now);
    bassOscillator.frequency.setValueAtTime(bassFrequency, now);
    melodyGain.gain.setValueAtTime(step % 4 === 3 ? 0.45 : 0.8, now);
    bassGain.gain.setValueAtTime(step % 8 < 4 ? 0.4 : 0.22, now);

    step += 1;
  };

  applyStep();
  const intervalId = window.setInterval(applyStep, 260);

  musicNodes = {
    intervalId,
    oscillators: [melodyOscillator, bassOscillator],
    masterGain,
  };
}

async function toggleMusic() {
  musicEnabled = !musicEnabled;

  if (musicEnabled) {
    startMusic();
    if (audioContext?.state === "suspended") {
      await audioContext.resume();
    }
  } else {
    stopMusic();
  }

  updateMusicButton();
}

function createBoardUi() {
  boardElement.innerHTML = "";
  cells = [];

  for (let row = 0; row < BOARD_HEIGHT; row += 1) {
    for (let col = 0; col < BOARD_WIDTH; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      boardElement.appendChild(cell);
      cells.push(cell);
    }
  }
}

function getCell(row, col) {
  return cells[row * BOARD_WIDTH + col];
}

function rotateOffsets(offsets) {
  return offsets.map(([x, y]) => [y, -x]);
}

function rotateGrid90(grid) {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const rotated = Array.from({ length: width }, () => Array(height).fill(null));

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      rotated[col][height - 1 - row] = grid[row][col];
    }
  }

  return rotated;
}

function makePiece() {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    anchor: { row: 1, col: Math.floor(BOARD_WIDTH / 2) },
    offsets: shape.map(([x, y]) => [x, y]),
    color,
  };
}

function getAbsoluteCells(piece) {
  return piece.offsets.map(([x, y]) => ({
    row: piece.anchor.row + y,
    col: piece.anchor.col + x,
  }));
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_HEIGHT && col >= 0 && col < BOARD_WIDTH;
}

function canOccupy(piece) {
  return getAbsoluteCells(piece).every(({ row, col }) => {
    if (col < 0 || col >= BOARD_WIDTH || row >= BOARD_HEIGHT) {
      return false;
    }

    if (row < 0) {
      return true;
    }

    return !board[row][col];
  });
}

function movePiece(piece, deltaRow, deltaCol) {
  return {
    ...piece,
    anchor: {
      row: piece.anchor.row + deltaRow,
      col: piece.anchor.col + deltaCol,
    },
  };
}

function lockPiece(piece) {
  getAbsoluteCells(piece).forEach(({ row, col }) => {
    if (inBounds(row, col)) {
      board[row][col] = piece.color;
    }
  });
}

function clearCompletedRows() {
  let clearedThisTick = 0;
  const nextBoard = board.filter((row) => {
    const complete = row.every(Boolean);
    if (complete) {
      clearedThisTick += 1;
      return false;
    }
    return true;
  });

  while (nextBoard.length < BOARD_HEIGHT) {
    nextBoard.unshift(Array(BOARD_WIDTH).fill(null));
  }

  board = nextBoard;

  if (clearedThisTick > 0) {
    linesCleared += clearedThisTick;
    score += [0, 100, 300, 500, 800][clearedThisTick] ?? clearedThisTick * 250;
    linesElement.textContent = String(linesCleared);
    scoreElement.textContent = String(score);
  }
}

function spawnPiece() {
  activePiece = makePiece();

  if (!canOccupy(activePiece)) {
    board = createEmptyBoard();
    score = 0;
    linesCleared = 0;
    scoreElement.textContent = "0";
    linesElement.textContent = "0";
    activePiece = makePiece();
  }
}

function stepGame() {
  if (!activePiece) {
    spawnPiece();
    render();
    return;
  }

  const nextPiece = movePiece(activePiece, 1, 0);
  if (canOccupy(nextPiece)) {
    activePiece = nextPiece;
  } else {
    lockPiece(activePiece);
    clearCompletedRows();
    spawnPiece();
  }

  render();
}

function rotateActivePiece(direction) {
  if (!activePiece) {
    return;
  }

  let rotatedOffsets = activePiece.offsets;
  const turns = direction > 0 ? 1 : 3;

  for (let i = 0; i < turns; i += 1) {
    rotatedOffsets = rotateOffsets(rotatedOffsets);
  }

  const rotatedPiece = {
    ...activePiece,
    offsets: rotatedOffsets,
  };

  if (canOccupy(rotatedPiece)) {
    activePiece = rotatedPiece;
    render();
  }
}

function moveActivePiece(direction) {
  if (!activePiece) {
    return;
  }

  const shifted = movePiece(activePiece, 0, direction);
  if (canOccupy(shifted)) {
    activePiece = shifted;
    render();
  }
}

function softDrop() {
  if (!activePiece) {
    return;
  }

  const lowered = movePiece(activePiece, 1, 0);
  if (canOccupy(lowered)) {
    activePiece = lowered;
    score += 1;
    scoreElement.textContent = String(score);
    render();
  } else {
    stepGame();
  }
}

function hardDrop() {
  if (!activePiece) {
    return;
  }

  let nextPiece = activePiece;
  while (canOccupy(movePiece(nextPiece, 1, 0))) {
    nextPiece = movePiece(nextPiece, 1, 0);
    score += 2;
  }

  scoreElement.textContent = String(score);
  activePiece = nextPiece;
  stepGame();
}

function render() {
  const activeCells = activePiece ? getAbsoluteCells(activePiece) : [];

  for (let row = 0; row < BOARD_HEIGHT; row += 1) {
    for (let col = 0; col < BOARD_WIDTH; col += 1) {
      const cell = getCell(row, col);
      const lockedColor = board[row][col];
      const isActive = activeCells.some((current) => current.row === row && current.col === col);

      cell.className = "cell";
      cell.style.background = "";

      if (lockedColor) {
        cell.classList.add("filled");
        cell.style.background = lockedColor;
      }

      if (isActive) {
        cell.classList.add("filled", "active");
        cell.style.background = activePiece.color;
      }
    }
  }
}

function restartGame() {
  board = createEmptyBoard();
  score = 0;
  linesCleared = 0;
  scoreElement.textContent = "0";
  linesElement.textContent = "0";
  activePiece = null;
  render();
}

function startLoop() {
  if (dropTimer) {
    clearInterval(dropTimer);
  }

  dropTimer = setInterval(stepGame, DROP_INTERVAL_MS);
}

document.addEventListener("keydown", (event) => {
  switch (event.code) {
    case "KeyA":
    case "ArrowLeft":
      moveActivePiece(-1);
      break;
    case "KeyD":
    case "ArrowRight":
      moveActivePiece(1);
      break;
    case "KeyW":
    case "ArrowUp":
      rotateActivePiece(1);
      break;
    case "KeyS":
    case "ArrowDown":
      softDrop();
      break;
    case "Space":
      event.preventDefault();
      hardDrop();
      break;
    default:
      break;
  }
});

startButton.addEventListener("click", () => {
  restartGame();
});

musicButton.addEventListener("click", () => {
  toggleMusic();
});

leftButton.addEventListener("click", () => {
  moveActivePiece(-1);
});

rightButton.addEventListener("click", () => {
  moveActivePiece(1);
});

rotateButton.addEventListener("click", () => {
  rotateActivePiece(1);
});

downButton.addEventListener("click", () => {
  softDrop();
});

dropButton.addEventListener("click", () => {
  hardDrop();
});

boardElement.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchTracking = true;
}, { passive: true });

boardElement.addEventListener("touchmove", (event) => {
  if (!touchTracking) {
    return;
  }

  event.preventDefault();
}, { passive: false });

boardElement.addEventListener("touchend", (event) => {
  if (!touchTracking) {
    return;
  }

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const swipeThreshold = 24;
  const tapThreshold = 10;

  touchTracking = false;

  if (absX < tapThreshold && absY < tapThreshold) {
    rotateActivePiece(1);
    return;
  }

  if (absX > absY && absX > swipeThreshold) {
    moveActivePiece(deltaX > 0 ? 1 : -1);
    return;
  }

  if (absY > swipeThreshold) {
    if (deltaY > 0) {
      if (absY > 90) {
        hardDrop();
      } else {
        softDrop();
      }
    } else {
      rotateActivePiece(1);
    }
  }
}, { passive: true });

createBoardUi();
restartGame();
updateMusicButton();
startLoop();
stepGame();
