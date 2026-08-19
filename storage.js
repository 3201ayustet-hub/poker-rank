(function(){
  'use strict';
  const KEY='poker-performance-book-v1';
  const seed={players:[],sessions:[],games:[],settings:{roomName:'PRIVATE POKER ROOM',version:'1.5'}};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const isUuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''));
  const uid=()=>crypto.randomUUID();
  function normalize(data){return {players:Array.isArray(data?.players)?data.players:[],sessions:Array.isArray(data?.sessions)?data.sessions:[],games:Array.isArray(data?.games)?data.games:[],settings:{...clone(seed.settings),...(data?.settings||{}),version:'1.5'}}}
  function migrateIds(input){
    const data=normalize(clone(input)); const pMap=new Map(),sMap=new Map(),gMap=new Map(); let changed=false;
    data.players.forEach(p=>{const old=p.id;if(!isUuid(old)){p.id=uid();changed=true}pMap.set(old,p.id)});
    data.sessions.forEach(s=>{const old=s.id;if(!isUuid(old)){s.id=uid();changed=true}sMap.set(old,s.id)});
    data.games.forEach(g=>{const old=g.id;if(!isUuid(old)){g.id=uid();changed=true}gMap.set(old,g.id)});
    data.games.forEach(g=>{
      g.sessionId=sMap.get(g.sessionId)||g.sessionId;
      g.playerIds=(g.playerIds||[]).map(x=>pMap.get(x)||x);
      const newResults={},newStacks={};Object.entries(g.results||{}).forEach(([k,v])=>newResults[pMap.get(k)||k]=v);Object.entries(g.currentStacks||{}).forEach(([k,v])=>newStacks[pMap.get(k)||k]=v);g.results=newResults;g.currentStacks=newStacks;
      (g.breaks||[]).forEach(b=>{if(!isUuid(b.id)){b.id=uid();changed=true}const st={};Object.entries(b.stacks||{}).forEach(([k,v])=>st[pMap.get(k)||k]=v);b.stacks=st});
      (g.events||[]).forEach(e=>{if(!isUuid(e.id)){e.id=uid();changed=true}if(e.playerId)e.playerId=pMap.get(e.playerId)||e.playerId});
    });
    return {data,changed};
  }
  function rawLoad(){try{const raw=localStorage.getItem(KEY);return raw?normalize(JSON.parse(raw)):clone(seed)}catch(_){return clone(seed)}}
  function load(){const m=migrateIds(rawLoad());if(m.changed)localStorage.setItem(KEY,JSON.stringify(m.data));return m.data}
  function save(data,{cloud=true}={}){const m=migrateIds(data);localStorage.setItem(KEY,JSON.stringify(m.data));if(cloud&&window.PokerCloud)window.PokerCloud.push(m.data).catch(()=>{});return m.data}
  function replaceFromCloud(data){const m=migrateIds(data);localStorage.setItem(KEY,JSON.stringify(m.data));return m.data}
  function reset(){localStorage.removeItem(KEY);if(window.PokerCloud)window.PokerCloud.push(clone(seed)).catch(()=>{})}
  function exportData(){return JSON.stringify(load(),null,2)}
  function importData(text){const parsed=JSON.parse(text);if(!parsed||!Array.isArray(parsed.players)||!Array.isArray(parsed.sessions)||!Array.isArray(parsed.games))throw new Error('データ形式が正しくありません。');const data=migrateIds(parsed).data;save(data);return data}
  async function initCloud(){if(!window.PokerCloud)return null;const remote=await window.PokerCloud.init();if(remote){const remoteHasData=(remote.players?.length||remote.sessions?.length||remote.games?.length);if(remoteHasData){return replaceFromCloud(remote)}const local=load();const localHasData=(local.players.length||local.sessions.length||local.games.length);if(localHasData)window.PokerCloud.push(local).catch(()=>{});}return load()}
  window.PokerStorage={KEY,load,save,replaceFromCloud,reset,exportData,importData,initCloud};
})();
