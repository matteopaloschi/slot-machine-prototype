// =============================================================================
// GameState — Constants & State
// =============================================================================

const SYMBOLS = {
  seven:   { key: 'seven',   label: 'Seven (7)', file: 'images/symbols/seven.svg'   },
  diamond: { key: 'diamond', label: 'Diamante',  file: 'images/symbols/diamond.svg' },
  bell:    { key: 'bell',    label: 'Sino',       file: 'images/symbols/bell.svg'    },
  cherry:  { key: 'cherry',  label: 'Cereja',     file: 'images/symbols/cherry.svg'  },
  lemon:   { key: 'lemon',   label: 'Limão',      file: 'images/symbols/lemon.svg'   },
  bar:     { key: 'bar',     label: 'BAR',        file: 'images/symbols/bar.svg'     },
};

const SYMBOL_KEYS = Object.keys(SYMBOLS);
// ['seven', 'diamond', 'bell', 'cherry', 'lemon', 'bar']

const PAY_TABLE = [
  { reels: ['seven', 'seven', 'seven'], type: 'major', credits: 20, label: '7 · 7 · 7'  },
  { reels: ['bell',  'bell',  'bell' ], type: 'minor', credits: 5,  label: 'Sino × 3'   },
];

const OUTCOME_PROBABILITY = {
  major: 0.08,  // 8%
  minor: 0.16,  // cumulative 24%  (roll < 0.24)
  none:  0.76,  // 76%
};

const state = {
  credits: 100,
  mode: 'simulation',     // 'simulation' | 'arduino'
  tokenInserted: false,
  spinning: false,
  playUsed: false,
  currentOutcome: null,   // { type: 'major'|'minor'|'none', reels: string[] }
  spinStep: 0,
};

// =============================================================================
// SymbolManager — image element creation, fallback, preload
// =============================================================================

/**
 * Returns an <img> element for `symbolName`, sized to fill its container while
 * preserving the image's intrinsic aspect ratio. If the image fails to load an
 * onerror handler replaces the <img> with a <span class="symbol-fallback">
 * containing the symbol name in uppercase.
 * @param {string} symbolName - a key from SYMBOLS (e.g. 'seven', 'bell')
 * @returns {HTMLElement}
 */
function createSymbolNode(symbolName) {
  const symbol = SYMBOLS[symbolName];
  const img = document.createElement('img');

  img.src = symbol ? symbol.file : '';
  img.alt = symbol ? symbol.label : symbolName;
  img.style.maxWidth = '100%';
  img.style.maxHeight = '100%';
  img.style.objectFit = 'contain';

  img.onerror = function () {
    const parent = img.parentElement;
    const span = document.createElement('span');
    span.className = 'symbol-fallback';
    span.textContent = symbolName.toUpperCase();
    if (parent) {
      parent.replaceChild(span, img);
    }
  };

  return img;
}

/**
 * Clears `reelEl` and appends a fresh symbol node for `symbolName`.
 * @param {HTMLElement} reelEl
 * @param {string} symbolName
 */
function setReelSymbol(reelEl, symbolName) {
  if (!reelEl) return;
  reelEl.innerHTML = '';
  reelEl.appendChild(createSymbolNode(symbolName));
}

/**
 * Preloads all symbol images by attaching hidden <img> elements to document.body.
 * Resolves when every image has either loaded or errored.
 * @returns {Promise<void>}
 */
function preloadSymbols() {
  return new Promise((resolve) => {
    const keys = SYMBOL_KEYS;
    if (keys.length === 0) {
      resolve();
      return;
    }

    let settled = 0;
    const hiddenImgs = [];

    function onSettled() {
      settled += 1;
      if (settled === keys.length) {
        hiddenImgs.forEach(img => {
          if (img.parentNode) img.parentNode.removeChild(img);
        });
        resolve();
      }
    }

    keys.forEach(key => {
      const img = document.createElement('img');
      img.src = SYMBOLS[key].file;
      img.style.display = 'none';
      img.onload = onSettled;
      img.onerror = onSettled;
      document.body.appendChild(img);
      hiddenImgs.push(img);
    });
  });
}

// =============================================================================
// DOM references (populated by initializeApp)
// =============================================================================

let reelElements = [];
let statusEl           = null;
let resultEl           = null;
let toggleBtn          = null;
let insertBtn          = null;
let connectBtn         = null;
let homeView           = null;
let gameView           = null;
let connectHomeBtn     = null;
let startGameBtn       = null;
let homeStatusEl       = null;
let creditsDisplayEl   = null;
let modeIndicatorEl    = null;
let reloadBtn          = null;
let creditsExhaustedMsg = null;
let payTableEl         = null;
let paylineIndicatorEl = null;

