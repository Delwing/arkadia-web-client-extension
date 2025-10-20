import Recorder from '../src/Recorder';
import { peekClient } from '../src/runtime/clientProvider';

jest.mock('../src/runtime/clientProvider', () => ({
  peekClient: jest.fn(),
}));

describe('Recorder playback', () => {
  test('replayRecordedMessagesTimed echoes outgoing commands', () => {
    const hooks = {
      processIncomingData: jest.fn(),
      sendCommand: jest.fn(),
      emit: jest.fn(),
    };
    const recorder = new Recorder(hooks as any);
    const sendCommand = jest.fn();
    (peekClient as jest.Mock).mockReturnValue({ sendCommand });
    (window as any).Output = { send: jest.fn() };
    recorder.setRecordedMessages([
      { message: 'look', timestamp: 0, direction: 'out' },
    ]);
    jest.useFakeTimers();
    recorder.replayRecordedMessagesTimed();
    jest.runAllTimers();
    expect((window as any).Output.send).toHaveBeenCalledWith('→ look');
    expect(sendCommand).toHaveBeenCalledWith('look', false);
  });
});
