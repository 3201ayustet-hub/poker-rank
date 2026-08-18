(function(){
  'use strict';
  const cfg=window.POKER_CONFIG||{};
  let client=null, channel=null, ready=false, syncing=false, pullTimer=null;
  const emit=(name,detail={})=>window.dispatchEvent(new CustomEvent(name,{detail}));
  const uuid=()=>crypto.randomUUID();
  const iso=v=>v||new Date().toISOString();

  async function getClient(){
    if(client)return client;
    if(!cfg.cloudEnabled||!cfg.supabaseUrl||!cfg.supabasePublishableKey)throw new Error('Supabase configuration is missing.');
    const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client=mod.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    return client;
  }
  function parseEventNote(note,labelFallback){
    try{const v=JSON.parse(note||'');return {label:v.label||labelFallback||'',meta:v.meta||{}}}catch(_){return {label:note||labelFallback||'',meta:{}}}
  }
  function eventTypeFromDb(t){return ({game_start:'start',break:'break',out:'out',reentry:'reentry',reentry_closed:'reentry_closed',game_finished:'finish'})[t]||t}
  function eventTypeToDb(t){return ({start:'game_start',break:'break',out:'out',elimination:'out',reentry:'reentry',reentry_closed:'reentry_closed',finish:'game_finished'})[t]||t}

  async function selectAll(table){const c=await getClient();const {data,error}=await c.from(table).select('*');if(error)throw error;return data||[]}
  async function pull(){
    if(syncing)return null;
    const [players,sessions,games,gps,breaks,records,events]=await Promise.all([
      selectAll('poker_players'),selectAll('poker_sessions'),selectAll('poker_games'),selectAll('poker_game_players'),selectAll('poker_breaks'),selectAll('poker_stack_records'),selectAll('poker_events')
    ]);
    const sessionOrder=[...sessions].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
    const sessionNo=new Map(sessionOrder.map((s,i)=>[s.id,i+1]));
    const out={players:players.map(p=>({id:p.id,memberNo:p.member_no,name:p.name,myHand:p.my_hand||'',createdAt:p.created_at})),sessions:sessions.map(s=>({id:s.id,sessionNumber:sessionNo.get(s.id)||0,date:s.session_date,name:s.name||'',status:s.status,createdAt:s.created_at})),games:[],settings:{roomName:'PRIVATE POKER ROOM',version:cfg.version||'1.3'}};
    for(const row of games){
      const participants=gps.filter(x=>x.game_id===row.id).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
      const g={id:row.id,sessionId:row.session_id,gameNumber:row.game_number,status:row.status==='playing'?'live':'finished',startingStack:row.starting_stack,playerIds:participants.map(x=>x.player_id),reentryOpen:!!row.reentry_open,currentStacks:{},results:{},breaks:[],events:[],createdAt:row.started_at||row.created_at,finishedAt:row.finished_at||null};
      participants.forEach(x=>{g.currentStacks[x.player_id]=Number(x.current_stack||0);g.results[x.player_id]={rank:x.final_rank||null,reentries:Number(x.reentry_count||0),isOut:!x.is_active};});
      const brs=breaks.filter(b=>b.game_id===row.id).sort((a,b)=>a.break_number-b.break_number);
      brs.forEach(b=>{const stacks={};records.filter(r=>r.break_id===b.id&&r.record_type==='break').forEach(r=>{const gp=participants.find(x=>x.id===r.game_player_id);if(gp)stacks[gp.player_id]=Number(r.stack||0)});g.breaks.push({id:b.id,number:b.break_number,stacks,at:b.recorded_at});});
      events.filter(e=>e.game_id===row.id).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).forEach(e=>{const gp=participants.find(x=>x.id===e.game_player_id);const parsed=parseEventNote(e.note,e.event_type);g.events.push({id:e.id,type:eventTypeFromDb(e.event_type),playerId:gp?.player_id||null,label:parsed.label,meta:parsed.meta,at:e.created_at});});
      out.games.push(g);
    }
    return out;
  }

  function flatten(data){
    const players=data.players.map(p=>({id:p.id,name:p.name,member_no:p.memberNo||null,my_hand:p.myHand||null,is_active:true,created_at:iso(p.createdAt),updated_at:new Date().toISOString()}));
    const sessions=data.sessions.map(s=>({id:s.id,session_date:s.date,name:s.name||null,status:s.status==='closed'?'closed':'open',created_at:iso(s.createdAt),updated_at:new Date().toISOString()}));
    const games=data.games.map(g=>({id:g.id,session_id:g.sessionId,game_number:g.gameNumber,starting_stack:g.startingStack,status:g.status==='finished'?'finished':'playing',reentry_open:!!g.reentryOpen,started_at:iso(g.createdAt),finished_at:g.finishedAt||null,created_at:iso(g.createdAt),updated_at:new Date().toISOString()}));
    const gamePlayers=[], breaks=[], records=[], events=[];
    data.games.forEach(g=>{
      const gpIds={};
      g.playerIds.forEach(pid=>{const gid=`${g.id}:${pid}`;gpIds[pid]=gid;gamePlayers.push({id:stableUuid(gid),game_id:g.id,player_id:pid,current_stack:Number(g.currentStacks?.[pid]||0),is_active:!g.results?.[pid]?.isOut,final_rank:g.results?.[pid]?.rank||null,elimination_order:null,reentry_count:Number(g.results?.[pid]?.reentries||0),created_at:iso(g.createdAt),updated_at:new Date().toISOString()})});
      g.breaks.forEach(b=>{breaks.push({id:b.id,game_id:g.id,break_number:b.number,recorded_at:iso(b.at),created_at:iso(b.at)});Object.entries(b.stacks||{}).forEach(([pid,stack])=>{if(!gpIds[pid])return;records.push({id:stableUuid(`break:${b.id}:${pid}`),game_id:g.id,game_player_id:stableUuid(gpIds[pid]),break_id:b.id,record_type:'break',stack:Number(stack),recorded_at:iso(b.at),created_at:iso(b.at)})})});
      g.playerIds.forEach(pid=>records.push({id:stableUuid(`start:${g.id}:${pid}`),game_id:g.id,game_player_id:stableUuid(gpIds[pid]),break_id:null,record_type:'start',stack:Number(g.startingStack),recorded_at:iso(g.createdAt),created_at:iso(g.createdAt)}));
      (g.events||[]).forEach(e=>{const gp=e.playerId?stableUuid(gpIds[e.playerId]):null;events.push({id:e.id,game_id:g.id,game_player_id:gp,event_type:eventTypeToDb(e.type),value_integer:Number.isFinite(Number(e.meta?.stack))?Number(e.meta.stack):null,note:JSON.stringify({label:e.label,meta:e.meta||{}}),created_at:iso(e.at)});if(e.playerId&&(e.type==='reentry'||e.type==='out'||e.type==='elimination'))records.push({id:stableUuid(`evt:${e.id}`),game_id:g.id,game_player_id:gp,break_id:null,record_type:e.type==='reentry'?'reentry':'out',stack:e.type==='reentry'?Number(e.meta?.stack||g.startingStack):0,recorded_at:iso(e.at),created_at:iso(e.at)})});
    });
    return {players,sessions,games,gamePlayers,breaks,records,events};
  }
  function stableUuid(seed){
    // deterministic UUID v4-shaped identifier for derived rows (game-player, stack-record)
    const part=salt=>{let h=(0x811c9dc5^salt)>>>0;for(let i=0;i<seed.length;i++)h=Math.imul(h^seed.charCodeAt(i),0x01000193)>>>0;return h.toString(16).padStart(8,'0')};
    const hex=(part(0)+part(0x9e37)+part(0x85eb)+part(0xc2b2)).slice(0,32).split('');
    hex[12]='4'; hex[16]=(((parseInt(hex[16],16)||0)&3)|8).toString(16);
    const h=hex.join(''); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
  }
  async function upsert(table,rows){if(!rows.length)return;const c=await getClient();const {error}=await c.from(table).upsert(rows,{onConflict:'id'});if(error)throw error}
  async function cleanup(table,keepIds){const c=await getClient();const {data,error}=await c.from(table).select('id');if(error)throw error;const keep=new Set(keepIds);const remove=(data||[]).map(x=>x.id).filter(x=>!keep.has(x));if(remove.length){const {error:delErr}=await c.from(table).delete().in('id',remove);if(delErr)throw delErr}}
  async function push(data){
    if(syncing)return; syncing=true; emit('poker-cloud-status',{status:'syncing'});
    try{
      const f=flatten(data);
      await upsert('poker_players',f.players);await upsert('poker_sessions',f.sessions);await upsert('poker_games',f.games);await upsert('poker_game_players',f.gamePlayers);await upsert('poker_breaks',f.breaks);await upsert('poker_stack_records',f.records);await upsert('poker_events',f.events);
      await cleanup('poker_stack_records',f.records.map(x=>x.id));await cleanup('poker_events',f.events.map(x=>x.id));await cleanup('poker_breaks',f.breaks.map(x=>x.id));await cleanup('poker_game_players',f.gamePlayers.map(x=>x.id));await cleanup('poker_games',f.games.map(x=>x.id));await cleanup('poker_sessions',f.sessions.map(x=>x.id));await cleanup('poker_players',f.players.map(x=>x.id));
      emit('poker-cloud-status',{status:'online'});
    }catch(error){console.error('[PokerCloud push]',error);emit('poker-cloud-status',{status:'error',message:error.message});throw error}finally{syncing=false}
  }
  function schedulePull(){clearTimeout(pullTimer);pullTimer=setTimeout(async()=>{try{const data=await pull();if(data)emit('poker-cloud-data',{data})}catch(error){console.error('[PokerCloud realtime pull]',error)}},500)}
  async function subscribe(){
    const c=await getClient(); if(channel)await c.removeChannel(channel);
    channel=c.channel('poker-rank-v1.3');
    ['poker_players','poker_sessions','poker_games','poker_game_players','poker_breaks','poker_stack_records','poker_events'].forEach(table=>{channel.on('postgres_changes',{event:'*',schema:'public',table},schedulePull)});
    channel.subscribe(status=>emit('poker-cloud-status',{status:status==='SUBSCRIBED'?'online':status.toLowerCase()}));
  }
  async function init(){
    try{await getClient();await subscribe();ready=true;const data=await pull();emit('poker-cloud-status',{status:'online'});return data}catch(error){console.error('[PokerCloud init]',error);emit('poker-cloud-status',{status:'offline',message:error.message});return null}
  }
  window.PokerCloud={init,pull,push,isReady:()=>ready};
})();
