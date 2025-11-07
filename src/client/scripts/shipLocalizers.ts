import Client from "../Client";

interface Localizer {
    pattern: RegExp;
    roomId: number;
}

function createHandler(client: Client, roomId: number) {
    return (line) => {
        client.Map.setMapRoomById(roomId);
        client.sendEvent('notify', { text: `Map Sync: ship ${roomId}` });
        return line;
    };
}

export default function initShipLocalizers(client: Client) {
    const parent = client.Triggers.registerTrigger('krzyczy:', (triggerLine) => triggerLine, 'ship-localizers');

    const entries: Localizer[] = [
        { pattern: /(?:Mlody smutny mezczyzna|Strag) krzyczy: Doplynelismy do przystani promu w Oxenfurcie! Mozna wysiadac!$/, roomId: 2464 },
        { pattern: /(?:Mlody smutny mezczyzna|Strag) krzyczy: Doplynelismy do przystani w Grabowej Buchcie! Mozna wysiadac!$/, roomId: 3542 },
        { pattern: /^(?:Charyzmatyczny brodaty mezczyzna|Batista) krzyczy: Doplynelismy do przystani na wyspie Mekan! Mozna wysiadac!$/, roomId: 23792 },
        { pattern: /^(?:Charyzmatyczny brodaty mezczyzna|Batista) krzyczy: Doplynelismy do zachodniego nabrzeza w Baccali! Mozna wysiadac!$/, roomId: 9707 },
        { pattern: /^(?:Chudy zdenerwowany mezczyzna|Pluskolec) krzyczy: Doplynelismy do pierwszego pomostu w Oxenfurcie! Mozna wysiadac!$/, roomId: 2467 },
        { pattern: /^(?:Chudy zdenerwowany mezczyzna|Pluskolec) krzyczy: Doplynelismy do poludniowego nabrzeza w Novigradzie! Mozna wysiadac!$/, roomId: 7908 },
        { pattern: /^(?:Chudy zdenerwowany mezczyzna|Pluskolec) krzyczy: Doplynelismy do przystani w Bialym Moscie! Mozna wysiadac!$/, roomId: 2212 },
        { pattern: /^(?:Ciemnowlosy przyjacielski mezczyzna|Mallcolm) krzyczy: Doplynelismy do przystani na Blekitnej Wstedze! Mozna wysiadac!$/, roomId: 6428 },
        { pattern: /^(?:Ciemnowlosy przyjacielski mezczyzna|Mallcolm) krzyczy: Doplynelismy do przystani w twierdzy Karak Varn! Mozna wysiadac!$/, roomId: 15409 },
        { pattern: /^(?:Czarnowlosy barczysty mezczyzna|Ancelmus) krzyczy: Doplynelismy do przystani na Blekitnej Wstedze! Mozna wysiadac!$/, roomId: 6429 },
        { pattern: /^(?:Czarnowlosy barczysty mezczyzna|Ancelmus) krzyczy: Doplynelismy do przystani w Krainie Zgromadzenia! Mozna wysiadac!$/, roomId: 6621 },
        { pattern: /^(?:Czarnowlosy barczysty mezczyzna|Ancelmus) krzyczy: Doplynelismy do przystani w Kreutzhofen! Mozna wysiadac!$/, roomId: 5207 },
        { pattern: /^(?:Czarnowlosy barczysty mezczyzna|Ancelmus) krzyczy: Doplynelismy do wschodniego nabrzeza w Nuln! Mozna wysiadac!$/, roomId: 7233 },
        { pattern: /^(?:Dojrzaly markotny mezczyzna|Elich) krzyczy: Doplynelismy do przystani nad Pontarem w Novigradzie! Mozna wysiadac!$/, roomId: 7903 },
        { pattern: /^(?:Dojrzaly markotny mezczyzna|Elich) krzyczy: Doplynelismy do przystani stoczni w Novigradzie! Mozna wysiadac!$/, roomId: 10486 },
        { pattern: /^(?:Dojrzaly markotny mezczyzna|Elich) krzyczy: Doplynelismy do przystani we wsi Nadrzecze! Mozna wysiadac!$/, roomId: 3583 },
        { pattern: /^(?:Haming|Stary zgorzknialy mezczyzna) krzyczy: Doplynelismy do drugiego pomostu w Pianie! Mozna wysiadac!$/, roomId: 2616 },
        { pattern: /^(?:Haming|Stary zgorzknialy mezczyzna) krzyczy: Doplynelismy do przystani w Hagge! Mozna wysiadac!$/, roomId: 10018 },
        { pattern: /^(?:Haming|Stary zgorzknialy mezczyzna) krzyczy: Doplynelismy do przystani w Starych Bukach! Mozna wysiadac!$/, roomId: 8087 },
        { pattern: /^(?:Intrygujacy dlugowlosy mezczyzna|Gvidon) krzyczy: Doplynelismy do poludniowego nabrzeza w Novigradzie! Mozna wysiadac!$/, roomId: 7911 },
        { pattern: /^(?:Intrygujacy dlugowlosy mezczyzna|Gvidon) krzyczy: Doplynelismy do przystani na Wyspie Milosci! Mozna wysiadac!$/, roomId: 11153 },
        { pattern: /^(?:Jasnowlosy sniady elf|Flavius) krzyczy: Doplynelismy do polnocnego nabrzeza w Novigradzie! Mozna wysiadac!$/, roomId: 2223 },
        { pattern: /^(?:Jasnowlosy sniady elf|Flavius) krzyczy: Doplynelismy do przystani w Blaviken! Mozna wysiadac!$/, roomId: 4061 },
        { pattern: /^(?:Jasnowlosy sniady elf|Flavius) krzyczy: Doplynelismy do przystani w Daevon! Mozna wysiadac!$/, roomId: 11690 },
        { pattern: /^(?:Kustykajacy barczysty mezczyzna|Rygwit) krzyczy: Doplynelismy do przystani na wyspie Kaer Hemdall! Mozna wysiadac!$/, roomId: 23685 },
        { pattern: /^(?:Kustykajacy barczysty mezczyzna|Rygwit) krzyczy: Doplynelismy do zachodniej osady na wyspie Ard Skellig! Mozna wysiadac!$/, roomId: 10369 },
        { pattern: /^(?:Luiggi|Lysawy gruby mezczyzna) krzyczy: Doplynelismy do przystani w Alimento! Mozna wysiadac!$/, roomId: 5601 },
        { pattern: /^(?:Luiggi|Lysawy gruby mezczyzna) krzyczy: Doplynelismy do przystani w Kreutzhofen! Mozna wysiadac!$/, roomId: 5206 },
        { pattern: /^(?:Malacius|Starszy spokojny mezczyzna krzyczy): Doplynelismy do czwartego pomostu w Oxenfurcie! Mozna wysiadac!$/, roomId: 2574 },
        { pattern: /^(?:Malacius|Starszy spokojny mezczyzna krzyczy): Doplynelismy do przystani w Blaviken! Mozna wysiadac!$/, roomId: 4059 },
        { pattern: /^(?:Malutki tlusciutki mezczyzna|Cern) krzyczy: Doplynelismy do przystani na Wyspie Milosci! Mozna wysiadac!$/, roomId: 11154 },
        { pattern: /^(?:Malutki tlusciutki mezczyzna|Cern) krzyczy: Doplynelismy do przystani w Urbimo! Mozna wysiadac!$/, roomId: 5946 },
        { pattern: /^(?:Mlody silny mezczyzna|Gmeath) krzyczy: Doplynelismy do przystani na polnocnym brzegu Pontaru! Mozna wysiadac!$/, roomId: 2624 },
        { pattern: /^(?:Mlody silny mezczyzna|Gmeath) krzyczy: Doplynelismy do przystani na poludniowym brzegu Pontaru! Mozna wysiadac!$/, roomId: 3442 },
        { pattern: /^(?:Mlody zylasty mezczyzna|Asa) krzyczy: Doplynelismy do przystani na wyspie Faroe! Mozna wysiadac!$/, roomId: 23669 },
        { pattern: /^(?:Mlody zylasty mezczyzna|Asa) krzyczy: Doplynelismy do przystani w twierdzy Rozrog! Mozna wysiadac!$/, roomId: 3280 },
        { pattern: /^(?:Mlody zylasty mezczyzna|Asa) krzyczy: Doplynelismy do zachodniego nabrzeza na wyspie Ard Skellig! Mozna wysiadac!$/, roomId: 10313 },
        { pattern: /^(?:Mrukliwy krzywonosy mezczyzna|Creyard) krzyczy: Doplynelismy do wschodniego nabrzeza w Nuln! Mozna wysiadac!$/, roomId: 6891 },
        { pattern: /^(?:Mrukliwy krzywonosy mezczyzna|Creyard) krzyczy: Doplynelismy do zachodniego nabrzeza w Bogenhafen! Mozna wysiadac!$/, roomId: 7568 },
        { pattern: /^(?:Opalony wytatuowany mezczyzna|Gervais) krzyczy: Doplynelismy do poludniowego nabrzeza w Quenelles! Mozna wysiadac!/, roomId: 4653 },
        { pattern: /^(?:Opalony wytatuowany mezczyzna|Gervais) krzyczy: Doplynelismy do przystani w Marguilles! Mozna wysiadac!/, roomId: 4890 },
        { pattern: /^(?:Otyly czerwononosy mezczyzna|Charonda) krzyczy: Doplynelismy do centralnego nabrzeza w Baccali! Mozna wysiadac!$/, roomId: 9705 },
        { pattern: /^(?:Otyly czerwononosy mezczyzna|Charonda) krzyczy: Doplynelismy do poludniowego nabrzeza w Novigradzie! Mozna wysiadac!$/, roomId: 7910 },
        { pattern: /^(?:Otyly czerwononosy mezczyzna|Charonda) krzyczy: Doplynelismy do przystani w twierdzy Rozrog! Mozna wysiadac!$/, roomId: 3281 },
        { pattern: /^(?:Przysadzista jasnowlosa kobieta|Hallgerda) krzyczy: Doplynelismy do polnocnego nabrzeza na wyspie Ard Skellig! Mozna wysiadac!$/, roomId: 10311 },
        { pattern: /^(?:Przysadzista jasnowlosa kobieta|Hallgerda) krzyczy: Doplynelismy do poludniowego nabrzeza w Novigradzie! Mozna wysiadac!$/, roomId: 7907 },
        { pattern: /^(?:Rudobrody rozmowny mezczyzna|Olaf) krzyczy: Doplynelismy do przystani na wyspie Hindarsfjall! Mozna wysiadac!$/, roomId: 23678 },
        { pattern: /^(?:Rudobrody rozmowny mezczyzna|Olaf) krzyczy: Doplynelismy do zachodniego nabrzeza na wyspie Ard Skellig! Mozna wysiadac!$/, roomId: 10314 },
        { pattern: /^(?:Smagly przygarbiony mezczyzna|Louis) krzyczy: Doplynelismy do przystani na polnocnym brzegu Grismerie! Mozna wysiadac!/, roomId: 7732 },
        { pattern: /^(?:Smagly przygarbiony mezczyzna|Louis) krzyczy: Doplynelismy do przystani na poludniowym brzegu Grismerie! Mozna wysiadac!/, roomId: 7733 },
        { pattern: /^(?:Sniady spokojny mezczyzna|Jacob) krzyczy: Doplynelismy do przystani na Blekitnej Wstedze! Mozna wysiadac!/, roomId: 6428 },
        { pattern: /^(?:Sniady spokojny mezczyzna|Jacob) krzyczy: Doplynelismy do przystani w Blaviken! Mozna wysiadac!/, roomId: 4060 },
        { pattern: /^(?:Wysoki kruczowlosy mezczyzna|Annibale) krzyczy: Doplynelismy do poludniowego nabrzeza w Novigradzie! Mozna wysiadac!/, roomId: 7909 },
        { pattern: /^(?:Wysoki kruczowlosy mezczyzna|Annibale) krzyczy: Doplynelismy do przystani w Urbimo! Mozna wysiadac!/, roomId: 5947 },
        { pattern: /^(?:Wysoki muskularny mezczyzna|Daniel) krzyczy: Doplynelismy do przystani na polnocnym brzegu Brienne! Mozna wysiadac!$/, roomId: 4824 },
        { pattern: /^(?:Wysoki muskularny mezczyzna|Daniel) krzyczy: Doplynelismy do przystani na poludniowym brzegu Brienne! Mozna wysiadac!$/, roomId: 4841 },
        { pattern: /^(?:Zarosniety ogorzaly kapitan|Bjorn) krzyczy: Doplynelismy do przystani na wyspie Mekan! Mozna wysiadac!$/, roomId: 23708 },
        { pattern: /^(?:Zarosniety ogorzaly kapitan|Bjorn) krzyczy: Doplynelismy do przystani w twierdzy Rozrog! Mozna wysiadac!$/, roomId: 3273 },
        { pattern: /^(?:Zarosniety smierdzacy mezczyzna|Kelim) krzyczy: Doplynelismy do poludniowego nabrzeza w Novigradzie! Mozna wysiadac!$/, roomId: 7912 },
        { pattern: /^(?:Zarosniety smierdzacy mezczyzna|Kelim) krzyczy: Doplynelismy do przystani w twierdzy Scala! Mozna wysiadac!$/, roomId: 927 },
        { pattern: /^(?:Zarosniety smierdzacy mezczyzna|Kelim) krzyczy: Doplynelismy do srodkowego pomostu w Obawie! Mozna wysiadac!$/, roomId: 3248 },
        { pattern: /^(?:Zarosniety smierdzacy mezczyzna|Kelim) krzyczy: Doplynelismy do zachodniego pomostu w Obawie! Mozna wysiadac!$/, roomId: 3247 },
        { pattern: /^Bryg z wolna doplywa do brzegu\./, roomId: 3251 },
    ];

    entries.forEach(entry => {
        const handler = createHandler(client, entry.roomId);
        parent.registerChild(entry.pattern, handler, 'ship-localizers');
    });
}
