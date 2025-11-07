import Recorder from '@web/Recorder';
import { clearClientInstance, setClientInstance } from "@shared/runtime";

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
    const mockClient = { sendCommand: jest.fn() } as any;
    setClientInstance(mockClient);
    recorder.setRecordedMessages([
      { message: 'look', timestamp: 0, direction: 'out' },
    ]);
    jest.useFakeTimers();
    recorder.replayRecordedMessagesTimed();
    jest.runAllTimers();
    expect(hooks.emit).toHaveBeenCalledWith('message', '→ look', undefined, 0);
  });

  test('setPlaybackSpeed emits playback.speed event', () => {
    const hooks = {
      processIncomingData: jest.fn(),
      sendCommand: jest.fn(),
      emit: jest.fn(),
      getCurrentMapLocation: jest.fn(),
      setMapLocationSilently: jest.fn(),
    };
    const recorder = new Recorder(hooks as any);
    recorder.setPlaybackSpeed(2);
    expect(hooks.emit).toHaveBeenCalledWith('playback.speed', 2);
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

  afterEach(() => {
    clearClientInstance();
  });
});
