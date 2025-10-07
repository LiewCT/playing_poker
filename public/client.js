// =====================================================
// 🎯 INITIAL SETUP
// =====================================================
const socket = io();
let myId = null;
let currentGame = null; // store latest game state globally
const room = 'table1'; // hardcoded for now

socket.on('connect', () => {
  myId = socket.id;
  joinBtn.disabled = false;
  socket.emit('joinTable', room); // ensure join after connection
});

// =====================================================
// 🎮 GAME TIMER VARIABLES
// =====================================================
let myReadyTimer = null;
let myReadyTimeLeft = 0;
let turnTimer = null;
let turnTimeLeft = 0;

// =====================================================
// 🎛️ DOM ELEMENT REFERENCES
// =====================================================
const joinBtn = document.getElementById('joinBtn');
const hitBtn = document.getElementById('hitBtn');
const standBtn = document.getElementById('standBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const resetBtn = document.getElementById('resetBtn');
const readyBtn = document.getElementById('readyBtn');
const leaveBtn = document.getElementById('leaveBtn');
const alwaysShuffleSelect = document.getElementById('alwaysShuffle');

const settingsIcon = document.getElementById('settings-icon');
const hostSettingsDiv = document.getElementById('host-settings');
const hostControls = document.getElementById('host-controls');
const nonHostMessage = document.getElementById('non-host-message');
const readyTimerToggle = document.getElementById('readyTimerToggle');

const updateTimersBtn = document.getElementById('updateTimersBtn');
const choosingTimeInput = document.getElementById('choosingTimeInput');
const readyTimeInput = document.getElementById('readyTimeInput');
const quickReadyTimeInput = document.getElementById('quickReadyTimeInput');

const readyTimerDiv = document.getElementById('ready-timer');
const choosingTimerDiv = document.getElementById('choosing-timer');
const playersArea = document.getElementById('players-area');

// =====================================================
// 🔒 INITIAL UI STATE
// =====================================================
joinBtn.disabled = true;
leaveBtn.disabled = false;
hitBtn.disabled = true;
standBtn.disabled = true;
shuffleBtn.disabled = true;
readyBtn.disabled = true;
resetBtn.disabled = true;
settingsIcon.style.display = 'none';

readyTimerDiv.style.display = 'none';
choosingTimerDiv.style.display = 'none';
playersArea.innerHTML = '';

// =====================================================
// ⚙️ SETTINGS PANEL LOGIC
// =====================================================
settingsIcon.addEventListener('click', () => {
  hostSettingsDiv.style.display =
    hostSettingsDiv.style.display === 'block' ? 'none' : 'block';
});

updateTimersBtn.addEventListener('click', () => {

  const choosingTime = parseInt(choosingTimeInput.value);
  const readyTime = parseInt(readyTimeInput.value);
  const quickReadyTime = parseInt(quickReadyTimeInput.value);

  // Validate numeric values
  if (isNaN(choosingTime) || isNaN(readyTime) || isNaN(quickReadyTime)) {
    alert('⚠️ Please enter valid numeric values.');
    return;
  }

  // Validate ranges
  if (choosingTime < 5 || choosingTime > 120) {
    alert('Choosing Time must be between 5 and 120 seconds.');
    return;
  }

  if (readyTime < 3 || readyTime > 30) {
    alert('Ready Time must be between 3 and 30 seconds.');
    return;
  }

  if (quickReadyTime < 1 || quickReadyTime > 10) {
    alert('Quick Ready Time must be between 1 and 10 seconds.');
    return;
  }

  hostSettingsDiv.style.display =
  hostSettingsDiv.style.display === 'block' ? 'none' : 'block';

  // Send update to server
  socket.emit('updateSetting', {
    choosingTime,
    readyTime,
    quickReadyTime
  });

  console.log('✅ Updated timers sent:', { choosingTime, readyTime, quickReadyTime });
});

// =====================================================
// 🕒 AUTO READY TOGGLE
// =====================================================
readyTimerToggle.addEventListener('change', () => {
  if (readyTimerToggle.checked) {
    console.log('Auto Ready ON');
    startReadyTimerForMe(currentGame?.settings?.readyTime || 5, currentGame);
    socket.emit('playerReady', room);
  } else {
    console.log('Auto Ready OFF');
    stopReadyTimerForMe();
  }
});

// =====================================================
// 🧠 SOCKET EVENT HANDLERS
// =====================================================
socket.on('gameState', (game) => {
  currentGame = game;
  renderGame(game);
});

socket.on('joinedAsPlayer', () => {
  joinBtn.disabled = true;
});

socket.on('joinDenied', (data) => {
  alert(data.reason);
});

// =====================================================
// 🖱️ BUTTON EVENT HANDLERS
// =====================================================
joinBtn.addEventListener('click', () => {
  socket.emit('requestJoinGame', room);
});

hitBtn.addEventListener('click', () => {
  socket.emit('hit', room);
  stopTurnTimer();
  startTurnTimer(currentGame.settings.choosingTime || 20, myId);
});

standBtn.addEventListener('click', () => {
  socket.emit('stand', room);
  stopTurnTimer();
  startTurnTimer(currentGame.settings.choosingTime || 20, myId);
});

shuffleBtn.addEventListener('click', () => {
  socket.emit('shuffleDeck', room);
});

resetBtn.addEventListener('click', () => {
  socket.emit('resetGame', room);
  joinBtn.disabled = false;
});

readyBtn.addEventListener('click', () => {
  socket.emit('playerReady', room);
});

leaveBtn.addEventListener('click', () => {
  socket.emit('leaveGame');
  resetUIForLeave();
});

alwaysShuffleSelect.addEventListener('change', () => {
  socket.emit('updateSetting', {
    alwaysShuffle: alwaysShuffleSelect.value === 'true',
  });
});

// =====================================================
// 🧮 HELPER FUNCTIONS
// =====================================================
function getHandValue(hand) {
  let value = 0;
  let aces = 0;
  hand.forEach((card) => {
    const name = card.filename.split('_of_')[0];
    if (['jack', 'queen', 'king'].includes(name)) value += 10;
    else if (name === 'ace') {
      aces++;
      value += 11;
    } else value += parseInt(name);
  });
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

function resetUIForLeave() {
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  hitBtn.disabled = true;
  standBtn.disabled = true;
  shuffleBtn.disabled = true;
  readyBtn.disabled = true;
  settingsIcon.style.display = 'none';
  stopReadyTimerForMe();
  stopTurnTimer();
}

// =====================================================
// 🧩 GAME RENDER FUNCTION (FULL VERSION RESTORED)
// =====================================================
function renderGame(game) {
  // ----- Dealer -----
  const dealerDiv = document.getElementById('dealer-cards');
  dealerDiv.innerHTML = '';
  game.dealer.forEach((card) => {
    const img = document.createElement('img');
    img.src = card.faceDown
      ? 'asset/img/back_cards/card_back_black.png'
      : `asset/img/cards/${card.filename}`;
    dealerDiv.appendChild(img);
  });

  const dealerValueDiv = document.getElementById('dealer-value');
  const dealerHandForValue = game.dealer.filter((c) => !c.faceDown);
  dealerValueDiv.textContent =
    dealerHandForValue.length > 0
      ? `Value: ${getHandValue(dealerHandForValue)}`
      : '';

  // ----- Players -----
  const playersArea = document.getElementById('players-area');
  playersArea.innerHTML = '';
  const scoreboard = document.getElementById('scoreboard');
  scoreboard.innerHTML = '';

  game.players.forEach((p, idx) => {
    const playerDiv = document.createElement('div');
    playerDiv.classList.add('player');

    if (game.inProgress && game.currentTurn === idx && !p.stand && !p.busted) {
      playerDiv.classList.add('choosing');
    }

    // Header
    const header = document.createElement('h2');
    header.textContent = p.id === myId ? 'You' : `Player ${p.id.slice(0, 5)}`;
    if (p.id === myId) playerDiv.classList.add('you-player');
    if (p.host) header.textContent += ' (Host)';
    if (p.ready) header.textContent += ' ✅ Ready';
    playerDiv.appendChild(header);

    // Cards
    const cardsDiv = document.createElement('div');
    cardsDiv.classList.add('cards');
    p.hand.forEach((card) => {
      const img = document.createElement('img');
      img.src = card.faceDown
        ? 'asset/img/back_cards/card_back_black.png'
        : `asset/img/cards/${card.filename}`;
      cardsDiv.appendChild(img);
    });
    playerDiv.appendChild(cardsDiv);

    // Value
    const valDiv = document.createElement('div');
    valDiv.textContent = `Value: ${getHandValue(p.hand)}`;
    playerDiv.appendChild(valDiv);

    // Result text
    if (p.result) {
      const res = document.createElement('div');
      res.textContent = p.result;
      playerDiv.appendChild(res);
    }

    playersArea.appendChild(playerDiv);

    // ----- Scoreboard -----
    let status = 'Waiting';
    if (p.stand) status = 'Stands';
    if (p.busted) status = 'Burst';
    if (game.inProgress && idx === game.currentTurn) status = 'Choosing';
    const line = document.createElement('div');
    line.textContent = `${p.id.slice(0, 5)} - ${status} (${getHandValue(p.hand)})`;
    scoreboard.appendChild(line);
  });

  // ----- Deck / Discard counts -----
  document.getElementById('discard-count').textContent = game.discard.length;
  document.getElementById('deck-count').textContent = game.deck.length;

  const me = game.players.find((p) => p.id === myId);

  // ----- Ready / Hit / Stand Buttons -----
  if (!game.inProgress) {
    stopTurnTimer();
    readyBtn.disabled = !me;
    readyBtn.textContent = me && me.ready ? 'Unready' : 'Ready';
    hitBtn.disabled = true;
    standBtn.disabled = true;
    choosingTimerDiv.style.display = 'none';
    joinBtn.disabled = false;
    leaveBtn.disabled = !me;

    // Auto Ready
    if (me && !me.ready && readyTimerToggle.checked && !myReadyTimer) {
      startReadyTimerForMe(game.settings.readyTime || 5, game);
    }
  } else {
    stopReadyTimerForMe();
    readyBtn.disabled = true;
    readyBtn.textContent = 'Ready';
    shuffleBtn.disabled = true;

    const currentTurnPlayer = game.players[game.currentTurn];
    hitBtn.disabled =
      !me || me.stand || me.busted || me.id !== currentTurnPlayer.id;
    standBtn.disabled =
      !me || me.stand || me.busted || me.id !== currentTurnPlayer.id;

    startTurnTimer(game.settings.choosingTime || 20, currentTurnPlayer.id);
  }

  // ----- Join / Leave / Shuffle Buttons -----
  if (!me) {
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
    shuffleBtn.disabled = true;
  } else {
    joinBtn.disabled = true;
    leaveBtn.disabled = false;

    if (me.host) {
      shuffleBtn.disabled = false;
      hostControls.style.display = 'block';
      nonHostMessage.style.display = 'none';
      alwaysShuffleSelect.value = game.settings.alwaysShuffle ? 'true' : 'false';
      resetBtn.disabled = false;
      settingsIcon.style.display = 'block';
    } else {
      hostControls.style.display = 'none';
      nonHostMessage.style.display = 'block';
      resetBtn.disabled = true;
      settingsIcon.style.display = 'block';
    }
  }

  // ----- Display Result -----
  const oldResult = document.getElementById('result');
  if (game.result) {
    let res = oldResult;
    if (!res) {
      res = document.createElement('div');
      res.id = 'result';
      document.getElementById('controls').appendChild(res);
    }
    res.innerHTML = `<h2>${game.result}</h2>`;
  } else if (oldResult) {
    oldResult.remove();
  }
}

// =====================================================
// 🕑 READY TIMER FUNCTIONS
// =====================================================
function startReadyTimerForMe(seconds, game) {
  if (game && game.inProgress) {
    stopReadyTimerForMe();
    return;
  }
  if (myReadyTimer) return;

  const readyDiv = document.getElementById('ready-timer');
  readyDiv.style.display = 'block';
  readyDiv.innerHTML = `<div class="timer-bar"></div><span></span>`;
  const bar = readyDiv.querySelector('.timer-bar');
  const text = readyDiv.querySelector('span');

  myReadyTimeLeft = seconds;
  text.textContent = `Get ready: ${myReadyTimeLeft}s`;
  bar.style.width = '100%';

  myReadyTimer = setInterval(() => {
    myReadyTimeLeft--;
    text.textContent = `Get ready: ${myReadyTimeLeft}s`;
    bar.style.width = `${(myReadyTimeLeft / seconds) * 100}%`;

    if (myReadyTimeLeft <= 0) {
      clearInterval(myReadyTimer);
      myReadyTimer = null;
      readyDiv.style.display = 'none';
      socket.emit('autoStartReady', myId);
    }
  }, 1000);
}

function stopReadyTimerForMe() {
  if (myReadyTimer) {
    clearInterval(myReadyTimer);
    myReadyTimer = null;
  }
  document.getElementById('ready-timer').style.display = 'none';
}

// =====================================================
// 🕒 TURN TIMER FUNCTIONS
// =====================================================
function startTurnTimer(seconds, playerId) {
  const choosingDiv = document.getElementById('choosing-timer');
  choosingDiv.style.display = 'block';
  choosingDiv.innerHTML = `<div class="timer-bar"></div><span></span>`;
  const bar = choosingDiv.querySelector('.timer-bar');
  const text = choosingDiv.querySelector('span');

  turnTimeLeft = seconds;
  const isMyTurn = playerId === myId;
  text.textContent = `${isMyTurn ? 'Your' : "Opponent's"} turn: ${turnTimeLeft}s`;
  bar.style.width = '100%';

  if (turnTimer) clearInterval(turnTimer);

  turnTimer = setInterval(() => {
    turnTimeLeft--;
    text.textContent = `${isMyTurn ? 'Your' : "Opponent's"} turn: ${turnTimeLeft}s`;
    bar.style.width = `${(turnTimeLeft / seconds) * 100}%`;

    if (turnTimeLeft <= 0) {
      clearInterval(turnTimer);
      turnTimer = null;
      choosingDiv.style.display = 'none';
      if (isMyTurn) socket.emit('autoStand', myId);
    }
  }, 1000);
}

function stopTurnTimer() {
  if (turnTimer) {
    clearInterval(turnTimer);
    turnTimer = null;
  }
  document.getElementById('choosing-timer').style.display = 'none';
}
