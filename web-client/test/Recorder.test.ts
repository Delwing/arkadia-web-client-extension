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
    recorder.setRecordedMessages([
      { message: 'look', timestamp: 0, direction: 'out' },
    ]);
    jest.useFakeTimers();
    recorder.replayRecordedMessagesTimed();
    jest.runAllTimers();
    expect(hooks.emit).toHaveBeenCalledWith('message', '→ look', undefined, 0);
  });
});