// Serial references
let serialPort = null;
let writer     = null;
let reader     = null;

// Buffer used to accumulate partial chunks until a full line ('\n') arrives
let serialLineBuffer = '';

// Animation timer (legacy setTimeout loop — kept for compatibility)
let spinTimer = null;

// =============================================================================
// AnimEngine — module-level state
// =============================================================================

// Target frame interval in ms (clamped between 16 ms and 83 ms → 12–60 fps)
const FRAME_INTERVAL = Math.min(83, Math.max(16, 50));

// Handle for the single shared rAF loop (null when not spinning)
let reelRafHandle = null;

// Tracks the last rendered symbol key per reel to enforce no-consecutive-repeat
let reelPrevSymbols = [null, null, null];

// Timestamp of the last rendered frame (used to pace the loop to FRAME_INTERVAL)
let lastFrameTime = 0;

// Cascade stop timer handles — cleared at the start of each spin and each stop
let cascadeTimers = [];

// All setTimeout handles created by win-effect functions, so they can all be
// cancelled atomically by clearWinEffects() (guards Property 8, Req 3.4)
let winEffectTimers = [];

// Reference to the win overlay element (set by initializeApp)
let winOverlayEl    = null;
let winOverlayMsgEl = null;

// =============================================================================
// GameState — decideOutcome()
// =============================================================================

/**
 * Decides the outcome of a spin using OUTCOME_PROBABILITY weights.
 * @returns {{ type: 'major'|'minor'|'none', reels: string[] }}
 */
function decideOutcome() {
  const roll = Math.random();

  if (roll < OUTCOME_PROBABILITY.major) {
    return { type: 'major', reels: ['seven', 'seven', 'seven'] };
  }

  if (roll < OUTCOME_PROBABILITY.major + OUTCOME_PROBABILITY.minor) {
    return { type: 'minor', reels: ['bell', 'bell', 'bell'] };
  }

  // NONE — pick 3 random symbols that do NOT form a winning combination
  let reels;
  do {
    reels = [
      SYMBOL_KEYS[Math.floor(Math.random() * SYMBOL_KEYS.length)],
      SYMBOL_KEYS[Math.floor(Math.random() * SYMBOL_KEYS.length)],
      SYMBOL_KEYS[Math.floor(Math.random() * SYMBOL_KEYS.length)],
    ];
  } while (
    PAY_TABLE.some(
      entry =>
        entry.reels[0] === reels[0] &&
        entry.reels[1] === reels[1] &&
        entry.reels[2] === reels[2]
    )
  );

  return { type: 'none', reels };
}

// =============================================================================
// UIRenderer — DOM write functions
// =============================================================================

/**
 * Updates #credits-display text content to show the credit count.
 * @param {number} credits
 */
function renderCredits(credits) {
  if (creditsDisplayEl) creditsDisplayEl.textContent = String(credits);
}

/**
 * Updates #status element text (canonical replacement for setStatus).
 * @param {string} msg
 */
function renderStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

/**
 * Updates #result element text (canonical replacement for setResult).
 * @param {string} msg
 */
function renderResult(msg) {
  if (resultEl) resultEl.textContent = msg;
}

/**
 * Sets #mode-indicator text and toggles the appropriate CSS class.
 * mode 'arduino'    → text "Arduino Conectado", adds mode-arduino, removes mode-simulation
 * mode 'simulation' → text "Modo Simulação",    adds mode-simulation, removes mode-arduino
 * @param {'arduino'|'simulation'} mode
 */
function renderModeIndicator(mode) {
  if (!modeIndicatorEl) return;
  if (mode === 'arduino') {
    modeIndicatorEl.textContent = 'Arduino Conectado';
    modeIndicatorEl.classList.add('mode-arduino');
    modeIndicatorEl.classList.remove('mode-simulation');
  } else {
    modeIndicatorEl.textContent = 'Modo Simulação';
    modeIndicatorEl.classList.add('mode-simulation');
    modeIndicatorEl.classList.remove('mode-arduino');
  }
}

/**
 * Reads from `state` and enables/disables #insert-btn and #toggle-btn.
 * - #insert-btn disabled when state.spinning === true OR state.credits === 0
 * - #toggle-btn disabled when not spinning and no fresh token (can't start a spin)
 *   but enabled when spinning (so the player can stop it)
 */
function updateButtons() {
  if (insertBtn) {
    insertBtn.disabled = state.spinning || state.credits === 0;
  }
  if (toggleBtn) {
    // Disabled only when idle without a usable token; always enabled while spinning
    toggleBtn.disabled = !state.spinning && (!state.tokenInserted || state.playUsed);
    toggleBtn.textContent = state.spinning
      ? 'Parar giro'
      : state.playUsed
        ? 'Jogo encerrado'
        : 'Iniciar giro';
  }
}

