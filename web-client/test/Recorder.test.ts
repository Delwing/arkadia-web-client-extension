import Recorder from '../src/Recorder';

describe('Recorder playback', () => {
  test('replayRecordedMessagesTimed echoes outgoing commands', () => {
    const hooks = {
      processIncomingData: jest.fn(),
      sendCommand: jest.fn(() => true),
      emit: jest.fn(),
    };
    const recorder = new Recorder(hooks as any);
    (window as any).Output = { send: jest.fn() };
    recorder.setRecordedMessages([
      { message: 'look', timestamp: 0, direction: 'out' },
    ]);
    jest.useFakeTimers();
    recorder.replayRecordedMessagesTimed();
    jest.runAllTimers();
    expect((window as any).Output.send).toHaveBeenCalledWith('→ look');
    expect(hooks.sendCommand).toHaveBeenCalledWith('look', false);
  });
});
