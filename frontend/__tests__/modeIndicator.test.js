// modeIndicator.test.js
// Property test for mode indicator accuracy (Property 9)
// Validates: Requirements 5.8, 5.9

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { renderModeIndicator } from '../app.js';

// ---------------------------------------------------------------------------
// DOM setup
//
// renderModeIndicator() reads the modeIndicatorEl module-level variable which
// is populated during initializeApp().  In the test environment we bypass
// initializeApp() and instead directly inject a fresh DOM element before each
// iteration by re-using the same element reference that the module picks up.
//
// Because app.js is an ES module (type="module") its module-scope variables
// are live bindings.  However, modeIndicatorEl is a *private* module variable.
// The simplest approach: create a real DOM element and attach it as
// #mode-indicator so that renderModeIndicator() locates it via the same path
// used in the real application (getElementById), then call the function and
// inspect the element.
//
// This requires us to re-point the module's internal ref.  Since we can't
// directly assign private module vars, we create the element in document,
// re-import the function, and note that renderModeIndicator uses the closure
// variable `modeIndicatorEl` set during initializeApp.  
//
// To work around this without a full initializeApp() call, we stub the element
// by inserting it into the jsdom document and calling a minimal init that sets
// only `modeIndicatorEl`.
// ---------------------------------------------------------------------------

/**
 * Create (or replace) #mode-indicator in the jsdom document and return it.
 */
function setupModeIndicatorEl() {
  let el = document.getElementById('mode-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mode-indicator';
    document.body.appendChild(el);
  }
  // Reset classes and text before each use
  el.className = '';
  el.textContent = '';
  return el;
}

// We need renderModeIndicator to see our element.  The function uses the
// module-scoped `modeIndicatorEl` closure variable which is populated in
// initializeApp().  We call initializeApp once with the element already in
// the DOM so the ref is resolved.

import { state } from '../app.js';

// Minimal DOM skeleton required by initializeApp
function buildMinimalDOM() {
  document.body.innerHTML = `
    <div id="mode-indicator"></div>
    <div id="status"></div>
    <div id="result"></div>
    <div id="reel-0"></div>
    <div id="reel-1"></div>
    <div id="reel-2"></div>
    <button id="insert-btn"></button>
    <button id="toggle-btn"></button>
    <button id="connect-btn"></button>
    <button id="connect-home-btn"></button>
    <button id="start-game-btn"></button>
    <div id="home-view"></div>
    <div id="game-view"></div>
    <div id="home-status"></div>
    <div id="credits-display"></div>
    <button id="reload-btn"></button>
    <div id="credits-exhausted-msg"></div>
    <div id="pay-table"></div>
  `;
}

// ---------------------------------------------------------------------------
// Property 9 — Mode indicator accurately reflects current mode
// Feature: slot-machine-casino-upgrade, Property 9: Mode indicator accurately reflects current mode
// ---------------------------------------------------------------------------

describe('Property 9: Mode indicator accurately reflects current mode', () => {
  beforeEach(() => {
    buildMinimalDOM();
    // Trigger initializeApp so internal DOM refs are resolved
    // We dispatch DOMContentLoaded synthetically — but since the module
    // already ran DOMContentLoaded once, we call initializeApp indirectly
    // by importing it.  Instead, replicate the ref-assignment inline:
    // The cleanest path: just call initializeApp if exported, or dispatch event.
    // We'll dispatch DOMContentLoaded to trigger the listener inside app.js.
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  it('text and CSS class are mutually exclusive and correct for simulation and arduino modes', () => {
    // Feature: slot-machine-casino-upgrade, Property 9: Mode indicator accurately reflects current mode
    fc.assert(
      fc.property(
        fc.constantFrom('simulation', 'arduino'),
        (mode) => {
          const el = document.getElementById('mode-indicator');

          renderModeIndicator(mode);

          if (mode === 'arduino') {
            expect(el.textContent).toBe('Arduino Conectado');
            expect(el.classList.contains('mode-arduino')).toBe(true);
            expect(el.classList.contains('mode-simulation')).toBe(false);
          } else {
            // simulation
            expect(el.textContent).toBe('Modo Simulação');
            expect(el.classList.contains('mode-simulation')).toBe(true);
            expect(el.classList.contains('mode-arduino')).toBe(false);
          }

          // Mutual exclusivity: both classes must never coexist
          const hasBoth =
            el.classList.contains('mode-arduino') &&
            el.classList.contains('mode-simulation');
          expect(hasBoth).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('switching mode clears the previous mode class', () => {
    const el = document.getElementById('mode-indicator');

    // Start in arduino mode
    renderModeIndicator('arduino');
    expect(el.classList.contains('mode-arduino')).toBe(true);
    expect(el.classList.contains('mode-simulation')).toBe(false);

    // Switch to simulation
    renderModeIndicator('simulation');
    expect(el.classList.contains('mode-simulation')).toBe(true);
    expect(el.classList.contains('mode-arduino')).toBe(false);

    // Switch back to arduino
    renderModeIndicator('arduino');
    expect(el.classList.contains('mode-arduino')).toBe(true);
    expect(el.classList.contains('mode-simulation')).toBe(false);
  });
});
