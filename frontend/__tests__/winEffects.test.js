/**
 * winEffects.test.js
 * Property-based test for win effect DOM cleanup (Property 8)
 *
 * **Validates: Requirements 3.4**
 *
 * Feature: slot-machine-casino-upgrade
 * Property 8: Win effect DOM is fully cleaned up after any win
 *
 * For any MAJOR or MINOR win trigger, after the effect duration has elapsed
 * and clearWinEffects() is called:
 *   - document.querySelectorAll('.particle').length === 0
 *   - no element in the DOM carries a win-pulse CSS class
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ── jsdom environment setup ────────────────────────────────────────────────
// Provide the minimal DOM that app.js needs to operate without crashing.
// We set this up before importing app.js so DOM references are populated.

function buildDOM() {
  document.body.innerHTML = `
    <div id="reels-container" style="position:relative;">
      <div class="reel" id="reel-0"></div>
      <div class="reel" id="reel-1"></div>
      <div class="reel" id="reel-2"></div>
      <div class="win-overlay is-hidden" id="win-overlay">
        <span id="win-overlay-msg"></span>
      </div>
    </div>
    <div id="status"></div>
    <div id="result"></div>
    <button id="insert-btn"></button>
    <button id="toggle-btn"></button>
    <button id="connect-btn"></button>
    <span id="credits-display"></span>
    <span id="mode-indicator"></span>
    <button id="reload-btn" style="display:none;"></button>
    <p id="credits-exhausted-msg" style="display:none;"></p>
    <div id="pay-table"></div>
    <div id="payline-indicator" style="display:none;"></div>
    <div id="home-view"></div>
    <div id="game-view"></div>
    <div id="home-status"></div>
  `;
}

// ── Import the module under test ───────────────────────────────────────────
// NOTE: app.js registers a DOMContentLoaded listener for initializeApp.
// We need to trigger that manually after building the DOM.

let mod;

beforeEach(async () => {
  buildDOM();

  // Re-import to get a fresh module with updated DOM references.
  // vi.resetModules() ensures each test gets a clean slate.
  vi.resetModules();
  mod = await import('../app.js');

  // Manually fire the initialisation (mirrors what the browser would do)
  document.dispatchEvent(new Event('DOMContentLoaded'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Property 8 ────────────────────────────────────────────────────────────
describe('Property 8 — Win effect DOM is fully cleaned up after clearWinEffects()', () => {
  it(
    'after triggerMajorWin() + clearWinEffects(): no .particle elements and no win-pulse classes remain',
    () => {
      // Feature: slot-machine-casino-upgrade, Property 8: Win effect DOM is fully cleaned up after any win
      fc.assert(
        fc.property(
          fc.constantFrom('major', 'minor'),
          (winType) => {
            // Rebuild DOM to isolate each iteration
            buildDOM();
            document.dispatchEvent(new Event('DOMContentLoaded'));

            const reels = [
              document.getElementById('reel-0'),
              document.getElementById('reel-1'),
              document.getElementById('reel-2'),
            ];

            // Trigger the appropriate win effect
            if (winType === 'major') {
              mod.triggerMajorWin(reels);
            } else {
              mod.triggerMinorWin(reels);
            }

            // After triggering, for major win there should be particles
            if (winType === 'major') {
              expect(document.querySelectorAll('.particle').length).toBeGreaterThanOrEqual(30);
            }

            // Reels should carry the correct pulse class before cleanup
            reels.forEach(reel => {
              const expectedClass = winType === 'major' ? 'win-pulse-major' : 'win-pulse-minor';
              expect(reel.classList.contains(expectedClass)).toBe(true);
            });

            // Now clear the effects
            mod.clearWinEffects();

            // ── Core Property 8 assertions ──────────────────────────────
            // 1. No particle elements remain in the DOM
            expect(document.querySelectorAll('.particle').length).toBe(0);

            // 2. No element carries a win-pulse-major class
            expect(document.querySelectorAll('.win-pulse-major').length).toBe(0);

            // 3. No element carries a win-pulse-minor class
            expect(document.querySelectorAll('.win-pulse-minor').length).toBe(0);

            // 4. The win overlay is hidden
            const overlay = document.getElementById('win-overlay');
            if (overlay) {
              expect(overlay.classList.contains('is-hidden')).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    }
  );

  it(
    'clearWinEffects() is idempotent — calling it multiple times leaves DOM in the same clean state',
    () => {
      // Feature: slot-machine-casino-upgrade, Property 8: Win effect DOM is fully cleaned up after any win
      fc.assert(
        fc.property(
          fc.constantFrom('major', 'minor'),
          fc.integer({ min: 1, max: 5 }),
          (winType, repeatCount) => {
            buildDOM();
            document.dispatchEvent(new Event('DOMContentLoaded'));

            const reels = [
              document.getElementById('reel-0'),
              document.getElementById('reel-1'),
              document.getElementById('reel-2'),
            ];

            if (winType === 'major') {
              mod.triggerMajorWin(reels);
            } else {
              mod.triggerMinorWin(reels);
            }

            // Call clearWinEffects multiple times
            for (let i = 0; i < repeatCount; i++) {
              mod.clearWinEffects();
            }

            expect(document.querySelectorAll('.particle').length).toBe(0);
            expect(document.querySelectorAll('.win-pulse-major').length).toBe(0);
            expect(document.querySelectorAll('.win-pulse-minor').length).toBe(0);
          }
        ),
        { numRuns: 30 }
      );
    }
  );

  it('triggerMajorWin() appends at least 30 .particle elements', () => {
    const reels = [
      document.getElementById('reel-0'),
      document.getElementById('reel-1'),
      document.getElementById('reel-2'),
    ];

    mod.triggerMajorWin(reels);
    expect(document.querySelectorAll('.particle').length).toBeGreaterThanOrEqual(30);
  });

  it('triggerMajorWin() adds .win-pulse-major to every reel', () => {
    const reels = [
      document.getElementById('reel-0'),
      document.getElementById('reel-1'),
      document.getElementById('reel-2'),
    ];

    mod.triggerMajorWin(reels);
    reels.forEach(reel => {
      expect(reel.classList.contains('win-pulse-major')).toBe(true);
    });
  });

  it('triggerMinorWin() adds .win-pulse-minor to every reel', () => {
    const reels = [
      document.getElementById('reel-0'),
      document.getElementById('reel-1'),
      document.getElementById('reel-2'),
    ];

    mod.triggerMinorWin(reels);
    reels.forEach(reel => {
      expect(reel.classList.contains('win-pulse-minor')).toBe(true);
    });
  });

  it('triggerMajorWin() shows "JACKPOT!" in the overlay', () => {
    const reels = [
      document.getElementById('reel-0'),
      document.getElementById('reel-1'),
      document.getElementById('reel-2'),
    ];

    mod.triggerMajorWin(reels);

    const overlay = document.getElementById('win-overlay');
    const msg     = document.getElementById('win-overlay-msg');
    expect(overlay.classList.contains('is-hidden')).toBe(false);
    expect(msg.textContent).toBe('JACKPOT!');
  });

  it('triggerMinorWin() shows "PRÊMIO!" in the overlay', () => {
    const reels = [
      document.getElementById('reel-0'),
      document.getElementById('reel-1'),
      document.getElementById('reel-2'),
    ];

    mod.triggerMinorWin(reels);

    const overlay = document.getElementById('win-overlay');
    const msg     = document.getElementById('win-overlay-msg');
    expect(overlay.classList.contains('is-hidden')).toBe(false);
    expect(msg.textContent).toBe('PRÊMIO!');
  });
});
