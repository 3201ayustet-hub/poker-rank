(function(){
  const KEY='poker-performance-book-v1';
  const seed={players:[],sessions:[],games:[],settings:{roomName:'PRIVATE POKER ROOM',version:'1.2'}};
  const clone=v=>JSON.parse(JSON.stringify(v));
  function normalize(data){
    return {players:Array.isArray(data?.players)?data.players:[],sessions:Array.isArray(data?.sessions)?data.sessions:[],games:Array.isArray(data?.games)?data.games:[],settings:{...clone(seed.settings),...(data?.settings||{})}};
  }
  function load(){try{const raw=localStorage.getItem(KEY);return raw?normalize(JSON.parse(raw)):clone(seed)}catch(_){return clone(seed)}}
  function save(data){localStorage.setItem(KEY,JSON.stringify(normalize(data)))}
  function reset(){localStorage.removeItem(KEY)}
  function exportData(){return JSON.stringify(load(),null,2)}
  function importData(text){const parsed=JSON.parse(text);if(!parsed||!Array.isArray(parsed.players)||!Array.isArray(parsed.sessions)||!Array.isArray(parsed.games))throw new Error('データ形式が正しくありません。');const data=normalize(parsed);save(data);return data}
  window.PokerStorage={KEY,load,save,reset,exportData,importData};
})();
