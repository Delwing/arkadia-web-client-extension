// Object List documentation - HTML content and initialization for the docs modal

const HP_COLORS_LIST: Record<string, string> = {
  danger: "tomato",
  warning: "yellow",
  success: "springgreen",
};
const HP_COLORS_CARD: Record<number, string> = {
  1: "#dc2626",
  2: "#dc2626",
  3: "#ef4444",
  4: "#f97316",
  5: "#eab308",
  6: "#84cc16",
  7: "#22c55e",
};

interface FakeObject {
  num: number;
  shortcut: string;
  desc: string;
  hp: number;
  isPlayer: boolean;
  isTeammate: boolean;
  attackNum: number | null;
  avatarTarget: boolean;
  attackTarget: boolean;
  defenseTarget: boolean;
}

const objects: FakeObject[] = [
  { num: 98, shortcut: "@", desc: "Gandalf", hp: 6, isPlayer: true, isTeammate: false, attackNum: 101, avatarTarget: false, attackTarget: false, defenseTarget: false },
  { num: 99, shortcut: "2", desc: "Aragorn", hp: 4, isPlayer: false, isTeammate: true, attackNum: 101, avatarTarget: false, attackTarget: false, defenseTarget: false },
  { num: 100, shortcut: "3", desc: "Legolas", hp: 5, isPlayer: false, isTeammate: true, attackNum: null, avatarTarget: false, attackTarget: false, defenseTarget: false },
  { num: 101, shortcut: "4", desc: "Duzy ork", hp: 2, isPlayer: false, isTeammate: false, attackNum: null, avatarTarget: true, attackTarget: true, defenseTarget: false },
  { num: 102, shortcut: "5", desc: "Maly goblin", hp: 0, isPlayer: false, isTeammate: false, attackNum: 98, avatarTarget: false, attackTarget: false, defenseTarget: false },
  { num: 103, shortcut: "6", desc: "Zly troll", hp: 5, isPlayer: false, isTeammate: false, attackNum: null, avatarTarget: false, attackTarget: false, defenseTarget: false },
];

const nextQueuedId = 103;
const teamAttacking = true;
const isLeader = true;
const descWidth = Math.max(...objects.map((o) => o.desc.length));

function hpLevel(hp: number): number {
  return Math.max(0, Math.min(6, hp)) + 1;
}
function hpColorLevel(level: number): string {
  return level <= 3 ? "danger" : level <= 5 ? "warning" : "success";
}
function getAttackers(obj: FakeObject): string[] {
  return objects.filter((o) => o.attackNum === obj.num).map((o) => o.shortcut);
}

function renderListView(): string {
  return objects
    .map((obj) => {
      const num = obj.shortcut;
      const level = hpLevel(obj.hp);
      const color = HP_COLORS_LIST[hpColorLevel(level)];
      const filled = "#".repeat(level);
      const empty = "-".repeat(7 - level);
      const hpBarContent = `[<span style="color:${color}">${filled}${empty}</span>]`;
      const padding = " ".repeat(descWidth - obj.desc.length);
      const attackers = getAttackers(obj);
      const arrow = attackers.length ? ` <- ${attackers.join(" ")}` : "";
      const isNextQueued = obj.num === nextQueuedId && !obj.isPlayer;

      let prefix = "  ";
      if (isLeader) {
        if (obj.isPlayer || obj.isTeammate) {
          prefix = obj.defenseTarget
            ? `<span class="target-dot target-dot-defense target-dot-active" style="color:greenyellow">>></span>`
            : `<span class="target-dot target-dot-defense" style="color:greenyellow">&#8226; </span>`;
        } else {
          prefix = obj.attackTarget
            ? `<span class="target-dot target-dot-attack target-dot-active" style="color:orangered">>></span>`
            : `<span class="target-dot target-dot-attack" style="color:orangered">&#8226; </span>`;
        }
      }

      let numHtml: string;
      if (obj.isPlayer) {
        numHtml = `${prefix}${num}`;
      } else {
        const numCls = "object-num" + (isNextQueued ? " object-num-next-target" : "");
        const numStyle = isNextQueued ? ' style="color:#ffd700"' : "";
        numHtml = `${prefix}<span class="${numCls}"${numStyle}>${num}</span>`;
      }

      let bar: string;
      if (obj.isPlayer) {
        bar = hpBarContent;
      } else if (obj.isTeammate) {
        bar = `<span class="object-hp-bar-teammate">${hpBarContent}</span>`;
      } else {
        bar = `<span class="object-hp-bar">${hpBarContent}</span>`;
      }

      let descHtml: string;
      if (obj.isPlayer) {
        descHtml = obj.desc + padding;
      } else {
        let descColor = "";
        let cls = "";
        if (obj.avatarTarget) descColor = "#ffaaaa";
        else if (obj.isTeammate) {
          descColor = "springgreen";
          if (teamAttacking && !obj.attackNum) cls = ' class="team-not-attacking"';
        } else if (obj.attackNum) descColor = "#b19cd9";

        const inner = descColor
          ? `<span${cls} style="color:${descColor}">${obj.desc}</span>`
          : obj.desc;
        descHtml = `<span class="object-desc">${inner}</span>${padding}`;
      }

      return `${numHtml} ${bar} ${descHtml}${arrow}`;
    })
    .join("<br>");
}

