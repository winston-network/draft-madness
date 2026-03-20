/**
 * Draft Madness — Main application logic
 * Single-page app: Landing → Draft Board with sidebar (teams → leaderboard)
 */

let gameState = null;
let draftState = null;
let sseSource = null;
let pollInterval = null;
let countdownInterval = null;
let pickPending = false;
let leaderboardPollInterval = null;
let lastLeaderboardData = null;

// ─── Toast ───
function showToast(msg, ms = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

// ─── Create / Join ───
async function createGame() {
  const btn = event.target;
  const name = document.getElementById('create-name').value.trim();
  if (!name) return showToast('Enter a game name');

  btn.disabled = true;
  btn.textContent = 'Creating...';
  try {
    const game = await API.createGame(name, 0);
    showToast(`Game created! Code: ${game.gameCode}`);
    document.getElementById('join-code').value = game.gameCode;
  } catch (e) {
    showToast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Game';
  }
}

async function joinGame() {
  const btn = event.target;
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const name = document.getElementById('join-name').value.trim();
  if (!code || !name) return showToast('Enter game code and your name');

  btn.disabled = true;
  btn.textContent = 'Joining...';
  try {
    const data = await API.join(name, code);
    API.setSession({ ...data, name });
    enterGame(code);
  } catch (e) {
    showToast(e.message);
    btn.disabled = false;
    btn.textContent = 'Join Game';
  }
}

function enterGame(code) {
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('game-page').style.display = 'block';
  loadGameState();
  loadDraft();
}

// ─── Game State ───
async function loadGameState() {
  const session = API.getSession();
  if (!session.gameCode) return;
  try {
    const game = await API.getGame(session.gameCode);
    gameState = game;

    // If in lobby, poll for updates until draft starts
    if (game.status === 'lobby') {
      if (!pollInterval) {
        pollInterval = setInterval(loadGameState, 5000);
      }
    } else {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }

    if (game.status === 'drafting') {
      updateStatusBar();
    }
  } catch (e) {
    showToast(e.message);
  }
}

async function submitTiebreaker() {
  const session = API.getSession();
  const score = document.getElementById('tiebreaker-input').value;
  if (!score) return showToast('Enter a score prediction');
  try {
    await API.submitTiebreaker(session.gameCode, score);
    showToast('Tiebreaker saved!');
  } catch (e) {
    showToast(e.message);
  }
}

// ─── Draft ───
async function loadDraft() {
  const session = API.getSession();
  if (!session.gameCode) return;

  try {
    const state = await API.getDraftState(session.gameCode);
    draftState = state;
    renderDraftGrid(state);
    updateStatusBar();
    connectSSE();

    // After draft complete: swap sidebar to leaderboard
    const teamsCard = document.getElementById('sidebar-teams-card');
    const sidebarLB = document.getElementById('sidebar-leaderboard');
    const draftComplete = state.currentPick.isComplete || state.game.status === 'active' || state.game.status === 'complete';

    if (draftComplete && teamsCard && sidebarLB) {
      teamsCard.style.display = 'none';
      sidebarLB.style.display = '';
      loadLeaderboard();
    } else {
      if (teamsCard) teamsCard.style.display = '';
      if (sidebarLB) sidebarLB.style.display = 'none';
      renderAvailableTeams(state);
    }

    // Fetch and start countdown timer if draft is active
    if (state.game.status === 'drafting' && !state.currentPick.isComplete) {
      try {
        const timer = await API.getDraftTimer(session.gameCode);
        if (timer.deadline) {
          startCountdown(timer.deadline);
        }
      } catch (_) { /* timer fetch failed, non-critical */ }
    } else {
      stopCountdown();
    }
  } catch (e) {
    showToast(e.message);
  }
}

// ─── Countdown Timer ───
function updateTimerColor(timerEl, remaining) {
  timerEl.classList.remove('timer-green', 'timer-warning', 'timer-danger');
  if (remaining <= 60) {
    timerEl.classList.add('timer-danger');
  } else if (remaining <= 120) {
    timerEl.classList.add('timer-warning');
  } else {
    timerEl.classList.add('timer-green');
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function startCountdown(deadline) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  const deadlineMs = new Date(deadline).getTime();
  const timerEl = document.getElementById('timer-display');
  if (!timerEl) return;

  function tick() {
    const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
    timerEl.textContent = formatTime(remaining);
    updateTimerColor(timerEl, remaining);

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      setTimeout(loadDraft, 2000);
    }
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function renderDraftGrid(state) {
  const container = document.getElementById('draft-rounds-container');
  const contestants = state.game.status !== 'lobby'
    ? (gameState?.contestants || []).sort((a, b) => a.draft_position - b.draft_position)
    : [];

  const pickMap = {};
  state.picks.forEach((p) => { pickMap[p.pick_number] = p; });

  const currentRound = state.currentPick.isComplete ? 17 : state.currentPick.round;

  function getPickNumForColumn(round, colPosition) {
    const roundStart = (round - 1) * 8;
    if (round % 2 === 1) {
      return roundStart + colPosition;
    } else {
      return roundStart + (9 - colPosition);
    }
  }

  let html = '<div class="draft-columns-header">';
  html += '<div class="draft-col-header">Rd</div>';
  for (let i = 1; i <= 8; i++) {
    const c = contestants.find((c) => c.draft_position === i);
    html += `<div class="draft-col-header">${c ? c.name : `Pos ${i}`}</div>`;
  }
  html += '</div>';

  for (let round = 1; round <= 16; round++) {
    let roundClass;
    if (round < currentRound) {
      roundClass = 'previous';
    } else if (round === currentRound) {
      roundClass = 'current';
    } else {
      roundClass = 'future';
    }

    if (roundClass === 'future' && round > currentRound + 2) continue;

    html += `<div class="draft-round ${roundClass}">`;
    html += `<div class="round-header">${round}</div>`;
    html += `<div class="round-picks">`;

    for (let col = 1; col <= 8; col++) {
      const pickNum = getPickNumForColumn(round, col);
      const pick = pickMap[pickNum];
      const isCurrent = !state.currentPick.isComplete &&
        state.currentPick.pickNumber === pickNum;

      if (pick) {
        const logoHtml = pick.logo_url
          ? `<img class="pick-logo" src="${pick.logo_url}" alt="" onerror="this.style.display='none'">`
          : '';
        html += `<div class="pick-cell filled">
          ${logoHtml}
          <span class="pick-team">${pick.team_name}</span>
          <span class="pick-seed">${pick.seed} seed</span>
        </div>`;
      } else if (isCurrent) {
        html += `<div class="pick-cell current-pick">
          <span class="pick-team" style="color:var(--accent)">Pick ${pickNum}</span>
        </div>`;
      } else {
        html += `<div class="pick-cell empty">
          <span class="pick-seed">${pickNum}</span>
        </div>`;
      }
    }

    html += '</div></div>';
  }

  container.innerHTML = html;
}

function renderAvailableTeams(state) {
  const session = API.getSession();
  const isMyTurn = state.currentContestant &&
    state.currentContestant.id === session.contestantId &&
    !state.currentPick.isComplete;

  const regions = ['East', 'West', 'South', 'Midwest'];
  const list = document.getElementById('teams-list');
  const sidebar = list.closest('.draft-sidebar');

  const draftedTeams = {};
  const myTeams = new Set();
  state.picks.forEach((p) => {
    draftedTeams[p.team_id] = (draftedTeams[p.team_id] || 0) + 1;
    if (p.contestant_id === session.contestantId) myTeams.add(p.team_id);
  });

  const allTeamMap = {};
  state.availableTeams.forEach((t) => { allTeamMap[t.id] = t; });
  state.picks.forEach((p) => {
    if (!allTeamMap[p.team_id]) {
      allTeamMap[p.team_id] = {
        id: p.team_id,
        name: p.team_name,
        seed: p.seed,
        region: p.region,
        logo_url: p.logo_url,
        primary_color: p.primary_color
      };
    }
  });

  if (!isMyTurn) {
    sidebar.classList.add('locked');
  } else {
    sidebar.classList.remove('locked');
  }

  let html = '<div class="teams-region-grid">';

  for (const region of regions) {
    html += `<div class="teams-region-col">`;
    html += `<div class="teams-region-header ${region}">${region}</div>`;

    const regionTeams = Object.values(allTeamMap)
      .filter((t) => t.region === region)
      .sort((a, b) => a.seed - b.seed);

    for (const team of regionTeams) {
      const count = draftedTeams[team.id] || 0;
      const picksLeft = 2 - count;
      const iOwnIt = myTeams.has(team.id);
      let itemClass, indicator;

      if (picksLeft <= 0) {
        itemClass = 'unavailable';
        indicator = '';
      } else if (picksLeft === 1) {
        itemClass = 'picks-1';
        indicator = '<span class="avail-dot dot-1"></span>';
      } else {
        itemClass = 'picks-2';
        indicator = '<span class="avail-dot dot-2"></span>';
      }

      const canPick = isMyTurn && picksLeft > 0 && !iOwnIt;
      const clickHandler = canPick ? `onclick="makePick(${team.id})"` : '';

      html += `<div class="team-mini ${itemClass}" ${clickHandler}>
        <span class="tm-seed">${team.seed}</span>
        <span class="tm-name">${team.name}</span>
        ${indicator}
      </div>`;
    }

    html += '</div>';
  }

  html += '</div>';
  list.innerHTML = html;
}

function updateStatusBar() {
  const bar = document.getElementById('status-bar');
  const statusText = document.getElementById('status-text');
  const timerEl = document.getElementById('timer-display');
  const session = API.getSession();
  const pauseBtn = document.getElementById('pause-resume-btn');

  if (!draftState || !draftState.currentPick) {
    bar.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';

  if (draftState.currentPick.isComplete) {
    bar.className = 'status-bar complete';
    statusText.textContent = 'Draft complete! Scores are live.';
    if (timerEl) timerEl.textContent = '';
    if (pauseBtn) pauseBtn.style.display = 'none';
    stopCountdown();
    return;
  }

  if (pauseBtn) {
    pauseBtn.style.display = 'inline-flex';
    const isPaused = draftState.game && draftState.game.status === 'paused';
    updatePauseButton(isPaused);
  }

  const isMyTurn = draftState.currentContestant &&
    draftState.currentContestant.id === session.contestantId;

  const round = draftState.currentPick.round;
  const pickNum = draftState.currentPick.pickNumber;

  if (isMyTurn) {
    bar.className = 'status-bar your-turn';
    statusText.textContent = `It's Your pick — Round ${round}, Pick ${pickNum}`;
  } else {
    bar.className = 'status-bar waiting';
    const name = draftState.currentContestant ? draftState.currentContestant.name : '?';
    statusText.textContent = `It's ${name}'s pick — Round ${round}, Pick ${pickNum}`;
  }
}

async function makePick(teamId) {
  if (pickPending) return;
  pickPending = true;
  const session = API.getSession();
  try {
    const result = await API.makePick(session.gameCode, teamId);
    showToast(`Picked: ${result.team}`);
    loadDraft();
  } catch (e) {
    showToast(e.message);
  } finally {
    pickPending = false;
  }
}

function connectSSE() {
  const session = API.getSession();
  if (sseSource) return;

  sseSource = new EventSource(`/api/draft/${session.gameCode}/stream`);
  sseSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'pick') {
        const autoLabel = data.autoPick ? ' (auto-pick)' : '';
        showToast(`${data.pick.contestantName} drafted ${data.pick.teamName}${autoLabel}`);
        loadDraft();
      } else if (data.type === 'join') {
        loadGameState();
      } else if (data.type === 'pause') {
        showToast('Draft paused');
        stopCountdown();
        updatePauseButton(true);
      } else if (data.type === 'resume') {
        showToast('Draft resumed');
        loadDraft();
        updatePauseButton(false);
      }
    } catch (_) {}
  };
  sseSource.onerror = () => {
    sseSource.close();
    sseSource = null;
    setTimeout(() => {
      connectSSE();
      loadDraft();
    }, 3000);
  };
}

// ─── Pause / Resume ───
async function togglePause() {
  const session = API.getSession();
  const btn = document.getElementById('pause-resume-btn');
  const isPaused = btn.classList.contains('paused');
  const endpoint = isPaused ? 'resume' : 'pause';

  btn.disabled = true;
  try {
    await fetch(`/api/draft/${session.gameCode}/${endpoint}`, { method: 'POST' });
    updatePauseButton(!isPaused);
  } catch (e) {
    showToast(e.message || 'Action failed');
  } finally {
    btn.disabled = false;
  }
}

function updatePauseButton(paused) {
  const btn = document.getElementById('pause-resume-btn');
  if (!btn) return;
  if (paused) {
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><polygon points="2,0 14,7 2,14" fill="currentColor"/></svg>';
    btn.className = 'btn btn-sm pause-btn paused';
    btn.title = 'Resume';
  } else {
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="0" width="4" height="14" fill="currentColor"/><rect x="9" y="0" width="4" height="14" fill="currentColor"/></svg>';
    btn.className = 'btn btn-sm pause-btn';
    btn.title = 'Pause';
  }
}

// ─── Leaderboard ───
async function loadLeaderboard() {
  const session = API.getSession();
  if (!session.gameCode) return;
  try {
    const data = await API.getLeaderboard(session.gameCode);
    lastLeaderboardData = data;
    renderLeaderboard(data);
    startLeaderboardPolling(data);
  } catch (_) {}
}

function startLeaderboardPolling(data) {
  if (leaderboardPollInterval) return;
  if (data.gameStatus !== 'active') return;

  const pollMs = data.pollStatus && data.pollStatus.shouldPoll
    ? Math.max(data.pollStatus.nextCheckMs || 600000, 60000)
    : 600000;

  leaderboardPollInterval = setInterval(async () => {
    const session = API.getSession();
    if (!session.gameCode) return;
    try {
      const fresh = await API.getLeaderboard(session.gameCode);
      lastLeaderboardData = fresh;
      renderLeaderboard(fresh);
      if (fresh.pollStatus && !fresh.pollStatus.shouldPoll && fresh.pollStatus.reason === 'All games final') {
        stopLeaderboardPolling();
      }
    } catch (_) {}
  }, pollMs);
}

function stopLeaderboardPolling() {
  if (leaderboardPollInterval) {
    clearInterval(leaderboardPollInterval);
    leaderboardPollInterval = null;
  }
}

async function manualRefreshScores() {
  const session = API.getSession();
  if (!session.gameCode) return;
  const btn = document.querySelector('.refresh-espn-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing...'; }
  try {
    const data = await API.refreshScores(session.gameCode);
    lastLeaderboardData = data;
    renderLeaderboard(data);
    showToast(`ESPN sync: ${data.espnResult?.updated || 0} results updated`);
  } catch (e) {
    showToast('ESPN sync failed: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Update Scores'; }
  }
}

function renderLeaderboard(data) {
  const { standings, roundsPlayed, championshipComplete } = data;
  const head = document.getElementById('sidebar-leaderboard-head');
  const body = document.getElementById('sidebar-leaderboard-body');
  if (!head || !body) return;

  const roundCols = [1, 2, 3, 4, 5, 6];
  const shortLabels = { 1: 'R1', 2: 'R2', 3: 'S16', 4: 'E8', 5: 'F4', 6: 'CH' };
  const currentRound = roundsPlayed.length > 0 ? Math.max(...roundsPlayed) : 0;

  head.innerHTML = `<tr>
    <th class="lb-rank">#</th>
    <th class="lb-name">Name</th>
    <th style="width:32px; font-size:0.5rem; padding:0.3rem 0.15rem">ALV</th>
    ${roundCols.map(r => {
      const played = roundsPlayed.includes(r);
      const isCurrent = r === currentRound;
      const fontSize = isCurrent ? '0.7rem' : '0.5rem';
      const fontWeight = isCurrent ? '800' : '400';
      const color = isCurrent ? 'color:var(--orange)' : '';
      return `<th class="lb-round ${played ? '' : 'round-pending'}" style="width:32px; font-size:${fontSize}; font-weight:${fontWeight}; padding:0.3rem 0.15rem; ${color}">${shortLabels[r]}</th>`;
    }).join('')}
    <th class="lb-total" style="width:44px">PTS</th>
  </tr>`;

  body.innerHTML = standings.map((s, i) => {
    const rank = i + 1;
    const showMedal = championshipComplete && rank <= 3;
    const rankClass = showMedal ? `rank-${rank}` : '';
    const rowClass = showMedal ? `place-${rank}` : '';

    const roundCells = roundCols.map(r => {
      const pts = s.roundScores[r] || 0;
      const played = roundsPlayed.includes(r);
      const isCurrent = r === currentRound;
      if (!played) return `<td class="lb-round round-pending" style="padding:0.25rem 0.1rem"><span class="round-tbd" style="font-size:0.55rem">—</span></td>`;
      const cellSize = isCurrent ? '0.9rem' : '0.8rem';
      const cellWeight = isCurrent ? 'font-weight:700' : '';
      return `<td class="lb-round" style="padding:0.25rem 0.1rem"><span class="round-pts${pts > 0 ? ' has-pts' : ''}" style="font-size:${cellSize}; ${cellWeight}">${pts}</span></td>`;
    }).join('');

    return `<tr class="${rowClass}" onclick="showTeamDetail(${s.contestantId}, '${s.name.replace(/'/g, "\\'")}')">
      <td class="lb-rank" style="padding:0.25rem 0.15rem"><span class="rank-badge ${rankClass}" style="width:22px; height:22px; font-size:0.7rem">${rank}</span></td>
      <td class="lb-name" style="padding:0.25rem 0.3rem; font-size:0.8rem; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap"><strong>${s.name}</strong></td>
      <td style="padding:0.25rem 0.15rem; text-align:center"><span class="alive-count" style="font-size:0.75rem">${s.teamsAlive}</span></td>
      ${roundCells}
      <td class="lb-total" style="padding:0.25rem 0.15rem"><span class="score-value" style="font-size:0.9rem">${s.score}</span></td>
    </tr>`;
  }).join('');
}

async function showTeamDetail(contestantId, name) {
  if (!lastLeaderboardData) return;
  const contestant = lastLeaderboardData.standings.find((s) => s.contestantId === contestantId);
  if (!contestant) return;

  const card = document.getElementById('team-details-card');
  if (!card) return;
  card.style.display = 'block';
  document.getElementById('detail-name').textContent = `${name}'s Teams`;

  const grid = document.getElementById('team-detail-grid');
  grid.innerHTML = contestant.teams
    .sort((a, b) => b.points - a.points || a.seed - b.seed)
    .map((t) => {
      const cls = t.eliminated ? 'mini-team-card eliminated' : 'mini-team-card';
      const logoUrl = t.espnId
        ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${t.espnId}.png`
        : '';
      const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="" style="width:28px;height:28px;object-fit:contain;margin-bottom:2px">`
        : '';
      return `<div class="${cls}">
        ${logoHtml}
        <div><strong>(${t.seed}) ${t.name}</strong></div>
        <div style="color:var(--text-muted); font-size:0.72rem">${t.region}</div>
        <div class="pts">${t.points} pts</div>
      </div>`;
    })
    .join('');
}

// ─── Test Mode ───
async function resetAndReload() {
  try {
    await fetch('/api/test/reset', { method: 'POST' });
    API.clearSession();
    sessionStorage.removeItem('mm_test_game');
    document.getElementById('test-toolbar').style.display = 'none';
    document.getElementById('landing-page').style.display = '';
    document.getElementById('game-page').style.display = 'none';
    showToast('Reset! Fresh start.');
  } catch (e) {
    showToast(e.message);
  }
}

async function quickTest() {
  const name = document.getElementById('test-name').value.trim() || 'TestPlayer';
  try {
    await fetch('/api/test/reset', { method: 'POST' });
    API.clearSession();

    const game = await API.createGame('Test Game', 20);
    const data = await API.join(name, game.gameCode);
    API.setSession({ ...data, name });

    await fetch('/api/test/fill-game/' + game.gameCode, { method: 'POST' });
    await API.startDraft(game.gameCode);

    enterGame(game.gameCode);
    showToast('Test game ready! Bots joined & draft started.');

    sessionStorage.setItem('mm_test_game', 'true');
    document.getElementById('test-toolbar').style.display = 'flex';
  } catch (e) {
    showToast(e.message);
  }
}

async function testSimulateRound() {
  const session = API.getSession();
  try {
    const resp = await fetch('/api/test/simulate-round/' + session.gameCode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ humanContestantId: session.contestantId })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Simulate failed');
    showToast(`Simulated ${data.picks.length} bot picks`);
    loadDraft();
  } catch (e) {
    showToast(e.message);
  }
}

