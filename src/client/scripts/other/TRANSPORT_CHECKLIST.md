# Transport Verification Checklist

For each route verify:
- **stop_pattern** — fires for both inside (`Z zewnatrz dochodzi stlumiony glos woznicy:`) and outside (`Siedzacy na kozle woznica krzyczy(?: glosno)?:` or `Woznica oznajmia glosno:`) forms
- **set_pattern** — correctly disambiguates direction; handles `glosno` variant
- **standing_pattern** — exact room.contents.object text
- **board_commands** — correct boarding sequence

Legend: ✅ confirmed · ⚠️ one form only / needs check · ❓ unknown · 🔗 shared standing pattern

---

## Powoz / Woz

### Novigrad - Oxenfurt ✅
- [x] stop_pattern: `Woznica oznajmia glosno: Postoj, ...` — same text inside/outside ✅
- [x] standing_pattern: `otwarty stojacy powoz` 🔗 Maribor-Obawa
- [x] board: `wem; wsiadz do powozu; wlm` ✅

### Maribor - Obawa
- [ ] stop_pattern: `Siedzacy na kozle woznica krzyczy(?: glosno)?:` per-stop — verify texts ⚠️
- [ ] set_pattern: same prefix — verify texts ⚠️
- [x] standing_pattern: `otwarty stojacy powoz` 🔗 Novigrad-Oxenfurt
- [x] board: `wem; wsiadz do powozu; wlm` ✅

### Maribor - Grabowa Buchta
- [ ] stop_pattern: `Z zewnatrz dochodzi...` — inside form only, need outside form
- [ ] set_pattern: `Woznica.*wola: Za chwile ruszamy w kierunku Mariboru/Grabowej Buchty` — verify
- [ ] standing_pattern: `drewniany stojacy woz`
- [ ] board: `wem; wsiadz do wozu; wlm`

### Bialy Most - Hagge
- [x] stop_pattern: per-stop alternation `(?:Z zewnatrz...|Woznica oznajmia gromkim glosem):` ✅ — unique per stop (include next stop name), no set_patterns needed
- [x] standing_pattern: `kupiecki stojacy woz` — ⚠️ verify exact text
- [ ] board: `wem; wsiadz do wozu; wsiadz do powozu; wlm` — verify (might be wozu only)

### Podgrodzie Tretogoru - Gelibol
- [ ] stop_pattern: `Z zewnatrz dochodzi...` — inside form only, need outside form
- [ ] set_pattern: `Siedzacy na kozle wozu kupiec wola...` — verify
- [ ] standing_pattern: `kupiecki stojacy woz z plandeka`
- [ ] board: `wem; wsiadz do wozu; wsiadz do powozu; wlm` — verify

---

## Dylizans

### Jouinard - Nuln
- [x] stop_pattern: `(?:Z zewnatrz dochodzi stlumiony glos woznicy|Woznica oznajmia gromkim glosem):` ✅ — outside form confirmed `Woznica oznajmia gromkim glosem: Postoj, ulica Bramna.`
- [x] set_pattern: `(?:Z zewnatrz dochodzi stlumiony glos woznicy|Woznica.*wola): Nastepny postoj - X!` ✅ — outside form `Woznica dylizansu glosno wola:` confirmed
- [x] standing_pattern: `ciemny stojacy dylizans` 🔗 Nuln-Blekitna Wstega
- [x] board: `wem; wsiadz do dylizansu; wlm`

### Nuln - Blekitna Wstega *(vehicle is ciemny)* ✅
- [x] stop_pattern: `(?:Z zewnatrz dochodzi stlumiony glos woznicy|Woznica oznajmia gromkim glosem):` — outside confirmed `Woznica oznajmia gromkim glosem: Postoj, na rynku przed gospoda.`
- [x] set_pattern: `(?:Z zewnatrz...|Woznica.*wola): Nastepny postoj - X!` — outside `Woznica dylizansu glosno wola:` confirmed
- [x] standing_pattern: `ciemny stojacy dylizans` 🔗 Jouinard-Nuln
- [x] board: `wem; wsiadz do dylizansu; wlm`
- ⚠️ start: also sees `Woznica gromkim glosem oznajmia: Odjazd.` from outside (same as KZ-Nuln)

### Kraina Zgromadzenia - Nuln ✅
- [x] stop_pattern: `(?:Z zewnatrz dochodzi stlumiony glos woznicy|Woznica oznajmia gromkim glosem):` — outside form confirmed `Woznica oznajmia gromkim glosem: Postoj, placyk w polnocnej czesci miasta.`
- [x] set_pattern: `(?:Z zewnatrz...|Woznica.*wola): Za chwile ruszamy w kierunku X!` — outside `Woznica dylizansu glosno wola:` confirmed · added to stops 0 and 3 for staging at KZ/Nuln
- [x] standing_pattern: `czarny stojacy dylizans` 🔗 Wyzima-Oxenfurt
- [x] board: `wem; wsiadz do dylizansu; wlm`
- ⚠️ start pattern: also sees `Woznica gromkim glosem oznajmia: Odjazd.` — may need alternative start text if current `Drzwiczki...` doesn't fire on board

