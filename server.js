const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // serve index.html, style.css, client.js

// --- Game State ---
const MAX_PLAYERS = 4; // for now just one player at a time

// --- Range limits declared above ---
const MIN_CHOOSING_TIME = 5;
const MAX_CHOOSING_TIME = 120;

const MIN_READY_TIME = 3;
const MAX_READY_TIME = 30;

const MIN_QUICK_READY_TIME = 1;
const MAX_QUICK_READY_TIME = 10;

let game = createNewGame();

io.on('connection', (socket) => {
  console.log('A user connected', socket.id);

  socket.on('joinTable', (room) => {
    socket.join(room);
    // put all non-players as spectators
    if (!game.spectators.includes(socket.id) && !game.players.find(p => p.id === socket.id)) {
      game.spectators.push(socket.id);
    }
    socket.emit('gameState', game);
  });

  socket.on('requestJoinGame', (room) => {
    if (game.players.length < MAX_PLAYERS && !game.inProgress) {
      // remove from spectators
      game.spectators = game.spectators.filter(id => id !== socket.id);

      // add player
      const isHost = game.players.length === 0; // first player is host
      game.players.push({ id: socket.id, hand: [], ready: false, host: isHost });

      io.to(room).emit('gameState', game);
      socket.emit('joinedAsPlayer');
    } else {
      socket.emit('joinDenied', { reason: 'Game in progress or no seat available' });
    }
  });

  socket.on('hit', (room) => {
    const player = game.players.find(p => p.id === socket.id);
    if (player && game.inProgress) {
      player.hand.push(dealCard(false));

      if (getHandValue(player.hand) > 21) {
        player.busted = true;
        player.stand = true;
        player.result = 'Burst!';
        advanceTurn();
      }

      io.to(room).emit('gameState', game);
    }
  });

  socket.on('stand', (room) => {
    const player = game.players.find(p => p.id === socket.id);
    if (player && game.inProgress) {
      player.stand = true;
      player.result = 'Stands';
      advanceTurn();
      io.to(room).emit('gameState', game);
    }
  });

  socket.on('disconnect', () => {
    // find the player index
    const idx = game.players.findIndex(p => p.id === socket.id);
    if (idx !== -1) {
      // move their cards to discard before removing
      game.players[idx].hand.forEach(card => game.discard.push(card));
      // remove player
      game.players.splice(idx, 1);
    }

    // remove from spectators too
    game.spectators = game.spectators.filter(id => id !== socket.id);

    // if no players left, stop the game
    if (game.players.length === 0) {
      game.inProgress = false;
    } else {
      // ensure there’s still a host
      if (!game.players.find(p => p.host)) {
        game.players[0].host = true; // promote new host
      }
    }

    // broadcast updated state
    io.emit('gameState', game);
  });

  socket.on('shuffleDeck', (room) => {
    const player = game.players.find(p => p.id === socket.id);
    if (!player || !player.host) return; // only host can shuffle

    game.deck = shuffleDeck(game.deck.concat(game.discard));
    game.discard = [];
    io.to(room).emit('gameState', game);
  });

  socket.on('resetGame', (room) => {
    const player = game.players.find(p => p.id === socket.id);
    if (!player || !player.host) return;
    game = createNewGame();
    io.to(room).emit('gameState', game);
  });

  socket.on('playerReady', () => {
    const player = game.players.find(p => p.id === socket.id);
    if (player && !game.inProgress) {
      // TOGGLE instead of always true
      player.ready = !player.ready;

      io.emit('gameState', game);

      if (
        game.players.length > 0 &&
        game.players.every(p => p.ready)
      ) {
        startRound();
      }
    }
  });

  socket.on('leaveGame', () => {
    // remove player from players array
    const idx = game.players.findIndex(p => p.id === socket.id);
    if (idx !== -1) {
      // move player’s cards to discard
      game.players[idx].hand.forEach(card => game.discard.push(card));
      game.players.splice(idx, 1);
    }
    // also remove from spectators
    game.spectators = game.spectators.filter(id => id !== socket.id);

    // if no players left, stop game
    if (game.players.length === 0) {
      game = createNewGame();
    } else {
      // ensure there’s still a host
      if (!game.players.find(p => p.host)) {
        game.players[0].host = true; // promote new host
      }
      if (game.players.every(p => p.ready)) {
        startRound();
      }
    }

    io.emit('gameState', game);
  });

  socket.on('updateSetting', (data) => {
    // Only host may update settings
    const player = game.players.find(p => p.id === socket.id);
    if (!player || !player.host) return;

    console.log(data);

    // Initialize settings object if missing
    if (!game.settings) {
      console.log("Missing");
      game.settings = {
        alwaysShuffle: true,
        choosingTime: 30,
        readyTime: 10,
        quickReadyTime: 3
      };
    }

    // Apply settings safely
    if (typeof data.alwaysShuffle === 'boolean') {
      game.settings.alwaysShuffle = data.alwaysShuffle;
    }

    if (typeof data.choosingTime === 'number' &&
        data.choosingTime >= MIN_CHOOSING_TIME &&
        data.choosingTime <= MAX_CHOOSING_TIME) {
      game.settings.choosingTime = data.choosingTime;
    }

    if (typeof data.readyTime === 'number' &&
        data.readyTime >= MIN_READY_TIME &&
        data.readyTime <= MAX_READY_TIME) {
      game.settings.readyTime = data.readyTime;
    }

    if (typeof data.quickReadyTime === 'number' &&
        data.quickReadyTime >= MIN_QUICK_READY_TIME &&
        data.quickReadyTime <= MAX_QUICK_READY_TIME) {
      game.settings.quickReadyTime = data.quickReadyTime;
    }

    // console.log('Updated settings:', game.settings);

    // Broadcast new settings to all clients
    io.emit('gameState', game);
  });

  socket.on('autoStartReady', (playerId) => {
    const player = game.players.find(p => p.id === playerId);
    if (!player || game.inProgress) return;
    
    player.ready = true; // auto-ready
    io.emit('gameState', game);

    // Check if all players are ready to start the round
    if (game.players.length > 0 && game.players.every(p => p.ready)) {
      startRound();  // your existing function to start the game
    }
  });

  socket.on('autoStand', (playerId) => {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return;
    player.stand = true;
    player.result = 'Stands';
    advanceTurn();
    io.emit('gameState', game);
  });
});

