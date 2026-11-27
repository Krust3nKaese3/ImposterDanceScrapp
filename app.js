/*
 * Imposter Dance. Host verteilt fertige Clips, alle starten auf einem gemeinsamen Zeitpunkt.
 */
(function () {
  'use strict';

  const A = window.ImposterAudio;
  const L = window.ImposterLogic;
  const AN = window.ImposterAnnounce;
  const S = window.ImposterSources;
  const LOBBY_KEY = 'imposterdance.lobby.v1';
  const SCRAP_URL = 'https://github.com/Krust3nKaese3/ImposterDanceScrapp';

  const state = {
    screen: 'lobby',
    shell: 'index',
    seated: [],
    directory: [],
    query: '',
    creating: false,
    draftName: '',
    draftTag: '',
    tracks: [],
    sourceId: 'local-mp3',
    sourceQuery: '',
    hits: [],
    match: L.createMatch([]),
    error: '',
    info: '',
    role: 'solo',
    selfDevice: '',
    roomCode: '',
    claims: {},
    origin: {},
    myPid: '',
    audioOn: false,
    myBallot: '',
    guestHint: false,
    clip: null,
    clipBytes: null,
    progress: {},
    binarySent: [],
    nextClip: null,
    clock: L.createClock(),
    offset: 0,
    playSource: null,
    qr: { open: '', hostLink: 'wlan', ssid: '', pass: '', note: '', image: '', share: '', copied: false, requests: [] },
    busy: false,
    songBusy: false,
    playBusy: false,
    danceSeconds: 15
  };

  function danceSeconds() {
    return A.secondsOf(state.danceSeconds);
  }

  const assembler = A.createAssembler();
  let announced = null;
  let playGen = 0;

  function bridge() {
    return window.OpenScrBridge || window.EveryAppBridge || null;
  }

  function mpApi() {
    const api = bridge();
    return api && api.multiplayer ? api.multiplayer : null;
  }

  function isGuest() {
    const api = bridge();
    return Boolean(api && api.guest === true) || state.role === 'guest';
  }

  function isHost() {
    return state.role === 'host' || state.role === 'solo';
  }

  function hostDevice() {
    return state.selfDevice || 'local';
  }

  function adoptIdentity() {
    const device = isGuest() ? state.selfDevice : hostDevice();
    if (!device) return;
    const mine = Object.keys(state.claims).find((id) => state.claims[id] === device);
    if (mine) state.myPid = mine;
  }

  function hostReady() {
    return Boolean(state.myPid && state.claims[state.myPid] === hostDevice() && state.seated.some((player) => player.id === state.myPid));
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function labelOf(player) {
    if (!player) return '';
    if (player.tag) return player.name + '#' + player.tag;
    return player.name || player.first || '';
  }

  function $(id) { return document.getElementById(id); }

  function inOpenScr() {
    return Boolean(window.ReactNativeWebView && window.ReactNativeWebView.postMessage);
  }

  function postShell(page) {
    state.shell = page;
    if (!inOpenScr()) return;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'shell-page', page: page }));
  }

  function applyShell(page) {
    const next = page === 'qr' || page === 'options' ? page : 'index';
    if (next === state.shell) return;
    postShell(next);
    if (next === 'qr') state.qr.open = '';
    render();
  }

  function render() {
    const root = $('app');
    if (!root) return;
    if (state.shell === 'qr') root.innerHTML = qrHtml();
    else if (state.shell === 'options') root.innerHTML = optionsHtml();
    else root.innerHTML = screenHtml();
    mountShared();
  }

  function screenHtml() {
    let html = lobbyHtml();
    if (state.screen === 'library') html = libraryHtml();
    else if (state.screen === 'deal' || state.screen === 'ready') html = readyHtml();
    else if (state.screen === 'dance') html = danceHtml();
    else if (state.screen === 'vote') html = voteHtml();
    else if (state.screen === 'reveal') html = revealHtml();
    if (!(isHost() && !isGuest())) return html;
    const hasSongAction = state.screen === 'lobby' || state.screen === 'library' || state.screen === 'reveal';
    const tools = (hasSongAction ? '' : forceSongButton()) + (state.screen === 'lobby' ? '' : abortButton());
    if (!tools) return html;
    return html.replace(/<\/div>\s*$/, tools + '</div>');
  }

  function forceSongButton() {
    return '<button type="button" class="btn" data-act="force-song">Nächsten Song erzwingen</button>';
  }

  function abortButton() {
    return '<button type="button" class="btn bad" data-act="abort">Spiel abbrechen</button>';
  }

  function header() {
    const code = state.roomCode ? ' · ' + esc(state.roomCode) : '';
    return `<div class="top"><div><h1>Imposter Dance</h1><p class="hint">Runde ${state.match.round || 0}${code}</p></div>
      ${isHost() && !isGuest() ? '<button type="button" class="btn ghost" data-act="qr">Einladen</button>' : ''}</div>`;
  }

  function banners() {
    const bits = [];
    if (state.error) bits.push(`<p class="error" role="alert">${esc(state.error)}</p>`);
    if (state.info) bits.push(`<p class="hint">${esc(state.info)}</p>`);
    if (isGuest()) bits.push('<p class="warn">Tab offen lassen, sonst bricht der Ton ab.</p>');
    return bits.join('');
  }

  function lobbyHtml() {
    if (window.OpenScrRoster) {
      return `${header()}<div class="stack">${banners()}<div id="openscr-roster"></div></div>`;
    }
    const chips = state.seated.map((player) => `<span class="chip">${esc(labelOf(player))}</span>`).join('');
    const hits = state.directory.filter((player) => {
      const needle = state.query.trim().toLowerCase();
      if (!needle) return true;
      return labelOf(player).toLowerCase().includes(needle);
    }).slice(0, 12);
    const suggest = hits.map((player) => `<button type="button" class="choice secondary" data-act="pick" data-id="${esc(player.id)}">${esc(labelOf(player))}</button>`).join('');
    const create = state.creating
      ? `<input id="draft-name" maxlength="16" placeholder="Anzeigename" aria-label="Anzeigename" value="${esc(state.draftName)}">
         <input id="draft-tag" maxlength="5" placeholder="Tag" aria-label="Tag" value="${esc(state.draftTag)}">
         <button type="button" class="btn" data-act="save-person">Speichern und hinzufügen</button>
         <button type="button" class="btn ghost" data-act="cancel-person">Zurück</button>`
      : '<button type="button" class="btn secondary" data-act="new-person">Neue Person</button>';
    return `${header()}<div class="stack">${banners()}
      <input id="name-query" maxlength="80" placeholder="Name eingeben" aria-label="Name suchen" value="${esc(state.query)}">
      ${suggest}
      ${isGuest() ? '' : create}
      <div class="roster">${chips}</div>
      ${isGuest() ? '<p class="hint">Der Host startet die Runde.</p>' : `<button type="button" class="btn" data-act="to-library" ${state.seated.length < L.MIN_PLAYERS ? 'disabled' : ''}>Musik wählen</button>`}
      <p class="hint">Ab ${L.MIN_PLAYERS} Personen. Jede hört über das eigene Handy und eigene Kopfhörer. Der Host bleibt auf Android. iOS kommt als Browser-Gast dazu.</p>
    </div>`;
  }

  function iconHtml(icon) {
    const text = String(icon || '♪');
    if (/^(https?:|data:image\/)/.test(text)) return `<img alt="" src="${esc(text)}">`;
    return esc(text);
  }

  function activeSource() {
    return S.get(state.sourceId) || S.get('local-mp3') || null;
  }

  function trackRows() {
    return state.tracks.map((track) => {
      const max = Math.max(0, (track.seconds || 0) - danceSeconds());
      return `<div class="track"><strong>${esc(track.name)}</strong>
        <label>Start bei ${track.start.toFixed(1)} s
          <input type="range" min="0" max="${max.toFixed(2)}" step="0.1" value="${track.start}" data-act="start-at" data-id="${esc(track.id)}" ${track.random ? 'disabled' : ''}>
        </label>
        <button type="button" class="btn ghost" data-act="toggle-random" data-id="${esc(track.id)}">${track.random ? 'Zufälliger Start: an' : 'Zufälliger Start: aus'}</button>
      </div>`;
    }).join('');
  }

  function sourceBar() {
    const list = S.list();
    if (list.length < 2) return '';
    const buttons = list.map((source) => `<button type="button" class="source ${source.id === state.sourceId ? 'on' : ''}" data-act="source" data-id="${esc(source.id)}" aria-label="${esc(source.name)}">${iconHtml(source.icon)}<span>${esc(source.name)}</span></button>`).join('');
    return `<nav class="sourcebar" aria-label="Musikquellen">${buttons}</nav>`;
  }

  function libraryHtml() {
    if (isGuest()) {
      return `${header()}<div class="stack">${banners()}
        <h2>Nächster Song</h2>
        <p class="hint">Der Host wählt den nächsten Song.</p>
      </div>`;
    }
    const source = activeSource();
    const files = !source || source.ui === 'files';
    const body = files
      ? `<section class="card stack">
        <h2>Songs vom Host-Handy</h2>
        <p class="hint">MP3 auswählen. Daraus wird vor dem Start ein ${danceSeconds()}-Sekunden-Schnipsel. Es geht komplett über das WLAN, nichts wird gestreamt.</p>
        <button type="button" class="btn secondary" data-act="pick-file">MP3 wählen</button>
        <input id="file-pick" type="file" accept="audio/mpeg,audio/mp3,.mp3" multiple hidden>
        ${trackRows() || '<p class="hint">Noch keine Datei.</p>'}
      </section>`
      : `<section class="card stack">
        <h2>${esc(source.name)}</h2>
        <p class="hint">Suche einen Titel. Der Host holt daraus ${danceSeconds()} Sekunden und verteilt dasselbe Paket wie bei einer MP3.</p>
        <input id="source-query" type="text" maxlength="80" placeholder="Suchen" aria-label="Musik suchen" value="${esc(state.sourceQuery)}">
        <button type="button" class="btn secondary" data-act="search-source" ${state.busy ? 'disabled' : ''}>Suchen</button>
        ${state.hits.map((hit) => `<button type="button" class="choice" data-act="add-hit" data-id="${esc(hit.id)}">${esc(hit.title || hit.name || hit.id)}</button>`).join('') || '<p class="hint">Noch keine Treffer.</p>'}
        ${trackRows() || '<p class="hint">Noch nichts für die Runde gewählt.</p>'}
      </section>`;
    return `${header()}<div class="stack">${banners()}
      ${body}
      ${playControl()}
      <button type="button" class="btn ghost" data-act="back-lobby">Zurück</button>
      ${sourceBar()}
    </div>`;
  }

  function playControl() {
    if (state.songBusy || state.playBusy) return '<div class="wait" aria-live="polite"><span class="spin" aria-hidden="true"></span></div>';
    return `<button type="button" class="btn" data-act="prepare" ${state.tracks.length ? '' : 'disabled'}>Abspielen</button>`;
  }

  function readyHtml() {
    return `${header()}<div class="stack">${banners()}
      <div class="roster">${loadCards()}</div>
      <div class="wait" aria-live="polite"><span class="spin" aria-hidden="true"></span></div>
    </div>`;
  }

  function loadCards() {
    const host = isHost() && !isGuest();
    return state.match.players.map((player) => {
      const ready = Boolean(state.match.ready[player.id]);
      const side = ready
        ? '<span class="orl-ok" aria-label="Fertig">✓</span>'
        : loadBar(player);
      const kick = host && !ready
        ? `<button type="button" class="orl-x" data-act="kick" data-id="${esc(player.id)}" aria-label="${esc(player.name)} rausnehmen">✕</button>`
        : '';
      const self = player.id === state.myPid ? ' orl-self' : '';
      return `<div class="orl-person${self}"><span>${esc(player.name)}</span>${side}${kick}</div>`;
    }).join('');
  }

  function loadBar(player) {
    const progress = state.progress[player.id];
    const percent = progress && progress.total
      ? Math.max(0, Math.min(100, Math.round((progress.received / progress.total) * 100)))
      : 8;
    return `<span class="loadbar" aria-label="lädt ${percent} Prozent"><span style="width:${percent}%"></span></span>`;
  }

  function loadLabel(player) {
    if (state.match.ready[player.id]) return 'bereit';
    const progress = state.progress[player.id];
    if (!progress || !progress.total) return 'lädt';
    const percent = Math.max(0, Math.min(100, Math.round((progress.received / progress.total) * 100)));
    return 'lädt ' + percent + ' %';
  }

  function namePicker() {
    return state.match.players.map((player) => `<button type="button" class="choice ${player.id === state.myPid ? 'mine' : ''}" data-act="hear-as" data-id="${esc(player.id)}">${esc(player.name)}</button>`).join('');
  }

  function danceHtml() {
    return `${header()}<div class="stack">${banners()}
      <section class="card dance" aria-live="polite"><div>♫</div><p class="hint">${danceSeconds()} Sekunden. Danach wird abgestimmt.</p></section>
    </div>`;
  }

  function voteHtml() {
    const vote = state.match.vote || { ballots: {}, claimed: {} };
    const me = state.match.players.find((player) => player.id === state.myPid);
    if (!me) {
      return `${header()}<div class="stack">${banners()}
        <h2>Wer ist der Imposter?</h2>
        <p class="hint">Dieses Handy hat in der Lobby niemanden gewählt.</p>
      </div>`;
    }
    const done = Boolean(vote.ballots[me.id] || state.myBallot);
    if (done) {
      const open = state.match.players.filter((player) => !vote.ballots[player.id]).length;
      return `${header()}<div class="stack">${banners()}
        <h2>Stimme ist abgegeben</h2>
        <p class="hint">${open ? 'Noch ' + open + ' ohne Stimme.' : 'Alle haben gewählt.'}</p>
      </div>`;
    }
    const choices = state.match.players.filter((player) => player.id !== me.id).map((player) =>
      `<button type="button" class="choice" data-act="suspect" data-id="${esc(player.id)}">${esc(player.name)}</button>`).join('');
    return `${header()}<div class="stack">${banners()}
      <h2>Wer ist der Imposter?</h2>
      <p class="hint">${esc(me.name)} stimmt auf diesem Handy.</p>
      ${choices}
    </div>`;
  }

  function revealHtml() {
    const last = state.match.last;
    const name = state.match.players.find((player) => player.id === (last && last.imposterId));
    const title = last && last.caught ? 'Imposter erwischt' : 'Imposter entkommt';
    const scores = state.match.players.map((player) => `<div class="choice secondary"><span>${esc(player.name)}</span><span>${player.score}</span></div>`).join('');
    return `${header()}<div class="stack">${banners()}
      <section class="card stack">
        <h2 class="${last && last.caught ? 'good' : 'warn'}">${title}</h2>
        <p class="lead">${esc(name ? name.name : '')} war der Imposter.</p>
      </section>
      ${scores}
      ${isHost() && !isGuest() ? '<button type="button" class="btn" data-act="next">Neuen Song auswählen</button>' : '<p class="hint">Der Host wählt den nächsten Song.</p>'}
      <button type="button" class="btn ghost" data-act="back-lobby">Zur Lobby</button>
    </div>`;
  }

  function qrHtml() {
    return `${header()}<div class="stack"><div id="openscr-qr"></div></div>`;
  }

  function optionsHtml() {
    return `${header()}<div class="stack">${banners()}
      <h2>Optionen</h2>
      <section class="card stack">
        <label class="field-label" for="dance-seconds">Tanzdauer: <span id="dance-seconds-label">${danceSeconds()} Sekunden</span></label>
        <input id="dance-seconds" type="range" min="3" max="30" step="1" value="${danceSeconds()}" aria-label="Tanzdauer in Sekunden" ${isHost() && !isGuest() ? '' : 'disabled'}>
        <p class="hint">So lange läuft der Schnipsel. Der Imposter hört nur die Ansage und danach Stille. Voreinstellung ist 15 Sekunden.</p>
      </section>
    </div>`;
  }

  function rosterModel() {
    const device = hostDevice();
    const hostHere = isHost() && !isGuest();
    const everyone = state.seated.length >= L.MIN_PLAYERS && state.seated.every((player) => state.claims[player.id]) && hostReady();
    return {
      query: state.query,
      directory: state.directory.map((player) => ({ id: String(player.id), label: labelOf(player) })),
      seated: state.seated.map((player) => {
        const owner = state.claims[player.id] || '';
        const mine = isGuest() ? state.selfDevice : device;
        return {
          id: String(player.id),
          pid: String(player.id),
          label: labelOf(player),
          connected: Boolean(owner),
          claimable: (!owner || owner === mine) && (hostHere || isGuest()),
          self: Boolean(owner) && owner === mine
        };
      }),
      startLabel: 'Musik wählen',
      startDisabled: !everyone || isGuest(),
      statsLabel: '',
      canRemove: hostHere,
      rulesHtml: '<p>Jede Person ein Handy. Die Karten legt der Host an. Ein Häkchen heißt, ein Handy hat den Namen gewählt. Wer dabei ist, tippt auf Ich.</p>'
    };
  }

  function mountShared() {
    if (state.shell === 'index' && state.screen === 'lobby' && window.OpenScrRoster) {
      const el = $('openscr-roster');
      if (el) {
        window.OpenScrRoster.attach(el, {
          onQuery: (value) => { state.query = value; },
          onPick: (id) => { seat(id); },
          onRemove: (id) => { if (isHost() && !isGuest()) unseat(id); },
          onMine: (id) => { if (isGuest()) seat(id); else claimHost(id); },
          onCreate: (draft) => { addPerson(draft.name, draft.tag); },
          onStart: () => { if (!isGuest()) { state.screen = 'library'; render(); } }
        });
        window.OpenScrRoster.setModel(rosterModel());
      }
    }
    if (state.shell === 'qr' && window.OpenScrQr) {
      const el = $('openscr-qr');
      if (!el) return;
      window.OpenScrQr.attach(el, {
        onScan: () => { const mp = mpApi(); if (mp && mp.join) mp.join({ scan: true, name: 'Gast' }); },
        onHost: () => { state.qr.open = 'host'; paintHostQr(); },
        onDownload: () => { paintDownloadQr(); },
        onWlan: () => { state.qr.hostLink = 'wlan'; paintHostQr(); },
        onHotspot: () => { state.qr.hostLink = 'hotspot'; state.qr.note = 'Name und Passwort eintragen.'; pushQr(); },
        onHotspotShow: (draft) => { state.qr.ssid = draft.ssid; state.qr.pass = draft.pass; paintHostQr(); },
        onCopy: () => { copyText(state.qr.share); state.qr.copied = true; pushQr(); },
        onShare: () => { if (navigator.share && state.qr.share) navigator.share({ title: 'Imposter Dance', url: state.qr.share }).catch(() => {}); },
        onStop: () => { const mp = mpApi(); if (mp && mp.endRoom) mp.endRoom(); state.role = 'solo'; postShell('index'); render(); },
        onApprove: (id) => { const mp = mpApi(); if (mp && mp.approveJoin) mp.approveJoin(id); },
        onDeny: (id) => { const mp = mpApi(); if (mp && mp.denyJoin) mp.denyJoin(id); }
      });
      pushQr();
    }
  }

  function pushQr() {
    if (!window.OpenScrQr) return;
    window.OpenScrQr.setModel({
      open: state.qr.open,
      hostLink: state.qr.hostLink,
      ssid: state.qr.ssid,
      pass: state.qr.pass,
      note: state.qr.note,
      image: state.qr.image,
      share: state.qr.share,
      copied: state.qr.copied,
      requests: state.qr.requests
    });
  }

  function wifiPayload(ssid, password) {
    const escWifi = (value) => String(value || '').replace(/([\\;,:"])/g, '\\$1');
    return 'WIFI:T:WPA;S:' + escWifi(ssid) + ';P:' + escWifi(password) + ';;';
  }

  async function qrImage(text) {
    const mp = mpApi();
    if (!mp || typeof mp.qrDataUrl !== 'function' || !text) return '';
    return mp.qrDataUrl(text);
  }

  async function hostCodes() {
    const mp = mpApi();
    if (!mp || typeof mp.codes !== 'function') return null;
    try { return await mp.codes(); } catch (error) { return null; }
  }

  async function paintHostQr() {
    state.qr.open = 'host';
    state.qr.copied = false;
    try {
      await ensureHost();
    } catch (error) {
      state.qr.note = errorText(error);
      state.qr.image = '';
      render();
      return;
    }
    let codes = await hostCodes();
    if (codes && !codes.gameUrl) {
      await wait(700);
      codes = await hostCodes();
    }
    if (codes && codes.roomCode) state.roomCode = codes.roomCode;
    const gameUrl = codes && (codes.gameUrl || codes.qrPayload) || '';
    state.qr.share = gameUrl;
    if (state.qr.hostLink === 'hotspot') {
      if (!state.qr.ssid) {
        state.qr.image = '';
        state.qr.note = 'Name und Passwort eintragen.';
        render();
        return;
      }
      state.qr.image = await qrImage(wifiPayload(state.qr.ssid, state.qr.pass));
      state.qr.note = 'Hotspot-Code scannen, danach denselben Spiel-Link öffnen.';
    } else {
      state.qr.image = gameUrl ? await qrImage(gameUrl) : '';
      state.qr.note = gameUrl
        ? 'Stellt sicher, dass ihr im selben WLAN seid.'
        : 'Der Spiel-Link wird vorbereitet.';
    }
    render();
  }

  async function paintDownloadQr() {
    state.qr.open = 'download';
    state.qr.copied = false;
    state.qr.share = SCRAP_URL;
    state.qr.note = 'In OpenScr scannen, um Imposter Dance zu laden.';
    state.qr.image = await qrImage(SCRAP_URL);
    render();
  }

  function seat(id) {
    const found = state.directory.find((player) => String(player.id) === String(id))
      || state.seated.find((player) => String(player.id) === String(id));
    if (!found) return;
    if (isGuest()) {
      state.myPid = String(found.id);
      const mp = mpApi();
      if (mp && mp.send) mp.send({ t: 'seat', pid: String(found.id), name: found.name, tag: found.tag || '' });
      state.info = '';
      render();
      return;
    }
    if (state.seated.some((player) => String(player.id) === String(found.id))) return;
    state.seated.push({ id: String(found.id), name: found.name, tag: found.tag || '' });
    state.origin[String(found.id)] = 'host';
    state.query = '';
    persistLobby();
    publish();
    render();
  }

  function claimHost(id) {
    const pid = String(id);
    if (!state.seated.some((player) => player.id === pid)) return;
    const owner = state.claims[pid];
    const device = hostDevice();
    if (owner && owner !== device) {
      state.error = 'Diese Person spielt schon auf einem anderen Handy.';
      render();
      return;
    }
    Object.keys(state.claims).forEach((key) => {
      if (state.claims[key] === device) delete state.claims[key];
    });
    state.claims[pid] = device;
    state.myPid = pid;
    state.error = '';
    publish();
    render();
  }

  function claimGuest(pid, from, draft) {
    const id = String(pid || '');
    const known = state.directory.find((item) => String(item.id) === id);
    const player = known || (draft && draft.name ? { id: id, name: draft.name, tag: draft.tag || '' } : null);
    if (!player || !from) return;
    if (!known) state.directory.push({ id: id, name: player.name, tag: player.tag || '' });
    const owner = state.claims[id];
    if (owner && owner !== from) return;
    state.seated.forEach((seat) => {
      if (state.origin[seat.id] === from && seat.id !== id) {
        delete state.claims[seat.id];
        delete state.origin[seat.id];
      }
    });
    state.seated = state.seated.filter((seat) => state.origin[seat.id] !== from || seat.id === id);
    Object.keys(state.claims).forEach((key) => {
      if (state.claims[key] === from && key !== id) delete state.claims[key];
    });
    if (!state.seated.some((seat) => seat.id === id)) {
      state.seated.push({ id: id, name: player.name, tag: player.tag || '' });
      state.origin[id] = from;
    }
    state.claims[id] = from;
    publish();
    render();
  }

  function unseat(id) {
    const pid = String(id);
    state.seated = state.seated.filter((player) => String(player.id) !== pid);
    delete state.claims[pid];
    delete state.origin[pid];
    if (state.myPid === pid) state.myPid = '';
    persistLobby();
    publish();
    render();
  }

  async function addPerson(name, tag) {
    const cleanName = L.clipName(name);
    const cleanTag = String(tag || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 5);
    if (cleanName.length < 3 || cleanTag.length < 3) {
      state.error = 'Name 3 bis 16 Zeichen, Tag 3 bis 5 Zeichen.';
      render();
      return;
    }
    const api = bridge();
    if (api && api.players && api.players.add) {
      try {
        const created = await api.players.add({ name: cleanName, tag: cleanTag });
        await refreshDirectory();
        if (created && created.id) seat(created.id);
      } catch (error) {
        state.error = errorText(error);
        render();
      }
      return;
    }
    const local = { id: 'p_' + Date.now().toString(36), name: cleanName, tag: cleanTag };
    state.directory.push(local);
    state.creating = false;
    seat(local.id);
  }

  async function refreshDirectory() {
    const api = bridge();
    if (api && api.players && api.players.list) {
      try {
        const rows = await api.players.list();
        if (Array.isArray(rows)) {
          state.directory = rows.map((row) => ({ id: String(row.id), name: row.name, tag: row.tag || '' }));
        }
      } catch (error) {
        state.error = errorText(error);
      }
    }
  }

  window.addEventListener('openscr-names', () => {
    refreshDirectory().then(() => {
      if (state.shell === 'index' && state.screen === 'lobby') render();
    });
  });

  function syncMatchPlayers() {
    const scores = {};
    const round = state.match.round || 0;
    state.match.players.forEach((player) => { scores[player.id] = player.score; });
    state.match = L.createMatch(state.seated.map((player) => ({
      id: player.id,
      name: player.name,
      score: scores[player.id] || 0
    })));
    state.match.round = round;
    state.match.phase = 'lobby';
  }

  async function onFiles(list) {
    state.error = '';
    state.songBusy = true;
    render();
    const files = Array.from(list || []);
    for (let i = 0; i < files.length; i += 1) {
      try {
        const track = await readTrack(files[i]);
        state.tracks.push(track);
      } catch (error) {
        state.error = errorText(error);
      }
    }
    state.songBusy = false;
    render();
  }

  async function readTrack(file) {
    await unlockAudio();
    const raw = new Uint8Array(await file.arrayBuffer());
    const ctx = audioContext();
    if (!ctx || !ctx.decodeAudioData) throw new Error('Dieses Handy kann die Datei nicht dekodieren.');
    const decoded = await ctx.decodeAudioData(raw.buffer.slice(0));
    const channels = [];
    for (let c = 0; c < decoded.numberOfChannels; c += 1) channels.push(decoded.getChannelData(c));
    const mono = channels.length > 1 ? A.mixToMono(channels) : A.floatChannelToInt16(channels[0]);
    const id = 't_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
    return {
      id: id,
      name: file.name,
      sourceId: 'local-mp3',
      item: { id: id, title: file.name, pcm: mono, rate: decoded.sampleRate, seconds: decoded.duration },
      seconds: decoded.duration,
      start: 0,
      random: true
    };
  }

  function announcementBytes() {
    if (!announced) announced = A.b64ToBytes(AN.b64);
    return announced;
  }

  function bridgeAudio() {
    const api = bridge();
    return api && api.audio ? api.audio : null;
  }

  function startSeconds(track, rng) {
    const rate = (track.item && track.item.rate) || A.RATE;
    if (track.random && track.item && track.item.pcm) {
      const windowSamples = Math.round(danceSeconds() * rate);
      return A.randomStart(track.item.pcm.length, windowSamples, rng) / rate;
    }
    if (track.random && track.seconds > danceSeconds()) {
      const roll = typeof rng === 'function' ? rng() : Math.random();
      return roll * (track.seconds - danceSeconds());
    }
    return track.start || 0;
  }

  async function clipBytesFor(track, rng) {
    const raw = (track.item && track.item.bytes) || track.bytes;
    const audioApi = bridgeAudio();
    if (raw && audioApi && typeof audioApi.cut === 'function') {
      const clip = await audioApi.cut({
        bytes: raw,
        startMs: Math.round(startSeconds(track, rng) * 1000),
        durationMs: danceSeconds() * 1000,
        targetBytes: A.clipBytesFor(danceSeconds())
      });
      return clip.bytes;
    }
    const source = S.get(track.sourceId || 'local-mp3');
    if (!source) throw new Error('Die Musikquelle fehlt.');
    const produced = await source.getClip(track.item, startSeconds(track, rng), danceSeconds());
    return S.toClipBytes(produced, A, danceSeconds());
  }

  async function cutPair(rng) {
    if (!state.tracks.length) throw new Error('Zuerst eine Musik wählen.');
    const track = state.tracks[state.match.round % state.tracks.length];
    const song = await clipBytesFor(track, rng);
    const imposter = A.imposterFromAnnouncement(announcementBytes(), danceSeconds());
    if (song.length !== imposter.length) throw new Error('Die beiden Clips sind nicht gleich lang.');
    return { song: song, imposter: imposter, clipId: 'c' + (state.match.round || 1) };
  }

  async function prepareRound() {
    if (state.seated.length < L.MIN_PLAYERS) {
      state.error = 'Mindestens drei Personen.';
      render();
      return;
    }
    state.busy = true;
    state.playBusy = true;
    state.error = '';
    render();
    try {
      await ensureHost();
      syncMatchPlayers();
      const begun = L.beginRound(state.match, Math.random);
      if (!begun.ok) throw new Error('Zu wenige Personen.');
      if (!state.myPid) adoptIdentity();
      if (state.myPid) state.claims[state.myPid] = hostDevice();
      const pair = await cutPair(Math.random);
      state.localPair = pair;
      state.myBallot = '';
      state.screen = 'ready';
      state.match.phase = 'deal';
      publish();
      await distribute(pair);
      deliverLocal();
      publish();
      maybeStart();
    } catch (error) {
      state.error = errorText(error);
      state.screen = 'library';
    }
    state.busy = false;
    state.playBusy = false;
    render();
  }

  function kickLoading(id) {
    if (!(isHost() && !isGuest())) return;
    const pid = String(id);
    if (!state.match.players.some((player) => player.id === pid) || state.match.ready[pid]) return;
    const wasImposter = state.match.imposterId === pid;
    state.seated = state.seated.filter((player) => player.id !== pid);
    delete state.claims[pid];
    delete state.origin[pid];
    state.match.players = state.match.players.filter((player) => player.id !== pid);
    delete state.match.ready[pid];
    delete state.progress[pid];
    if (state.myPid === pid) state.myPid = '';
    if (!state.match.players.length) {
      state.error = 'Niemand ist mehr in der Runde.';
      publish();
      render();
      return;
    }
    if (wasImposter) {
      const next = state.match.players[Math.floor(Math.random() * state.match.players.length)];
      state.match.imposterId = next.id;
      delete state.match.ready[next.id];
      delete state.progress[next.id];
      publish();
      render();
      handImposterClip(next);
      return;
    }
    publish();
    render();
    maybeStart();
  }

  async function handImposterClip(player) {
    const pair = state.localPair;
    if (!pair || !player) return;
    if (player.id === state.myPid) {
      acceptClip(pair.clipId, pair.imposter);
      return;
    }
    const mp = mpApi();
    const to = state.claims[player.id];
    if (!mp || !to) return;
    if (typeof mp.sendBinary === 'function') {
      await mp.sendBinary({ to: to, bytes: pair.imposter, id: pair.clipId });
      return;
    }
    const parts = A.splitClip(pair.imposter, pair.clipId);
    for (let i = 0; i < parts.length; i += 1) await mp.send(parts[i], { to: to });
  }

  function remoteTargets() {
    return state.match.players.filter((player) => {
      const device = state.claims[player.id];
      return device && device !== state.selfDevice;
    }).slice().sort((a, b) => String(a.id).localeCompare(String(b.id), 'de'));
  }

  async function distribute(pair) {
    const mp = mpApi();
    const targets = remoteTargets();
    if (!mp || !targets.length) return;
    if (typeof mp.sendBinary === 'function') {
      for (let i = 0; i < targets.length; i += 1) {
        const player = targets[i];
        const bytes = player.id === state.match.imposterId ? pair.imposter : pair.song;
        const pause = L.binaryWaitMs(state.binarySent, bytes.length, Date.now());
        if (pause) await wait(pause);
        await mp.sendBinary({ to: state.claims[player.id], bytes: bytes, id: pair.clipId });
        state.binarySent.push({ at: Date.now(), n: bytes.length });
      }
      return;
    }
    const jobs = [];
    targets.forEach((player) => {
      const bytes = player.id === state.match.imposterId ? pair.imposter : pair.song;
      A.splitClip(bytes, pair.clipId).forEach((part) => jobs.push({ to: state.claims[player.id], data: part }));
    });
    for (let i = 0; i < jobs.length; i += 1) {
      await mp.send(jobs[i].data, { to: jobs[i].to });
      if (i % 6 === 5) await wait(800);
    }
  }

  function deliverLocal() {
    if (!state.localPair || !state.myPid) return;
    const bytes = state.myPid === state.match.imposterId ? state.localPair.imposter : state.localPair.song;
    acceptClip(state.localPair.clipId, bytes);
  }

  function noteProgress(playerId, progress) {
    if (!playerId || !progress) return;
    const received = Number(progress.received) || 0;
    const total = Number(progress.total) || 0;
    const prev = state.progress[playerId];
    state.progress[playerId] = { id: progress.id, received: received, total: total };
    const before = prev && prev.total ? Math.floor((prev.received / prev.total) * 10) : -1;
    const after = total ? Math.floor((received / total) * 10) : 0;
    if (before === after) return;
    render();
    if (isHost() && !isGuest()) {
      publish();
      return;
    }
    const mp = mpApi();
    if (mp && mp.send && state.myPid === playerId) {
      mp.send({ t: 'prog', pid: playerId, id: progress.id, received: received, total: total });
    }
  }

  function acceptClip(id, bytes) {
    const parsed = A.parseClip(bytes);
    if (!parsed) return;
    if (id === state.match.clipId) {
      state.clip = parsed;
      state.clipBytes = bytes;
    } else state.nextClip = { id: id, parsed: parsed };
    if (state.myPid) noteProgress(state.myPid, { id: id, received: 1, total: 1 });
    const ctx = audioContext();
    if (ctx && ctx.resume) ctx.resume().catch(() => {});
    state.audioOn = true;
    tellReady();
  }

  function tellReady() {
    if (!state.clip || !state.myPid) return;
    if (isHost() && !isGuest()) {
      L.markReady(state.match, state.myPid);
      publish();
      render();
      maybeStart();
      return;
    }
    const mp = mpApi();
    if (mp && mp.send) mp.send({ t: 'ready', id: state.match.clipId, pid: state.myPid });
  }

  function maybeStart() {
    if (isHost() && !isGuest() && state.match.phase !== 'dance' && L.allReady(state.match)) playRound();
  }

  async function playRound() {
    if (state.match.phase === 'dance') return;
    if (!L.allReady(state.match)) return;
    const startAt = Date.now() + 700;
    const armed = L.arm(state.match, startAt);
    if (!armed.ok) return;
    state.screen = 'dance';
    publish();
    const mp = mpApi();
    if (mp && mp.broadcast) await mp.broadcast({ t: 'go', id: state.match.clipId, at: startAt });
    schedulePlay(startAt);
    render();
  }

  function playMs() {
    if (state.clip && state.clip.durationMs) return state.clip.durationMs;
    return danceSeconds() * 1000;
  }

  function playInPage(localAt, durationMs) {
    const ctx = audioContext();
    if (!ctx || !state.clip) return false;
    const arm = () => {
      const left = Math.max(0, localAt - Date.now());
      startBuffer(ctx.currentTime + left / 1000, durationMs / 1000);
    };
    if (ctx.resume) ctx.resume().then(arm).catch(arm);
    else arm();
    return true;
  }

  function schedulePlay(startAt) {
    const offset = isHost() && !isGuest() ? 0 : state.offset;
    const localAt = L.localStartAt(startAt, offset);
    const waitMs = Math.max(0, localAt - Date.now());
    const durationMs = playMs();
    const gen = playGen;
    const audioApi = bridgeAudio();
    window.setTimeout(() => { if (gen === playGen) finishDance(); }, waitMs + durationMs);
    if (audioApi && typeof audioApi.schedulePlay === 'function' && state.clipBytes) {
      if (typeof audioApi.stop === 'function') audioApi.stop();
      let pending;
      try {
        pending = audioApi.schedulePlay({
          bytes: state.clipBytes,
          startAtMs: localAt,
          durationMs: durationMs
        });
      } catch (error) {
        if (!playInPage(localAt, durationMs)) state.error = errorText(error);
        return;
      }
      if (pending && typeof pending.catch === 'function') {
        pending.catch((error) => {
          if (playInPage(localAt, durationMs)) return;
          state.error = errorText(error);
          render();
        });
      }
      return;
    }
    playInPage(localAt, durationMs);
  }

  function startBuffer(when, seconds) {
    if (!state.clip) return;
    const ctx = audioContext();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, state.clip.samples.length, state.clip.rate || A.RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < state.clip.samples.length; i += 1) channel[i] = state.clip.samples[i] / 32768;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(when);
    source.stop(when + (seconds || danceSeconds()));
    state.playSource = source;
  }

  function stopPlayback() {
    playGen += 1;
    if (state.playSource) {
      try { state.playSource.stop(); } catch (error) { /* schon zu Ende */ }
      state.playSource = null;
    }
    const audioApi = bridgeAudio();
    if (audioApi && typeof audioApi.stop === 'function') {
      try { audioApi.stop(); } catch (error) { /* kein laufender Ton */ }
    }
  }

  function forceNextSong() {
    if (!(isHost() && !isGuest())) return;
    stopPlayback();
    state.tracks = [];
    state.clip = null;
    state.clipBytes = null;
    state.nextClip = null;
    state.progress = {};
    state.pendingClaim = '';
    state.myBallot = '';
    state.busy = false;
    state.error = '';
    state.info = '';
    state.screen = 'library';
    state.match.phase = 'lobby';
    publish();
    render();
  }

  function abortGame() {
    if (!(isHost() && !isGuest())) return;
    stopPlayback();
    state.clip = null;
    state.clipBytes = null;
    state.nextClip = null;
    state.progress = {};
    state.pendingClaim = '';
    state.busy = false;
    state.error = '';
    state.info = 'Spiel abgebrochen.';
    state.screen = 'lobby';
    syncMatchPlayers();
    state.match.round = 0;
    postShell('index');
    publish();
    render();
  }

  function finishDance() {
    if (state.match.phase !== 'dance') return;
    if (!(isHost() && !isGuest())) return;
    L.openVote(state.match);
    state.screen = 'vote';
    state.pendingClaim = '';
    publish();
    preloadNext();
    render();
  }

  function preloadNext() {
    if (!state.tracks.length) return;
    const round = state.match.round;
    const track = state.tracks[round % state.tracks.length];
    clipBytesFor(track, Math.random).then((song) => {
      state.nextPrepared = {
        id: 'c' + (round + 1),
        song: song,
        imposter: A.imposterFromAnnouncement(announcementBytes())
      };
    }).catch(() => {
      state.info = 'Der nächste Schnipsel wird beim Start der Runde geschnitten.';
    });
  }

  function onClaim(id, local) {
    const result = L.claim(state.match, id);
    if (!result.ok) return;
    if (local !== false) state.pendingClaim = id;
    publish();
    render();
  }

  function onBack(id) {
    const who = id || state.pendingClaim;
    if (!who) return;
    L.back(state.match, who);
    if (who === state.pendingClaim) state.pendingClaim = '';
    publish();
    render();
  }

  function onSuspect(id, voterId) {
    const voter = voterId || state.myPid;
    if (!voter || !state.match.vote) return;
    if (!state.match.vote.claimed[voter]) L.claim(state.match, voter);
    const result = L.cast(state.match, voter, id);
    if (!result.ok) {
      state.error = 'Die Stimme gilt nur für eine andere Person.';
      render();
      return;
    }
    if (voter === state.pendingClaim) state.pendingClaim = '';
    state.error = '';
    if (!L.pendingVoters(state.match).length) L.resolve(state.match);
    if (state.match.phase === 'reveal') state.screen = 'reveal';
    else state.screen = 'vote';
    publish();
    render();
  }

  function publish() {
    if (!(isHost() && !isGuest())) return;
    const mp = mpApi();
    if (!mp || !mp.broadcast) return;
    const view = L.publicView(state.match, '');
    view.seated = state.seated;
    view.claims = state.claims;
    view.screen = state.screen;
    view.progress = state.progress;
    view.danceSeconds = danceSeconds();
    mp.broadcast(view);
  }

  function applyState(view) {
    if (!view || view.t !== 'state') return;
    const scores = {};
    (view.players || []).forEach((player) => { scores[player.id] = player.score; });
    const match = L.createMatch(view.players || []);
    match.players.forEach((player) => { player.score = scores[player.id] || 0; });
    match.round = view.round || 0;
    match.phase = view.phase || 'lobby';
    match.clipId = view.clipId || '';
    match.startAt = view.startAt || 0;
    match.ready = view.ready || {};
    match.imposterId = view.imposterId || null;
    match.last = view.last || null;
    if (view.phase === 'vote' || view.phase === 'reveal') {
      match.vote = { ballots: {}, claimed: {} };
      (view.ballots || []).forEach((id) => { match.vote.ballots[id] = 'hidden'; });
      (view.claimed || []).forEach((id) => { match.vote.claimed[id] = true; });
    }
    state.match = match;
    if (Array.isArray(view.seated)) state.seated = view.seated;
    if (view.claims && typeof view.claims === 'object') state.claims = view.claims;
    if (view.progress && typeof view.progress === 'object') state.progress = view.progress;
    if (view.danceSeconds != null) state.danceSeconds = A.secondsOf(view.danceSeconds);
    adoptIdentity();
    const voted = Array.isArray(view.ballots) ? view.ballots : [];
    if (state.myPid && voted.indexOf(state.myPid) < 0) state.myBallot = '';
    state.screen = view.screen || phaseScreen(view.phase);
    render();
  }

  function phaseScreen(phase) {
    if (phase === 'deal' || phase === 'ready') return 'ready';
    if (phase === 'dance') return 'dance';
    if (phase === 'vote') return 'vote';
    if (phase === 'reveal') return 'reveal';
    return 'lobby';
  }

  function onNet(message) {
    const data = message && message.data ? message.data : message;
    if (!data || typeof data !== 'object') return;
    if (data.t === 'state') {
      applyState(data);
      return;
    }
    if (data.t === 'clip') {
      const done = A.pushChunk(assembler, data);
      if (done) acceptClip(data.id, done);
      return;
    }
    if (data.t === 'sync' && data.phase === 'q' && isHost() && !isGuest()) {
      const mp = mpApi();
      const from = message && message.from;
      if (mp && from) mp.send({ t: 'sync', phase: 'a', t1: data.t1, t2: Date.now(), t3: Date.now() }, { to: from });
      return;
    }
    if (data.t === 'sync' && data.phase === 'a') {
      const t4 = Date.now();
      const offset = L.ntpOffset(data.t1, data.t2, data.t3, t4);
      const delay = L.ntpDelay(data.t1, data.t2, data.t3, t4);
      L.pushSample(state.clock, offset, delay);
      state.offset = L.clockOffset(state.clock);
      return;
    }
    if (data.t === 'hear' && isHost()) {
      state.claims[data.pid] = message.from || data.device || '';
      publish();
      return;
    }
    if (data.t === 'seat' && isHost() && !isGuest()) {
      claimGuest(data.pid, message.from || '', { name: data.name, tag: data.tag });
      return;
    }
    if (data.t === 'prog' && isHost()) {
      state.progress[data.pid] = { id: data.id, received: Number(data.received) || 0, total: Number(data.total) || 0 };
      render();
      return;
    }
    if (data.t === 'ready' && isHost()) {
      if (data.id === state.match.clipId) L.markReady(state.match, data.pid);
      publish();
      render();
      maybeStart();
      return;
    }
    if (data.t === 'go') {
      state.screen = 'dance';
      state.match.phase = 'dance';
      schedulePlay(data.at);
      render();
      return;
    }
    if (data.t === 'vote' && isHost()) {
      if (data.step === 'claim') onClaim(data.pid, false);
      if (data.step === 'back') onBack(data.pid);
      if (data.step === 'cast') onSuspect(data.suspect, data.pid);
    }
  }

  function sendVote(step, extra) {
    if (isHost() && !isGuest()) {
      if (step === 'cast') onSuspect(extra.suspect, extra.pid || state.myPid);
      return;
    }
    if (step === 'cast') state.myBallot = extra.suspect || '';
    const mp = mpApi();
    if (mp && mp.send) mp.send(Object.assign({ t: 'vote', step: step }, extra));
    render();
  }

  async function ensureHost() {
    if (isGuest()) return;
    const mp = mpApi();
    if (!mp || state.role === 'host') return;
    const room = await mp.host({ name: 'Host', maxPlayers: 16, discoverable: true, joinApproval: true });
    state.role = 'host';
    state.roomCode = room && room.roomCode || '';
    state.selfDevice = room && (room.playerId || room.selfId) || state.selfDevice;
    publish();
  }

  async function bootNet() {
    const mp = mpApi();
    if (!mp) return;
    mp.onMessage((message) => onNet(message));
    if (typeof mp.onBinary === 'function') {
      mp.onBinary((message) => {
        if (!message) return;
        acceptClip(message.id, message.bytes);
        render();
      });
    }
    if (typeof mp.onBinaryProgress === 'function') {
      mp.onBinaryProgress((progress) => {
        state.selfProgress = progress;
        if (state.myPid) noteProgress(state.myPid, progress);
      });
    }
    mp.onPlayersChanged((roster) => {
      if (roster && roster.roomCode) state.roomCode = roster.roomCode;
      if (roster && roster.selfId) state.selfDevice = roster.selfId;
      if (isHost() && !isGuest()) publish();
    });
    mp.onJoinRequest((request) => {
      state.qr.requests = [{ id: request.id, name: request.name }];
      if (state.shell === 'qr') pushQr();
    });
    mp.onHostAway(() => { state.info = 'Host ist kurz weg.'; render(); });
    const back = await mp.resume();
    if (back && back.role) {
      state.role = back.role === 'host' ? 'host' : 'guest';
      state.selfDevice = back.selfId || '';
      state.roomCode = back.roomCode || '';
      state.guestHint = state.role === 'guest';
    } else if (bridge() && bridge().guest === true) {
      state.role = 'guest';
      state.guestHint = true;
    }
    if (state.role === 'guest') syncLoop();
  }

  function syncLoop() {
    const mp = mpApi();
    if (!mp || state.role !== 'guest') return;
    const tick = () => {
      mp.send({ t: 'sync', phase: 'q', t1: Date.now() });
      window.setTimeout(tick, 2000);
    };
    tick();
  }

  function audioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!state.audioCtx) state.audioCtx = new Ctx();
    return state.audioCtx;
  }

  async function unlockAudio() {
    const ctx = audioContext();
    if (ctx && ctx.resume) await ctx.resume();
    state.audioOn = true;
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) state.wakeLock = await navigator.wakeLock.request('screen');
    } catch (error) { /* Browser lehnt ab, bis die Geste sitzt. */ }
    const api = bridge();
    if (api && api.keepAwake && api.keepAwake.acquire) {
      try { await api.keepAwake.acquire(); } catch (error) { /* Browser-Gast hält den Host nicht wach. */ }
    }
    if (state.clip && state.myPid) tellReady();
    const mp = mpApi();
    if (mp && state.myPid) mp.send({ t: 'hear', pid: state.myPid });
    state.claims[state.myPid] = state.selfDevice || 'local';
  }

  function chooseHear(id) {
    state.myPid = id;
    const mp = mpApi();
    if (mp && mp.send && !(isHost() && !isGuest())) mp.send({ t: 'hear', pid: id });
    else state.claims[id] = state.selfDevice || 'local';
    if (state.clipBytes) noteProgress(id, { id: state.match.clipId, received: 1, total: 1 });
    else if (state.selfProgress) noteProgress(id, state.selfProgress);
    deliverLocal();
    render();
  }

  async function persistLobby() {
    const payload = JSON.stringify({ v: 2, seated: state.seated, danceSeconds: danceSeconds() });
    const api = bridge();
    if (api && api.storage && api.storage.set) {
      try { await api.storage.set(LOBBY_KEY, payload); } catch (error) { state.error = errorText(error); }
    }
  }

  async function restoreLobby() {
    const api = bridge();
    if (!api || !api.storage || !api.storage.get) return;
    try {
      const raw = await api.storage.get(LOBBY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.seated)) state.seated = parsed.seated;
      const savedSeconds = parsed && parsed.danceSeconds != null ? A.secondsOf(parsed.danceSeconds) : null;
      const oldDefault = !parsed || Number(parsed.v) < 2;
      if (savedSeconds != null && !(oldDefault && savedSeconds === 10)) state.danceSeconds = savedSeconds;
      if (oldDefault) persistLobby();
    } catch (error) { /* leere Lobby ist in Ordnung */ }
  }

  function copyText(value) {
    const api = bridge();
    if (api && api.clipboard && api.clipboard.setString) api.clipboard.setString(value);
    else if (navigator.clipboard) navigator.clipboard.writeText(value);
  }

  function errorText(error) {
    if (!error) return 'Unbekannter Fehler.';
    return String(error.message || error);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function onClick(event) {
    const button = event.target.closest && event.target.closest('[data-act]');
    if (!button) return;
    const act = button.dataset.act;
    if (act === 'pick') seat(button.dataset.id);
    if (act === 'new-person') { state.creating = true; render(); }
    if (act === 'cancel-person') { state.creating = false; render(); }
    if (act === 'save-person') addPerson(($('draft-name') || {}).value, ($('draft-tag') || {}).value);
    if (act === 'to-library') { state.screen = 'library'; render(); }
    if (act === 'back-lobby') { state.screen = 'lobby'; postShell('index'); render(); }
    if (act === 'abort') abortGame();
    if (act === 'force-song') forceNextSong();
    if (act === 'pick') return;
    if (act === 'pick-file') pickFiles();
    if (act === 'source') {
      state.sourceId = button.dataset.id;
      state.hits = [];
      state.error = '';
      render();
    }
    if (act === 'search-source') searchSource();
    if (act === 'add-hit') addHit(button.dataset.id);
    if (act === 'pick') return;
    if (act === 'prepare') prepareRound();
    if (act === 'kick') kickLoading(button.dataset.id);
    if (act === 'unlock') unlockAudio().then(render);
    if (act === 'play') playRound();
    if (act === 'hear-as') chooseHear(button.dataset.id);
    if (act === 'claim') sendVote('claim', { pid: button.dataset.id });
    if (act === 'vote-back') sendVote('back', { pid: state.pendingClaim });
    if (act === 'suspect') sendVote('cast', { pid: state.myPid, suspect: button.dataset.id });
    if (act === 'next') {
      state.tracks = [];
      state.screen = 'library';
      render();
    }
    if (act === 'qr') applyShell('qr');
    if (act === 'close-qr') applyShell('index');
    if (act === 'toggle-random') {
      const track = state.tracks.find((item) => item.id === button.dataset.id);
      if (track) track.random = !track.random;
      render();
    }
  }

  async function pickFiles() {
    const api = bridge();
    if (api && api.files && typeof api.files.pickAudio === 'function') {
      state.error = '';
      state.songBusy = true;
      render();
      try {
        const picked = await api.files.pickAudio({ accept: ['audio/mpeg', 'audio/mp3', '.mp3'], multiple: true });
        const canCut = Boolean(bridgeAudio() && typeof bridgeAudio().cut === 'function');
        for (let i = 0; i < (picked || []).length; i += 1) {
          const file = picked[i];
          const id = 't_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
          let seconds = (Number(file.durationMs) || 0) / 1000;
          const item = { id: id, title: file.name, bytes: file.bytes, seconds: seconds };
          if (!canCut) {
            const decoded = await readTrack({ name: file.name, arrayBuffer: async () => file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) });
            item.pcm = decoded.item.pcm;
            item.rate = decoded.item.rate;
            seconds = decoded.seconds;
          }
          state.tracks.push({
            id: id,
            name: file.name,
            sourceId: 'local-mp3',
            bytes: canCut ? file.bytes : null,
            item: item,
            seconds: seconds,
            start: 0,
            random: true
          });
        }
      } catch (error) {
        state.error = errorText(error);
      }
      state.songBusy = false;
      render();
      return;
    }
    const input = $('file-pick');
    if (input) input.click();
  }

  function onInput(event) {
    if (event.target.id === 'name-query') {
      state.query = event.target.value;
      render();
      const field = $('name-query');
      if (field) {
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      }
    }
    if (event.target.id === 'source-query') state.sourceQuery = event.target.value;
    if (event.target.id === 'dance-seconds') {
      state.danceSeconds = A.secondsOf(event.target.value);
      const label = $('dance-seconds-label');
      if (label) label.textContent = danceSeconds() + ' Sekunden';
      persistLobby();
      publish();
    }
    if (event.target.dataset && event.target.dataset.act === 'start-at') {
      const track = state.tracks.find((item) => item.id === event.target.dataset.id);
      if (track) track.start = Number(event.target.value) || 0;
      const label = event.target.parentNode;
      if (label) label.firstChild.textContent = 'Start bei ' + track.start.toFixed(1) + ' s';
    }
  }

  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', (event) => {
    if (event.target.id === 'file-pick') onFiles(event.target.files);
  });

  function registerLocalSource() {
    S.registerMusicSource({
      id: 'local-mp3',
      name: 'MP3',
      icon: '♫',
      ui: 'files',
      search: function () {
        return state.tracks.filter((track) => track.sourceId === 'local-mp3').map((track) => ({
          id: track.id,
          title: track.name,
          seconds: track.seconds
        }));
      },
      getClip: function (item, startSec, durationSec) {
        const rate = item.rate || A.RATE;
        const start = Math.max(0, Math.round((startSec || 0) * rate));
        const count = Math.max(1, Math.round((durationSec || A.SECONDS) * rate));
        const out = new Int16Array(count);
        const pcm = item.pcm || new Int16Array(0);
        for (let i = 0; i < count; i += 1) {
          const at = start + i;
          out[i] = at < pcm.length ? pcm[at] : 0;
        }
        return { pcm: out, sampleRate: rate };
      }
    });
  }

  async function searchSource() {
    const source = activeSource();
    if (!source || source.ui === 'files') return;
    state.busy = true;
    state.error = '';
    render();
    try {
      const hits = await source.search(state.sourceQuery || '');
      state.hits = Array.isArray(hits) ? hits : [];
      if (!state.hits.length) state.info = 'Keine Treffer.';
      else state.info = '';
    } catch (error) {
      state.error = errorText(error);
    }
    state.busy = false;
    render();
  }

  function addHit(id) {
    const hit = state.hits.find((item) => String(item.id) === String(id));
    if (!hit) return;
    const seconds = Number(hit.seconds || hit.duration || 0);
    state.tracks.push({
      id: 'q_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
      name: hit.title || hit.name || 'Titel',
      sourceId: state.sourceId,
      item: hit,
      seconds: seconds,
      start: 0,
      random: seconds > danceSeconds()
    });
    state.info = '';
    render();
  }

  registerLocalSource();
  S.onChange(function () {
    if (state.screen === 'library' && state.shell === 'index') render();
  });

  const prior = window.ImposterDance || {};
  window.ImposterDance = {
    version: prior.version || S.VERSION,
    scrappId: prior.scrappId || S.SCRAPP_ID,
    registerMusicSource: prior.registerMusicSource || S.registerMusicSource,
    listMusicSources: prior.listMusicSources || S.list,
    state: state,
    prepareRound: prepareRound,
    unlockAudio: unlockAudio
  };

  if (window.ImposterAddons) {
    const api = bridge();
    window.ImposterAddons.install({
      bridge: api,
      target: window,
      cache: window.__openscrAddonCache,
      hostInjects: Boolean(api && api.addonsAvailable === true) || !Array.isArray(window.__openscrAddonCache),
      scrapp: {
        id: 'imposter-dance',
        repoUrl: SCRAP_URL,
        name: 'Imposter Dance',
        version: '1.0.0'
      },
      dispatch: (detail) => {
        window.dispatchEvent(new CustomEvent('openscr:addon', { detail: detail }));
      }
    });
  }

  window.addEventListener('openscr-shell', (event) => applyShell(event.detail));

  restoreLobby().then(refreshDirectory).then(() => {
    const pick = document.getElementById('file-pick');
    bootNet().then(() => {
      adoptIdentity();
      if (state.role === 'host') publish();
      render();
    });
    if (pick) { /* Dateiinput liegt im Library-Screen. */ }
  });
})();
