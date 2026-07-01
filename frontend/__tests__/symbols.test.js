// symbols.test.js
// Property tests for symbol generation and fallback (Properties 6, 7)
// Validates: Requirements 1.4, 2.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SYMBOL_KEYS, randomSymbolKey, setReelSymbol } from '../app.js';

// ---------------------------------------------------------------------------
// Property 6 — No consecutive symbol repeat during spin
// Feature: slot-machine-casino-upgrade, Property 6: No consecutive symbol repeat during spin
// ---------------------------------------------------------------------------

describe('Property 6: No consecutive symbol repeat during spin', () => {
  it('each generated symbol key differs from the previous for any frame count and initial symbol', () => {
    // Feature: slot-machine-casino-upgrade, Property 6: No consecutive symbol repeat during spin
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 200 }),
        fc.constantFrom(...SYMBOL_KEYS),
        (frameCount, initialSymbol) => {
          let prevKey = initialSymbol;

          for (let frame = 0; frame < frameCount; frame++) {
            const nextKey = randomSymbolKey(prevKey);

            // Each symbol must differ from the previous one (no consecutive repeat)
            expect(nextKey).not.toBe(prevKey);

            // The result must be a valid symbol key
            expect(SYMBOL_KEYS).toContain(nextKey);

            prevKey = nextKey;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7 — Symbol fallback is non-empty for any missing image
// Feature: slot-machine-casino-upgrade, Property 7: Symbol fallback is non-empty for any missing image
// ---------------------------------------------------------------------------

describe('Property 7: Symbol fallback is non-empty for any missing image', () => {
  it('after onerror fires, the reel contains a <span class="symbol-fallback"> with non-empty uppercase text', () => {
    // Feature: slot-machine-casino-upgrade, Property 7: Symbol fallback is non-empty for any missing image
    fc.assert(
      fc.property(
        fc.constantFrom(...SYMBOL_KEYS),
        (symbolKey) => {
          // Create a container div to act as the reel element
          const container = document.createElement('div');

          // Use setReelSymbol to populate the reel with the symbol's img node
          setReelSymbol(container, symbolKey);

          // Get the <img> element that was placed inside the container
          const img = container.querySelector('img');
          expect(img).not.toBeNull();

          // Manually trigger the onerror handler to simulate image load failure
          img.onerror();

          // After onerror, the <img> should be replaced by a fallback span
          const fallbackSpan = container.querySelector('span.symbol-fallback');
          expect(fallbackSpan).not.toBeNull();

          // The fallback text must be non-empty
          const text = fallbackSpan.textContent;
          expect(text).toBeTruthy();
          expect(text.length).toBeGreaterThan(0);

          // The fallback text must be uppercase
          expect(text).toBe(text.toUpperCase());

          // The broken <img> must no longer be present in the container
          expect(container.querySelector('img')).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