function renderCardView(): string {
  const cards = objects.map((obj) => {
    const num = obj.shortcut;
    const level = hpLevel(obj.hp);
    const hpPercent = ((level / 7) * 100).toFixed(1);
    const hpColor = HP_COLORS_CARD[level];
    const isNextQueued = obj.num === nextQueuedId && !obj.isPlayer;
    const attackers = getAttackers(obj);

    const cardCls = [
      "object-card",
      obj.isPlayer && "object-card--player",
      obj.isTeammate && !obj.isPlayer && "object-card--teammate",
      obj.avatarTarget && !obj.isPlayer && "object-card--target",
      isNextQueued && "object-card--next-queued",
      obj.attackTarget && "object-card--attack-target",
      obj.defenseTarget && "object-card--defense-target",
    ]
      .filter(Boolean)
      .join(" ");

    const numCls = "object-card__number" + (isNextQueued ? " object-card__number--next-target" : "");
    const nameCls = [
      "object-card__name",
      obj.avatarTarget && !obj.isPlayer && !obj.isTeammate && "object-card__name--target",
      obj.isTeammate && !obj.isPlayer && "object-card__name--teammate",
      obj.attackNum && !obj.isPlayer && !obj.isTeammate && !obj.avatarTarget && "object-card__name--attacking",
      obj.isTeammate && !obj.isPlayer && teamAttacking && !obj.attackNum && "object-card__name--teammate-not-attacking",
    ]
      .filter(Boolean)
      .join(" ");

    let icons = "";
    if (!obj.isPlayer && !obj.isTeammate) {
      const markCls = obj.attackTarget ? " object-card__icon--mark-attack--active" : "";
      icons = `<span class="object-card__icon object-card__icon--attack"></span>
        <span class="object-card__icon object-card__icon--guard"></span>
        <span class="object-card__icon object-card__icon--przelam"></span>
        ${isLeader ? `<span class="object-card__icon object-card__icon--mark-attack${markCls}"></span>` : ""}`;
    } else if (obj.isTeammate && !obj.isPlayer) {
      const markCls = obj.defenseTarget ? " object-card__icon--mark-defense--active" : "";
      icons = `<span class="object-card__icon object-card__icon--guard"></span>
        ${isLeader ? `<span class="object-card__icon object-card__icon--mark-defense${markCls}"></span>` : ""}`;
    }

    const attackerBadges = attackers.map((a) => `<span class="object-card__attacker">${a}</span>`).join("");
    const hpBarCls = obj.isTeammate && !obj.isPlayer ? "object-card__hp-bar--teammate" : "object-card__hp-bar";

    return `<div class="${cardCls}">
      <div class="object-card__row1">
        <span class="${numCls}">${num}</span>
        <span class="${nameCls}">${obj.desc}</span>
        <span class="object-card__icons">${icons}</span>
      </div>
      <div class="object-card__row2">
        <span class="object-card__attackers">${attackerBadges}</span>
      </div>
      <div class="${hpBarCls}"><div class="object-card__hp-fill" style="width:${hpPercent}%;background-color:${hpColor}"></div></div>
    </div>`;
  });
  return `<div class="objects-list-cards">${cards.join("")}</div>`;
}

