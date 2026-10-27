import { parseRoomId } from '@web/PeopleBrowser/personLocation.ts';

describe('parseRoomId', () => {
    it('accepts a positive room number, with or without #', () => {
        expect(parseRoomId('1203')).toBe(1203);
        expect(parseRoomId(' #4 ')).toBe(4);
    });

    it('rejects anything else', () => {
        expect(parseRoomId('')).toBeNull();
        expect(parseRoomId('0')).toBeNull();
        expect(parseRoomId('12a')).toBeNull();
        expect(parseRoomId('-3')).toBeNull();
    });
});