/**
 * Shows or hides #reload-btn and #credits-exhausted-msg.
 * @param {boolean} show
 */
function showReloadButton(show) {
  if (reloadBtn) {
    reloadBtn.style.display = show ? '' : 'none';
  }
  if (creditsExhaustedMsg) {
    creditsExhaustedMsg.style.display = show ? '' : 'none';
  }
}

/**
 * Writes the pay table DOM into #pay-table. Called once at init.
 * Creates entries from PAY_TABLE with symbol labels and credit amounts.
 */
function renderPayTable() {
  if (!payTableEl) return;
  payTableEl.innerHTML = '';
  PAY_TABLE.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'pay-table-entry';

    const symbolsSpan = document.createElement('span');
    symbolsSpan.className = 'pay-table-symbols';
    symbolsSpan.textContent = entry.label;

    const creditsSpan = document.createElement('span');
    creditsSpan.className = 'pay-table-credits';
    creditsSpan.textContent = `${entry.credits} créditos`;

    div.appendChild(symbolsSpan);
    div.appendChild(creditsSpan);
    payTableEl.appendChild(div);
  });
}

// =============================================================================
// Helper utilities (will be expanded / replaced in later tasks)
// =============================================================================

/** @deprecated Use renderStatus() instead */
function setStatus(message) {
  renderStatus(message);
}

/** @deprecated Use renderResult() instead */
function setResult(message) {
  renderResult(message);
}

function setHomeStatus(message) {
  if (homeStatusEl) homeStatusEl.textContent = message;
}

function showGameView() {
  if (homeView) {
    homeView.classList.add('is-hidden');
    homeView.hidden = true;
    homeView.setAttribute('aria-hidden', 'true');
  }
  if (gameView) {
    gameView.classList.remove('is-hidden');
    gameView.hidden = false;
    gameView.setAttribute('aria-hidden', 'false');
  }
}

