import { beforeEach, describe, expect, it } from 'vitest';
import { state, updateButtons } from '../app.js';

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

describe('toggle button state', () => {
  beforeEach(() => {
    state.credits = 100;
    state.mode = 'simulation';
    state.tokenInserted = false;
    state.spinning = false;
    state.playUsed = false;
    buildMinimalDOM();
  });

  it('updates the button label as the round transitions', () => {
    const toggleBtn = document.getElementById('toggle-btn');

    state.tokenInserted = true;
    state.playUsed = false;
    state.spinning = false;
    updateButtons();
    expect(toggleBtn.textContent).toBe('Iniciar giro');

    state.spinning = true;
    updateButtons();
    expect(toggleBtn.textContent).toBe('Parar giro');

    state.spinning = false;
    state.playUsed = true;
    updateButtons();
    expect(toggleBtn.textContent).toBe('Jogo encerrado');
  });
});
