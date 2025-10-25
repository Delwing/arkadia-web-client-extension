import Recorder from '../src/Recorder';

describe('Recorder playback', () => {
  test('replayRecordedMessagesTimed echoes outgoing commands', () => {
    const hooks = {
      processIncomingData: jest.fn(),
      sendCommand: jest.fn(),
      emit: jest.fn(),
      getCurrentMapLocation: jest.fn(),
      setMapLocationSilently: jest.fn(),
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

  test('stores start location and applies it once during playback', async () => {
    const getCurrentMapLocation = jest.fn()
      .mockReturnValueOnce(3525)
      .mockReturnValue(3527);
    const hooks = {
      processIncomingData: jest.fn(),
      sendCommand: jest.fn(),
      emit: jest.fn(),
      getCurrentMapLocation,
      setMapLocationSilently: jest.fn(),
    };
    const recorder = new Recorder(hooks as any);
    recorder.startRecording('demo');
    recorder.handleIncoming('Some line');
    await recorder.stopRecording(false);

    const events = recorder.getRecordedMessages();
    expect(events[0].initialLocationId).toBe(3525);
    expect(events[0].locationId).toBe(3527);

    recorder.replayRecordedMessages();

    expect(hooks.setMapLocationSilently).toHaveBeenCalledTimes(1);
    expect(hooks.setMapLocationSilently).toHaveBeenCalledWith(3525);
  });
});