/** Returns a random symbol key that is different from `exclude`. */
function randomSymbolKey(exclude) {
  const candidates = exclude
    ? SYMBOL_KEYS.filter(k => k !== exclude)
    : SYMBOL_KEYS;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function setReels(keys) {
  keys.forEach((key, index) => {
    if (reelElements[index]) {
      reelElements[index].textContent = key; // placeholder until SymbolManager (Task 3)
    }
  });
}

function setReelSpinning(active) {
  reelElements.forEach(reel => {
    if (reel) reel.classList.toggle('is-spinning', active);
  });
}

function setWinState(active) {
  if (gameView) gameView.classList.toggle('is-winning', active);
}

function updateControls() {
  const canPlay = state.tokenInserted && !state.playUsed && !state.spinning;
  if (toggleBtn) {
    toggleBtn.disabled = !state.spinning && !canPlay;
    toggleBtn.textContent = state.spinning
      ? 'Parar giro'
      : state.playUsed
        ? 'Jogo encerrado'
        : 'Iniciar giro';
  }
  if (insertBtn) {
    insertBtn.disabled = state.spinning || state.credits === 0;
  }
}

// =============================================================================
// AnimEngine — rAF frame loop
// =============================================================================

/**
 * Single shared requestAnimationFrame loop that drives all three reels.
 * Runs at ~FRAME_INTERVAL ms per frame (20 fps by default).
 * Stops automatically when state.spinning becomes false.
 * @param {number} timestamp - DOMHighResTimeStamp provided by rAF
 */
function spinFrameLoop(timestamp) {
  if (!state.spinning) return;

  if (timestamp - lastFrameTime >= FRAME_INTERVAL) {
    lastFrameTime = timestamp;
    reelElements.forEach((reel, i) => {
      if (!reel) return;
      const newKey = randomSymbolKey(reelPrevSymbols[i]);
      setReelSymbol(reel, newKey);
      reelPrevSymbols[i] = newKey;
    });
  }

  reelRafHandle = requestAnimationFrame(spinFrameLoop);
}

/**
 * Begins the rAF spin loop and updates UI state.
 * - Sets state.spinning = true
 * - Adds is-spinning class to all three reels
 * - Disables #insert-btn and #toggle-btn via updateButtons()
 * - Initialises per-reel prev-symbol state
 * - Kicks off the shared spinFrameLoop
 */
function startSpinAnimation() {
  // Cancel any stale loop before starting a fresh one
  if (reelRafHandle !== null) {
    cancelAnimationFrame(reelRafHandle);
    reelRafHandle = null;
  }

  // Clear any pending cascade stop timers from a previous stop sequence
  cascadeTimers.forEach(t => clearTimeout(t));
  cascadeTimers = [];

  // Reset per-frame state
  lastFrameTime = 0;
  reelPrevSymbols = [null, null, null];

  // Mark all reels as spinning
  reelElements.forEach(reel => {
    if (reel) reel.classList.add('is-spinning');
  });

  // Update game state and disable buttons (guards Property 4)
  state.spinning = true;
  updateButtons();

  // Start the shared frame loop
  reelRafHandle = requestAnimationFrame(spinFrameLoop);
}

/**
 * Triggers the cascade stop sequence for all three reels.
 * - Clears any pending cascade timers
 * - Stops reel-0 immediately, reel-1 after 300 ms, reel-2 after 600 ms
 * - Each reel stop: cancels the shared rAF, sets the final symbol, applies .reel--snap,
 *   removes .reel--snap after 150 ms, and removes .is-spinning from that reel
 * - After reel-2 stops (600 ms): shows #payline-indicator, sets state.spinning = false,
 *   calls updateButtons(), then invokes optional onCascadeComplete callback
 * Requires state.currentOutcome to already be set before calling.
 * @param {Function} [onCascadeComplete] - Optional callback invoked after all reels stop
 */
function stopSpinAnimation(onCascadeComplete) {
  // Clear any previously scheduled cascade timers
  cascadeTimers.forEach(t => clearTimeout(t));
  cascadeTimers = [];

  const outcome = state.currentOutcome;

  /**
   * Stops an individual reel: cancels rAF, sets final symbol, applies snap class.
   * @param {number} reelIndex
   */
  function stopReel(reelIndex) {
    // Cancel the shared rAF loop (only needed on reel-0; subsequent stops are no-ops
    // if the loop already stopped, but cancelling a completed handle is safe)
    if (reelRafHandle !== null) {
      cancelAnimationFrame(reelRafHandle);
      reelRafHandle = null;
    }

    const reelEl = reelElements[reelIndex];
    if (!reelEl) return;

    // Set the pre-determined outcome symbol
    const symbolKey = outcome ? outcome.reels[reelIndex] : SYMBOL_KEYS[0];
    setReelSymbol(reelEl, symbolKey);

    // Apply snap animation class and remove it after 150 ms
    reelEl.classList.add('reel--snap');
    const snapTimer = setTimeout(() => {
      reelEl.classList.remove('reel--snap');
    }, 150);
    cascadeTimers.push(snapTimer);

    // Remove spinning state from this reel
    reelEl.classList.remove('is-spinning');
  }

  // Stop reel-0 immediately
  stopReel(0);

  // Stop reel-1 after 300 ms
  const t1 = setTimeout(() => {
    stopReel(1);
  }, 300);
  cascadeTimers.push(t1);

  // Stop reel-2 after 600 ms, then finalise spin state
  const t2 = setTimeout(() => {
    stopReel(2);

    // Show payline indicator
    if (paylineIndicatorEl) {
      paylineIndicatorEl.style.display = '';
    }

    // Finalise state
    state.spinning = false;
    updateButtons();

    // Invoke post-cascade callback if provided (e.g. to apply credit awards)
    if (typeof onCascadeComplete === 'function') {
      onCascadeComplete();
    }
  }, 600);
  cascadeTimers.push(t2);
}

// =============================================================================
// AnimEngine — win effects
// =============================================================================

/**
 * Shows the win overlay with `message` text.
 * @param {string} message
 */
function showWinOverlay(message) {
  if (winOverlayMsgEl) winOverlayMsgEl.textContent = message;
  if (winOverlayEl) {
    winOverlayEl.classList.remove('is-hidden');
  }
}

/**
 * Hides the win overlay element.
 */
function hideWinOverlay() {
  if (winOverlayEl) winOverlayEl.classList.add('is-hidden');
  if (winOverlayMsgEl) winOverlayMsgEl.textContent = '';
}

/**
 * Triggers the MAJOR win effect:
 *  - Adds .win-pulse-major to all three reels
 *  - Appends ≥ 30 .particle divs with randomised gold/amber colour, 6–14 px size,
 *    random direction, and CSS animation duration 0.8–1.5 s
 *  - Shows "JACKPOT!" overlay for ≥ 2 s
 *  - All setTimeout handles stored in winEffectTimers
 * @param {HTMLElement[]} [reels] - optional override; defaults to reelElements
 */
function triggerMajorWin(reels) {
  const targetReels = reels || reelElements;
  targetReels.forEach(reel => {
    if (reel) reel.classList.add('win-pulse-major');
  });

  // Particle system — find the reels container to anchor particles
  const container = document.getElementById('reels-container') ||
    (targetReels[0] && targetReels[0].parentElement);

  const PARTICLE_COUNT = 30;
  const particles = [];

  if (container) {
    // Ensure the container has relative positioning for absolute particle placement
    const containerStyle = window.getComputedStyle(container);
    if (containerStyle.position === 'static') {
      container.style.position = 'relative';
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';

      // Randomised gold / amber colour
      const colours = ['#ffd166', '#ffb347', '#ffc200', '#f59e0b', '#ffa500', '#e8a000'];
      const colour  = colours[Math.floor(Math.random() * colours.length)];

      // Randomised size 6–14 px
      const size = 6 + Math.random() * 8; // 6 to 14

      // Randomised direction (spread fan upward and sideways)
      const angle    = (Math.random() * 360); // full 360° spread
      const distance = 40 + Math.random() * 80; // 40–120 px travel
      const tx = Math.cos((angle * Math.PI) / 180) * distance;
      const ty = Math.sin((angle * Math.PI) / 180) * distance - 40; // bias upward

      // Randomised duration 0.8–1.5 s
      const duration = (0.8 + Math.random() * 0.7).toFixed(3);

      // Random starting position spread across the container
      const containerRect = container.getBoundingClientRect();
      const startX = Math.random() * (containerRect.width  || 300);
      const startY = Math.random() * (containerRect.height || 130);

      particle.style.cssText = [
        `background: ${colour}`,
        `width: ${size.toFixed(1)}px`,
        `height: ${size.toFixed(1)}px`,
        `left: ${startX.toFixed(1)}px`,
        `top: ${startY.toFixed(1)}px`,
        `--tx: ${tx.toFixed(1)}px`,
        `--ty: ${ty.toFixed(1)}px`,
        `--particle-duration: ${duration}s`,
      ].join(';');

      container.appendChild(particle);
      particles.push(particle);
    }
  }

  // Remove particles after the longest possible animation (1.5 s) + small buffer
  const particleCleanupTimer = setTimeout(() => {
    particles.forEach(p => {
      if (p.parentNode) p.parentNode.removeChild(p);
    });
  }, 1600);
  winEffectTimers.push(particleCleanupTimer);

  // Show JACKPOT! overlay for ≥ 2 s
  showWinOverlay('JACKPOT!');
  const overlayTimer = setTimeout(() => {
    hideWinOverlay();
  }, 2000);
  winEffectTimers.push(overlayTimer);
}

/**
 * Triggers the MINOR win effect:
 *  - Adds .win-pulse-minor to all three reels
 *  - Shows "PRÊMIO!" overlay for ≥ 1 s
 *  - All setTimeout handles stored in winEffectTimers
 * @param {HTMLElement[]} [reels] - optional override; defaults to reelElements
 */
function triggerMinorWin(reels) {
  const targetReels = reels || reelElements;
  targetReels.forEach(reel => {
    if (reel) reel.classList.add('win-pulse-minor');
  });

  // Show PRÊMIO! overlay for ≥ 1 s
  showWinOverlay('PRÊMIO!');
  const overlayTimer = setTimeout(() => {
    hideWinOverlay();
  }, 1000);
  winEffectTimers.push(overlayTimer);
}

/**
 * Cancels all pending win-effect timers, removes all .particle elements,
 * removes win-pulse classes from all reels, and hides the overlay.
 * Called at the start of each new spin and after effect duration elapses.
 * (guards Property 8, Req 3.4)
 */
function clearWinEffects() {
  // Cancel all pending timers
  winEffectTimers.forEach(t => clearTimeout(t));
  winEffectTimers = [];

  // Remove all particle elements from the DOM
  document.querySelectorAll('.particle').forEach(p => {
    if (p.parentNode) p.parentNode.removeChild(p);
  });

  // Remove win-pulse classes from all reels
  reelElements.forEach(reel => {
    if (reel) {
      reel.classList.remove('win-pulse-major');
      reel.classList.remove('win-pulse-minor');
    }
  });

  // Also scrub any stray win-pulse classes on any element in the document
  document.querySelectorAll('.win-pulse-major').forEach(el => {
    el.classList.remove('win-pulse-major');
  });
  document.querySelectorAll('.win-pulse-minor').forEach(el => {
    el.classList.remove('win-pulse-minor');
  });

  // Hide the overlay
  hideWinOverlay();
}

// =============================================================================
// Animation helpers (legacy — kept; startSpin() now delegates to startSpinAnimation)
// =============================================================================

function animateSpin() {
  if (!state.spinning) return;

  setReels([
    randomSymbolKey(),
    randomSymbolKey(),
    randomSymbolKey(),
  ]);
  spinTimer = window.setTimeout(animateSpin, 80);
}

function finishSpin() {
  const outcome = state.currentOutcome || decideOutcome();
  setReels(outcome.reels);

  const message = outcome.type === 'major'
    ? 'Prêmio maior liberado!'
    : outcome.type === 'minor'
      ? 'Bonus menor liberado.'
      : 'Sem prêmio desta vez.';

  setResult(message);
  setStatus('Giro encerrado.');
  setReelSpinning(false);
  setWinState(outcome.type !== 'none');
  sendCommand(`RESULT:${outcome.type.toUpperCase()}`);

  state.spinning = false;
  state.currentOutcome = null;
  state.spinStep = 0;
  updateControls();
}

// =============================================================================
// Game actions (will be expanded in Tasks 9 and 11)
// =============================================================================

/**
 * Inserts a coin: debits 1 credit, sets tokenInserted=true, clears prior
 * outcome/playUsed, and updates the UI before any animation starts.
 * In Arduino mode sends the FICHA command; no command in simulation mode.
 *
 * @param {boolean} [fromHardware=false] - true when this call originated from
 *   a TOKEN_INSERTED message read off the serial port, so we must NOT echo
 *   the FICHA command back to the Arduino (it already knows).
 */
function insertCoin(fromHardware = false) {
  if (state.credits === 0) return;
  if (state.tokenInserted) return; // ignore duplicate token reads

  // Clear any active win effects from a previous round
  if (typeof clearWinEffects === 'function') clearWinEffects();

  state.credits        -= 1;
  state.tokenInserted   = true;
  state.playUsed        = false;
  state.currentOutcome  = null;
  state.spinStep        = 0;

  // Update UI BEFORE any animation starts (guards Property 1)
  renderCredits(state.credits);
  renderStatus('Ficha inserida. Pronto para jogar.');
  renderResult('');
  updateButtons();

  // Show reload button if credits just hit 0
  if (state.credits === 0) {
    showReloadButton(true);
  }

  // Send serial command in Arduino mode only, and only if this insertion was
  // triggered from the UI (not an echo of a hardware-reported token)
  if (state.mode === 'arduino' && !fromHardware) {
    sendCommand('FICHA');
  }
}

/**
 * Starts a spin round.
 *
 * Guards (Property 11):
 *   - tokenInserted === false → status "Insira uma ficha antes de girar.", return
 *   - playUsed === true       → status message, return
 *
 * On proceed:
 *   1. Clear any leftover win effects from the previous round
 *   2. Call decideOutcome() and store result in state.currentOutcome
 *   3. Set playUsed = true, hide payline indicator
 *   4. Call startSpinAnimation() to begin the rAF loop
 *   5. In Arduino mode only: send START command
 *
 * @param {boolean} [fromHardware=false] - true when triggered by a SPIN_START
 *   message read off the serial port (physical button press).
 *
 * Requirements: 4.7, 5.3, 7.1
 */
function startSpin(fromHardware = false) {
  // Guard: token not inserted (Property 11 — must not alter credits or spin state)
  if (!state.tokenInserted) {
    renderStatus('Insira uma ficha antes de girar.');
    return;
  }

  // Guard: play already used for this token
  if (state.playUsed) {
    renderStatus('Esta ficha já foi usada. Insira outra ficha para jogar novamente.');
    return;
  }

  // Clear any leftover win effects before starting a new spin
  clearWinEffects();

  // Hide payline indicator (shown again after cascade stop)
  if (paylineIndicatorEl) {
    paylineIndicatorEl.style.display = 'none';
  }

  // Decide outcome now so the cascade stop can snap to the correct symbols
  state.currentOutcome = decideOutcome();
  state.playUsed = true;
  state.spinStep = 0;

  renderStatus('Giro iniciado. Clique novamente para parar.');

  // Begin rAF spin animation
  startSpinAnimation();

  // Send serial command in Arduino mode only, unless this call is just an
  // echo of the Arduino's own SPIN_START report
  if (state.mode === 'arduino' && !fromHardware) {
    sendCommand('START');
  }
}

/**
 * Stops the active spin.
 *
 * - Guards: returns early if not spinning
 * - Calls stopSpinAnimation() with a post-cascade callback that:
 *     1. Applies the credit award for the outcome (Property 2):
 *        MAJOR → +20, MINOR → +5, NONE → unchanged
 *     2. Calls renderCredits, renderResult, updateButtons, showReloadButton
 *     3. Triggers the appropriate win effect (triggerMajorWin / triggerMinorWin / nothing)
 * - In Arduino mode: sends STOP command before cascade begins
 *
 * @param {boolean} [fromHardware=false] - true when triggered by a SPIN_STOP
 *   message read off the serial port (physical button press).
 *
 * Requirements: 4.3, 4.4, 5.4, 7.1
 */
function stopSpin(fromHardware = false) {
  if (!state.spinning) return;

  // Send STOP command in Arduino mode only, unless this is an echo of the
  // Arduino's own SPIN_STOP report
  if (state.mode === 'arduino' && !fromHardware) {
    sendCommand('STOP');
  }

  // Define what happens after all three reels have stopped (600 ms cascade)
  function onCascadeComplete() {
    const outcome = state.currentOutcome;
    const outcomeType = outcome ? outcome.type : 'none';

    // Apply credit award (Property 2)
    if (outcomeType === 'major') {
      state.credits += 20;
    } else if (outcomeType === 'minor') {
      state.credits += 5;
    }
    // 'none' → no credit change

    // Determine result message
    let resultMsg;
    if (outcomeType === 'major') {
      resultMsg = 'JACKPOT! +20 créditos!';
    } else if (outcomeType === 'minor') {
      resultMsg = 'Prêmio! +5 créditos!';
    } else {
      resultMsg = 'Sem prêmio desta vez.';
    }

    // Update UI
    renderCredits(state.credits);
    renderResult(resultMsg);
    renderStatus('Giro encerrado.');
    updateButtons();

    // Show reload button if credits are exhausted
    if (state.credits === 0) {
      showReloadButton(true);
    }

    // Trigger win effects
    if (outcomeType === 'major') {
      triggerMajorWin(reelElements);
    } else if (outcomeType === 'minor') {
      triggerMinorWin(reelElements);
    }

    // Tell the Arduino which prize to dispense (drives the servo on the
    // physical dispenser) and then reset the hardware token state so a new
    // ficha is required for the next round.
    if (state.mode === 'arduino') {
      const serialCommands = getSerialCommandsForOutcome(outcomeType);
      serialCommands.forEach(command => sendCommand(command));
    }

    // Reset token state so a new ficha is required for the next round
    state.tokenInserted = false;
  }

  stopSpinAnimation(onCascadeComplete);
}

// =============================================================================
// SerialAdapter
// =============================================================================

async function connectArduino() {
  if (!navigator.serial) {
    const message = 'Web Serial não está disponível neste navegador.';
    setStatus(message);
    setHomeStatus(message);
    return;
  }

  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 9600 });

    const textDecoder = new TextDecoderStream();
    serialPort.readable.pipeTo(textDecoder.writable).catch(() => {
      // pipeTo rejects when the port is closed/disconnected; handled below
    });
    reader = textDecoder.readable.getReader();

    writer = serialPort.writable.getWriter();

    // Flip the app into Arduino mode now that the port is open and the
    // reader/writer are ready — this is what actually activates the
    // sendCommand() calls inside insertCoin()/startSpin()/stopSpin().
    state.mode = 'arduino';
    renderModeIndicator('arduino');

    serialLineBuffer = '';

    const message = 'Arduino conectado.';
    setStatus(message);
    setHomeStatus('Arduino conectado. Você já pode iniciar o jogo.');

    // React to physical disconnects (cable pulled, device reset, etc.)
    navigator.serial.addEventListener('disconnect', handleSerialDisconnect);

    readFromArduino();
  } catch (error) {
    const message = `Falha ao conectar: ${error.message}`;
    setStatus(message);
    setHomeStatus(message);
  }
}

