import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSerialDisconnect, state } from '../app.js';

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
    <div id="payline-indicator"></div>
    <div id="win-overlay"></div>
    <div id="win-overlay-msg"></div>
  `;

  document.dispatchEvent(new Event('DOMContentLoaded'));
}

describe('serial reconnect handling', () => {
  beforeEach(() => {
    buildMinimalDOM();
    state.mode = 'arduino';
    state.tokenInserted = true;
    state.spinning = false;
    state.playUsed = false;
  });

  it('switches back to simulation mode and updates the status on disconnect', async () => {
    const statusEl = document.getElementById('status');
    const homeStatusEl = document.getElementById('home-status');

    await handleSerialDisconnect();

    expect(state.mode).toBe('simulation');
    expect(statusEl.textContent).toContain('desconectado');
    expect(homeStatusEl.textContent).toContain('desconectado');
  });
});
