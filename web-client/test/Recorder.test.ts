import Recorder from '../src/Recorder';
import appEventBus from '@client/src/events/app-event-bus';

describe('Recorder playback', () => {
  test('replayRecordedMessagesTimed echoes outgoing commands', () => {
    const adapter = {
      messages$: {
        subscribe: jest.fn(),
        next: jest.fn(),
      },
    };
    appEventBus.clear();
    const emitSpy = jest.spyOn(appEventBus, 'emit');
    const recorder = new Recorder(adapter as any);
    recorder.setRecordedMessages([
      { message: 'look', timestamp: 0, direction: 'out' },
    ]);
    jest.useFakeTimers();
    try {
      recorder.replayRecordedMessagesTimed();
      jest.runAllTimers();
      expect(emitSpy.mock.calls).toContainEqual([
        'message',
        expect.objectContaining({ text: '→ look', type: 'command' }),
      ]);
    } finally {
      emitSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