/**
 * Reads chunks from the Arduino, buffers them, and dispatches one
 * processSerialLine() call per complete '\n'-terminated line. Web Serial /
 * TextDecoderStream chunks are NOT guaranteed to align with line breaks, so
 * a raw `value.trim()` per read (the previous implementation) could split a
 * single message across two reads and silently drop it.
 */
async function readFromArduino() {
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      serialLineBuffer += value;

      let newlineIndex;
      while ((newlineIndex = serialLineBuffer.indexOf('\n')) >= 0) {
        const line = serialLineBuffer.slice(0, newlineIndex).trim();
        serialLineBuffer = serialLineBuffer.slice(newlineIndex + 1);
        if (line) processSerialLine(line);
      }
    }
  } catch (error) {
    // Happens e.g. when the device is unplugged mid-read
    console.error('Erro de leitura serial:', error);
    handleSerialDisconnect();
  }
}

/**
 * Interprets a single line reported by the Arduino sketch and synchronises
 * the JS state with what actually happened on the hardware (ultrasonic
 * sensor / physical button), instead of relying solely on UI clicks.
 * @param {string} line
 */
function processSerialLine(line) {
  console.log('Arduino:', line);

  switch (line) {
    case 'TOKEN_INSERTED':
      // Sensor ultrassônico detectou a ficha — sincroniza o estado do jogo
      insertCoin(true);
      break;

    case 'SPIN_START':
      // Botão físico pressionado para iniciar
      startSpin(true);
      break;

    case 'SPIN_STOP':
      // Botão físico pressionado novamente para parar
      stopSpin(true);
      break;

    case 'RESET_OK':
      renderStatus('Arduino resetado.');
      break;

    case 'PRIZE_MAJOR':
    case 'PRIZE_MINOR':
    case 'NO_PRIZE':
      // Confirmação do Arduino de que o dispenser foi acionado (ou não);
      // a UI já reflete o resultado a partir do onCascadeComplete.
      break;

    default:
      // Mensagem não reconhecida — apenas loga, não quebra o fluxo
      break;
  }
}

