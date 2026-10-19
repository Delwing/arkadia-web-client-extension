import { vi } from 'vitest';
import eventBus from '@modules/core/eventBus';
import type { RecordingRequest, RecordingRequestResult } from '@shared/events';

vi.mock('@web/recordingStorage', () => ({
    saveRecording: vi.fn(async () => {}),
    getRecording: vi.fn(async () => null),
    getRecordingNames: vi.fn(async () => []),
    deleteRecording: vi.fn(async () => {}),
}));

import recordingManager from '@web/RecordingManager';
import { saveRecording } from '@web/recordingStorage';

function request(req: RecordingRequest): Promise<RecordingRequestResult> {
    return new Promise(resolve => {
        const off = eventBus.on('recording.request.done', (result) => {
            off();
            resolve(result);
        });
        eventBus.emit('recording.request', req);
    });
}

describe('RecordingManager recording requests', () => {
    afterEach(async () => {
        await recordingManager.stopRecording(false);
        vi.clearAllMocks();
    });

    it('starts a named recording and saves it on stop', async () => {
        expect(await request({ action: 'start', name: 'troll' })).toMatchObject({ active: null, started: 'troll' });
        expect(recordingManager.getActiveRecordingName()).toBe('troll');

        expect(await request({ action: 'stop', save: true })).toMatchObject({ active: 'troll' });
        expect(recordingManager.getActiveRecordingName()).toBeNull();
        expect(saveRecording).toHaveBeenCalledWith('troll', expect.any(Array));
    });

    it('names an unnamed recording by date and time', async () => {
        const { started } = await request({ action: 'start' });
        expect(started).toMatch(/^\d\d\.\d\d \d\d:\d\d$/);
    });

    it('keeps the recording in progress instead of replacing it', async () => {
        await request({ action: 'start', name: 'first' });
        expect(await request({ action: 'start', name: 'second' })).toMatchObject({ active: 'first', started: null });
        expect(recordingManager.getActiveRecordingName()).toBe('first');
    });

    it('discards without saving', async () => {
        await request({ action: 'start', name: 'troll' });
        await request({ action: 'stop', save: false });
        expect(recordingManager.getActiveRecordingName()).toBeNull();
        expect(saveRecording).not.toHaveBeenCalled();
    });

    it('reports nothing to stop', async () => {
        expect(await request({ action: 'stop', save: true })).toMatchObject({ active: null });
    });
});
