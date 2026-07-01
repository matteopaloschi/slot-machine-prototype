import { beforeEach, describe, expect, it } from 'vitest';
import { getSerialCommandsForOutcome, getSerialConnectionErrorMessage, state } from '../app.js';

describe('Arduino round reset flow', () => {
  beforeEach(() => {
    state.mode = 'simulation';
    state.tokenInserted = true;
  });

  it('sends RESULT and RESET after a completed round in Arduino mode', () => {
    state.mode = 'arduino';

    expect(getSerialCommandsForOutcome('major')).toEqual(['RESULT:MAJOR', 'RESET']);
    expect(getSerialCommandsForOutcome('minor')).toEqual(['RESULT:MINOR', 'RESET']);
    expect(getSerialCommandsForOutcome('none')).toEqual(['RESULT:NONE', 'RESET']);
  });

  it('does not emit serial commands in simulation mode', () => {
    expect(getSerialCommandsForOutcome('major')).toEqual([]);
  });

  it('formats common serial connection errors for the user', () => {
    expect(getSerialConnectionErrorMessage('Failed to execute \'open\' on \'SerialPort\': Failed to open serial port.')).toContain('porta serial');
    expect(getSerialConnectionErrorMessage('The port is already in use.')).toContain('já está em uso');
    expect(getSerialConnectionErrorMessage('The port is not available.')).toContain('não está disponível');
  });
});
