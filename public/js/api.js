/**
 * API client for March Madness Draft.
 * Handles all backend communication + session storage.
 */

const API = (() => {
  const BASE = '/api';

  function getToken() {
    return localStorage.getItem('mm_token');
  }

  function setSession(data) {
    localStorage.setItem('mm_token', data.token);
    localStorage.setItem('mm_contestant_id', data.contestantId);
    localStorage.setItem('mm_game_code', data.gameId);
    localStorage.setItem('mm_name', data.name || '');
  }

  function getSession() {
    return {
      token: localStorage.getItem('mm_token'),
      contestantId: parseInt(localStorage.getItem('mm_contestant_id')),
      gameCode: localStorage.getItem('mm_game_code'),
      name: localStorage.getItem('mm_name'),
    };
  }

  function clearSession() {
    localStorage.removeItem('mm_token');
    localStorage.removeItem('mm_contestant_id');
    localStorage.removeItem('mm_game_code');
    localStorage.removeItem('mm_name');
  }

  async function request(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = token;

    const res = await fetch(`${BASE}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  return {
    getToken,
    setSession,
    getSession,
    clearSession,

    // Auth
    join: (name, gameCode) =>
      request('/auth/join', {
        method: 'POST',
        body: JSON.stringify({ name, gameCode }),
      }),

    me: () => request('/auth/me'),

    // Games
    createGame: (name, buyIn) =>
      request('/games', {
        method: 'POST',
        body: JSON.stringify({ name, buyIn: parseFloat(buyIn) || 0 }),
      }),

    getGame: (code) => request(`/games/${code}`),

    startDraft: (code) =>
      request(`/games/${code}/start-draft`, { method: 'POST' }),

    submitTiebreaker: (code, score) =>
      request(`/games/${code}/tiebreaker`, {
        method: 'POST',
        body: JSON.stringify({ score: parseInt(score) }),
      }),

    // Draft
    getDraftState: (code) => request(`/draft/${code}/state`),

    makePick: (code, teamId) =>
      request(`/draft/${code}/pick`, {
        method: 'POST',
        body: JSON.stringify({ teamId }),
      }),

    // Timer
    getDraftTimer: (code) => request(`/draft/${code}/timer`),

    // Scores
    getLeaderboard: (code) => request(`/scores/${code}/leaderboard`),
    refreshScores: (code) => request(`/scores/${code}/refresh`, { method: 'POST' }),
    getScenarios: (code) => request(`/scores/${code}/scenarios`),

    // Teams
    getTeams: () => request('/teams'),

    // Import
    importPreview: (gameName, fileBase64, sheetsUrl) =>
      request('/import/preview', {
        method: 'POST',
        body: JSON.stringify({ gameName, file: fileBase64, sheetsUrl }),
      }),

    importConfirm: (gameName, fileBase64, sheetsUrl) =>
      request('/import/confirm', {
        method: 'POST',
        body: JSON.stringify({ gameName, file: fileBase64, sheetsUrl }),
      }),
  };
})();