async function testAutoPickAll() {
  const session = API.getSession();
  try {
    const resp = await fetch('/api/test/simulate-full-draft/' + session.gameCode, { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Simulate failed');
    showToast('Draft simulated!');
    loadDraft();
  } catch (e) {
    showToast(e.message);
  }
}

async function testSimulateTournamentRound() {
  const session = API.getSession();
  try {
    const resp = await fetch('/api/test/simulate-tournament-round/' + session.gameCode, { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Simulate failed');
    showToast(data.message + (data.complete ? ' — Tournament complete!' : ''));
    loadLeaderboard();
  } catch (e) {
    showToast(e.message);
  }
}

// ─── Init ───
(function init() {
  const urlCode = new URLSearchParams(window.location.search).get('code');
  if (urlCode) {
    const joinCodeEl = document.getElementById('join-code');
    if (joinCodeEl) joinCodeEl.value = urlCode.toUpperCase();
  }

  const session = API.getSession();
  if (session.token && session.gameCode) {
    API.me()
      .then(() => {
        enterGame(session.gameCode);
        if (sessionStorage.getItem('mm_test_game') === 'true') {
          document.getElementById('test-toolbar').style.display = 'flex';
        }
      })
      .catch(() => {
        API.clearSession();
        sessionStorage.removeItem('mm_test_game');
        document.getElementById('landing-page').style.display = '';
        document.getElementById('game-page').style.display = 'none';
      });
  }
})();
