/**
 * Draft Madness — Main application logic
 */

let gameState = null;
let draftState = null;
let sseSource = null;
let pollInterval = null;
let countdownInterval = null;

// ─── Toast ───
function showToast(msg, ms = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

// ─── Tab Navigation ───
function switchTab(tab) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-tabs button').forEach((b) => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');

  const tabLabels = { lobby: 'Lobby', draft: 'Draft', scores: 'Leaderboard', scenarios: 'Scenarios' };
  document.querySelectorAll('.nav-tabs button').forEach((b) => {
    if (b.textContent === tabLabels[tab]) b.classList.add('active');
  });

  if (tab === 'draft') loadDraft();
  if (tab === 'scores') loadLeaderboard();
  if (tab === 'scenarios') loadScenarios();
  if (tab === 'lobby') loadLobby();
}

// ─── Create / Join ───
async function createGame() {
  const btn = event.target;
  const name = document.getElementById('create-name').value.trim();
  const buyIn = document.getElementById('create-buyin').value;
  if (!name) return showToast('Enter a game name');

  btn.disabled = true;
  btn.textContent = 'Creating...';
  try {
    const game = await API.createGame(name, buyIn);
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
  document.getElementById('game-code-display').textContent = code;
  document.getElementById('player-name-display').textContent = API.getSession().name;
  loadLobby();
  switchTab('draft');
}

// ─── Lobby ───
async function loadLobby() {
  const session = API.getSession();
  if (!session.gameCode) return;
  try {
    const game = await API.getGame(session.gameCode);
    gameState = game;

    document.getElementById('lobby-game-name').textContent = game.name;
    document.getElementById('lobby-buyin').textContent = game.buy_in || 0;
    document.getElementById('lobby-code').textContent = game.id;

    const countEl = document.getElementById('lobby-count');
    countEl.querySelector('span').textContent = `${game.contestants.length}/8 contestants`;
    document.getElementById('lobby-count-fill').style.width = `${(game.contestants.length / 8) * 100}%`;

    const list = document.getElementById('contestant-list');
    list.innerHTML = game.contestants
      .map((c) => {
        const posHtml = c.draft_position
          ? `<span class="draft-position-badge">${c.draft_position}</span>`
          : '<span class="waiting-badge">Waiting...</span>';
        const youBadge = c.id === session.contestantId ? '<span class="you-badge">You</span>' : '';
        return `<li><span>${c.name}${youBadge}</span>${posHtml}</li>`;
      })
      .join('');

    // Show start button if 8 contestants and in lobby
    const startBtn = document.getElementById('start-draft-btn');
    if (game.contestants.length === 8 && game.status === 'lobby') {
      startBtn.style.display = 'inline-flex';
    } else {
      startBtn.style.display = 'none';
    }

    // Show tiebreaker if draft started or active
    const tbCard = document.getElementById('tiebreaker-card');
    if (game.status === 'drafting' || game.status === 'active') {
      tbCard.style.display = 'block';
      const me = game.contestants.find((c) => c.id === session.contestantId);
      if (me && me.tiebreaker_score != null) {
        document.getElementById('tiebreaker-status').textContent = `Saved: ${me.tiebreaker_score}`;
        document.getElementById('tiebreaker-input').value = me.tiebreaker_score;
      }
    }

    if (game.status === 'drafting') {
      updateStatusBar();
    }

    // If in lobby, poll for updates
    if (game.status === 'lobby') {
      if (!pollInterval) {
        pollInterval = setInterval(loadLobby, 5000);
      }
    } else {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }

  } catch (e) {
    showToast(e.message);
  }
}

async function startDraft() {
  const btn = document.getElementById('start-draft-btn');
  btn.disabled = true;
  btn.textContent = 'Drawing straws...';

  const session = API.getSession();
  try {
    await API.startDraft(session.gameCode);
    showToast('Straws drawn! Draft starting!');
    await loadLobby();
    setTimeout(() => switchTab('draft'), 1200);
  } catch (e) {
    showToast(e.message);
    btn.disabled = false;
    btn.textContent = 'Draw Straws & Start Draft';
  }
}

async function submitTiebreaker() {
  const session = API.getSession();
  const score = document.getElementById('tiebreaker-input').value;
  if (!score) return showToast('Enter a score prediction');
  try {
    await API.submitTiebreaker(session.gameCode, score);
    document.getElementById('tiebreaker-status').textContent = `Saved: ${score}`;
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
    renderAvailableTeams(state);
    updateStatusBar();
    connectSSE();

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
function startCountdown(deadline) {
  stopCountdown();

  const deadlineMs = new Date(deadline).getTime();
  const timerEl = document.getElementById('timer-display');
  if (!timerEl) return;

  function tick() {
    const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Update styling based on urgency
    timerEl.classList.remove('timer-warning', 'timer-danger');
    if (remaining <= 5) {
      timerEl.classList.add('timer-danger');
    } else if (remaining <= 15) {
      timerEl.classList.add('timer-warning');
    }

    if (remaining <= 0) {
      stopCountdown();
      // Refresh draft state — server will have auto-picked
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
  const timerEl = document.getElementById('timer-display');
  if (timerEl) {
    timerEl.textContent = '';
    timerEl.classList.remove('timer-warning', 'timer-danger');
  }
}

function renderDraftGrid(state) {
  const container = document.getElementById('draft-rounds-container');
  const contestants = state.game.status !== 'lobby'
    ? (gameState?.contestants || []).sort((a, b) => a.draft_position - b.draft_position)
    : [];

  const pickMap = {};
  state.picks.forEach((p) => { pickMap[p.pick_number] = p; });

  // Determine current round (1-based)
  const currentRound = state.currentPick.isComplete ? 17 : state.currentPick.round;

  // Build snake order mapping: for each round, which pick# goes to which column (draft_position)
  // Columns are always 1-8 (left to right = draft_position 1-8)
  // In odd rounds, position 1 picks first; in even rounds, position 8 picks first
  function getPickNumForColumn(round, colPosition) {
    // colPosition is 1-8 (the draft_position / column index)
    const roundStart = (round - 1) * 8;
    if (round % 2 === 1) {
      // Forward: position 1 = pick 1, position 2 = pick 2, etc.
      return roundStart + colPosition;
    } else {
      // Reverse: position 1 = pick 8, position 2 = pick 7, etc.
      return roundStart + (9 - colPosition);
    }
  }

  // Column headers (spacer for round label + contestant names)
  let html = '<div class="draft-columns-header">';
  html += '<div class="draft-col-header">Rd</div>';
  for (let i = 1; i <= 8; i++) {
    const c = contestants.find((c) => c.draft_position === i);
    html += `<div class="draft-col-header">${c ? c.name : `Pos ${i}`}</div>`;
  }
  html += '</div>';

  // Render rounds
  for (let round = 1; round <= 16; round++) {
    let roundClass;
    if (round < currentRound) {
      roundClass = 'previous';
    } else if (round === currentRound) {
      roundClass = 'current';
    } else {
      roundClass = 'future';
    }

    // Only show: all previous, current, and next 2 future rounds
    if (roundClass === 'future' && round > currentRound + 2) continue;

    html += `<div class="draft-round ${roundClass}">`;
    html += `<div class="round-header">${round}</div>`;
    html += `<div class="round-picks">`;

    // Always render columns 1-8 in order (matching header)
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

  // Track how many times each team has been drafted
  const draftedTeams = {};
  const myTeams = new Set();
  state.picks.forEach((p) => {
    draftedTeams[p.team_id] = (draftedTeams[p.team_id] || 0) + 1;
    if (p.contestant_id === session.contestantId) myTeams.add(p.team_id);
  });

  // Build a full team list from availableTeams (< 2 picks) plus fully drafted ones from picks
  // availableTeams already has teams with times_drafted < 2
  const allTeamMap = {};
  state.availableTeams.forEach((t) => { allTeamMap[t.id] = t; });

  // Add fully drafted teams from picks (teams drafted 2x won't be in availableTeams)
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

  // Toggle locked state
  if (!isMyTurn) {
    sidebar.classList.add('locked');
  } else {
    sidebar.classList.remove('locked');
  }

  // 4-column grid: one column per region, all 64 teams visible
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

      if (picksLeft <= 0 || iOwnIt) {
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

  if (!draftState || !draftState.currentPick) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';

  if (draftState.currentPick.isComplete) {
    bar.className = 'status-bar complete';
    statusText.textContent = 'Draft complete! Check the Leaderboard.';
    if (timerEl) timerEl.textContent = '';
    stopCountdown();
    return;
  }

  const isMyTurn = draftState.currentContestant &&
    draftState.currentContestant.id === session.contestantId;

  if (isMyTurn) {
    bar.className = 'status-bar your-turn';
    statusText.textContent = `Your pick! Round ${draftState.currentPick.round}, Pick #${draftState.currentPick.pickNumber}`;
  } else {
    bar.className = 'status-bar waiting';
    const name = draftState.currentContestant ? draftState.currentContestant.name : '?';
    statusText.textContent = `Waiting for ${name} — Round ${draftState.currentPick.round}, Pick #${draftState.currentPick.pickNumber}`;
  }
}

async function makePick(teamId) {
  const session = API.getSession();
  try {
    const result = await API.makePick(session.gameCode, teamId);
    showToast(`Picked: ${result.team}`);
    loadDraft();
  } catch (e) {
    showToast(e.message);
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
      }
    } catch (_) {}
  };
  sseSource.onerror = () => {
    sseSource.close();
    sseSource = null;
    setTimeout(connectSSE, 3000);
  };
}

// ─── Leaderboard ───
let lastLeaderboardData = null;

async function loadLeaderboard() {
  const session = API.getSession();
  if (!session.gameCode) return;

  try {
    const data = await API.getLeaderboard(session.gameCode);
    lastLeaderboardData = data;
    renderPrizes(data.prizes);
    renderLeaderboard(data);
  } catch (e) {
    showToast(e.message);
  }
}

function renderPrizes(prizes) {
  const el = document.getElementById('prizes-display');
  el.innerHTML = `
    <div class="prize-card first">
      <div class="place">1st Place</div>
      <div class="amount">$${prizes.first}</div>
    </div>
    <div class="prize-card second">
      <div class="place">2nd Place</div>
      <div class="amount">$${prizes.second}</div>
    </div>
    <div class="prize-card third">
      <div class="place">3rd Place</div>
      <div class="amount">$${prizes.third}</div>
    </div>
  `;
}

function renderLeaderboard(data) {
  const { standings, roundsPlayed, championshipComplete, roundLabels } = data;

  // Build header — always show all 6 round columns
  const head = document.getElementById('leaderboard-head');
  const roundCols = [1, 2, 3, 4, 5, 6];
  head.innerHTML = `<tr>
    <th class="lb-rank">#</th>
    <th class="lb-name">Contestant</th>
    ${roundCols
      .map((r) => {
        const played = roundsPlayed.includes(r);
        const cls = played ? '' : 'round-pending';
        return `<th class="lb-round ${cls}">${roundLabels[r]}</th>`;
      })
      .join('')}
    <th class="lb-total">Total</th>
    <th class="lb-alive">Alive</th>
  </tr>`;

  // Build rows
  const body = document.getElementById('leaderboard-body');
  body.innerHTML = standings
    .map((s, i) => {
      const rank = i + 1;
      // Only show medals when championship is complete
      const showMedal = championshipComplete && rank <= 3;
      const rankClass = showMedal ? `rank-${rank}` : '';
      const rowClass = showMedal ? `place-${rank}` : '';

      const roundCells = roundCols
        .map((r) => {
          const pts = s.roundScores[r] || 0;
          const played = roundsPlayed.includes(r);
          if (!played) return `<td class="lb-round round-pending"><span class="round-tbd">—</span></td>`;
          return `<td class="lb-round"><span class="round-pts${pts > 0 ? ' has-pts' : ''}">${pts}</span></td>`;
        })
        .join('');

      return `<tr class="${rowClass}" onclick="showTeamDetail(${s.contestantId}, '${s.name.replace(/'/g, "\\'")}')">
        <td class="lb-rank"><span class="rank-badge ${rankClass}">${showMedal ? ['', '&#9679;', '&#9679;', '&#9679;'][rank] : rank}</span></td>
        <td class="lb-name"><strong>${s.name}</strong></td>
        ${roundCells}
        <td class="lb-total"><span class="score-value">${s.score}</span></td>
        <td class="lb-alive"><span class="alive-count">${s.teamsAlive}<span class="alive-of">/16</span></span></td>
      </tr>`;
    })
    .join('');
}

async function showTeamDetail(contestantId, name) {
  if (!lastLeaderboardData) return;
  const contestant = lastLeaderboardData.standings.find((s) => s.contestantId === contestantId);
  if (!contestant) return;

  const card = document.getElementById('team-details-card');
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

// ─── Scenarios ───
async function loadScenarios() {
  const session = API.getSession();
  if (!session.gameCode) return;

  try {
    const data = await API.getScenarios(session.gameCode);
    const container = document.getElementById('scenarios-container');
    const info = document.getElementById('scenarios-info');

    if (!data.available) {
      info.textContent = data.message;
      container.innerHTML = '';
      return;
    }

    info.textContent = `${data.teamsAlive.length} teams remain. ${data.scenarios.length} possible outcomes:`;

    container.innerHTML = data.scenarios
      .map((s, i) => {
        const standingsHtml = s.standings
          .map((st, j) => `<span class="rank-entry">${j + 1}. ${st.name} (${st.score})</span>`)
          .join('');

        return `<div class="scenario-card">
          <h4>Scenario ${i + 1}</h4>
          <p class="scenario-desc">${s.description}</p>
          <div class="scenario-standings">${standingsHtml}</div>
        </div>`;
      })
      .join('');
  } catch (e) {
    showToast(e.message);
  }
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
    // Wipe any old data first
    await fetch('/api/test/reset', { method: 'POST' });
    API.clearSession();

    // Create game
    const game = await API.createGame('Test Game', 20);

    // Join as human
    const data = await API.join(name, game.gameCode);
    API.setSession({ ...data, name });

    // Fill with bots
    await fetch('/api/test/fill-game/' + game.gameCode, { method: 'POST' });

    // Start draft
    await API.startDraft(game.gameCode);

    enterGame(game.gameCode);
    showToast('Test game ready! Bots joined & draft started.');

    // Mark as test game and show toolbar
    sessionStorage.setItem('mm_test_game', 'true');
    document.getElementById('test-toolbar').style.display = 'flex';

    setTimeout(() => switchTab('draft'), 800);
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
    // Switch to leaderboard to see updated scores
    switchTab('scores');
  } catch (e) {
    showToast(e.message);
  }
}

// ─── Init ───
(function init() {
  const session = API.getSession();
  if (session.token && session.gameCode) {
    API.me()
      .then(() => {
        enterGame(session.gameCode);
        // Restore test toolbar if this was a test game
        if (sessionStorage.getItem('mm_test_game') === 'true') {
          document.getElementById('test-toolbar').style.display = 'flex';
        }
      })
      .catch(() => {
        // Server doesn't recognize this session (DB was wiped, etc.)
        API.clearSession();
        sessionStorage.removeItem('mm_test_game');
        document.getElementById('landing-page').style.display = '';
        document.getElementById('game-page').style.display = 'none';
      });
  }
})();
