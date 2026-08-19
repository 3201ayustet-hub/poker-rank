(function () {
  'use strict';

  const $app = document.getElementById('app');
  const fmt = new Intl.NumberFormat('ja-JP');
  let db = window.PokerStorage.load();
  let route = { name: 'home' };
  let cloudStatus = 'connecting';
  let activeHonorIndex = 1;

  const LINE_COLORS = ['#d1be87','#6fb394','#a89fc9','#c78f76','#88a9bd','#c4aa91','#8fb28c','#b38ca0','#a7a27f','#86a4a0'];

  function id(_prefix) { return crypto.randomUUID(); }
  function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
  function num(v) { const n = Number(String(v ?? '').replaceAll(',','')); return Number.isFinite(n) ? n : 0; }
  function today() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function formatDate(value) { const d=new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime()) ? (value||'—') : new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(d).toUpperCase(); }
  function clock(iso) { const d=new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}); }
  function elapsedLabel(ms) { const m=Math.max(0,Math.round(ms/60000)); if(m===0)return 'START'; if(m<60)return `+${m}m`; const h=Math.floor(m/60), r=m%60; return r ? `+${h}h${r}` : `+${h}h`; }
  function ordinal(n) { if(n===1)return '1ST'; if(n===2)return '2ND'; if(n===3)return '3RD'; return `${n}TH`; }
  function parseHand(hand){
    const raw=String(hand||'').trim().toUpperCase();
    const symbols=raw.match(/(10|[2-9TJQKA])[♠♥♦♣]/g);
    if(symbols?.length>=2)return symbols.slice(0,2).map(x=>({rank:x.replace(/[♠♥♦♣]/,''),suit:x.slice(-1)}));
    const m=raw.match(/^(10|[2-9TJQKA])(10|[2-9TJQKA])([SO])?$/); if(!m)return null;
    const suited=m[3]==='S', pair=m[1]===m[2]; return [{rank:m[1],suit:'♠'},{rank:m[2],suit:suited?'♠':pair?'♥':'♥'}];
  }
  function handCardsHTML(hand,{small=false}={}){
    const cards=parseHand(hand); if(!cards)return `<span class="card-back ${small?'small':''}"><i>♠</i></span><span class="card-back ${small?'small':''}"><i>♠</i></span>`;
    return cards.map(c=>`<span class="mini-playing-card ${small?'small':''} ${c.suit==='♥'||c.suit==='♦'?'red-suit':''}"><b>${esc(c.rank)}</b><i>${c.suit}</i></span>`).join('');
  }

  function playerById(pid){ return db.players.find(p=>p.id===pid); }
  function sessionById(sid){ return db.sessions.find(s=>s.id===sid); }
  function gameById(gid){ return db.games.find(g=>g.id===gid); }
  function players(){ return db.players; }
  function completedGames(){ return db.games.filter(g=>g.status==='finished'); }
  function save(){ db=window.PokerStorage.save(db); }

  function ensureGameShape(g){
    if(!g)return;
    g.results ||= {}; g.currentStacks ||= {}; g.breaks ||= []; g.events ||= [];
    g.playerIds ||= [];
    g.playerIds.forEach(pid=>{
      g.results[pid] ||= {rank:null,reentries:0,isOut:false};
      if(!Number.isFinite(g.currentStacks[pid])) g.currentStacks[pid]=g.startingStack;
    });
  }
  db.games.forEach(ensureGameShape);

  function performancePercent(rank, fieldSize){ if(!rank||!fieldSize)return 0; if(fieldSize<=1)return rank===1?100:0; return ((fieldSize-rank)/(fieldSize-1))*100; }
  function playerStats(pid, games=completedGames()){
    const entries=games.filter(g=>g.playerIds.includes(pid)&&g.results?.[pid]?.rank);
    const count=entries.length;
    const titles=entries.filter(g=>g.results[pid].rank===1).length;
    const performance=count?entries.reduce((s,g)=>s+performancePercent(g.results[pid].rank,g.playerIds.length),0)/count:0;
    const reentries=games.reduce((s,g)=>s+(g.results?.[pid]?.reentries||0),0);
    const podiums=entries.filter(g=>g.results[pid].rank<=Math.min(3,g.playerIds.length)).length;
    return {games:count,titles,performance,reentries,podiums,winRate:count?titles/count*100:0,reentryAvg:count?reentries/count:0};
  }
  function gameResultRows(g){ ensureGameShape(g); return g.playerIds.map(pid=>({playerId:pid,...g.results[pid]})).filter(r=>r.rank).sort((a,b)=>a.rank-b.rank); }
  function livePlayers(g){ ensureGameShape(g); return g.playerIds.filter(pid=>!g.results[pid].isOut); }
  function currentStack(g,pid){ ensureGameShape(g); return Number.isFinite(g.currentStacks[pid])?g.currentStacks[pid]:g.startingStack; }
  function totalReentries(g){ ensureGameShape(g); return g.playerIds.reduce((s,pid)=>s+(g.results[pid]?.reentries||0),0); }
  function expectedChips(g){ return g.startingStack*(g.playerIds.length+totalReentries(g)); }
  function unresolvedOutEvent(g,pid){ return [...g.events].reverse().find(e=>e.playerId===pid&&(e.type==='out'||e.type==='elimination')); }
  function addEvent(g,type,playerId,label,meta={}){ g.events.push({id:id('evt'),type,playerId:playerId||null,label,meta,at:new Date().toISOString()}); }

  function navigate(name,params={}){ route={name,...params}; window.scrollTo({top:0,behavior:'instant'}); render(); }

  function topBar(title,backAction){
    return `<header class="topbar">
      ${backAction?`<button class="icon-btn" data-action="${backAction}" aria-label="戻る">←</button>`:`<div class="brand-mark" aria-hidden="true">♠</div>`}
      <div class="topbar-copy"><div class="eyebrow">POKER PERFORMANCE BOOK</div><div class="top-title">${esc(title)}</div></div>
      <button class="icon-btn" data-action="menu" aria-label="メニュー">•••</button>
    </header>`;
  }
  function bottomNav(active){
    const items=[['home','HOME'],['session-list','SESSION'],['players','PLAYERS'],['records','RECORDS']];
    return `<nav class="bottom-nav">${items.map(([n,l])=>`<button data-nav="${n}" class="${active===n?'active':''}"><span>${l}</span></button>`).join('')}</nav>`;
  }
  function sectionHead(left,right=''){ return `<div class="section-head"><span>${left}</span><span>${right}</span></div>`; }

  function liveGame(){
    return [...db.games].filter(g=>g.status==='live').sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))[0]||null;
  }
  function currentStandings(g){
    ensureGameShape(g);
    const active=livePlayers(g).sort((a,b)=>currentStack(g,b)-currentStack(g,a));
    const out=g.playerIds.filter(pid=>g.results[pid].isOut).sort((a,b)=>{
      const ra=g.results[a].rank||999, rb=g.results[b].rank||999;
      if(ra!==rb)return ra-rb;
      return (unresolvedOutEvent(g,b)?.at||'').localeCompare(unresolvedOutEvent(g,a)?.at||'');
    });
    return {active,out};
  }

  function homeView(){
    const g=liveGame();
    if(!g){
      return `${topBar(db.settings.roomName||'PRIVATE POKER ROOM')}<main class="page home-page">
        <section class="no-game">
          <div class="vegas-chip">♠</div>
          <div class="eyebrow">PRIVATE POKER ROOM</div>
          <h1>NO GAME<br>IN PLAY</h1>
          <div class="gold-rule"></div>
          <p>The table is waiting.</p>
          <small>SESSIONからゲームを開始すると、ここにライブ順位とスタック推移が表示されます。</small>
        </section>
      </main>${bottomNav('home')}`;
    }
    ensureGameShape(g);
    const s=sessionById(g.sessionId);
    const st=currentStandings(g);
    const avg=st.active.length?expectedChips(g)/st.active.length:0;
    const leader=st.active[0];
    const lastBreak=g.breaks[g.breaks.length-1];
    const lastAt=lastBreak?.at||g.events[g.events.length-1]?.at||g.createdAt;
    return `${topBar(db.settings.roomName||'PRIVATE POKER ROOM')}
      <main class="page home-page">
        <section class="live-banner">
          <div><div class="live-pill"><i></i> LIVE</div><div class="eyebrow">TOURNAMENT ${String(g.gameNumber).padStart(2,'0')} · ${formatDate(s?.date)}</div></div>
          <div class="break-badge">${g.breaks.length?`BREAK ${String(g.breaks.length).padStart(2,'0')}`:'OPENING'}</div>
        </section>
        <section class="leader-stage">
          <div class="eyebrow">CURRENT LEADER</div>
          <div class="leader-rank">01</div>
          <div class="leader-name">${esc(playerById(leader)?.name||'—')}</div>
          <div class="leader-stack">${leader?fmt.format(currentStack(g,leader)):'—'}<small>CHIPS</small></div>
          <div class="live-kpis"><span><b>${g.playerIds.length}</b><small>FIELD</small></span><span><b>${st.active.length}</b><small>REMAINING</small></span><span><b>${fmt.format(Math.round(avg))}</b><small>AVERAGE</small></span><span><b>${totalReentries(g)}</b><small>RE-ENTRY</small></span></div>
        </section>
        <section class="ledger-section standings-section">
          ${sectionHead('CURRENT STANDINGS',g.reentryOpen?'RE-ENTRY OPEN':'RE-ENTRY CLOSED')}
          <div class="standings-list">
            ${st.active.map((pid,i)=>{const re=g.results[pid]?.reentries||0;return `<div class="standing-row ${i===0?'is-leader':''}"><span class="standing-rank">${String(i+1).padStart(2,'0')}</span><strong class="standing-player"><span class="standing-hand">${handCardsHTML(playerById(pid)?.myHand,{small:true})}</span><span class="standing-name-wrap"><span>${esc(playerById(pid)?.name||'—')}</span>${re>0?`<small class="standing-reentry">RE-ENTRY ×${re}</small>`:''}</span></strong><b>${fmt.format(currentStack(g,pid))}</b></div>`}).join('')}
            ${st.out.length?`<div class="out-divider"><span>OUT</span></div>${st.out.map(pid=>{const re=g.results[pid]?.reentries||0;return `<div class="standing-row is-out"><span class="standing-rank">${g.results[pid].rank?String(g.results[pid].rank).padStart(2,'0'):'—'}</span><strong class="standing-player"><span class="standing-hand">${handCardsHTML(playerById(pid)?.myHand,{small:true})}</span><span class="standing-name-wrap"><span>${esc(playerById(pid)?.name||'—')}</span>${re>0?`<small class="standing-reentry">RE-ENTRY ×${re}</small>`:''}</span></strong><b>OUT</b></div>`}).join('')}`:''}
          </div>
        </section>
        <section class="ledger-section graph-section">
          ${sectionHead('STACK HISTORY',`UPDATED ${clock(lastAt)}`)}
          ${renderStackChart(g,{home:true})}
        </section>
      </main>${bottomNav('home')}`;
  }

  function playersView(){
    const list=[...players()].sort((a,b)=>(a.memberNo||0)-(b.memberNo||0));
    return `${topBar('MEMBERS')}<main class="page players-page">
      <section class="page-intro compact-intro"><div class="eyebrow">PRIVATE MEMBERS CLUB</div><h1>Players</h1></section>
      <section class="member-directory">${sectionHead('MEMBER DIRECTORY',`${list.length} / 10`)}
      ${list.map(p=>{const st=playerStats(p.id);return `<button class="member-pass" data-nav="player" data-player-id="${p.id}"><span class="member-pass-no">MEMBER ${String(p.memberNo||0).padStart(2,'0')}</span><span class="member-hand-mark">${handCardsHTML(p.myHand,{small:true})}</span><span class="member-pass-name">${esc(p.name)}</span><span class="member-pass-stats"><b>${st.games?st.performance.toFixed(1)+'%':'—'}</b><small>PERFORMANCE</small></span><span class="member-pass-meta">${st.titles} TITLES · ${st.games} GAMES</span></button>`}).join('')||'<p class="muted copy">プレイヤーを登録してください。</p>'}
      </section>${list.length<10?'<button class="primary-action wide" data-action="add-player">＋ ADD MEMBER</button>':''}
      </main>${bottomNav('players')}`;
  }

  function playerView(pid){
    const p=playerById(pid); if(!p)return playersView(); const s=playerStats(pid);
    const games=completedGames().filter(g=>g.playerIds.includes(pid)&&g.results[pid]?.rank).sort((a,b)=>(b.finishedAt||'').localeCompare(a.finishedAt||''));
    return `${topBar(p.name,'back-players')}<main class="page">
      <section class="member-card members-card-frame"><div class="member-card-top"><div class="eyebrow">MEMBER ${String(p.memberNo||0).padStart(2,'0')}</div><div class="members-club-seal">♠</div></div><div class="member-identity"><div class="profile-hand">${handCardsHTML(p.myHand)}</div><div><div class="member-card-name">${esc(p.name)}</div><div class="hand-caption">MY HAND · ${esc(p.myHand||'NOT SET')}</div></div></div><div class="member-card-footer">PRIVATE POKER ROOM · PLAYER'S CARD</div></section>
      <section class="player-performance"><div class="eyebrow">PERFORMANCE</div><div class="profile-performance">${s.games?s.performance.toFixed(1):'—'}<span>${s.games?'%':''}</span></div><div class="metric-line"><span><b>${s.games}</b><small>GAMES</small></span><span><b>${s.titles}</b><small>TITLES</small></span><span><b>${s.winRate.toFixed(1)}%</b><small>WIN RATE</small></span><span><b>${s.reentryAvg.toFixed(2)}</b><small>RE-ENTRY</small></span></div></section>
      <section class="ledger-section">${sectionHead('TOURNAMENT RECORDS',`${games.length} GAMES`)}${games.map(g=>`<button class="ledger-row" data-nav="game" data-game-id="${g.id}"><span class="ledger-index">${g.results[pid].rank}</span><span class="ledger-main"><strong>GAME ${String(g.gameNumber).padStart(2,'0')}</strong><small>${formatDate(sessionById(g.sessionId)?.date)} · RE-ENTRY ${g.results[pid].reentries||0}</small></span><span class="ledger-result">${performancePercent(g.results[pid].rank,g.playerIds.length).toFixed(0)}%</span></button>`).join('')||'<p class="muted copy">まだ戦績がありません。</p>'}</section>
      <div class="split-actions"><button class="quiet-action" data-action="edit-player" data-player-id="${p.id}">EDIT</button><button class="danger-action" data-action="delete-player" data-player-id="${p.id}">DELETE</button></div>
      </main>`;
  }

  function sessionsView(){
    const list=[...db.sessions].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    return `${topBar('SESSIONS')}<main class="page sessions-page"><section class="page-intro compact-intro"><div class="eyebrow">TOURNAMENT DAYS</div><h1>Sessions</h1></section><button class="primary-action wide" data-action="new-session">＋ NEW SESSION</button><section class="session-ledger">${sectionHead('SESSION LEDGER',`${list.length} SESSIONS`)}${list.map(s=>{const gs=db.games.filter(g=>g.sessionId===s.id);const liveGame=gs.find(g=>g.status==='live');const memberCount=new Set(gs.flatMap(g=>g.playerIds)).size;const reentries=gs.reduce((n,g)=>n+totalReentries(g),0);const state=liveGame?'LIVE':s.status==='open'?'OPEN':'CLOSED';return `<button class="session-ticket ${liveGame?'is-live':''}" data-nav="session" data-session-id="${s.id}"><div class="session-ticket-head"><span>SESSION ${String(s.sessionNumber||0).padStart(2,'0')}</span><b class="session-ticket-status ${liveGame?'live-text':''}">${liveGame?'● ':''}${state}</b></div><div class="session-ticket-date">${formatDate(s.date)}</div><div class="session-ticket-name">${esc(s.name||'PRIVATE GAME')}</div><div class="session-ticket-rule"></div><div class="session-ticket-metrics"><span><b>${gs.length}</b><small>TOURNAMENTS</small></span><span><b>${memberCount}</b><small>MEMBERS</small></span><span><b>${reentries}</b><small>RE-ENTRIES</small></span></div><div class="session-ticket-foot"><span>${liveGame?`GAME ${String(liveGame.gameNumber).padStart(2,'0')} · IN PLAY`:gs.length?`LAST GAME · ${String(Math.max(...gs.map(g=>g.gameNumber))).padStart(2,'0')}`:'NO GAMES YET'}</span><i>›</i></div></button>`}).join('')||'<p class="muted copy">まだSessionがありません。</p>'}</section></main>${bottomNav('session-list')}`;
  }

  function sessionView(sid){
    const s=sessionById(sid); if(!s)return sessionsView();
    const gs=db.games.filter(g=>g.sessionId===sid).sort((a,b)=>a.gameNumber-b.gameNumber);
    const members=new Set(gs.flatMap(g=>g.playerIds)); const re=gs.reduce((n,g)=>n+totalReentries(g),0);
    return `${topBar(`SESSION ${String(s.sessionNumber||0).padStart(2,'0')}`,'back-sessions')}<main class="page">
      <section class="session-hero"><div class="eyebrow">SESSION ${String(s.sessionNumber||0).padStart(2,'0')}</div><h1>${formatDate(s.date)}</h1><p>${esc(s.name||'PRIVATE GAME')}</p></section>
      <section class="metric-strip"><span><b>${gs.length}</b><small>GAMES</small></span><span><b>${members.size}</b><small>PLAYERS</small></span><span><b>${re}</b><small>RE-ENTRIES</small></span></section>
      <button class="primary-action wide" data-action="new-game" data-session-id="${s.id}">＋ START NEXT GAME</button>
      <section class="ledger-section">${sectionHead('GAME RECORD',`${gs.length} TOURNAMENTS`)}${gs.map(g=>{ensureGameShape(g);const w=gameResultRows(g)[0];return `<button class="ledger-row tall" data-nav="game" data-game-id="${g.id}"><span class="ledger-index">${String(g.gameNumber).padStart(2,'0')}</span><span class="ledger-main"><strong>${g.status==='live'?'TOURNAMENT LIVE':esc(playerById(w?.playerId)?.name||'RESULT PENDING')}</strong><small>${g.playerIds.length}P · RE-ENTRY ${totalReentries(g)}</small></span><span class="${g.status==='live'?'live-text':'champion'}">${g.status==='live'?'● LIVE':w?'WINNER':'—'}</span></button>`}).join('')||'<p class="muted copy">まだゲームがありません。</p>'}</section>
      <div class="split-actions"><button class="quiet-action" data-action="toggle-session" data-session-id="${s.id}">${s.status==='open'?'CLOSE SESSION':'REOPEN SESSION'}</button><button class="danger-action" data-action="delete-session" data-session-id="${s.id}">DELETE SESSION</button></div>
      </main>`;
  }

  function gameView(gid){
    const g=gameById(gid); if(!g)return sessionsView(); ensureGameShape(g);
    if(g.status==='finished')return gameResultView(g);
    const st=currentStandings(g);
    return `${topBar(`GAME ${String(g.gameNumber).padStart(2,'0')}`,'back-session')}<main class="page live-page">
      <section class="game-control-head"><div><div class="live-pill"><i></i> LIVE</div><h1>GAME ${String(g.gameNumber).padStart(2,'0')}</h1></div><div class="game-state"><b>${g.reentryOpen?'RE-ENTRY OPEN':'RE-ENTRY CLOSED'}</b><span>${st.active.length} / ${g.playerIds.length} REMAINING</span></div></section>
      <section class="control-callout"><div class="eyebrow">NEXT ACTION</div><button class="primary-action hero-action" data-action="break-entry" data-game-id="${g.id}">RECORD BREAK <span>＋</span></button></section>
      <section class="ledger-section">${sectionHead('CURRENT FIELD',`${fmt.format(expectedChips(g))} TOTAL CHIPS`)}<div class="field-list">${st.active.map((pid,i)=>`<div class="field-row"><span class="field-rank">${String(i+1).padStart(2,'0')}</span><span class="field-player"><strong><span class="field-hand">${handCardsHTML(playerById(pid)?.myHand,{small:true})}</span>${esc(playerById(pid)?.name||'—')}</strong><small>RE-ENTRY ${g.results[pid].reentries||0}</small></span><span class="field-stack">${fmt.format(currentStack(g,pid))}</span><button class="mini-action out-action" data-action="mark-out" data-game-id="${g.id}" data-player-id="${pid}">OUT</button></div>`).join('')}${st.out.map(pid=>`<div class="field-row is-out"><span class="field-rank">${g.results[pid].rank||'—'}</span><span class="field-player"><strong><span class="field-hand">${handCardsHTML(playerById(pid)?.myHand,{small:true})}</span>${esc(playerById(pid)?.name||'—')}</strong><small>RE-ENTRY ${g.results[pid].reentries||0}</small></span><span class="field-stack">OUT</span>${g.reentryOpen?`<button class="mini-action reentry-action" data-action="reenter" data-game-id="${g.id}" data-player-id="${pid}">RE-ENTER</button>`:'<span></span>'}</div>`).join('')}</div></section>
      <section class="ledger-section">${sectionHead('STACK HISTORY',`${g.breaks.length} BREAKS`)}${renderStackChart(g)}</section>
      <section class="ledger-section">${sectionHead('GAME LEDGER',`${g.events.length} EVENTS`)}${[...g.events].reverse().map(e=>`<div class="event-row"><span>${clock(e.at)}</span><strong>${esc(e.label)}</strong></div>`).join('')}</section>
      <section class="danger-zone">${sectionHead('GAME MANAGEMENT')}<button class="danger-action wide" data-action="delete-game" data-game-id="${g.id}">DELETE GAME</button></section>
      </main><div class="sticky-actions"><button class="gold" data-action="break-entry" data-game-id="${g.id}">BREAK</button><button data-action="${g.reentryOpen?'close-reentry':'noop'}" data-game-id="${g.id}">${g.reentryOpen?'CLOSE RE-ENTRY':'RE-ENTRY CLOSED'}</button><button data-action="finish-game" data-game-id="${g.id}">FINISH</button></div>`;
  }

  function gameResultView(g){
    const rows=gameResultRows(g), winner=rows[0];
    return `${topBar(`GAME ${String(g.gameNumber).padStart(2,'0')}`,'back-session')}<main class="page result-page">
      <section class="result-hero"><div class="eyebrow">TOURNAMENT RESULT</div><div class="winner-rank">01</div><h1>${esc(playerById(winner?.playerId)?.name||'—')}</h1><div class="champion-title">CHAMPION</div></section>
      <section class="ledger-section">${sectionHead('FINAL RESULTS',`${g.playerIds.length} PLAYERS`)}${rows.map(r=>`<div class="result-row"><span>${String(r.rank).padStart(2,'0')}</span><strong>${esc(playerById(r.playerId)?.name||'—')}</strong><small>${performancePercent(r.rank,g.playerIds.length).toFixed(1)}% · RE-ENTRY ${g.results[r.playerId]?.reentries||0}</small></div>`).join('')}</section>
      <section class="ledger-section">${sectionHead('STACK HISTORY',`${g.breaks.length} BREAKS`)}${renderStackChart(g)}</section>
      <section class="ledger-section">${sectionHead('GAME LEDGER',`${g.events.length} EVENTS`)}${[...g.events].reverse().map(e=>`<div class="event-row"><span>${clock(e.at)}</span><strong>${esc(e.label)}</strong></div>`).join('')}</section>
      <section class="danger-zone">${sectionHead('GAME MANAGEMENT')}<button class="danger-action wide" data-action="delete-game" data-game-id="${g.id}">DELETE GAME</button></section>
      </main>`;
  }

  function graphData(g){
    ensureGameShape(g);
    const startMs=new Date(g.createdAt||Date.now()).getTime();
    const nodes=[];
    g.breaks.forEach(b=>nodes.push({type:'break',at:new Date(b.at).getTime(),break:b}));
    g.events.filter(e=>e.type==='out'||e.type==='elimination'||e.type==='reentry').forEach(e=>nodes.push({type:e.type,at:new Date(e.at).getTime(),event:e}));
    nodes.sort((a,b)=>a.at-b.at);
    const state={},active=new Set(); let theoreticalTotal=g.startingStack*g.playerIds.length;
    g.playerIds.forEach(pid=>{state[pid]=g.startingStack;active.add(pid)});
    const segments={}; g.playerIds.forEach(pid=>segments[pid]=[[{t:startMs,v:g.startingStack}]]);
    const average=[{t:startMs,v:g.startingStack}];
    nodes.forEach(n=>{
      if(n.type==='break'){
        Object.entries(n.break.stacks||{}).forEach(([pid,v])=>{if(!active.has(pid))return;state[pid]=Number(v)||0;const seg=segments[pid][segments[pid].length-1];if(seg)seg.push({t:n.at,v:state[pid]})});
        if(active.size) average.push({t:n.at,v:theoreticalTotal/active.size});
      }else if(n.type==='out'||n.type==='elimination'){
        const pid=n.event.playerId;
        if(pid&&active.has(pid)){
          const avgBefore=theoreticalTotal/active.size;
          average.push({t:n.at,v:avgBefore});
          const seg=segments[pid][segments[pid].length-1];
          if(seg) seg.push({t:n.at,v:0});
          active.delete(pid); delete state[pid];
          if(active.size) average.push({t:n.at,v:theoreticalTotal/active.size});
        }
      }else if(n.type==='reentry'){
        const pid=n.event.playerId;
        if(pid){
          if(active.size) average.push({t:n.at,v:theoreticalTotal/active.size});
          active.add(pid); state[pid]=g.startingStack; theoreticalTotal+=g.startingStack;
          segments[pid].push([{t:n.at,v:g.startingStack}]);
          average.push({t:n.at,v:theoreticalTotal/active.size});
        }
      }
    });
    const endMs=Math.max(startMs+60000,...nodes.map(n=>n.at),...(g.finishedAt?[new Date(g.finishedAt).getTime()]:[]));
    return {startMs,endMs,segments,average,breaks:g.breaks.map(b=>({t:new Date(b.at).getTime(),number:b.number}))};
  }

  function renderStackChart(g,{home=false}={}){
    const data=graphData(g); const width=720,height=home?360:330; const left=60,right=20,top=28,bottom=58; const cw=width-left-right,ch=height-top-bottom;
    const allVals=[g.startingStack,...data.average.map(p=>p.v)]; Object.values(data.segments).flat(2).forEach(p=>allVals.push(p.v));
    const rawMax=Math.max(1,...allVals); const yMax=Math.ceil(rawMax/10000)*10000||10000;
    const x=t=>left+((t-data.startMs)/(data.endMs-data.startMs||1))*cw; const y=v=>top+ch-(v/yMax)*ch;
    const path=pts=>pts.map((p,i)=>`${i?'L':'M'} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
    const yTicks=4, duration=data.endMs-data.startMs; const xTicks=duration<90*60000?3:4;
    const grid=Array.from({length:yTicks+1},(_,i)=>{const v=yMax*(i/yTicks);const yy=y(v);return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" class="chart-grid"/><text x="${left-10}" y="${yy+4}" text-anchor="end" class="chart-axis">${v>=1000?Math.round(v/1000)+'K':v}</text>`}).join('');
    const xt=Array.from({length:xTicks+1},(_,i)=>{const t=data.startMs+duration*(i/xTicks),xx=x(t);return `<text x="${xx}" y="${height-20}" text-anchor="${i===0?'start':i===xTicks?'end':'middle'}" class="chart-axis">${elapsedLabel(t-data.startMs)}</text>`}).join('');
    const breakMarks=data.breaks.map(b=>`<line x1="${x(b.t)}" y1="${top}" x2="${x(b.t)}" y2="${top+ch}" class="break-line"/><text x="${x(b.t)+4}" y="${top+12}" class="break-label">B${b.number}</text>`).join('');
    const lines=g.playerIds.map((pid,i)=>segmentsToSvg(data.segments[pid],LINE_COLORS[i%LINE_COLORS.length],path)).join('');
    const avgPath=data.average.length>1?`<path d="${path(data.average)}" class="average-line"/>`:'';
    const legend=g.playerIds.map((pid,i)=>`<span><i style="--legend:${LINE_COLORS[i%LINE_COLORS.length]}"></i>${esc(playerById(pid)?.name||'—')}</span>`).join('')+`<span class="avg-legend"><i></i>AVERAGE</span>`;
    return `<div class="stack-chart-wrap"><svg class="stack-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="プレイヤー別スタック推移"><g>${grid}${breakMarks}${lines}${avgPath}${xt}</g></svg><div class="chart-legend">${legend}</div><div class="chart-note">横軸はゲーム開始からの実時間。AVERAGEは理論総チップ ÷ ACTIVE人数。最後の記録点からOUT時刻の0へ直線で下降。AVERAGEはOUT／RE-ENTRY時刻で更新し、RE-ENTRYは開始スタックから新しい線で再開します。</div></div>`;
  }
  function segmentsToSvg(segments,color,path){ return (segments||[]).filter(s=>s.length>0).map(s=>`<path d="${path(s)}" fill="none" stroke="${color}" class="player-line"/>`).join(''); }

  function titleStreak(pid){
    const gs=completedGames().filter(g=>g.playerIds.includes(pid)&&g.results?.[pid]?.rank).sort((a,b)=>(a.finishedAt||'').localeCompare(b.finishedAt||''));
    let best=0,cur=0; gs.forEach(g=>{if(g.results[pid].rank===1){cur++;best=Math.max(best,cur)}else cur=0}); return best;
  }
  function latestPlayerGameDate(pid){
    const g=[...completedGames()].filter(x=>x.playerIds.includes(pid)&&x.results?.[pid]?.rank).sort((a,b)=>(b.finishedAt||b.createdAt||'').localeCompare(a.finishedAt||a.createdAt||''))[0];
    return g ? formatDate(sessionById(g.sessionId)?.date) : '—';
  }
  function recordsView(){
    const ranked=players().map(p=>({p,s:playerStats(p.id)})).filter(x=>x.s.games>0).sort((a,b)=>b.s.performance-a.s.performance||b.s.titles-a.s.titles);
    const titles=[...ranked].sort((a,b)=>b.s.titles-a.s.titles||b.s.performance-a.s.performance)[0];
    const perf=ranked[0], games=[...ranked].sort((a,b)=>b.s.games-a.s.games)[0], re=[...ranked].sort((a,b)=>b.s.reentries-a.s.reentries)[0];
    const clean=[...ranked].filter(x=>x.s.games>=2).sort((a,b)=>a.s.reentryAvg-b.s.reentryAvg||b.s.games-a.s.games)[0];
    const streak=ranked.map(x=>({...x,streak:titleStreak(x.p.id)})).sort((a,b)=>b.streak-a.streak)[0];
    const first=[...completedGames()].sort((a,b)=>(a.finishedAt||a.createdAt||'').localeCompare(b.finishedAt||b.createdAt||''))[0];
    const honors=[
      {corner:'A♠',label:'MOST TITLES',value:titles?.s.titles??'—',name:titles?.p.name||'—',tag:'TITLE HOLDER',description:'このルームで最も多くトーナメントを制したプレイヤー。',date:titles?latestPlayerGameDate(titles.p.id):'—'},
      {corner:'K♥',label:'BEST PERFORMANCE',value:perf?perf.s.performance.toFixed(1)+'%':'—',name:perf?.p.name||'—',tag:'FIELD MASTER',description:'参加人数を補正した平均成績率が最も高いプレイヤー。',date:perf?latestPlayerGameDate(perf.p.id):'—',red:true},
      {corner:'Q♦',label:'MOST GAMES',value:games?.s.games??'—',name:games?.p.name||'—',tag:'IRON PLAYER',description:'このルームで最も多くのトーナメントに参加したプレイヤー。',date:games?latestPlayerGameDate(games.p.id):'—',red:true},
      {corner:'J♣',label:'RE-ENTRY KING',value:re?.s.reentries??'—',name:re?.p.name||'—',tag:'BACK FOR MORE',description:'累計リエントリー回数が最も多いプレイヤー。',date:re?latestPlayerGameDate(re.p.id):'—'}
    ];
    activeHonorIndex=Math.max(0,Math.min(activeHonorIndex,honors.length-1));
    const active=honors[activeHonorIndex];
    return `${topBar('ROOM RECORDS')}<main class="page records-page simple-records">
      <section class="records-opening"><div class="eyebrow">HALL OF RECORDS</div><h1>House Honors</h1><div class="ornament-rule"><i></i></div><p>このルームの歴史を、4枚の特別なカードに刻む。</p></section>
      <section class="honor-grid" aria-label="主要ルーム記録">${honors.map((h,i)=>`<button type="button" data-action="focus-honor" data-honor-index="${i}" class="honor-grid-card ${h.red?'red-honor':''} ${activeHonorIndex===i?'is-active':''}" aria-pressed="${activeHonorIndex===i?'true':'false'}"><div class="honor-corner">${h.corner}</div><div class="honor-grid-body"><div class="honor-label">${h.label}</div><div class="honor-value">${h.value}</div><div class="honor-divider"></div><div class="honor-holder">${esc(h.name)}</div><div class="honor-date">${h.date}</div></div><div class="honor-tag">${h.tag}</div></button>`).join('')}</section>
      <section class="honor-detail ${active.red?'red-detail':''}"><div class="honor-detail-title"><span>${active.corner.slice(-1)}</span><strong>${active.label}</strong></div><p>${active.description}</p><div class="honor-detail-stats"><b>${active.value}</b><strong>${esc(active.name)}</strong><small>${active.date}</small></div><div class="honor-detail-footer"><span>HOUSE HONOR ${String(activeHonorIndex+1).padStart(2,'0')}</span><span>♛</span></div></section>
      <p class="honor-hint">ⓘ 4枚のカードをタップすると、下の詳細が切り替わります</p>
      <section class="ledger-section performance-ranking">${sectionHead('PLAYER PERFORMANCE','ALL-TIME STANDINGS')}${ranked.map((x,i)=>`<div class="rank-card ${i===0?'rank-one':''}"><div class="rank-main"><span>${String(i+1).padStart(2,'0')}</span><div class="rank-player"><span class="rank-hand">${handCardsHTML(x.p.myHand,{small:true})}</span><strong>${esc(x.p.name)}</strong></div><b>${x.s.performance.toFixed(1)}%</b></div><div class="rank-meta"><span>${x.s.titles} TITLES</span><span>${x.s.games} GAMES</span><span>${x.s.winRate.toFixed(1)}% WIN</span><span>${x.s.reentryAvg.toFixed(2)} AVG RE-ENTRY</span></div></div>`).join('')||'<p class="muted copy">戦績が蓄積されるとランキングが表示されます。</p>'}</section>
      <section class="ledger-section additional-records">${sectionHead('SIDE RECORDS')}<div class="mini-record"><span>LONGEST TITLE STREAK</span><b>${streak?.streak||0}</b><small>${esc(streak?.p.name||'—')} · CONSECUTIVE TITLES</small></div><div class="mini-record"><span>CLEANEST PLAYER</span><b>${clean?clean.s.reentryAvg.toFixed(2):'—'}</b><small>${esc(clean?.p.name||'—')} · AVG RE-ENTRY</small></div></section>
      <section class="room-history">${sectionHead('ROOM HISTORY')}<div class="history-stats"><span><b>${completedGames().length}</b><small>TOURNAMENTS</small></span><span><b>${players().length}</b><small>MEMBERS</small></span><span><b>${db.games.reduce((n,g)=>n+totalReentries(g),0)}</b><small>RE-ENTRIES</small></span></div><div class="first-game"><small>FIRST RECORDED GAME</small><strong>${first?formatDate(sessionById(first.sessionId)?.date):'—'}</strong></div></section>
      </main>${bottomNav('records')}`;
  }

  function modal(content){ document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop"><section class="modal-sheet">${content}</section></div>`); }
  function closeModal(){ document.querySelector('.modal-backdrop')?.remove(); }
  function addPlayerModal(existing){
    const parsed=parseHand(existing?.myHand)||[{rank:'A',suit:'♠'},{rank:'K',suit:'♥'}];
    const ranks=['A','K','Q','J','10','9','8','7','6','5','4','3','2'], suits=['♠','♥','♦','♣'];
    const opts=(items,selected)=>items.map(x=>`<option value="${x}" ${x===selected?'selected':''}>${x}</option>`).join('');
    modal(`<div class="modal-head"><div><div class="eyebrow">MEMBER RECORD</div><h2>${existing?'EDIT MEMBER':'NEW MEMBER'}</h2></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="player-form" ${existing?`data-player-id="${existing.id}"`:''}><label class="form-field"><span>PLAYER NAME</span><input name="name" required maxlength="24" value="${esc(existing?.name||'')}"></label><div class="form-caption">MY HAND · SELECT TWO CARDS</div><div class="hand-select-grid"><fieldset><legend>CARD 1</legend><select name="card1Rank">${opts(ranks,parsed[0].rank)}</select><select name="card1Suit">${opts(suits,parsed[0].suit)}</select></fieldset><fieldset><legend>CARD 2</legend><select name="card2Rank">${opts(ranks,parsed[1].rank)}</select><select name="card2Suit">${opts(suits,parsed[1].suit)}</select></fieldset></div><div class="hand-live-preview" id="hand-preview">${handCardsHTML(`${parsed[0].rank}${parsed[0].suit}${parsed[1].rank}${parsed[1].suit}`)}</div><p class="muted hand-help">同じカードを2枚選ぶことはできません。</p><button class="primary-action wide" type="submit">${existing?'SAVE CHANGES':'REGISTER MEMBER'}</button></form>`);
  }
  function newSessionModal(){ modal(`<div class="modal-head"><div><div class="eyebrow">NEW SESSION</div><h2>OPEN THE ROOM</h2></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="session-form"><label class="form-field"><span>DATE</span><input type="date" name="date" required value="${today()}"></label><label class="form-field"><span>SESSION NAME</span><input name="name" placeholder="PRIVATE GAME"></label><button class="primary-action wide" type="submit">START SESSION</button></form>`); }
  function newGameModal(sid){
    const previous=[...db.games].filter(g=>g.sessionId===sid).sort((a,b)=>b.gameNumber-a.gameNumber)[0]; const defaults=previous?.playerIds||players().map(p=>p.id);
    modal(`<div class="modal-head"><div><div class="eyebrow">NEW TOURNAMENT</div><h2>START GAME</h2></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="game-form" data-session-id="${sid}"><label class="form-field"><span>STARTING STACK</span><input inputmode="numeric" name="startingStack" required value="${previous?.startingStack||20000}"></label><div class="form-caption">SELECT PLAYERS</div><div class="player-picks">${players().map(p=>`<label class="player-pick"><input type="checkbox" name="players" value="${p.id}" ${defaults.includes(p.id)?'checked':''}><span>${esc(p.name)}</span><small class="pick-hand">${handCardsHTML(p.myHand,{small:true})}</small></label>`).join('')}</div><button class="primary-action wide" type="submit">START TOURNAMENT</button></form>`); }
  function breakModal(gid){ const g=gameById(gid); if(!g)return; ensureGameShape(g); const alive=livePlayers(g); modal(`<div class="modal-head"><div><div class="eyebrow">STACK COUNT</div><h2>BREAK ${String(g.breaks.length+1).padStart(2,'0')}</h2></div><button class="icon-btn" data-action="close-modal">×</button></div><form id="break-form" data-game-id="${g.id}"><div class="stack-inputs">${alive.map(pid=>`<label><span>${esc(playerById(pid)?.name||'—')}</span><input inputmode="numeric" name="stack_${pid}" value="${currentStack(g,pid)}" required></label>`).join('')}</div><div id="break-audit" class="live-audit"></div><button class="primary-action wide" type="submit">SAVE BREAK</button></form>`); updateBreakAudit(g.id); }
  function updateBreakAudit(gid){ const g=gameById(gid),form=document.getElementById('break-form'),out=document.getElementById('break-audit'); if(!g||!form||!out)return; const entered=livePlayers(g).reduce((s,pid)=>s+num(form.elements[`stack_${pid}`]?.value),0), expected=expectedChips(g), diff=entered-expected; out.innerHTML=`<span><small>EXPECTED</small><b>${fmt.format(expected)}</b></span><span><small>ENTERED</small><b>${fmt.format(entered)}</b></span><span class="${diff===0?'ok':'warn'}"><small>DIFFERENCE</small><b>${diff>0?'+':''}${fmt.format(diff)}</b></span>`; }
  function menuModal(){ modal(`<div class="modal-head"><div><div class="eyebrow">SYSTEM · v1.10</div><h2>DATA BOOK</h2></div><button class="icon-btn" data-action="close-modal">×</button></div><div class="menu-stack"><button class="quiet-action wide" data-action="export-data">EXPORT BACKUP</button><label class="quiet-action wide file-label">IMPORT BACKUP<input id="import-file" type="file" accept="application/json"></label><button class="danger-action wide" data-action="reset-data">RESET ALL DATA</button></div><div class="cloud-panel"><span class="cloud-dot ${cloudStatus}"></span><div><b>SUPABASE SYNC</b><small>${cloudStatus.toUpperCase()}</small></div></div><p class="muted copy">Supabaseと同期し、同じURLを開いた複数端末へ変更を反映します。通信できない場合も端末内に保存されます。</p>`); }

  function deleteGame(gid,skipConfirm=false){ const g=gameById(gid); if(!g)return false; if(!skipConfirm&&!confirm(`GAME ${String(g.gameNumber).padStart(2,'0')} を削除しますか？\n順位・Break・リエントリー・Game Ledgerも削除されます。\nこの操作は元に戻せません。`))return false; db.games=db.games.filter(x=>x.id!==gid); save(); return true; }
  function deletePlayer(pid){ const p=playerById(pid); if(!p)return; const affected=db.games.filter(g=>g.playerIds.includes(pid)).length; if(!confirm(`「${p.name}」を削除しますか？\n過去の戦績・スタック履歴・リエントリー記録も削除されます。\n影響するゲーム: ${affected}\nこの操作は元に戻せません。`))return;
    const removeGameIds=[];
    db.games.forEach(g=>{ if(!g.playerIds.includes(pid))return; ensureGameShape(g); g.playerIds=g.playerIds.filter(x=>x!==pid); delete g.results[pid]; delete g.currentStacks[pid]; g.breaks.forEach(b=>{if(b.stacks)delete b.stacks[pid]}); g.events=g.events.filter(e=>e.playerId!==pid); if(g.playerIds.length<2){removeGameIds.push(g.id);return;} if(g.status==='finished'){ const rows=gameResultRows(g); rows.forEach((r,i)=>g.results[r.playerId].rank=i+1); } });
    db.games=db.games.filter(g=>!removeGameIds.includes(g.id)); db.players=db.players.filter(x=>x.id!==pid); save(); navigate('players');
  }
  function deleteSession(sid){ const s=sessionById(sid); if(!s)return; const count=db.games.filter(g=>g.sessionId===sid).length; if(!confirm(`SESSION ${String(s.sessionNumber||0).padStart(2,'0')} を削除しますか？\n含まれる ${count} ゲームもすべて削除されます。\nこの操作は元に戻せません。`))return; db.games=db.games.filter(g=>g.sessionId!==sid); db.sessions=db.sessions.filter(x=>x.id!==sid); save(); navigate('session-list'); }

  function markOut(gid,pid){
    const g=gameById(gid),p=playerById(pid); if(!g||!p)return; ensureGameShape(g);
    const before=currentStack(g,pid);
    modal(`<div class="modal-head"><div><div class="eyebrow danger-eyebrow">PLAYER OUT</div><h2>CONFIRM OUT</h2></div><button class="icon-btn" data-action="close-modal">×</button></div><div class="out-confirm-player"><span class="out-confirm-hand">${handCardsHTML(p.myHand,{small:true})}</span><strong>${esc(p.name)}</strong></div><div class="out-confirm-stack"><small>CURRENT STACK</small><b>${fmt.format(before)}</b></div><p class="out-confirm-copy">${g.reentryOpen?'OUT後もRE-ENTRYできます。':'RE-ENTRY受付終了後のため、このOUTで順位が確定します。'}</p><div class="split-actions"><button class="quiet-action" data-action="close-modal">CANCEL</button><button class="danger-action solid-danger" data-action="confirm-out" data-game-id="${gid}" data-player-id="${pid}">CONFIRM OUT</button></div>`);
  }
  function confirmOut(gid,pid){
    const g=gameById(gid),p=playerById(pid); if(!g||!p)return; ensureGameShape(g); const before=currentStack(g,pid);
    g.results[pid].isOut=true; g.currentStacks[pid]=0;
    if(!g.reentryOpen){const rank=livePlayers(g).length+1;g.results[pid].rank=rank;addEvent(g,'elimination',pid,`${p.name} — ${ordinal(rank)}`,{stackBefore:before});}
    else addEvent(g,'out',pid,`${p.name} OUT`,{stackBefore:before});
    save(); closeModal(); render();
  }
  function reenter(gid,pid){ const g=gameById(gid),p=playerById(pid); if(!g||!p||!g.reentryOpen)return; ensureGameShape(g); g.results[pid].isOut=false; g.results[pid].rank=null; g.results[pid].reentries=(g.results[pid].reentries||0)+1; g.currentStacks[pid]=g.startingStack; addEvent(g,'reentry',pid,`${p.name} RE-ENTRY ×${g.results[pid].reentries}`,{stack:g.startingStack}); save(); render(); }
  function closeReentry(gid){ const g=gameById(gid); if(!g||!confirm('リエントリー受付を終了しますか？'))return; ensureGameShape(g); g.reentryOpen=false; const currentlyOut=g.playerIds.filter(pid=>g.results[pid].isOut&&!g.results[pid].rank).sort((a,b)=>(unresolvedOutEvent(g,a)?.at||'').localeCompare(unresolvedOutEvent(g,b)?.at||'')); let rank=livePlayers(g).length+currentlyOut.length; currentlyOut.forEach(pid=>{g.results[pid].rank=rank--;}); addEvent(g,'reentry_closed',null,'RE-ENTRY CLOSED'); save(); render(); }
  function finishGame(gid){ const g=gameById(gid); if(!g)return; ensureGameShape(g); const alive=livePlayers(g); if(alive.length!==1){alert('残り1名になってから終了してください。');return;} if(g.reentryOpen){if(!confirm('リエントリー受付も終了し、優勝を確定しますか？'))return; closeReentrySilent(g);} const winner=alive[0]; g.results[winner].rank=1;g.results[winner].isOut=false;g.status='finished';g.finishedAt=new Date().toISOString();addEvent(g,'finish',winner,`${playerById(winner)?.name||'PLAYER'} CHAMPION`);save();render(); }
  function closeReentrySilent(g){ ensureGameShape(g); g.reentryOpen=false; const currentlyOut=g.playerIds.filter(pid=>g.results[pid].isOut&&!g.results[pid].rank).sort((a,b)=>(unresolvedOutEvent(g,a)?.at||'').localeCompare(unresolvedOutEvent(g,b)?.at||'')); let rank=livePlayers(g).length+currentlyOut.length; currentlyOut.forEach(pid=>{g.results[pid].rank=rank--;}); addEvent(g,'reentry_closed',null,'RE-ENTRY CLOSED'); }

  function exportBackup(){ const blob=new Blob([window.PokerStorage.exportData()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`poker-rank-v1.10-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }

  function handleClick(e){
    const nav=e.target.closest('[data-nav]'); if(nav){const n=nav.dataset.nav;if(n==='session')navigate('session',{sessionId:nav.dataset.sessionId});else if(n==='game')navigate('game',{gameId:nav.dataset.gameId});else if(n==='player')navigate('player',{playerId:nav.dataset.playerId});else navigate(n);return;}
    const el=e.target.closest('[data-action]'); if(!el)return; const a=el.dataset.action;
    if(a==='noop')return;
    if(a==='menu')menuModal(); else if(a==='close-modal')closeModal(); else if(a==='add-player')addPlayerModal(); else if(a==='edit-player')addPlayerModal(playerById(el.dataset.playerId)); else if(a==='delete-player')deletePlayer(el.dataset.playerId);
    else if(a==='new-session')newSessionModal(); else if(a==='new-game')newGameModal(el.dataset.sessionId); else if(a==='break-entry')breakModal(el.dataset.gameId);
    else if(a==='back-players')navigate('players'); else if(a==='back-sessions')navigate('session-list'); else if(a==='back-session'){const g=gameById(route.gameId);navigate('session',{sessionId:g?.sessionId});}
    else if(a==='mark-out')markOut(el.dataset.gameId,el.dataset.playerId); else if(a==='confirm-out')confirmOut(el.dataset.gameId,el.dataset.playerId); else if(a==='focus-honor'){activeHonorIndex=Number(el.dataset.honorIndex)||0;render();} else if(a==='reenter')reenter(el.dataset.gameId,el.dataset.playerId); else if(a==='close-reentry')closeReentry(el.dataset.gameId); else if(a==='finish-game')finishGame(el.dataset.gameId);
    else if(a==='toggle-session'){const s=sessionById(el.dataset.sessionId);if(s){s.status=s.status==='open'?'closed':'open';save();render();}}
    else if(a==='delete-game'){const g=gameById(el.dataset.gameId);if(deleteGame(el.dataset.gameId))navigate('session',{sessionId:g?.sessionId});}
    else if(a==='delete-session')deleteSession(el.dataset.sessionId); else if(a==='export-data')exportBackup();
    else if(a==='reset-data'&&confirm('すべてのデータを削除します。元に戻せません。')){window.PokerStorage.reset();db=window.PokerStorage.load();closeModal();navigate('home');}
  }

  function handleSubmit(e){
    if(e.target.id==='player-form'){e.preventDefault();const fd=new FormData(e.target),pid=e.target.dataset.playerId;const name=String(fd.get('name')||'').trim();if(!name)return;const c1=`${fd.get('card1Rank')}${fd.get('card1Suit')}`,c2=`${fd.get('card2Rank')}${fd.get('card2Suit')}`;if(c1===c2){alert('同じカードは2枚選択できません。');return;}const myHand=`${c1}${c2}`;if(pid){const p=playerById(pid);p.name=name;p.myHand=myHand;}else{if(players().length>=10){alert('プレイヤーは最大10名です。');return;}db.players.push({id:id('pl'),memberNo:Math.max(0,...db.players.map(p=>p.memberNo||0))+1,name,myHand,createdAt:new Date().toISOString()});}save();closeModal();navigate('players');}
    if(e.target.id==='session-form'){e.preventDefault();const fd=new FormData(e.target);const s={id:id('ses'),sessionNumber:Math.max(0,...db.sessions.map(x=>x.sessionNumber||0))+1,date:fd.get('date'),name:String(fd.get('name')||'').trim(),status:'open',createdAt:new Date().toISOString()};db.sessions.push(s);save();closeModal();navigate('session',{sessionId:s.id});}
    if(e.target.id==='game-form'){e.preventDefault();const fd=new FormData(e.target),playerIds=fd.getAll('players');if(playerIds.length<2){alert('2名以上を選択してください。');return;}const stack=num(fd.get('startingStack'));if(stack<=0){alert('開始スタックを入力してください。');return;}const sid=e.target.dataset.sessionId,n=Math.max(0,...db.games.filter(g=>g.sessionId===sid).map(g=>g.gameNumber||0))+1;const g={id:id('game'),sessionId:sid,gameNumber:n,status:'live',startingStack:stack,playerIds,reentryOpen:true,currentStacks:{},results:{},breaks:[],events:[],createdAt:new Date().toISOString()};ensureGameShape(g);addEvent(g,'start',null,`GAME ${String(n).padStart(2,'0')} START`);db.games.push(g);save();closeModal();navigate('game',{gameId:g.id});}
    if(e.target.id==='break-form'){e.preventDefault();const g=gameById(e.target.dataset.gameId);if(!g)return;const stacks={};livePlayers(g).forEach(pid=>stacks[pid]=num(e.target.elements[`stack_${pid}`].value));const entered=Object.values(stacks).reduce((a,b)=>a+b,0),expected=expectedChips(g);if(entered!==expected&&!confirm(`総チップが一致していません。\nExpected: ${fmt.format(expected)}\nEntered: ${fmt.format(entered)}\nこのまま保存しますか？`))return;g.currentStacks={...g.currentStacks,...stacks};g.breaks.push({id:id('br'),number:g.breaks.length+1,stacks,at:new Date().toISOString()});addEvent(g,'break',null,`BREAK ${String(g.breaks.length).padStart(2,'0')} RECORDED`);save();closeModal();render();}
  }
  function handleInput(e){if(e.target.closest('#break-form'))updateBreakAudit(e.target.closest('#break-form').dataset.gameId);}
  function handleChange(e){if(e.target.closest('#player-form')&&['card1Rank','card1Suit','card2Rank','card2Suit'].includes(e.target.name)){const f=e.target.closest('#player-form'),p=document.getElementById('hand-preview');if(p){const h=`${f.elements.card1Rank.value}${f.elements.card1Suit.value}${f.elements.card2Rank.value}${f.elements.card2Suit.value}`;p.innerHTML=handCardsHTML(h);}}if(e.target.id==='import-file'&&e.target.files[0]){const reader=new FileReader();reader.onload=()=>{try{db=window.PokerStorage.importData(reader.result);db.games.forEach(ensureGameShape);closeModal();navigate('home');}catch(err){alert(err.message)}};reader.readAsText(e.target.files[0]);}}

  function render(){
    if(route.name==='home')$app.innerHTML=homeView(); else if(route.name==='players')$app.innerHTML=playersView(); else if(route.name==='player')$app.innerHTML=playerView(route.playerId); else if(route.name==='session-list')$app.innerHTML=sessionsView(); else if(route.name==='session')$app.innerHTML=sessionView(route.sessionId); else if(route.name==='game')$app.innerHTML=gameView(route.gameId); else if(route.name==='records')$app.innerHTML=recordsView(); else $app.innerHTML=homeView();
  }

  window.addEventListener('poker-cloud-status',e=>{cloudStatus=e.detail?.status||'offline';document.documentElement.dataset.cloud=cloudStatus;});
  window.addEventListener('poker-cloud-data',e=>{if(!e.detail?.data)return;db=window.PokerStorage.replaceFromCloud(e.detail.data);db.games.forEach(ensureGameShape);render();});
  document.addEventListener('click',handleClick); document.addEventListener('submit',handleSubmit); document.addEventListener('input',handleInput); document.addEventListener('change',handleChange); render();
  window.PokerStorage.initCloud().then(remote=>{if(remote){db=remote;db.games.forEach(ensureGameShape);render();}});
})();
