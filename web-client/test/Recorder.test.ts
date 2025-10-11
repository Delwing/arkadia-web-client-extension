import Recorder from '../src/Recorder';

describe('Recorder playback', () => {
  test('replayRecordedMessagesTimed echoes outgoing commands', () => {
    const hooks = {
      processIncomingData: jest.fn(),
      sendCommand: jest.fn(),
      emit: jest.fn(),
    };
    const recorder = new Recorder(hooks as any);
    (window as any).clientExtension = { sendCommand: jest.fn() };
    (window as any).Output = { send: jest.fn() };
    recorder.setRecordedMessages([
      { message: 'look', timestamp: 0, direction: 'out' },
    ]);
    jest.useFakeTimers();
    recorder.replayRecordedMessagesTimed();
    jest.runAllTimers();
    expect((window as any).Output.send).toHaveBeenCalledWith('→ look');
    jest.useRealTimers();
  });

  test('startOver primes playback from the beginning when idle', () => {
    const hooks = {
      processIncomingData: jest.fn(),
      sendCommand: jest.fn(),
      emit: jest.fn(),
    };
    (window as any).Output = { send: jest.fn() };
    const recorder = new Recorder(hooks as any);
    recorder.setRecordedMessages([
      { message: 'cmd1', timestamp: 0, direction: 'out' },
      { message: 'cmd2', timestamp: 10, direction: 'in' },
    ]);

    recorder.startOver();

    expect(hooks.emit).toHaveBeenCalledWith('playback.start', 2);
    expect((window as any).Output.send).toHaveBeenCalledWith('== Playback start ==');
    expect(hooks.emit).toHaveBeenCalledWith('playback.index', 0, 2);
    expect(hooks.emit).toHaveBeenCalledWith('playback.pause');
  });
});