function advanceTurn() {
  let next = game.currentTurn + 1;
  while (next < game.players.length) {
    const p = game.players[next];
    if (!p.stand && !p.busted) break;
    next++;
  }

  if (next >= game.players.length) {
    dealerPlay();
  } else {
    game.currentTurn = next;
  }
}

function dealerPlay() {
  game.dealer.forEach(c => c.faceDown = false);

  while (getHandValue(game.dealer) < 17) {
    game.dealer.push(dealCard(false));
  }

  game.players.forEach(p => {
    const playerVal = getHandValue(p.hand);
    const dealerVal = getHandValue(game.dealer);

    if (p.busted) p.result = 'Burst!';
    else if (dealerVal > 21) p.result = 'Dealer busts — Player wins!';
    else if (playerVal > dealerVal) p.result = 'Player wins!';
    else if (playerVal < dealerVal) p.result = 'Dealer wins!';
    else p.result = 'Push!';
  });

  game.inProgress = false;
  io.emit('gameState', game);
}

function createNewGame() {
  return {
    deck: shuffleDeck(createDeck()),
    discard: [],
    players: [],
    dealer: [],
    spectators: [],
    inProgress: false,
    result: null,
    currentTurn: 0,
    settings: { 
      alwaysShuffle: true,
      choosingTime: 30,
      readyTime: 10,
      quickReadyTime: 3        
    }
  };
}

function createDeck() {
  const suits = ['spades', 'hearts', 'clubs', 'diamonds'];
  const values = ['2','3','4','5','6','7','8','9','10','jack','queen','king','ace'];
  const deck = [];
  suits.forEach(suit => {
    values.forEach(value => {
      // build filename like '9_of_spades.svg', 'ace_of_hearts.svg'
      const filename = `${value}_of_${suit}.svg`;
      deck.push({ filename, faceDown: false });
    });
  });
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getHandValue(hand) {
  let value = 0;
  let aces = 0;

  hand.forEach(card => {
    // strip .svg then get rank
    let name = card.filename.split('_of_')[0]; // e.g. '9' or 'ace'
    if (name === 'jack' || name === 'queen' || name === 'king') {
      value += 10;
    } else if (name === 'ace') {
      aces += 1;
      value += 11; // count ace as 11 first
    } else {
      value += parseInt(name);
    }
  });

  // adjust for aces if bust
  while (value > 21 && aces > 0) {
    value -= 10; // convert an ace from 11 to 1
    aces -= 1;
  }

  return value;
}

function startRound() {
  // move old cards to discard
  game.players.forEach(p => {
    if (p.hand) p.hand.forEach(card => game.discard.push(card));
    p.hand = [];
    p.stand = false;
    p.busted = false;
    p.result = null;
    p.ready = false; // reset ready
  });
  game.dealer.forEach(card => game.discard.push(card));
  game.dealer = [];

  game.result = null;
  game.inProgress = true;
  game.currentTurn = 0;

  // auto-shuffle if host enabled setting
  if (game.settings.alwaysShuffle) {
    game.deck = shuffleDeck(game.deck.concat(game.discard));
    game.discard = [];
  }

  if (game.deck.length < (game.players.length * 2 + 2)) {
    game.result = 'No cards left in deck. Please shuffle.';
    game.inProgress = false;
    return;
  }

  // deal to each player
  game.players.forEach(p => p.hand.push(dealCard(false)));
  game.dealer.push(dealCard(false));
  game.players.forEach(p => p.hand.push(dealCard(false)));
  game.dealer.push(dealCard(true));

  const dealerHasBlackjack = getHandValue(game.dealer) === 21 && game.dealer.length === 2;
  if (dealerHasBlackjack) {
    game.dealer.forEach(c => c.faceDown = false);
    game.players.forEach(p => {
      if (getHandValue(p.hand) === 21 && p.hand.length === 2) {
        p.result = 'Push!'; // tie
      } else {
        p.result = 'Dealer Blackjack wins';
      }
      p.stand = true;
    });
    game.inProgress = false; // round ends immediately
  } else {
    // Check for player blackjack individually
    game.players.forEach((p, idx) => {
      if (getHandValue(p.hand) === 21 && p.hand.length === 2) {
        p.stand = true;
        p.result = 'Blackjack!';
        // Move turn to next player if it's this player's turn
        if (game.currentTurn === idx) {
          advanceTurn();
        }
      }
    });
  }
  io.emit('gameState', game);
}

function dealCard(faceDown) {
  if (game.deck.length === 0) {
    return { filename: 'no_card.svg', faceDown: false };
  }
  const card = game.deck.pop();
  return { filename: card.filename, faceDown };
}

function endRound() {

  game.inProgress = false;
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
