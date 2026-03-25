import {Recorder} from '@shared/recorder';

const mockStorage = {
  saveRecording: jest.fn(),
  getRecording: jest.fn(),
  getRecordingNames: jest.fn(),
  deleteRecording: jest.fn(),
};

function createTestRecorder(hooks: any) {
  return new Recorder(hooks, mockStorage);
}

describe('Recorder playback', () => {
  test('replayRecordedMessagesTimed echoes outgoing commands', () => {
    const hooks = {
      processIncomingData: jest.fn(),
      sendCommand: jest.fn(),
      emit: jest.fn(),
    };
    const recorder = createTestRecorder(hooks);
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
    };
    const recorder = createTestRecorder(hooks);
    recorder.setPlaybackSpeed(2);
    expect(hooks.emit).toHaveBeenCalledWith('playback.speed', 2);
  });

  test('applies initial location via renderMapLocation event during playback', () => {
    const hooks = {
      processIncomingData: jest.fn(),
      sendCommand: jest.fn(),
      emit: jest.fn(),
    };
    const recorder = createTestRecorder(hooks);

    recorder.setRecordedMessages([
      { message: 'Some line', timestamp: 0, direction: 'in' as const, initialLocationId: 3525, locationId: 3527 },
    ]);

    recorder.replayRecordedMessages();

    expect(hooks.emit).toHaveBeenCalledWith('renderMapLocation', { locationId: 3525 });
  });
});
