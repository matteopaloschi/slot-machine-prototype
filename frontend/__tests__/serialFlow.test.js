import { beforeEach, describe, expect, it } from 'vitest';
import { getSerialCommandsForOutcome, state } from '../app.js';

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
});