function renderCompactView(): string {
  const cards = objects.map((obj) => {
    const num = obj.shortcut;
    const level = hpLevel(obj.hp);
    const hpPercent = ((level / 7) * 100).toFixed(1);
    const hpColor = HP_COLORS_CARD[level];
    const isNextQueued = obj.num === nextQueuedId && !obj.isPlayer;
    const attackers = getAttackers(obj);

    const cardCls = [
      "object-card",
      "object-card--compact",
      obj.isPlayer && "object-card--player",
      obj.isTeammate && !obj.isPlayer && "object-card--teammate",
      obj.avatarTarget && !obj.isPlayer && "object-card--target",
      isNextQueued && "object-card--next-queued",
      obj.attackTarget && "object-card--attack-target",
      obj.defenseTarget && "object-card--defense-target",
    ]
      .filter(Boolean)
      .join(" ");

    const numCls = "object-card__number" + (isNextQueued ? " object-card__number--next-target" : "");
    const nameCls = [
      "object-card__name",
      obj.avatarTarget && !obj.isPlayer && !obj.isTeammate && "object-card__name--target",
      obj.isTeammate && !obj.isPlayer && "object-card__name--teammate",
      obj.attackNum && !obj.isPlayer && !obj.isTeammate && !obj.avatarTarget && "object-card__name--attacking",
      obj.isTeammate && !obj.isPlayer && teamAttacking && !obj.attackNum && "object-card__name--teammate-not-attacking",
    ]
      .filter(Boolean)
      .join(" ");

    const hpBarCls = obj.isTeammate && !obj.isPlayer ? "object-card__hp-bar-vertical--teammate" : "object-card__hp-bar-vertical";

    let targetDot = "";
    if (isLeader) {
      if (obj.isPlayer || obj.isTeammate) {
        const active = obj.defenseTarget ? " object-card__target-dot--active" : "";
        targetDot = `<span class="object-card__target-dot object-card__target-dot--defense${active}"></span>`;
      } else {
        const active = obj.attackTarget ? " object-card__target-dot--active" : "";
        targetDot = `<span class="object-card__target-dot object-card__target-dot--attack${active}"></span>`;
      }
    }

    const attackerBadges = attackers.length
      ? `<span class="object-card__attackers-inline">${attackers.map((a) => `<span class="object-card__attacker">${a}</span>`).join("")}</span>`
      : "";

    return `<div class="${cardCls}">
      <div class="${hpBarCls}">
        <div class="object-card__hp-fill-vertical" style="height:${hpPercent}%;background-color:${hpColor}"></div>
      </div>
      <div class="object-card__compact-content">
        ${targetDot}
        <span class="${numCls}">${num}</span>
        <span class="${nameCls}">${obj.desc}</span>
        ${attackerBadges}
      </div>
    </div>`;
  });
  return `<div class="objects-list-cards objects-list-cards--compact">${cards.join("")}</div>`;
}

function renderDotsView(): string {
  const cards = objects.map((obj) => {
    const num = obj.shortcut;
    const level = hpLevel(obj.hp);
    const hpColor = HP_COLORS_CARD[level];
    const isNextQueued = obj.num === nextQueuedId && !obj.isPlayer;
    const attackers = getAttackers(obj);

    const cardCls = [
      "object-card",
      "object-card--compact",
      "object-card--compact-dots",
      obj.isPlayer && "object-card--player",
      obj.isTeammate && !obj.isPlayer && "object-card--teammate",
      obj.avatarTarget && !obj.isPlayer && "object-card--target",
      isNextQueued && "object-card--next-queued",
      obj.attackTarget && "object-card--attack-target",
      obj.defenseTarget && "object-card--defense-target",
    ]
      .filter(Boolean)
      .join(" ");

    const numCls = "object-card__number" + (isNextQueued ? " object-card__number--next-target" : "");
    const nameCls = [
      "object-card__name",
      obj.avatarTarget && !obj.isPlayer && !obj.isTeammate && "object-card__name--target",
      obj.isTeammate && !obj.isPlayer && "object-card__name--teammate",
      obj.attackNum && !obj.isPlayer && !obj.isTeammate && !obj.avatarTarget && "object-card__name--attacking",
      obj.isTeammate && !obj.isPlayer && teamAttacking && !obj.attackNum && "object-card__name--teammate-not-attacking",
    ]
      .filter(Boolean)
      .join(" ");

    const dotsCls = obj.isTeammate && !obj.isPlayer ? "object-card__hp-dots--teammate" : "object-card__hp-dots";
    const dots = Array.from({ length: 7 }, (_, i) =>
      i < level
        ? `<span class="object-card__hp-dot object-card__hp-dot--filled" style="background-color:${hpColor}"></span>`
        : `<span class="object-card__hp-dot object-card__hp-dot--empty"></span>`,
    ).join("");

    let targetDot = "";
    if (isLeader) {
      if (obj.isPlayer || obj.isTeammate) {
        const active = obj.defenseTarget ? " object-card__target-dot--active" : "";
        targetDot = `<span class="object-card__target-dot object-card__target-dot--defense${active}"></span>`;
      } else {
        const active = obj.attackTarget ? " object-card__target-dot--active" : "";
        targetDot = `<span class="object-card__target-dot object-card__target-dot--attack${active}"></span>`;
      }
    }

    const attackerBadges = attackers.length
      ? `<span class="object-card__attackers-inline">${attackers.map((a) => `<span class="object-card__attacker">${a}</span>`).join("")}</span>`
      : "";

    return `<div class="${cardCls}">
      <div class="object-card__compact-content">
        ${targetDot}
        <span class="${numCls}">${num}</span>
        <div class="${dotsCls}">${dots}</div>
        <span class="${nameCls}">${obj.desc}</span>
        ${attackerBadges}
      </div>
    </div>`;
  });
  return `<div class="objects-list-cards objects-list-cards--compact">${cards.join("")}</div>`;
}

