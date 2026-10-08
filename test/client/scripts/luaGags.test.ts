import { isHitOnMe } from '@client/scripts/luaGags';

describe('isHitOnMe', () => {
    test.each([
        'Silnym wymachem swojego archaicznego zdobionego topora trafiasz gburowatego jasnowlosego krasnoluda chaosu w korpus, pozostawiajac na jego ciele niewielka rane.',
        'Uderzenie twojego archaicznego zdobionego topora pozostawia na ciele gburowatego jasnowlosego krasnoluda chaosu dluga, czerwona szrame.',
        'Bardzo ciezko ranisz zielonoskorego orka.',
        'Bierzesz plynny zamach swoim toporem, jednak niecelny cios zupelnie mija przeciwnika.',
    ])('my own hit is not a hit on me: %s', line => {
        expect(isHitOnMe(line)).toBe(false);
    });

    test.each([
        'Gburowaty jasnowlosy krasnolud chaosu ledwo muska cie jednorecznym krasnoludzkim toporem, trafiajac cie w nogi.',
        'Zielonoskory ork rani ciebie w glowe.',
        'Ork zadaje ci potezny cios.',
        'Ork rani cię w głowę.',
    ])('a blow naming me lands on me: %s', line => {
        expect(isHitOnMe(line)).toBe(true);
    });
});
