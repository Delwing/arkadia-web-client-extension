# Zrzuty: faza 3, PR 1 (popupy walki i statusu)

Porownania PRZED / PO dla migracji rodziny walki i statusu na system
projektowy. Lewa polowa kazdego obrazka to `origin/redesign` sprzed PR-a,
prawa to stan po nim.

Po co w repo: `UI_MIGRATION.md` §5 mowi, ze dla redesignu ten diff JEST
recenzja. Zrzut w opisie PR-a znika razem z PR-em; tutaj zostaje przy kodzie,
ktory opisuje.

Trzy motywy z osmiu, dobrane tak, zeby lapaly rozne rodzaje bledow:

| Motyw | Po co |
|---|---|
| `arkadia` | domyslny, ciemny, akcent niebieski |
| `parchment` | jasny - lapie kontrast odwrocony wzgledem ciemnych |
| `fantasy` | mocny akcent (fiolet) - lapie reguly, ktore ida za akcentem |

## Jak je odtworzyc

Zrzuty robi tymczasowy harness Playwrighta, ktory NIE jest czescia zestawu
testow (nic nie asercjonuje - tylko otwiera kolejne popupy i je fotografuje).
Nie jest commitowany; recepta w `UI_MIGRATION.md` §4, faza 3, krok 8 mowi, co
ma robic. Wersje PRZED bierze sie z `git worktree add <sciezka> origin/redesign`
i tego samego harnessa.

Mozna je skasowac, gdy faza 6 sie domknie - wtedy opisuja juz tylko historie.
