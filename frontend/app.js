const symbols = ["🍒", "🍋", "🦎", "🐊"];
const reelElements = [document.getElementById("reel-0"), document.getElementById("reel-1"), document.getElementById("reel-2")];
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const toggleBtn = document.getElementById("toggle-btn");
const insertBtn = document.getElementById("insert-btn");
const connectBtn = document.getElementById("connect-btn");

let tokenInserted = false;
let spinning = false;
let playUsed = false;
let spinTimer = null;
let serialPort = null;
let writer = null;
let reader = null;
let currentOutcome = null;
let spinStep = 0;

function setStatus(message) {
  statusEl.textContent = message;
}

function setResult(message) {
  resultEl.textContent = message;
}

function randomSymbol() {
  return symbols[Math.floor(Math.random() * symbols.length)];
}

function getSpinSymbol(targetSymbol) {
  const alternatives = symbols.filter((symbol) => symbol !== targetSymbol);
  return alternatives[Math.floor(Math.random() * alternatives.length)];
}

function setReels(values) {
  values.forEach((value, index) => {
    reelElements[index].textContent = value;
  });
}

function updateControls() {
  const canPlay = tokenInserted && !playUsed && !spinning;
  toggleBtn.disabled = !spinning && !canPlay;
  toggleBtn.textContent = spinning
    ? "Parar giro"
    : playUsed
      ? "Jogo encerrado"
      : "Iniciar giro";
}

function animateSpin() {
  if (!spinning) return;

  setReels([randomSymbol(), randomSymbol(), randomSymbol()]);
  spinTimer = window.setTimeout(animateSpin, 80);
}

function finishSpin() {
  const outcome = currentOutcome || decideOutcome();
  setReels(outcome.reels);
  const message = outcome.type === "major"
    ? "Prêmio maior liberado!"
    : outcome.type === "minor"
      ? "Bonus menor liberado."
      : "Sem prêmio desta vez.";

  setResult(message);
  setStatus("Giro encerrado.");
  sendCommand(`RESULT:${outcome.type.toUpperCase()}`);
  spinning = false;
  currentOutcome = null;
  spinStep = 0;
  updateControls();
}

function startSpin() {
  if (!tokenInserted) {
    setStatus("Insira uma ficha antes de girar.");
    return;
  }

  if (playUsed) {
    setStatus("Esta ficha já foi usada. Insira outra ficha para jogar novamente.");
    return;
  }

  currentOutcome = decideOutcome();
  playUsed = true;
  spinning = true;
  setStatus("Giro iniciado. Clique novamente para parar.");
  setReels([randomSymbol(), randomSymbol(), randomSymbol()]);
  spinStep = 0;
  window.clearTimeout(spinTimer);
  animateSpin();
  sendCommand("START");
  updateControls();
}

function stopSpin() {
  if (!spinning) return;

  window.clearTimeout(spinTimer);
  finishSpin();
}

function decideOutcome() {
  const roll = Math.random();
  if (roll < 0.08) {
    return { type: "major", reels: ["🐊", "🐊", "🐊"] };
  }
  if (roll < 0.24) {
    return { type: "minor", reels: ["🦎", "🦎", "🦎"] };
  }

  const nonePatterns = [
    ["🍒", "🍋", "🍒"],
    ["🍋", "🍒", "🍋"],
    ["🦎", "🍋", "🍒"],
    ["🍒", "🍒", "🍋"],
    ["🍋", "🍋", "🦎"]
  ];

  return {
    type: "none",
    reels: nonePatterns[Math.floor(Math.random() * nonePatterns.length)]
  };
}

async function connectArduino() {
  if (!navigator.serial) {
    setStatus("Web Serial não está disponível neste navegador.");
    return;
  }

  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 9600 });

    const textDecoder = new TextDecoderStream();
    serialPort.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();

    writer = serialPort.writable.getWriter();
    setStatus("Arduino conectado.");
    readFromArduino();
  } catch (error) {
    setStatus(`Falha ao conectar: ${error.message}`);
  }
}

async function readFromArduino() {
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      console.log("Arduino:", value.trim());
    }
  }
}

async function sendCommand(command) {
  if (!writer) return;
  const payload = `${command}\n`;
  await writer.write(new TextEncoder().encode(payload));
}

insertBtn.addEventListener("click", () => {
  tokenInserted = true;
  playUsed = false;
  spinning = false;
  currentOutcome = null;
  spinStep = 0;
  window.clearTimeout(spinTimer);
  setResult("Pronto para jogar.");
  setStatus("Ficha inserida. Pronto para jogar.");
  updateControls();
  sendCommand("FICHA");
});

toggleBtn.addEventListener("click", () => {
  if (spinning) {
    stopSpin();
  } else {
    startSpin();
  }
});

connectBtn.addEventListener("click", connectArduino);
updateControls();