/**
 * Cleans up serial state after a disconnect (physical unplug or read error)
 * and falls back to simulation mode so the game keeps working from the UI.
 */
function handleSerialDisconnect() {
  if (navigator.serial && typeof navigator.serial.removeEventListener === 'function') {
    navigator.serial.removeEventListener('disconnect', handleSerialDisconnect);
  }

  state.mode = 'simulation';
  renderModeIndicator('simulation');
  renderStatus('Arduino desconectado. Voltando ao modo simulação.');
  setHomeStatus('Arduino desconectado. Voltando ao modo simulação.');

  writer = null;
  reader = null;
  serialPort = null;
  serialLineBuffer = '';

  return Promise.resolve();
}

function getSerialCommandsForOutcome(outcomeType) {
  if (state.mode !== 'arduino') return [];

  const normalizedType = (outcomeType || 'none').toString().toLowerCase();
  let resultCommand = 'RESULT:NONE';

  if (normalizedType === 'major') {
    resultCommand = 'RESULT:MAJOR';
  } else if (normalizedType === 'minor') {
    resultCommand = 'RESULT:MINOR';
  }

  return [resultCommand, 'RESET'];
}

async function sendCommand(command) {
  if (!writer) return;
  try {
    const payload = `${command}\n`;
    await writer.write(new TextEncoder().encode(payload));
  } catch (error) {
    console.error('Falha ao enviar comando serial:', error);
    handleSerialDisconnect();
  }
}

