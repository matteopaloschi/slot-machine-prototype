// credits.test.js
// Property tests for credit arithmetic (Properties 1, 2, 3, 11)
// Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.7

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { state } from '../app.js';

// ---------------------------------------------------------------------------
// Inline credit-logic helpers
//
// The full insertCoin / startSpin / stopSpin / reloadCredits functions will be
// added to app.js in Task 9.  Until then the tests use minimal inline
// implementations that capture ONLY the credit-arithmetic rules under test.
// ---------------------------------------------------------------------------

/** Reset shared state to a known baseline before every property iteration. */
function resetState(overrides = {}) {
  state.credits       = overrides.credits       ?? 100;
  state.tokenInserted = overrides.tokenInserted ?? false;
  state.spinning      = overrides.spinning      ?? false;
  state.playUsed      = overrides.playUsed      ?? false;
  state.currentOutcome = overrides.currentOutcome ?? null;
  state.spinStep      = overrides.spinStep      ?? 0;
  state.mode          = overrides.mode          ?? 'simulation';
}

/**
 * Inline insertCoin: debits 1 credit when credits > 0, sets tokenInserted,
 * clears playUsed/spinning.  Does NOT start any animation.
 */
function insertCoin() {
  if (state.credits === 0) return;
  state.credits -= 1;
  state.tokenInserted = true;
  state.playUsed      = false;
  state.spinning      = false;  // debit happens BEFORE any animation
}

/**
 * Inline startSpin: guards on tokenInserted and playUsed.
 * When tokenInserted is false it must NOT change credits.
 */
function startSpin() {
  if (!state.tokenInserted) {
    // Property 11 guard – do nothing to credits
    return;
  }
  if (state.playUsed) {
    return;
  }
  state.playUsed = true;
  state.spinning = true;
}

/**
 * Inline applyOutcome: awards credits after a spin result is displayed.
 * Called after the reels have stopped.
 */
function applyOutcome(type) {
  if (type === 'major') {
    state.credits += 20;
  } else if (type === 'minor') {
    state.credits += 5;
  }
  // 'none' → no change
  state.spinning = false;
  state.tokenInserted = false;
  state.currentOutcome = null;
}

/**
 * Inline reloadCredits: restores balance to 100.
 */
function reloadCredits() {
  state.credits = 100;
}

// ---------------------------------------------------------------------------
// Property 1 — Credit debit precedes animation
// Feature: slot-machine-casino-upgrade, Property 1: Credit debit precedes animation
// ---------------------------------------------------------------------------

describe('Property 1: Credit debit precedes animation', () => {
  it('after insertCoin(), credits === N-1 and spinning === false for any N ∈ [1, 10000]', () => {
    // Feature: slot-machine-casino-upgrade, Property 1: Credit debit precedes animation
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        (startingCredits) => {
          resetState({ credits: startingCredits });

          insertCoin();

          // Credit was debited BEFORE any animation
          expect(state.credits).toBe(startingCredits - 1);
          // Spinning must still be false — debit precedes animation start
          expect(state.spinning).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 — Credit award is correct for any win outcome
// Feature: slot-machine-casino-upgrade, Property 2: Credit award is correct for any win outcome
// ---------------------------------------------------------------------------

describe('Property 2: Credit award is correct for any win outcome', () => {
  it('balance after result equals B+20 (major), B+5 (minor), or B (none)', () => {
    // Feature: slot-machine-casino-upgrade, Property 2: Credit award is correct for any win outcome
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.constantFrom('major', 'minor', 'none'),
        (balance, outcomeType) => {
          resetState({ credits: balance, spinning: true, tokenInserted: true });

          applyOutcome(outcomeType);

          if (outcomeType === 'major') {
            expect(state.credits).toBe(balance + 20);
          } else if (outcomeType === 'minor') {
            expect(state.credits).toBe(balance + 5);
          } else {
            expect(state.credits).toBe(balance);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 — Credit balance never goes negative
// Feature: slot-machine-casino-upgrade, Property 3: Credit balance never goes negative
// ---------------------------------------------------------------------------

describe('Property 3: Credit balance never goes negative', () => {
  it('balance is always ≥ 0 after any arbitrary sequence of actions', () => {
    // Feature: slot-machine-casino-upgrade, Property 3: Credit balance never goes negative
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('insert', 'major', 'minor', 'none', 'reload'),
          { minLength: 1, maxLength: 50 }
        ),
        (actions) => {
          resetState({ credits: 100 });

          for (const action of actions) {
            switch (action) {
              case 'insert':
                insertCoin();
                break;
              case 'major':
                applyOutcome('major');
                break;
              case 'minor':
                applyOutcome('minor');
                break;
              case 'none':
                applyOutcome('none');
                break;
              case 'reload':
                reloadCredits();
                break;
            }
            // The invariant must hold after EVERY individual action
            expect(state.credits).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11 — Spin without inserted token never alters credit balance
// Feature: slot-machine-casino-upgrade, Property 11: Spin without inserted token never alters credit balance
// ---------------------------------------------------------------------------

describe('Property 11: Spin without inserted token never alters credit balance', () => {
  it('startSpin() with tokenInserted=false leaves credits unchanged and spinning=false', () => {
    // Feature: slot-machine-casino-upgrade, Property 11: Spin without inserted token never alters credit balance
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.boolean(),
        (credits, playUsed) => {
          resetState({ credits, tokenInserted: false, playUsed, spinning: false });

          const creditsBefore = state.credits;
          startSpin(); // must be a no-op for credits because tokenInserted is false

          expect(state.credits).toBe(creditsBefore);
          expect(state.spinning).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
