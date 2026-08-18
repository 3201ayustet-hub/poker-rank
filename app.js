(function () {
  'use strict';

  const $app = document.getElementById('app');
  let db = window.PokerStorage.load();
  let route = { name: 'room' };

  const fmt = new Intl.NumberFormat('ja-JP');

  function id(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDate(date) {
    const d = new Date(`${date}T12:00:00`);
    if (Number.isNaN(d.getTime())) return date || '—';
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(d).toUpperCase();
  }

  function today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function playerById(playerId) {
    return db.players.find(p => p.id === playerId);
  }

  function sessionById(sessionId) {
    return db.sessions.find(s => s.id === sessionId);
  }

  function gameById(gameId) {
    return db.games.find(g => g.id === gameId);
  }

  function activePlayers() {
    return db.players.filter(p => p.active !== false);
  }

  function save() {
    window.PokerStorage.save(db);
  }

  function performancePercent(rank, fieldSize) {
    if (!rank || !fieldSize || fieldSize <= 1) return rank === 1 ? 100 : 0;
    return ((fieldSize - rank) / (fieldSize - 1)) * 100;
  }

  function completedGames() {
    return db.games.filter(g => g.status === 'finished');
  }

  function playerStats(playerId, games = completedGames()) {
    const entries = games.filter(g => g.playerIds.includes(playerId) && g.results?.[playerId]?.rank);
    const gamesCount = entries.length;
    const titles = entries.filter(g => g.results[playerId].rank === 1).length;
    const performance = gamesCount
      ? entries.reduce((sum, g) => sum + performancePercent(g.results[playerId].rank, g.playerIds.length), 0) / gamesCount
      : 0;
    const reentries = games.reduce((sum, g) => sum + (g.results?.[playerId]?.reentries || 0), 0);
    return {
      games: gamesCount,
      titles,
      winRate: gamesCount ? (titles / gamesCount) * 100 : 0,
      performance,
      reentries,
      reentryAvg: gamesCount ? reentries / gamesCount : 0
    };
  }

  function gameResultRows(game) {
    return game.playerIds
      .map(pid => ({ playerId: pid, ...(game.results?.[pid] || {}) }))
      .filter(r => r.rank)
      .sort((a, b) => a.rank - b.rank);
  }

  function currentStack(game, playerId) {
    if (game.currentStacks && Number.isFinite(game.currentStacks[playerId])) return game.currentStacks[playerId];
    return game.startingStack;
  }

  function livePlayers(game) {
    return game.playerIds.filter(pid => !game.results?.[pid]?.isOut);
  }

  function totalReentries(game) {
    return Object.values(game.results || {}).reduce((sum, r) => sum + (r.reentries || 0), 0);
  }

  function expectedChips(game) {
    return game.startingStack * (game.playerIds.length + totalReentries(game));
  }

  function ensureGameShape(game) {
    game.results ||= {};
    game.currentStacks ||= {};
    game.breaks ||= [];
    game.events ||= [];
    game.playerIds.forEach(pid => {
      game.results[pid] ||= { rank: null, reentries: 0, isOut: false };
      if (!Number.isFinite(game.currentStacks[pid])) game.currentStacks[pid] = game.startingStack;
    });
  }

  function addEvent(game, type, playerId, label) {
    game.events ||= [];
    game.events.push({ id: id('evt'), type, playerId: playerId || null, label, at: new Date().toISOString() });
  }

  function eventTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }

  function navigate(name, params = {}) {
    route = { name, ...params };
    window.scrollTo({ top: 0, behavior: 'instant' });
    render();
  }

  function topBar(title, backAction) {
    return `<header class="topbar">
      ${backAction ? `<button class="icon-btn" data-action="${backAction}" aria-label="戻る">←</button>` : `<div class="brand-mark">♠</div>`}
      <div><div class="eyebrow">POKER PERFORMANCE BOOK</div><div class="top-title">${esc(title)}</div></div>
      <button class="icon-btn" data-action="menu" aria-label="メニュー">•••</button>
    </header>`;
  }

  function bottomNav(active) {
    const items = [
      ['room', 'ROOM'],
      ['session-list', 'SESSION'],
      ['players', 'PLAYERS'],
      ['records', 'RECORDS']
    ];
    return `<nav class="bottom-nav">${items.map(([name, label]) => `
      <button data-nav="${name}" class="${active === name ? 'active' : ''}">${label}</button>
    `).join('')}</nav>`;
  }

  function emptyState(title, text, action, label) {
    return `<section class="empty-state">
      <div class="ornament">♠</div>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      ${action ? `<button class="primary-action" data-action="${action}">${esc(label)}</button>` : ''}
    </section>`;
  }

  function roomView() {
    const finished = completedGames();
    const leaderboard = activePlayers()
      .map(p => ({ p, s: playerStats(p.id) }))
      .filter(x => x.s.games > 0)
      .sort((a, b) => b.s.performance - a.s.performance);
    const leader = leaderboard[0];
    const currentSession = db.sessions.find(s => s.status === 'open') || [...db.sessions].sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
    const currentGame = currentSession ? db.games.find(g => g.sessionId === currentSession.id && g.status === 'live') : null;

    const hero = leader ? `
      <section class="hero-metric">
        <div class="eyebrow">ROOM LEADER · PERFORMANCE</div>
        <div class="hero-number">${leader.s.performance.toFixed(1)}<span>%</span></div>
        <div class="hero-name">${esc(leader.p.name)}</div>
        <div class="metric-line">
          <span><b>${leader.s.games}</b><small>GAMES</small></span>
          <span><b>${leader.s.titles}</b><small>TITLES</small></span>
          <span><b>${leader.s.winRate.toFixed(1)}%</b><small>WIN RATE</small></span>
          <span><b>${leader.s.reentryAvg.toFixed(2)}</b><small>RE-ENTRY</small></span>
        </div>
      </section>` : `
      <section class="hero-metric">
        <div class="eyebrow">PLAYER PERFORMANCE</div>
        <div class="hero-number ghost">—</div>
        <div class="hero-name">THE BOOK IS READY</div>
      </section>`;

    const sessionBlock = currentSession ? `
      <section class="ledger-section">
        <div class="section-head"><span>CURRENT SESSION</span><button data-nav="session" data-session-id="${currentSession.id}">OPEN</button></div>
        <div class="session-feature" data-nav="session" data-session-id="${currentSession.id}">
          <div><div class="large-serif">${formatDate(currentSession.date)}</div><div class="muted">${esc(currentSession.name || 'PRIVATE GAME')}</div></div>
          <div class="session-status">${currentGame ? 'LIVE' : currentSession.status === 'open' ? 'OPEN' : 'CLOSED'}</div>
        </div>
      </section>` : `
      <section class="ledger-section">
        <div class="section-head"><span>CURRENT SESSION</span></div>
        <button class="primary-action wide" data-action="new-session">START A SESSION</button>
      </section>`;

    const recent = [...finished].sort((a,b) => (b.finishedAt || '').localeCompare(a.finishedAt || '')).slice(0,5);
    return `${topBar(db.settings.roomName || 'PRIVATE POKER ROOM')}
      <main class="page">${hero}${sessionBlock}
      <section class="ledger-section">
        <div class="section-head"><span>RECENT TOURNAMENTS</span><span>${finished.length} GAMES</span></div>
        ${recent.length ? recent.map(g => {
          const winner = gameResultRows(g)[0];
          return `<button class="ledger-row" data-nav="game" data-game-id="${g.id}">
            <span class="ledger-index">${String(g.gameNumber).padStart(2,'0')}</span>
            <span class="ledger-main"><strong>${esc(playerById(winner?.playerId)?.name || '—')}</strong><small>${formatDate(sessionById(g.sessionId)?.date)} · ${g.playerIds.length}P</small></span>
            <span class="ledger-result">1ST</span>
          </button>`;
        }).join('') : `<p class="muted copy">まだ終了したゲームはありません。</p>`}
      </section>
      </main>${bottomNav('room')}`;
  }

  function playersView() {
    const players = [...activePlayers()].sort((a,b) => a.memberNo - b.memberNo);
    return `${topBar('MEMBERS')}
      <main class="page">
        <section class="page-intro"><div class="eyebrow">PRIVATE MEMBERS CLUB</div><h1>Players</h1><p>登録プレイヤーは最大10名。マイハンドと戦績を一冊の記録として残します。</p></section>
        <section class="ledger-section">
          <div class="section-head"><span>MEMBER DIRECTORY</span><span>${players.length} / 10</span></div>
          ${players.map(p => {
            const s = playerStats(p.id);
            return `<button class="member-row" data-nav="player" data-player-id="${p.id}">
              <span class="member-no">${String(p.memberNo).padStart(2,'0')}</span>
              <span class="member-main"><strong>${esc(p.name)}</strong><small>MY HAND · ${esc(p.myHand || '—')}</small></span>
              <span class="member-perf">${s.games ? `${s.performance.toFixed(1)}%` : '—'}</span>
            </button>`;
          }).join('') || `<p class="muted copy">プレイヤーを登録してください。</p>`}
        </section>
        ${players.length < 10 ? `<button class="primary-action wide" data-action="add-player">ADD MEMBER</button>` : ''}
      </main>${bottomNav('players')}`;
  }

  function playerView(playerId) {
    const p = playerById(playerId);
    if (!p) return roomView();
    const s = playerStats(playerId);
    return `${topBar(p.name, 'back-players')}
      <main class="page">
        <section class="member-card">
          <div class="eyebrow">MEMBER ${String(p.memberNo).padStart(2,'0')}</div>
          <div class="member-card-name">${esc(p.name)}</div>
          <div class="my-hand"><span>MY HAND</span><strong>${esc(p.myHand || '—')}</strong></div>
        </section>
        <section class="hero-metric compact">
          <div class="eyebrow">PERFORMANCE</div>
          <div class="hero-number">${s.games ? s.performance.toFixed(1) : '—'}${s.games ? '<span>%</span>' : ''}</div>
          <div class="metric-line">
            <span><b>${s.games}</b><small>GAMES</small></span>
            <span><b>${s.titles}</b><small>TITLES</small></span>
            <span><b>${s.winRate.toFixed(1)}%</b><small>WIN RATE</small></span>
            <span><b>${s.reentryAvg.toFixed(2)}</b><small>RE-ENTRY</small></span>
          </div>
        </section>
        <section class="ledger-section"><div class="section-head"><span>TOURNAMENT RECORDS</span></div>
          ${completedGames().filter(g => g.playerIds.includes(playerId)).sort((a,b)=>(b.finishedAt||'').localeCompare(a.finishedAt||'')).map(g => {
            const r = g.results[playerId];
            return `<button class="ledger-row" data-nav="game" data-game-id="${g.id}">
              <span class="ledger-index">${r.rank}</span><span class="ledger-main"><strong>GAME ${String(g.gameNumber).padStart(2,'0')}</strong><small>${formatDate(sessionById(g.sessionId)?.date)} · RE-ENTRY ${r.reentries || 0}</small></span><span class="ledger-result">${performancePercent(r.rank,g.playerIds.length).toFixed(0)}%</span>
            </button>`;
          }).join('') || `<p class="muted copy">まだ戦績はありません。</p>`}
        </section>
        <div class="split-actions"><button class="quiet-action" data-action="edit-player" data-player-id="${p.id}">EDIT</button><button class="danger-action" data-action="deactivate-player" data-player-id="${p.id}">ARCHIVE</button></div>
      </main>`;
  }

  function sessionsView() {
    const sessions = [...db.sessions].sort((a,b) => b.date.localeCompare(a.date));
    return `${topBar('SESSIONS')}
      <main class="page">
        <section class="page-intro"><div class="eyebrow">TOURNAMENT ARCHIVE</div><h1>Sessions</h1><p>1日の集まりをSessionとしてまとめ、その中で複数のTournamentを管理します。</p></section>
        <button class="primary-action wide" data-action="new-session">NEW SESSION</button>
        <section class="ledger-section"><div class="section-head"><span>SESSION BOOK</span></div>
          ${sessions.map((s,i) => {
            const gs = db.games.filter(g=>g.sessionId===s.id);
            return `<button class="ledger-row tall" data-nav="session" data-session-id="${s.id}">
              <span class="ledger-index">${String(s.sessionNumber || (sessions.length-i)).padStart(2,'0')}</span>
              <span class="ledger-main"><strong>${formatDate(s.date)}</strong><small>${esc(s.name || 'PRIVATE GAME')} · ${gs.length} GAMES</small></span>
              <span class="session-status">${s.status === 'open' ? 'OPEN' : 'CLOSED'}</span>
            </button>`;
          }).join('') || `<p class="muted copy">Sessionはまだありません。</p>`}
        </section>
      </main>${bottomNav('session-list')}`;
  }

  function sessionView(sessionId) {
    const s = sessionById(sessionId);
    if (!s) return sessionsView();
    const games = db.games.filter(g => g.sessionId === s.id).sort((a,b)=>a.gameNumber-b.gameNumber);
    const finished = games.filter(g=>g.status==='finished');
    const playerIds = [...new Set(games.flatMap(g=>g.playerIds))];
    const sessionLeaderboard = playerIds.map(pid=>({ p: playerById(pid), s: playerStats(pid, finished) })).filter(x=>x.p && x.s.games).sort((a,b)=>b.s.performance-a.s.performance);
    const live = games.find(g=>g.status==='live');
    return `${topBar(`SESSION ${String(s.sessionNumber || 1).padStart(2,'0')}`, 'back-sessions')}
      <main class="page">
        <section class="session-hero"><div class="eyebrow">PRIVATE GAME</div><h1>${formatDate(s.date)}</h1><p>${esc(s.name || 'PRIVATE POKER SESSION')}</p></section>
        <section class="metric-strip"><span><b>${games.length}</b><small>GAMES</small></span><span><b>${playerIds.length}</b><small>PLAYERS</small></span><span><b>${games.reduce((n,g)=>n+totalReentries(g),0)}</b><small>RE-ENTRIES</small></span></section>
        ${live ? `<button class="primary-action wide" data-nav="game" data-game-id="${live.id}">RETURN TO LIVE GAME</button>` : s.status==='open' ? `<button class="primary-action wide" data-action="new-game" data-session-id="${s.id}">${games.length ? 'START NEXT GAME' : 'START FIRST GAME'}</button>` : ''}
        ${sessionLeaderboard.length ? `<section class="ledger-section"><div class="section-head"><span>TODAY'S PERFORMANCE</span></div>${sessionLeaderboard.map((x,i)=>`<button class="ranking-row" data-nav="player" data-player-id="${x.p.id}"><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(x.p.name)}</strong><b>${x.s.performance.toFixed(1)}%</b></button>`).join('')}</section>` : ''}
        <section class="ledger-section"><div class="section-head"><span>GAME RECORD</span></div>
          ${games.map(g=>{ const winner=gameResultRows(g)[0]; return `<button class="ledger-row tall" data-nav="game" data-game-id="${g.id}"><span class="ledger-index">${String(g.gameNumber).padStart(2,'0')}</span><span class="ledger-main"><strong>${g.status==='finished' ? esc(playerById(winner?.playerId)?.name || '—') : 'TOURNAMENT IN PLAY'}</strong><small>${g.playerIds.length} PLAYERS · STACK ${fmt.format(g.startingStack)}</small></span><span class="session-status">${g.status==='finished'?'FINAL':'LIVE'}</span></button>`}).join('') || `<p class="muted copy">このSessionにはまだGameがありません。</p>`}
        </section>
        ${s.status==='open' && !live ? `<button class="quiet-action wide" data-action="close-session" data-session-id="${s.id}">CLOSE SESSION</button>` : ''}
      </main>`;
  }

  function gameView(gameId) {
    const g = gameById(gameId);
    if (!g) return roomView();
    ensureGameShape(g);
    if (g.status === 'finished') return gameResultView(g);
    const sorted = [...g.playerIds].sort((a,b)=>currentStack(g,b)-currentStack(g,a));
    const alive = livePlayers(g);
    return `${topBar(`GAME ${String(g.gameNumber).padStart(2,'0')}`, 'back-session')}
      <main class="page live-page">
        <section class="live-head"><div><div class="eyebrow">CURRENT FIELD</div><h1>LIVE</h1></div><div class="live-meta"><span>BREAK ${String(g.breaks.length).padStart(2,'0')}</span><span>${g.reentryOpen ? 'RE-ENTRY OPEN' : 'RE-ENTRY CLOSED'}</span></div></section>
        <section class="field-list">${sorted.map((pid,i)=>{
          const p=playerById(pid), r=g.results[pid], stack=currentStack(g,pid), isOut=r.isOut;
          return `<article class="field-row ${isOut?'is-out':''}"><div class="field-rank">${isOut?'OUT':String(i+1).padStart(2,'0')}</div><div class="field-player"><strong>${esc(p?.name||'Unknown')}</strong><small>${r.reentries ? `RE-ENTRY ×${r.reentries}` : 'IN PLAY'}</small></div><div class="field-stack">${isOut?'—':fmt.format(stack)}</div>${isOut && g.reentryOpen ? `<button class="mini-action" data-action="reenter" data-player-id="${pid}" data-game-id="${g.id}">RE-ENTER</button>` : !isOut ? `<button class="mini-action" data-action="mark-out" data-player-id="${pid}" data-game-id="${g.id}">OUT</button>` : ''}</article>`;
        }).join('')}</section>
        <section class="ledger-section chip-audit"><div class="section-head"><span>CHIP AUDIT</span></div><div class="audit-grid"><span><small>EXPECTED</small><b>${fmt.format(expectedChips(g))}</b></span><span><small>IN PLAY</small><b>${fmt.format(alive.reduce((sum,pid)=>sum+currentStack(g,pid),0))}</b></span><span><small>RE-ENTRY</small><b>${totalReentries(g)}</b></span></div></section>
        <section class="ledger-section"><div class="section-head"><span>GAME LEDGER</span></div>${[...g.events].reverse().slice(0,8).map(e=>`<div class="event-row"><span>${eventTime(e.at)}</span><strong>${esc(e.label)}</strong></div>`).join('') || `<p class="muted copy">ゲームイベントはまだありません。</p>`}</section>
        <div class="sticky-actions"><button data-action="break-entry" data-game-id="${g.id}">BREAK</button>${g.reentryOpen?`<button data-action="close-reentry" data-game-id="${g.id}">CLOSE RE-ENTRY</button>`:''}${alive.length===1?`<button class="gold" data-action="finish-game" data-game-id="${g.id}">FINISH</button>`:''}</div>
      </main>`;
  }

  function gameResultView(g) {
    const rows=gameResultRows(g);
    const winner=rows[0];
    return `${topBar(`GAME ${String(g.gameNumber).padStart(2,'0')}`, 'back-session')}
      <main class="page">
        <section class="result-hero"><div class="eyebrow">TOURNAMENT RESULT</div><div class="winner-rank">01</div><h1>${esc(playerById(winner?.playerId)?.name||'—')}</h1><div class="champion">CHAMPION</div></section>
        <section class="ledger-section"><div class="section-head"><span>FINAL RESULTS</span><span>${g.playerIds.length} PLAYERS</span></div>${rows.map(r=>`<button class="result-row" data-nav="player" data-player-id="${r.playerId}"><span>${String(r.rank).padStart(2,'0')}</span><strong>${esc(playerById(r.playerId)?.name||'—')}</strong><small>${performancePercent(r.rank,g.playerIds.length).toFixed(1)}% · RE-ENTRY ${r.reentries||0}</small></button>`).join('')}</section>
        <section class="ledger-section"><div class="section-head"><span>STACK HISTORY</span><span>${g.breaks.length} BREAKS</span></div>${renderStackHistory(g)}</section>
        <section class="ledger-section"><div class="section-head"><span>GAME LEDGER</span></div>${g.events.map(e=>`<div class="event-row"><span>${eventTime(e.at)}</span><strong>${esc(e.label)}</strong></div>`).join('')}</section>
      </main>`;
  }

  function renderStackHistory(g) {
    if (!g.breaks.length) return `<p class="muted copy">Break記録はありません。</p>`;
    const max = Math.max(g.startingStack, ...g.breaks.flatMap(b=>Object.values(b.stacks||{})));
    return g.playerIds.map(pid=>{
      const p=playerById(pid);
      const points=[g.startingStack,...g.breaks.map(b=>b.stacks?.[pid]||0)];
      return `<div class="history-row"><div class="history-label">${esc(p?.name||'—')}</div><div class="bars">${points.map((v,i)=>`<span class="bar" title="${fmt.format(v)}" style="height:${Math.max(6,(v/max)*62)}px"><i>${i===0?'S':i}</i></span>`).join('')}</div><div class="history-last">${fmt.format(points.at(-1)||0)}</div></div>`;
    }).join('');
  }

  function recordsView() {
    const stats=activePlayers().map(p=>({p,s:playerStats(p.id)})).filter(x=>x.s.games);
    const bestPerf=[...stats].sort((a,b)=>b.s.performance-a.s.performance)[0];
    const mostTitles=[...stats].sort((a,b)=>b.s.titles-a.s.titles)[0];
    const mostGames=[...stats].sort((a,b)=>b.s.games-a.s.games)[0];
    const mostRe=[...stats].sort((a,b)=>b.s.reentries-a.s.reentries)[0];
    const cards=[['BEST PERFORMANCE',bestPerf,bestPerf?`${bestPerf.s.performance.toFixed(1)}%`:'—'],['MOST TITLES',mostTitles,mostTitles?String(mostTitles.s.titles):'—'],['MOST GAMES',mostGames,mostGames?String(mostGames.s.games):'—'],['MOST RE-ENTRIES',mostRe,mostRe?String(mostRe.s.reentries):'—']];
    return `${topBar('ROOM RECORDS')}
      <main class="page"><section class="page-intro"><div class="eyebrow">HALL OF RECORDS</div><h1>Room Records</h1><p>このポーカールームに積み重なった記録を、静かな殿堂として残します。</p></section>
        <section class="records-grid">${cards.map(([label,x,value])=>`<article class="record-block"><div class="eyebrow">${label}</div><div class="record-number">${value}</div><div class="record-name">${esc(x?.p?.name||'NO RECORD')}</div></article>`).join('')}</section>
        <section class="ledger-section"><div class="section-head"><span>PERFORMANCE RANKING</span></div>${[...stats].sort((a,b)=>b.s.performance-a.s.performance).map((x,i)=>`<button class="ranking-row" data-nav="player" data-player-id="${x.p.id}"><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(x.p.name)}</strong><b>${x.s.performance.toFixed(1)}%</b></button>`).join('')||`<p class="muted copy">戦績が登録されるとランキングが表示されます。</p>`}</section>
      </main>${bottomNav('records')}`;
  }

  function modal(content) {
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal"><div class="modal-sheet">${content}</div></div>`);
  }

  function closeModal() {
    document.getElementById('modal')?.remove();
  }

  function addPlayerModal(existing) {
    modal(`<div class="modal-head"><div><div class="eyebrow">MEMBER PROFILE</div><h2>${existing?'EDIT MEMBER':'ADD MEMBER'}</h2></div><button class="icon-btn" data-action="close-modal">×</button></div>
      <form id="player-form" data-player-id="${existing?.id||''}">
        <label>PLAYER NAME<input name="name" maxlength="20" required value="${esc(existing?.name||'')}"></label>
        <label>MY HAND<input name="myHand" maxlength="6" placeholder="AKs" value="${esc(existing?.myHand||'')}"></label>
        <button class="primary-action wide" type="submit">${existing?'SAVE CHANGES':'REGISTER MEMBER'}</button>
      </form>`);
  }

  function newSessionModal() {
    modal(`<div class="modal-head"><div><div class="eyebrow">NEW CHAPTER</div><h2>NEW SESSION</h2></div><button class="icon-btn" data-action="close-modal">×</button></div>
      <form id="session-form"><label>DATE<input type="date" name="date" required value="${today()}"></label><label>SESSION NAME<input name="name" maxlength="30" placeholder="PRIVATE GAME"></label><button class="primary-action wide" type="submit">OPEN SESSION</button></form>`);
  }

  function newGameModal(sessionId) {
    const s=sessionById(sessionId); if(!s)return;
    const prev=[...db.games.filter(g=>g.sessionId===sessionId)].sort((a,b)=>b.gameNumber-a.gameNumber)[0];
    const defaultIds=prev?.playerIds||activePlayers().map(p=>p.id);
    modal(`<div class="modal-head"><div><div class="eyebrow">TOURNAMENT ENTRY</div><h2>NEW GAME</h2></div><button class="icon-btn" data-action="close-modal">×</button></div>
      <form id="game-form" data-session-id="${sessionId}"><label>STARTING STACK<input inputmode="numeric" name="startingStack" required value="${prev?.startingStack||20000}"></label><div class="form-caption">SELECT PLAYERS</div><div class="player-picks">${activePlayers().map(p=>`<label class="player-pick"><input type="checkbox" name="players" value="${p.id}" ${defaultIds.includes(p.id)?'checked':''}><span>${esc(p.name)}</span><small>${esc(p.myHand||'—')}</small></label>`).join('')}</div><button class="primary-action wide" type="submit">START TOURNAMENT</button></form>`);
  }

  function breakModal(gameId) {
    const g=gameById(gameId); if(!g)return; ensureGameShape(g);
    const alive=livePlayers(g);
    modal(`<div class="modal-head"><div><div class="eyebrow">STACK COUNT</div><h2>BREAK ${String(g.breaks.length+1).padStart(2,'0')}</h2></div><button class="icon-btn" data-action="close-modal">×</button></div>
      <form id="break-form" data-game-id="${g.id}"><div class="stack-inputs">${alive.map(pid=>`<label><span>${esc(playerById(pid)?.name||'—')}</span><input inputmode="numeric" name="stack_${pid}" value="${currentStack(g,pid)}" required></label>`).join('')}</div><div id="break-audit" class="live-audit"></div><button class="primary-action wide" type="submit">SAVE BREAK</button></form>`);
    updateBreakAudit(g.id);
  }

  function updateBreakAudit(gameId) {
    const g=gameById(gameId); const form=document.getElementById('break-form'); const out=document.getElementById('break-audit'); if(!g||!form||!out)return;
    const entered=livePlayers(g).reduce((sum,pid)=>sum+Number(form.elements[`stack_${pid}`]?.value||0),0);
    const expected=expectedChips(g);
    const diff=entered-expected;
    out.innerHTML=`<span><small>EXPECTED</small><b>${fmt.format(expected)}</b></span><span><small>ENTERED</small><b>${fmt.format(entered)}</b></span><span class="${diff===0?'ok':'warn'}"><small>DIFFERENCE</small><b>${diff>0?'+':''}${fmt.format(diff)}</b></span>`;
  }

  function menuModal() {
    modal(`<div class="modal-head"><div><div class="eyebrow">SYSTEM</div><h2>DATA BOOK</h2></div><button class="icon-btn" data-action="close-modal">×</button></div>
      <div class="menu-stack"><button class="quiet-action wide" data-action="export-data">EXPORT BACKUP</button><label class="quiet-action wide file-label">IMPORT BACKUP<input id="import-file" type="file" accept="application/json"></label><button class="danger-action wide" data-action="reset-data">RESET ALL DATA</button></div><p class="muted copy">現在はこの端末のブラウザ内に保存されます。Supabase同期は次フェーズで追加できます。</p>`);
  }

  function handleClick(e) {
    const nav=e.target.closest('[data-nav]');
    if(nav){ const n=nav.dataset.nav; if(n==='session') navigate('session',{sessionId:nav.dataset.sessionId}); else if(n==='game') navigate('game',{gameId:nav.dataset.gameId}); else if(n==='player') navigate('player',{playerId:nav.dataset.playerId}); else navigate(n); return; }
    const el=e.target.closest('[data-action]'); if(!el)return;
    const a=el.dataset.action;
    if(a==='menu') menuModal();
    if(a==='close-modal') closeModal();
    if(a==='add-player') addPlayerModal();
    if(a==='edit-player') addPlayerModal(playerById(el.dataset.playerId));
    if(a==='deactivate-player') { const p=playerById(el.dataset.playerId); if(p&&confirm(`${p.name} をアーカイブしますか？`)){p.active=false;save();navigate('players');} }
    if(a==='new-session') newSessionModal();
    if(a==='new-game') newGameModal(el.dataset.sessionId);
    if(a==='break-entry') breakModal(el.dataset.gameId);
    if(a==='back-players') navigate('players');
    if(a==='back-sessions') navigate('session-list');
    if(a==='back-session'){ const g=gameById(route.gameId); navigate('session',{sessionId:g?.sessionId}); }
    if(a==='mark-out') markOut(el.dataset.gameId,el.dataset.playerId);
    if(a==='reenter') reenter(el.dataset.gameId,el.dataset.playerId);
    if(a==='close-reentry') closeReentry(el.dataset.gameId);
    if(a==='finish-game') finishGame(el.dataset.gameId);
    if(a==='close-session'){ const s=sessionById(el.dataset.sessionId); if(s&&confirm('Sessionを終了しますか？')){s.status='closed';save();render();} }
    if(a==='export-data') exportBackup();
    if(a==='reset-data' && confirm('すべてのデータを削除します。元に戻せません。')) { window.PokerStorage.reset(); db=window.PokerStorage.load(); closeModal(); navigate('room'); }
  }

  function markOut(gameId, playerId) {
    const g=gameById(gameId), p=playerById(playerId); if(!g||!p)return; ensureGameShape(g);
    if(!confirm(`${p.name} をOUT登録しますか？`))return;
    g.results[playerId].isOut=true; g.currentStacks[playerId]=0;
    if(!g.reentryOpen){ const rank=livePlayers(g).length+1; g.results[playerId].rank=rank; addEvent(g,'elimination',playerId,`${p.name} — ${rank}TH`); }
    else addEvent(g,'out',playerId,`${p.name} OUT`);
    save(); render();
  }

  function reenter(gameId, playerId) {
    const g=gameById(gameId),p=playerById(playerId); if(!g||!p||!g.reentryOpen)return; ensureGameShape(g);
    g.results[playerId].isOut=false; g.results[playerId].rank=null; g.results[playerId].reentries=(g.results[playerId].reentries||0)+1; g.currentStacks[playerId]=g.startingStack;
    addEvent(g,'reentry',playerId,`${p.name} RE-ENTRY ×${g.results[playerId].reentries}`); save(); render();
  }

  function closeReentry(gameId) {
    const g=gameById(gameId); if(!g||!confirm('リエントリー受付を終了しますか？'))return;
    g.reentryOpen=false;
    const currentlyOut=g.playerIds.filter(pid=>g.results[pid].isOut && !g.results[pid].rank);
    let nextRank=livePlayers(g).length + currentlyOut.length;
    currentlyOut.forEach(pid=>{ g.results[pid].rank=nextRank--; });
    addEvent(g,'reentry_closed',null,'RE-ENTRY CLOSED'); save(); render();
  }

  function finishGame(gameId) {
    const g=gameById(gameId); if(!g)return; ensureGameShape(g); const alive=livePlayers(g); if(alive.length!==1){alert('残り1名になってから終了してください。');return;}
    if(g.reentryOpen){ if(!confirm('リエントリー受付も終了し、優勝を確定しますか？'))return; g.reentryOpen=false; }
    const winnerId=alive[0]; g.results[winnerId].rank=1; g.results[winnerId].isOut=false; g.status='finished'; g.finishedAt=new Date().toISOString(); addEvent(g,'finish',winnerId,`${playerById(winnerId)?.name||'PLAYER'} CHAMPION`); save(); render();
  }

  function exportBackup(){ const blob=new Blob([window.PokerStorage.exportData()],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`poker-performance-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }

  function handleSubmit(e) {
    if(e.target.id==='player-form'){e.preventDefault(); const fd=new FormData(e.target), pid=e.target.dataset.playerId; if(pid){const p=playerById(pid);p.name=fd.get('name').trim();p.myHand=fd.get('myHand').trim();}else{if(activePlayers().length>=10){alert('プレイヤーは最大10名です。');return;}db.players.push({id:id('pl'),memberNo:Math.max(0,...db.players.map(p=>p.memberNo||0))+1,name:fd.get('name').trim(),myHand:fd.get('myHand').trim(),active:true,createdAt:new Date().toISOString()});}save();closeModal();navigate('players');}
    if(e.target.id==='session-form'){e.preventDefault();const fd=new FormData(e.target);const s={id:id('ses'),sessionNumber:Math.max(0,...db.sessions.map(x=>x.sessionNumber||0))+1,date:fd.get('date'),name:fd.get('name').trim(),status:'open',createdAt:new Date().toISOString()};db.sessions.push(s);save();closeModal();navigate('session',{sessionId:s.id});}
    if(e.target.id==='game-form'){e.preventDefault();const fd=new FormData(e.target);const playerIds=fd.getAll('players');if(playerIds.length<2){alert('2名以上を選択してください。');return;}const stack=Number(String(fd.get('startingStack')).replaceAll(',',''));if(!Number.isFinite(stack)||stack<=0){alert('開始スタックを入力してください。');return;}const sessionId=e.target.dataset.sessionId;const n=db.games.filter(g=>g.sessionId===sessionId).length+1;const g={id:id('game'),sessionId,gameNumber:n,status:'live',startingStack:stack,playerIds,reentryOpen:true,currentStacks:{},results:{},breaks:[],events:[],createdAt:new Date().toISOString()};ensureGameShape(g);addEvent(g,'start',null,`GAME ${String(n).padStart(2,'0')} START`);db.games.push(g);save();closeModal();navigate('game',{gameId:g.id});}
    if(e.target.id==='break-form'){e.preventDefault();const g=gameById(e.target.dataset.gameId);if(!g)return;const stacks={};livePlayers(g).forEach(pid=>stacks[pid]=Number(e.target.elements[`stack_${pid}`].value||0));const entered=Object.values(stacks).reduce((a,b)=>a+b,0), expected=expectedChips(g);if(entered!==expected&&!confirm(`総チップが一致していません。\nExpected: ${fmt.format(expected)}\nEntered: ${fmt.format(entered)}\nこのまま保存しますか？`))return;g.currentStacks={...g.currentStacks,...stacks};g.breaks.push({id:id('br'),number:g.breaks.length+1,stacks,at:new Date().toISOString()});addEvent(g,'break',null,`BREAK ${String(g.breaks.length).padStart(2,'0')} RECORDED`);save();closeModal();render();}
  }

  function handleInput(e){ if(e.target.closest('#break-form')) updateBreakAudit(e.target.closest('#break-form').dataset.gameId); }

  function handleChange(e){ if(e.target.id==='import-file'&&e.target.files[0]){const reader=new FileReader();reader.onload=()=>{try{db=window.PokerStorage.importData(reader.result);closeModal();navigate('room');}catch(err){alert(err.message);}};reader.readAsText(e.target.files[0]);} }

  function render(){
    if(route.name==='room') $app.innerHTML=roomView();
    else if(route.name==='players') $app.innerHTML=playersView();
    else if(route.name==='player') $app.innerHTML=playerView(route.playerId);
    else if(route.name==='session-list') $app.innerHTML=sessionsView();
    else if(route.name==='session') $app.innerHTML=sessionView(route.sessionId);
    else if(route.name==='game') $app.innerHTML=gameView(route.gameId);
    else if(route.name==='records') $app.innerHTML=recordsView();
    else $app.innerHTML=roomView();
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleChange);
  render();
})();