// =============================================================================
// Initialization
// =============================================================================

function initializeApp() {
  reelElements = [
    document.getElementById('reel-0'),
    document.getElementById('reel-1'),
    document.getElementById('reel-2'),
  ];
  statusEl            = document.getElementById('status');
  resultEl            = document.getElementById('result');
  toggleBtn           = document.getElementById('toggle-btn');
  insertBtn           = document.getElementById('insert-btn');
  connectBtn          = document.getElementById('connect-btn');
  homeView            = document.getElementById('home-view');
  gameView            = document.getElementById('game-view');
  connectHomeBtn      = document.getElementById('connect-home-btn');
  startGameBtn        = document.getElementById('start-game-btn');
  homeStatusEl        = document.getElementById('home-status');
  creditsDisplayEl    = document.getElementById('credits-display');
  modeIndicatorEl     = document.getElementById('mode-indicator');
  reloadBtn           = document.getElementById('reload-btn');
  creditsExhaustedMsg = document.getElementById('credits-exhausted-msg');
  payTableEl          = document.getElementById('pay-table');
  paylineIndicatorEl  = document.getElementById('payline-indicator');
  winOverlayEl        = document.getElementById('win-overlay');
  winOverlayMsgEl     = document.getElementById('win-overlay-msg');

  // Reflect the initial (simulation) mode in the UI
  renderModeIndicator(state.mode);

  if (insertBtn) {
    insertBtn.addEventListener('click', () => insertCoin(false));
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (state.spinning) {
        stopSpin(false);
      } else {
        startSpin(false);
      }
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', connectArduino);
  }

  if (connectHomeBtn) {
    connectHomeBtn.addEventListener('click', connectArduino);
  }

  if (startGameBtn) {
    startGameBtn.addEventListener('click', () => {
      showGameView();
      setHomeStatus('Jogo iniciado. Insira uma ficha para começar.');
    });
  }

  updateControls();
}

document.addEventListener('DOMContentLoaded', initializeApp);

// =============================================================================
// Exports — consumed by __tests__ (not loaded by index.html directly)
// =============================================================================

export {
  SYMBOLS,
  SYMBOL_KEYS,
  PAY_TABLE,
  OUTCOME_PROBABILITY,
  state,
  decideOutcome,
  createSymbolNode,
  setReelSymbol,
  preloadSymbols,
  randomSymbolKey,
  // UIRenderer
  renderCredits,
  renderStatus,
  renderResult,
  renderModeIndicator,
  updateButtons,
  showReloadButton,
  renderPayTable,
  // AnimEngine
  startSpinAnimation,
  stopSpinAnimation,
  triggerMajorWin,
  triggerMinorWin,
  clearWinEffects,
  winEffectTimers,
  FRAME_INTERVAL,
  // Game actions
  insertCoin,
  startSpin,
  stopSpin,
  // SerialAdapter
  connectArduino,
  processSerialLine,
  getSerialCommandsForOutcome,
  handleSerialDisconnect,
};