export const objectListDocHtml = `<div class="ol-doc">

<h1>Lista Obiektow</h1>
<p class="subtitle">
  Panel wyswietlajacy obiekty w aktualnej lokacji: gracza, czlonkow druzyny i wrogow.<br>
  Pokazuje HP, wskazniki celow i umozliwia akcje walki przez klikanie.
</p>

<h2>Scenariusz uzyty w przykladach</h2>
<p>Wszystkie demonstracje ponizej pokazuja ten sam scenariusz walki z perspektywy <strong>lidera druzyny</strong>:</p>
<ul>
  <li><strong>@</strong> &ndash; Gracz "Gandalf" (pelne HP), atakowany przez goblina</li>
  <li><strong>2</strong> &ndash; Sojusznik "Aragorn" (srednie HP), atakuje orka</li>
  <li><strong>3</strong> &ndash; Sojusznik "Legolas" (dobre HP), <em>nie atakuje</em> (kursywa)</li>
  <li><strong>4</strong> &ndash; Wrog "Duzy ork" (niskie HP), aktualny cel + oznaczony cel ataku, atakowany przez @ i 2</li>
  <li><strong>5</strong> &ndash; Wrog "Maly goblin" (krytyczne HP), atakuje gracza</li>
  <li><strong>6</strong> &ndash; Wrog "Zly troll" (dobre HP), nastepny w kolejce ataku (zloty)</li>
</ul>

<h2>Tryby widoku</h2>
<p>Przelaczaj przyciskiem: <strong>Lista</strong> &rarr; <strong>Karty</strong> &rarr; <strong>Kompakt</strong> &rarr; <strong>Kropki</strong> &rarr; Lista&hellip;</p>

<div class="ol-tabs">
  <div class="ol-tab active" data-tab="list">Lista</div>
  <div class="ol-tab" data-tab="card">Karty</div>
  <div class="ol-tab" data-tab="compact">Kompakt</div>
  <div class="ol-tab" data-tab="dots">Kropki</div>
</div>

<div class="ol-tab-panels">

  <!-- LIST -->
  <div class="ol-tab-panel active" data-panel="list">
    <h3>Podglad</h3>
    <div class="demo-box-list">
      <div class="objects-list-content js-demo-list"></div>
    </div>

    <h3>Anatomia linii (przyklad wroga)</h3>
    <div class="anatomy">
      <div class="anatomy-line">
        <span class="anatomy-seg seg-prefix" data-idx="1" style="color:orangered">&gt;&gt;</span>
        <span class="anatomy-seg seg-num" data-idx="2">4</span>
        <span class="anatomy-seg seg-hp" data-idx="3">[<span style="color:tomato">###----</span>]</span>
        <span class="anatomy-seg seg-name" data-idx="4"><span style="color:#ffaaaa">Duzy ork</span></span>
        <span class="anatomy-seg seg-arrow" data-idx="5">&lt;- @ 2</span>
      </div>
      <div class="anatomy-legend">
        <span><b>1</b> Prefiks celu</span>
        <span><b>2</b> Numer</span>
        <span><b>3</b> Pasek HP</span>
        <span><b>4</b> Nazwa</span>
        <span><b>5</b> Atakujacy</span>
      </div>
    </div>
    <h3>Akcje klikniecia w widoku listy</h3>
    <table class="action-table">
      <tr><th>Element</th><th>Na wrogu</th><th>Na sojuszniku</th><th>Na graczu</th></tr>
      <tr><td><span class="mn">1</span>Prefiks celu</td><td><span class="cmd">/wa N</span> oznacz cel ataku</td><td><span class="cmd">/wz N</span> oznacz cel obrony</td><td><span class="cmd">/wz @</span> oznacz cel obrony</td></tr>
      <tr><td><span class="mn">2</span>Numer</td><td><span class="cmd">/z N</span> atakuj</td><td>(zablokowane)</td><td>&ndash;</td></tr>
      <tr><td><span class="mn">3</span>Pasek HP</td><td><span class="cmd">/prze N</span> przelam obrone</td><td><span class="cmd">/w N</span> wycofaj sie</td><td>&ndash;</td></tr>
      <tr><td><span class="mn">4</span>Nazwa</td><td><span class="cmd">/za N</span> zaslon</td><td><span class="cmd">/za N</span> zaslon</td><td>&ndash;</td></tr>
    </table>
    <div class="note">
      <strong>Prefiks celu (tylko lider):</strong>
      <code>&bull;</code> = nieaktywny, kliknij aby oznaczyc.
      <code>&gt;&gt;</code> = aktywny, kliknij aby wylaczyc + wyslij rozkaz
      (<span class="cmd">/ra N</span> atakuj, <span class="cmd">/rz N</span> bron).
      Niebedacy liderami widza <code>&gt;&gt;</code> ale nie moga kliknac.
    </div>
  </div>

  <!-- CARDS -->
  <div class="ol-tab-panel" data-panel="card">
    <h3>Podglad</h3>
    <div class="demo-box" style="max-width:380px">
      <div class="js-demo-card"></div>
    </div>

    <h3>Anatomia karty (przyklad wroga)</h3>
    <div class="anatomy-real">
      <div class="objects-list-cards">
        <div class="object-card object-card--target object-card--attack-target" style="position:relative;overflow:visible">
          <i class="marker" style="top:-7px;left:-7px;right:auto">6</i>
          <div class="object-card__row1">
            <span class="object-card__number" style="position:relative;overflow:visible">4<i class="marker">1</i></span>
            <span class="object-card__name object-card__name--target" style="position:relative;overflow:visible">Duzy ork<i class="marker">2</i></span>
            <span class="object-card__icons" style="position:relative">
              <span class="object-card__icon object-card__icon--attack"></span>
              <span class="object-card__icon object-card__icon--guard"></span>
              <span class="object-card__icon object-card__icon--przelam"></span>
              <span class="object-card__icon object-card__icon--mark-attack object-card__icon--mark-attack--active"></span>
              <i class="marker">3</i>
            </span>
          </div>
          <div class="object-card__row2">
            <span class="object-card__attackers" style="position:relative">
              <span class="object-card__attacker">@</span>
              <span class="object-card__attacker">2</span>
              <i class="marker">4</i>
            </span>
          </div>
          <div class="object-card__hp-bar" style="position:relative;overflow:visible">
            <div class="object-card__hp-fill" style="width:42.9%;background-color:#ef4444"></div>
            <i class="marker">5</i>
          </div>
        </div>
      </div>
      <div class="anatomy-legend" style="margin-top:1rem">
        <span><b>1</b> Numer</span>
        <span><b>2</b> Nazwa</span>
        <span><b>3</b> Ikony akcji</span>
        <span><b>4</b> Atakujacy</span>
        <span><b>5</b> Pasek HP (dolny)</span>
        <span><b>6</b> Obramowanie karty + wskaznik celu ataku</span>
      </div>
    </div>
    <h3>Akcje klikniecia w widoku kart</h3>
    <table class="action-table">
      <tr><th>Element</th><th>Na wrogu</th><th>Na sojuszniku</th></tr>
      <tr><td><span class="mn">1</span>Numer</td><td><span class="cmd">/z N</span> atakuj</td><td>(zablokowane)</td></tr>
      <tr><td><span class="mn">2</span>Nazwa</td><td><span class="cmd">/za N</span> zaslon</td><td><span class="cmd">/za N</span> zaslon</td></tr>
      <tr><td><span class="mn">5</span>Pasek HP (dolny)</td><td><span class="cmd">/prze N</span> przelam obrone</td><td><span class="cmd">/w N</span> wycofaj sie</td></tr>
      <tr><td><span class="mn">3</span>Ikona miecza</td><td><span class="cmd">/z N</span> atakuj</td><td>&ndash;</td></tr>
      <tr><td><span class="mn">3</span>Ikona tarczy</td><td><span class="cmd">/za N</span> zaslon</td><td><span class="cmd">/za N</span> zaslon</td></tr>
      <tr><td><span class="mn">3</span>Ikona zlamanej tarczy</td><td><span class="cmd">/prze N</span> przelam obrone</td><td>&ndash;</td></tr>
      <tr><td><span class="mn">3</span>Ikona celownika (lider)</td><td><span class="cmd">/wa N</span> oznacz cel ataku</td><td>&ndash;</td></tr>
      <tr><td><span class="mn">3</span>Ikona tarczy+gwiazdy (lider)</td><td>&ndash;</td><td><span class="cmd">/wz N</span> oznacz cel obrony</td></tr>
    </table>
    <h3>Kolory tla kart</h3>
    <div class="color-grid">
      <div class="color-item"><span class="color-dot" style="background:rgba(96,165,250,0.25)"></span> Niebieski &ndash; Gracz</div>
      <div class="color-item"><span class="color-dot" style="background:rgba(34,197,94,0.2)"></span> Zielony &ndash; Sojusznik</div>
      <div class="color-item"><span class="color-dot" style="background:linear-gradient(135deg,rgba(255,100,100,0.3),rgba(255,170,170,0.1))"></span> Czerwony gradient &ndash; Aktualny cel</div>
      <div class="color-item"><span class="color-dot" style="background:rgba(255,255,255,0.04);border:2px solid rgba(255,215,0,0.4)"></span> Zlote obramowanie &ndash; Nastepny cel z kolejki</div>
      <div class="color-item"><span class="color-dot" style="background:rgba(255,255,255,0.04);box-shadow:inset 3px 0 0 orangered"></span> Pomaranczowy lewy pasek &ndash; Oznaczony cel ataku</div>
      <div class="color-item"><span class="color-dot" style="background:rgba(255,255,255,0.04);box-shadow:inset 3px 0 0 greenyellow"></span> Zielony lewy pasek &ndash; Oznaczony cel obrony</div>
    </div>
  </div>

  <!-- COMPACT -->
  <div class="ol-tab-panel" data-panel="compact">
    <h3>Podglad</h3>
    <div class="demo-box" style="max-width:340px">
      <div class="js-demo-compact"></div>
    </div>

    <h3>Anatomia wiersza kompaktowego (przyklad wroga)</h3>
    <div class="anatomy-real">
      <div class="objects-list-cards objects-list-cards--compact" style="max-width:280px">
        <div class="object-card object-card--compact object-card--target object-card--attack-target" style="position:relative;overflow:visible">
          <div class="object-card__hp-bar-vertical" style="position:relative;overflow:visible">
            <div class="object-card__hp-fill-vertical" style="height:42.9%;background-color:#ef4444"></div>
            <i class="marker" style="top:-7px;left:-7px;right:auto">1</i>
          </div>
          <div class="object-card__compact-content">
            <span class="object-card__target-dot object-card__target-dot--attack object-card__target-dot--active" style="position:relative"><i class="marker" style="top:-7px;right:-5px">2</i></span>
            <span class="object-card__number" style="position:relative;overflow:visible">4<i class="marker">3</i></span>
            <span class="object-card__name object-card__name--target" style="position:relative;overflow:visible">Duzy ork<i class="marker">4</i></span>
            <span class="object-card__attackers-inline" style="position:relative">
              <span class="object-card__attacker">@</span>
              <span class="object-card__attacker">2</span>
              <i class="marker">5</i>
            </span>
          </div>
          <i class="marker" style="top:-7px;right:-7px">6</i>
        </div>
      </div>
      <div class="anatomy-legend" style="margin-top:1rem">
        <span><b>1</b> Pionowy pasek HP</span>
        <span><b>2</b> Kropka celu</span>
        <span><b>3</b> Numer</span>
        <span><b>4</b> Nazwa</span>
        <span><b>5</b> Atakujacy</span>
        <span><b>6</b> Prawe obramowanie = cel ataku</span>
      </div>
    </div>
    <h3>Akcje klikniecia w widoku kompaktowym</h3>
    <table class="action-table">
      <tr><th>Element</th><th>Na wrogu</th><th>Na sojuszniku</th></tr>
      <tr><td><span class="mn">2</span>Kropka celu (lider)</td><td><span class="cmd">/wa N</span> oznacz cel ataku</td><td><span class="cmd">/wz N</span> oznacz cel obrony</td></tr>
      <tr><td><span class="mn">3</span>Numer</td><td><span class="cmd">/z N</span> atakuj</td><td>(zablokowane)</td></tr>
      <tr><td><span class="mn">1</span>Pionowy pasek HP</td><td><span class="cmd">/prze N</span> przelam obrone</td><td><span class="cmd">/w N</span> wycofaj sie</td></tr>
      <tr><td><span class="mn">4</span>Nazwa</td><td><span class="cmd">/za N</span> zaslon</td><td><span class="cmd">/za N</span> zaslon</td></tr>
    </table>
    <div class="note">
      Prawe obramowanie: <span style="color:orangered">pomaranczowo-czerwone</span> = cel ataku, <span style="color:greenyellow">zielono-zolte</span> = cel obrony.
    </div>
  </div>

  <!-- DOTS -->
  <div class="ol-tab-panel" data-panel="dots">
    <h3>Podglad</h3>
    <div class="demo-box" style="max-width:340px">
      <div class="js-demo-dots"></div>
    </div>

    <h3>Anatomia wiersza z kropkami (przyklad wroga)</h3>
    <div class="anatomy-real">
      <div class="objects-list-cards objects-list-cards--compact" style="max-width:280px">
        <div class="object-card object-card--compact object-card--compact-dots object-card--target object-card--attack-target" style="position:relative;overflow:visible">
          <div class="object-card__compact-content">
            <span class="object-card__target-dot object-card__target-dot--attack object-card__target-dot--active" style="position:relative"><i class="marker" style="top:-7px;right:-5px">1</i></span>
            <span class="object-card__number" style="position:relative;overflow:visible">4<i class="marker">2</i></span>
            <div class="object-card__hp-dots" style="position:relative">
              <span class="object-card__hp-dot object-card__hp-dot--filled" style="background-color:#ef4444"></span>
              <span class="object-card__hp-dot object-card__hp-dot--filled" style="background-color:#ef4444"></span>
              <span class="object-card__hp-dot object-card__hp-dot--filled" style="background-color:#ef4444"></span>
              <span class="object-card__hp-dot object-card__hp-dot--empty"></span>
              <span class="object-card__hp-dot object-card__hp-dot--empty"></span>
              <span class="object-card__hp-dot object-card__hp-dot--empty"></span>
              <span class="object-card__hp-dot object-card__hp-dot--empty"></span>
              <i class="marker">3</i>
            </div>
            <span class="object-card__name object-card__name--target" style="position:relative;overflow:visible">Duzy ork<i class="marker">4</i></span>
            <span class="object-card__attackers-inline" style="position:relative">
              <span class="object-card__attacker">@</span>
              <span class="object-card__attacker">2</span>
              <i class="marker">5</i>
            </span>
          </div>
          <i class="marker" style="top:-7px;right:-7px">6</i>
        </div>
      </div>
      <div class="anatomy-legend" style="margin-top:1rem">
        <span><b>1</b> Kropka celu</span>
        <span><b>2</b> Numer</span>
        <span><b>3</b> Kropki HP</span>
        <span><b>4</b> Nazwa</span>
        <span><b>5</b> Atakujacy</span>
        <span><b>6</b> Prawe obramowanie = cel ataku</span>
      </div>
    </div>
    <h3>Akcje klikniecia w widoku kropek</h3>
    <table class="action-table">
      <tr><th>Element</th><th>Na wrogu</th><th>Na sojuszniku</th></tr>
      <tr><td><span class="mn">1</span>Kropka celu (lider)</td><td><span class="cmd">/wa N</span> oznacz cel ataku</td><td><span class="cmd">/wz N</span> oznacz cel obrony</td></tr>
      <tr><td><span class="mn">2</span>Numer</td><td><span class="cmd">/z N</span> atakuj</td><td>(zablokowane)</td></tr>
      <tr><td><span class="mn">3</span>Kropki HP</td><td><span class="cmd">/prze N</span> przelam obrone</td><td><span class="cmd">/w N</span> wycofaj sie</td></tr>
      <tr><td><span class="mn">4</span>Nazwa</td><td><span class="cmd">/za N</span> zaslon</td><td><span class="cmd">/za N</span> zaslon</td></tr>
    </table>
    <div class="note">
      Ten sam uklad co kompakt, ale z 7 kropkami zamiast pionowego paska.
      Wypelnione = pozostale HP, szare puste = utracone HP.
    </div>
  </div>

</div><!-- /ol-tab-panels -->

<h2>Kolory tekstu</h2>
<div class="color-grid">
  <div class="color-item"><span class="color-dot" style="background:#ffaaaa"></span> <span style="color:#ffaaaa">Jasnoczerwony</span> &ndash; Twoj aktualny cel</div>
  <div class="color-item"><span class="color-dot" style="background:springgreen"></span> <span style="color:springgreen">Zielony</span> &ndash; Sojusznik</div>
  <div class="color-item"><span class="color-dot" style="background:#b19cd9"></span> <span style="color:#b19cd9">Fioletowy</span> &ndash; Wrog atakujacy kogos</div>
  <div class="color-item"><span class="color-dot" style="background:#ffd700"></span> <span style="color:#ffd700">Zloty numer</span> &ndash; Nastepny cel z kolejki</div>
  <div class="color-item"><span class="color-dot" style="background:springgreen;opacity:0.5"></span> <em style="color:springgreen;display:inline-block;transform:skewX(-10deg)">Kursywa zielona</em> &ndash; Sojusznik nie atakujacy</div>
  <div class="color-item"><span class="color-dot" style="background:orangered"></span> <span style="color:orangered">Pomaranczowo-czerwony</span> &ndash; Oznaczenie celu ataku (lider)</div>
  <div class="color-item"><span class="color-dot" style="background:greenyellow"></span> <span style="color:greenyellow">Zielono-zolty</span> &ndash; Oznaczenie celu obrony (lider)</div>
</div>

<h2>Menu kontekstowe (prawy przycisk)</h2>
<p>
  Klikniecie prawym przyciskiem na obiekt otwiera menu kontekstowe z konfigurowalnymi komendami.
  Kazda komenda wysyla <code>{komenda} ob_{objectId}</code> do gry.
</p>
<p>
  Domyslne komendy: <code>ob</code>, <code>ocen</code>, <code>zapros</code>, <code>wskaz</code>.
  Konfigurowalne w Ustawieniach UI &rarr; <em>Komendy menu kontekstowego obiektow</em>.
</p>

<h2>Notacja strzalek (&lt;-)</h2>
<p>
  W widokach listy i kompakt, <code>&lt;- @ 2</code> oznacza ze obiekty
  <strong>@</strong> (gracz) i <strong>2</strong> atakuja ta jednostke.
  W widoku kart wyswietlane jest to jako okragle znaczniki atakujacych.
</p>

</div>`;

export function objectListDocInit(container: HTMLElement): void {
  const demoList = container.querySelector(".js-demo-list");
  const demoCard = container.querySelector(".js-demo-card");
  const demoCompact = container.querySelector(".js-demo-compact");
  const demoDots = container.querySelector(".js-demo-dots");

  if (demoList) demoList.innerHTML = renderListView();
  if (demoCard) demoCard.innerHTML = renderCardView();
  if (demoCompact) demoCompact.innerHTML = renderCompactView();
  if (demoDots) demoDots.innerHTML = renderDotsView();

  container.querySelectorAll<HTMLElement>(".ol-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      container.querySelectorAll(".ol-tab").forEach((t) => t.classList.remove("active"));
      container.querySelectorAll(".ol-tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      container.querySelector(`.ol-tab-panel[data-panel="${tab.dataset.tab}"]`)?.classList.add("active");
    });
  });
}
