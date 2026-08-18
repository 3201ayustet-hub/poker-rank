(function () {
  const KEY = 'poker-performance-book-v1';

  const seed = {
    players: [],
    sessions: [],
    games: [],
    settings: { roomName: 'PRIVATE POKER ROOM' }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(seed);
      const data = JSON.parse(raw);
      return {
        players: Array.isArray(data.players) ? data.players : [],
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
        games: Array.isArray(data.games) ? data.games : [],
        settings: data.settings || clone(seed.settings)
      };
    } catch (_) {
      return clone(seed);
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function reset() {
    localStorage.removeItem(KEY);
  }

  function exportData() {
    return JSON.stringify(load(), null, 2);
  }

  function importData(jsonText) {
    const parsed = JSON.parse(jsonText);
    if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.games)) {
      throw new Error('データ形式が正しくありません。');
    }
    save(parsed);
    return parsed;
  }

  window.PokerStorage = { load, save, reset, exportData, importData, KEY };
})();