### Wyzima - Oxenfurt *(open, "wspinasz sie na")* ✅
- [x] stop_pattern: `Monotonne kolysanie ustaje w koncu i woz zatrzymuje sie.` ✅ definition-level
- [x] set_pattern: `(?: glosno)?` handles both forms ✅
- [x] standing_pattern: `czarny stojacy dylizans` 🔗 Kraina Zgromadzenia
- [x] board: `wem; wsiadz do dylizansu; wlm`

### Salignac - Nuln ✅
- [x] stop_pattern: `(?:Z zewnatrz dochodzi stlumiony glos woznicy|Woznica oznajmia gromkim glosem):` — outside confirmed `Woznica oznajmia gromkim glosem: Postoj, niewielki plac w poludniowej czesci miasta.`
- [x] set_pattern: `(?:Z zewnatrz...|Woznica.*wola): Nastepny postoj - X!` — outside `Woznica dylizansu glosno wola:` confirmed · added to stop 3 (Nuln) for staging
- [x] standing_pattern: `zielony stojacy dylizans`
- [x] board: `wem; wsiadz do dylizansu; wlm`

### Varieno - Miragliano - Campogrotta
- [ ] stop_pattern: `Z zewnatrz dochodzi...` — inside form only, need outside form
- [ ] set_pattern — verify
- [ ] standing_pattern: `szary stojacy dylizans`
- [ ] board: `wem; wsiadz do dylizansu; wlm`

### Quenelles - Montlac - Merceaux-Descloux - Parravon ⚠️ unverified
- [x] stop_pattern: `(?:Z zewnatrz dochodzi stlumiony glos woznicy|Woznica oznajmia gromkim glosem):` — outside form assumed same as other routes, pending confirmation
- [x] set_pattern: `(?:Z zewnatrz...|Woznica.*wola): Nastepny postoj - X!` — assumed same format, pending confirmation
- [x] standing_pattern: `blekitny stojacy dylizans`
- [x] board: `wem; wsiadz do dylizansu; wlm`

### Carreras - Rivia - Scala
- [ ] stop_pattern: `Z zewnatrz dochodzi...` — inside form only, need outside form
- [ ] set_pattern — verify
- [ ] standing_pattern: ❓ not defined
- [ ] board: `wem; wsiadz do dylizansu; wlm`

---

## Ships

Key things to check per ship:
- stop_pattern uses NPC name (not description) — both `Name krzyczy:` and `Description krzyczy:` in alternation
- standing_pattern matches exact room.contents.object text
- board_commands correct

- [ ] Ancelmus
- [x] Annibale — `Jakis mezczyzna krzyczy na galeonie:` ✅
- [x] Asa — `(?:Asa|Mlody zylasty mezczyzna) krzyczy` on board · `Jakis mezczyzna krzyczy na skeidzie:` outside ✅ confirmed
- [ ] Batista
- [x] Bjorn — `Jakis mezczyzna krzyczy na statku:` outside ✅ confirmed
- [x] Cern *(standing: "Tajemniczy okret" 🔗 Gvidon)* · outside: `krzyczy na okrecie:` ✅ · stop text confirmed
- [x] Charonda — `Jakis mezczyzna krzyczy na statku:` ✅ (confirms Batista, Bjorn, Kelim, Mallcolm)
- [ ] Creyard
- [x] Daniel — standing: `Prom.` (non-paid, no kup bilet) ✅
- [ ] Elich
- [ ] Flavius
- [x] Francois — `(?:Francois|Dumny wysoki mezczyzna) krzyczy` on board · `Jakis mezczyzna krzyczy na brygu:` outside ✅ · both stops confirmed
- [ ] Gervais
- [ ] Gmeath
- [x] Gvidon *(standing: "Tajemniczy okret" 🔗 Cern)* · outside: `krzyczy na okrecie:` ✅
- [x] Hallgerda — `Jakas kobieta krzyczy na knarze:` ✅
- [x] Haming — per-stop patterns with `(?:... krzyczy|Jakis mezczyzna krzyczy na statku):` inside/outside alternation · set_patterns on Hagge stops for two-way disambiguation · Stare Buki/Piana outside form ⚠️ unverified
- [ ] Jacob
- [x] Kelim — `(?:Kelim|Zarosniety smierdzacy mezczyzna) krzyczy` on board · `Jakis mezczyzna krzyczy na statku:` outside ✅ confirmed
- [x] Louis — `(?:Louis|Smagly przygarbiony mezczyzna) krzyczy` on board · `Jakis mezczyzna krzyczy na tratwie:` outside ✅ confirmed
- [x] Luiggi — `(?:Luiggi|Lysawy gruby mezczyzna) krzyczy` on board · `Jakis mezczyzna krzyczy na tratwie:` outside ✅
- [x] Malacius *(stop_pattern regex fixed)* ✅
- [ ] Mallcolm
- [x] Olaf — `(?:Olaf|Rudobrody rozmowny mezczyzna) krzyczy` on board · `Jakis mezczyzna krzyczy na barkasie:` outside ✅ confirmed
- [x] Pluskolec — `Jakis mezczyzna krzyczy na szkucie:` ✅
- [ ] Rygwit
- [x] Strag — outside form `Jakis mezczyzna krzyczy na promie:` ✅ (prom, not statek)
