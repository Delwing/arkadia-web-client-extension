import Client from "../Client";

interface Localizer {
    pattern: string;
    roomId: number;
}

function createHandler(client: Client, roomId: number) {
    return (line) => {
        client.Map.setMapRoomById(roomId);
        client.sendEvent('notify', { text: `Map Sync: localizer ${roomId}` });
        return line;
    };
}

export default function initLocalizers(client: Client) {
    const parentPatterns = [
        "Z zewnatrz dochodzi stlumiony glos woznicy",
        "Z zewnatrz slyszysz glos woznicy",
        "Woznica oznajmia gromkim glosem",
        "Woznica dylizansu glosno wola",
        "Woznica oznajmia glosno",
    ];

    const parent = client.Triggers.registerTrigger(parentPatterns, (line) => line, 'localizers');

    const entries: Localizer[] = [
        // kz-nuln
        { pattern: 'Postoj, dziedziniec frontowy karczmy', roomId: 6727 },
        { pattern: 'Postoj, rozstaje przed zajazdem', roomId: 6571 },
        { pattern: 'Postoj, trakt przez wioske', roomId: 6779 },
        { pattern: 'Postoj, placyk w polnocnej czesci miasta', roomId: 7256 },
        // campo-varieno
        { pattern: 'Fermata - Campogrotta', roomId: 5468 },
        { pattern: 'Fermata - incrocio alla Miragliano', roomId: 5439 },
        { pattern: 'incrocio alla Viadaza!', roomId: 5625 },
        { pattern: 'incrocio alla Urbimo!', roomId: 5842 },
        { pattern: 'Fermata - Varieno', roomId: 5985 },
        // urbimo-toscania
        { pattern: 'Fermata - Urbimo', roomId: 5887 },
        { pattern: 'Fermata - Ebino', roomId: 5373 },
        { pattern: 'Fermata - Toscania', roomId: 5308 },
        // nuln-salignac
        { pattern: 'Postoj, rynek miejski Salignac La Rouge', roomId: 4922 },
        { pattern: "Postoj, dziedziniec przed zajazdem 'Pod piegowata elfka'", roomId: 4985 },
        { pattern: 'Postoj, placyk w centrum miasteczka Kreutzhofen', roomId: 5200 },
        { pattern: 'Postoj, niewielki plac w poludniowej czesci miasta', roomId: 6903 },
        // nuln-jouinard
        { pattern: 'Postoj, ulica Bramna', roomId: 7332 },
        { pattern: "Postoj, przed zajazdem 'Pod Srebrnym Grotem'", roomId: 7458 },
        { pattern: 'Postoj, rynek przy fontannie', roomId: 7550 },
        { pattern: 'Postoj, placyk z fontanna', roomId: 7640 },
        // nuln-blekitna
        { pattern: 'Postoj, ulica Krancowa', roomId: 6879 },
        { pattern: 'Postoj, przed karczma', roomId: 7131 },
        { pattern: 'Postoj, skrzyzowanie traktow w miasteczku', roomId: 7086 },
        { pattern: 'Postoj, na rynku Averheim', roomId: 6520 },
        { pattern: 'Postoj, nieduzy placyk', roomId: 6448 },
        { pattern: 'Postoj, dziedziniec zajazdu kompanii Cztery Pory Roku', roomId: 6430 },
        // quenelles-merceaux
        { pattern: 'Postoj, plac Gillesa le Breton', roomId: 4659 },
        { pattern: 'Postoj, centrum wioski Montlac', roomId: 7786 },
        { pattern: 'Postoj, w wiosce Merceaux-Descloux', roomId: 7744 },
        { pattern: 'Postoj, plac przed zajazdem.', roomId: 26659 },
        // wyzima-oxen
        { pattern: 'Postoj - pod Wyzima', roomId: 729 },
        { pattern: 'Postoj - wies Anchor', roomId: 3760 },
        { pattern: 'Postoj - plac w centrum Bialego Mostu', roomId: 746 },
        { pattern: 'Postoj - rozdroza niedaleko Piany', roomId: 764 },
        { pattern: 'Postoj - wies na podgrodziu Oxenfurtu', roomId: 790 },
        // maribor-grabowa
        { pattern: 'Postoj, przystan powozowa.', roomId: 180 },
        { pattern: 'Postoj, na dziedzincu zajazdu', roomId: 3343 },
        { pattern: 'Postoj, centralny plac wioski', roomId: 3457 },
        { pattern: 'Postoj, placyk w Grabowej Buchcie', roomId: 3525 },
        // maribor-verden
        { pattern: 'Postoj, lesne rozdroze.', roomId: 536 },
        { pattern: 'Postoj, przed zajazdem.', roomId: 3043 },
        { pattern: 'Postoj, placyk w centrum wsi.', roomId: 3221 },
        // gelibol-tretogor
        { pattern: 'Postoj, podgrodzie Tretogoru.', roomId: 3926 },
        { pattern: 'Postoj, glowny plac miasta.', roomId: 4163 },
        { pattern: 'Postoj, srodek niewielkiej osady.', roomId: 4092 },
        // bialy-hagge
        { pattern: 'Postoj przed brama Bialego Mostu.', roomId: 2188 },
        { pattern: 'Postoj, Plac Ratuszowy w Rinde.', roomId: 1998 },
        { pattern: 'Postoj pod brama miasta Murivel.', roomId: 1896 },
        { pattern: 'Postoj, Twierdza Hagge.', roomId: 9990 },
        // carreras-lyria
        { pattern: 'Postoj, na przeleczy.', roomId: 266 },
        { pattern: 'Postoj, gosciniec rivski.', roomId: 994 },
        { pattern: 'Postoj, na rogatkach.', roomId: 860 },
        { pattern: 'Postoj, pod murem zajazdu.', roomId: 680 },
        // novigrad-oxenfurt
        { pattern: 'Woznica oznajmia glosno: Postoj, droga kolo Novigradu.', roomId: 829 },
        { pattern: 'Woznica oznajmia glosno: Postoj, droga opodal Oxenfurtu.', roomId: 804 },
    ];

    entries.forEach(entry => {
        const handler = createHandler(client, entry.roomId);
        parent.registerChild(entry.pattern, handler, 'localizers');
    });

    client.Triggers.registerTrigger("Otworzyly sie drzwi klatki.", (line) => {
        client.Map.refreshPosition = true
        return line
    })
}
