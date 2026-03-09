const canvas = document.getElementById("game");
const context = canvas.getContext("2d");
const connectionPill = document.getElementById("connection-pill");
const playerCountText = document.getElementById("player-count");
const areaNameText = document.getElementById("area-name");
const foodCountText = document.getElementById("food-count");
const giftCountText = document.getElementById("gift-count");
const scoreCountText = document.getElementById("score-count");
const deathsCountText = document.getElementById("deaths-count");
const moodText = document.getElementById("mood-text");
const catNameForm = document.getElementById("cat-name-form");
const catNameInput = document.getElementById("cat-name-input");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatLog = document.getElementById("chat-log");
const chatHint = document.getElementById("chat-hint");
const musicToggle = document.getElementById("music-toggle");

const storedName = window.localStorage.getItem("cat-world-name") ?? "Captain Whiskers";
const view = {
  scale: 0.82
};

const input = {
  left: false,
  right: false,
  jump: false
};

const localPlayer = {
  id: null,
  x: 140,
  y: 150,
  vx: 0,
  vy: 0,
  width: 56,
  height: 42,
  facing: 1,
  grounded: false,
  sleeping: false,
  meowing: false,
  meowUntil: 0,
  bubbleText: "",
  bubbleUntil: 0,
  name: storedName,
  treatsEaten: 0,
  giftsCollected: 0,
  score: 0,
  deaths: 0,
  areaName: "Cozy Cat Room",
  style: {
    coat: "#f2a65a",
    stripe: "#8a4f20",
    scarf: "#2f6fda"
  }
};

const world = {
  width: 1400,
  height: 720,
  spawn: { x: 120, y: 470 },
  hazards: {
    lava: {
      startX: Number.POSITIVE_INFINITY,
      surfaceY: Number.POSITIVE_INFINITY
    }
  },
  zones: [],
  platforms: [],
  collectibles: [],
  players: [],
  chatMessages: []
};

const camera = {
  x: 0
};

const pendingCollectIds = new Set();
let pendingDeath = false;
let audioContext = null;
let audioUnlocked = false;
let lastFrame = performance.now();
let lastSentAt = 0;
let lastPolledAt = 0;
let previousPlayerStates = new Map();
let pendingSleepSyncUntil = 0;
let pendingMeowSyncUntil = 0;

const meowVoices = Array.from({ length: 4 }, () => {
  const audio = new Audio("/audio/cat-mew.wav");
  audio.preload = "auto";
  return audio;
});

for (const audio of meowVoices) {
  audio.load();
}

const backgroundMusic = new Audio("/audio/bgm-retro-calm.mp3");
backgroundMusic.loop = true;
backgroundMusic.preload = "auto";
backgroundMusic.volume = 0.16;
backgroundMusic.load();

function musicEnabledState() {
  return window.localStorage.getItem("cat-world-music") !== "off";
}

function setStatus(text) {
  connectionPill.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function getViewportWidth() {
  return canvas.width / view.scale;
}

function updateHud() {
  areaNameText.textContent = localPlayer.areaName;
  foodCountText.textContent = String(localPlayer.treatsEaten);
  giftCountText.textContent = String(localPlayer.giftsCollected);
  scoreCountText.textContent = String(localPlayer.score);
  deathsCountText.textContent = String(localPlayer.deaths);
  moodText.textContent = localPlayer.sleeping ? "Sleeping" : "Awake";
  chatHint.textContent = `You are ${localPlayer.name}`;
  musicToggle.textContent = `Music: ${musicEnabledState() ? "On" : "Off"}`;
}

function renderChatMessages() {
  chatLog.textContent = "";

  if (world.chatMessages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent = "No messages yet. Break the silence.";
    chatLog.append(empty);
    return;
  }

  for (const message of world.chatMessages) {
    const row = document.createElement("div");
    row.className = "chat-message";

    const name = document.createElement("strong");
    name.textContent = `${message.playerName}: `;

    const text = document.createElement("span");
    text.textContent = message.text;

    row.append(name, text);
    chatLog.append(row);
  }

  chatLog.scrollTop = chatLog.scrollHeight;
}

function normalizeName(rawName) {
  const normalized = rawName.replace(/\s+/g, " ").trim().slice(0, 18);
  return normalized || "Captain Whiskers";
}

function isTypingField(target) {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
}

function getCollectibleBounds(collectible) {
  return {
    x: collectible.x - 16,
    y: collectible.y - 16,
    width: 32,
    height: 32
  };
}

function ensureAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return null;
  }

  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtor();
  }

  return audioContext;
}

async function playMeowSound(volume = 0.04, pitch = 1) {
  if (audioUnlocked) {
    const freeVoice = meowVoices.find((audio) => audio.paused || audio.ended);
    const voice = freeVoice ?? new Audio("/audio/cat-mew.wav");
    voice.volume = Math.min(1, Math.max(0.05, volume * 10));
    voice.playbackRate = pitch;
    voice.currentTime = 0;

    try {
      await voice.play();
      return;
    } catch {
      // Fall back to synthesized audio below.
    }
  }

  const audio = ensureAudioContext();
  if (!audio) {
    return;
  }

  if (audio.state === "suspended") {
    try {
      await audio.resume();
    } catch {
      return;
    }
  }

  const now = audio.currentTime;
  const mainGain = audio.createGain();
  mainGain.gain.setValueAtTime(0.0001, now);
  mainGain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
  mainGain.connect(audio.destination);

  const primary = audio.createOscillator();
  primary.type = "triangle";
  primary.frequency.setValueAtTime(780 * pitch, now);
  primary.frequency.exponentialRampToValueAtTime(520 * pitch, now + 0.16);

  const secondary = audio.createOscillator();
  secondary.type = "sine";
  secondary.frequency.setValueAtTime(1120 * pitch, now + 0.06);
  secondary.frequency.exponentialRampToValueAtTime(690 * pitch, now + 0.30);

  const secondaryGain = audio.createGain();
  secondaryGain.gain.value = 0.36;

  primary.connect(mainGain);
  secondary.connect(secondaryGain);
  secondaryGain.connect(mainGain);

  primary.start(now);
  secondary.start(now);
  primary.stop(now + 0.36);
  secondary.stop(now + 0.30);
}

async function unlockAudioAndMaybeStartMusic() {
  audioUnlocked = true;

  const audio = ensureAudioContext();
  if (audio && audio.state === "suspended") {
    try {
      await audio.resume();
    } catch {
      // Ignore and continue with HTML audio.
    }
  }

  if (musicEnabledState() && backgroundMusic.paused) {
    try {
      await backgroundMusic.play();
    } catch {
      // Some browsers may still block until another interaction.
    }
  }

  updateHud();
}

function detectCollectibles() {
  const playerBounds = {
    x: localPlayer.x,
    y: localPlayer.y,
    width: localPlayer.width,
    height: localPlayer.height
  };

  for (const collectible of world.collectibles) {
    if (!collectible.active) {
      continue;
    }

    if (rectsOverlap(playerBounds, getCollectibleBounds(collectible))) {
      pendingCollectIds.add(collectible.id);
      collectible.active = false;
    }
  }
}

function triggerBubble(text, durationMs) {
  localPlayer.bubbleText = text;
  localPlayer.bubbleUntil = performance.now() + durationMs;
}

function markSleepPending(durationMs = 700) {
  pendingSleepSyncUntil = performance.now() + durationMs;
}

function markMeowPending(durationMs = 700) {
  pendingMeowSyncUntil = performance.now() + durationMs;
}

function respawnFromLava() {
  localPlayer.x = world.spawn.x;
  localPlayer.y = world.spawn.y;
  localPlayer.vx = 0;
  localPlayer.vy = 0;
  localPlayer.grounded = false;
  localPlayer.sleeping = false;
  markSleepPending();
  localPlayer.deaths += 1;
  pendingDeath = true;
  triggerBubble("Ouch!", 1800);
  updateHud();
}

function applyPhysics(delta) {
  const runSpeed = 360;
  const gravity = 1750;
  const jumpVelocity = -760;

  if (localPlayer.sleeping && (input.left || input.right || input.jump)) {
    localPlayer.sleeping = false;
    markSleepPending();
  }

  if (localPlayer.sleeping) {
    localPlayer.vx *= 0.8;
    if (Math.abs(localPlayer.vx) < 5) {
      localPlayer.vx = 0;
    }
  } else if (input.left === input.right) {
    localPlayer.vx *= 0.84;
    if (Math.abs(localPlayer.vx) < 5) {
      localPlayer.vx = 0;
    }
  } else if (input.left) {
    localPlayer.vx = -runSpeed;
    localPlayer.facing = -1;
  } else if (input.right) {
    localPlayer.vx = runSpeed;
    localPlayer.facing = 1;
  }

  if (!localPlayer.sleeping && input.jump && localPlayer.grounded) {
    localPlayer.vy = jumpVelocity;
    localPlayer.grounded = false;
  }

  localPlayer.vy += gravity * delta;

  localPlayer.x += localPlayer.vx * delta;
  localPlayer.y += localPlayer.vy * delta;
  localPlayer.x = clamp(localPlayer.x, 0, Math.max(0, world.width - localPlayer.width));

  const bounds = {
    x: localPlayer.x,
    y: localPlayer.y,
    width: localPlayer.width,
    height: localPlayer.height
  };

  localPlayer.grounded = false;

  for (const platform of world.platforms) {
    const hitbox = {
      x: platform.x,
      y: platform.y,
      width: platform.width,
      height: platform.height
    };

    if (!rectsOverlap(bounds, hitbox)) {
      continue;
    }

    const previousBottom = localPlayer.y - localPlayer.vy * delta + localPlayer.height;

    if (previousBottom <= platform.y + 8 && localPlayer.vy >= 0) {
      localPlayer.y = platform.y - localPlayer.height;
      localPlayer.vy = 0;
      localPlayer.grounded = true;
      bounds.y = localPlayer.y;
    }
  }

  const inLavaZone = localPlayer.x + localPlayer.width > world.hazards.lava.startX;
  const hitLava = inLavaZone && localPlayer.y + localPlayer.height >= world.hazards.lava.surfaceY;

  if (hitLava) {
    respawnFromLava();
  } else if (localPlayer.y > world.height + 20) {
    localPlayer.x = world.spawn.x;
    localPlayer.y = world.spawn.y;
    localPlayer.vx = 0;
    localPlayer.vy = 0;
  }

  localPlayer.meowing = performance.now() < localPlayer.meowUntil;
  camera.x = clamp(
    localPlayer.x - getViewportWidth() * 0.4,
    0,
    Math.max(0, world.width - getViewportWidth())
  );
}

function drawRoomBackground() {
  const roomWidth = 1540;
  context.fillStyle = "#f4d2b6";
  context.fillRect(0, 0, roomWidth, canvas.height);

  context.fillStyle = "#ffefda";
  context.fillRect(70, 80, 260, 180);
  context.strokeStyle = "#b87443";
  context.lineWidth = 14;
  context.strokeRect(70, 80, 260, 180);
  context.beginPath();
  context.moveTo(200, 80);
  context.lineTo(200, 260);
  context.moveTo(70, 170);
  context.lineTo(330, 170);
  context.stroke();

  context.fillStyle = "#b66b57";
  context.fillRect(1040, 490, 240, 70);
  context.fillStyle = "#d98d78";
  context.fillRect(1065, 455, 190, 50);

  context.fillStyle = "#f2b863";
  context.beginPath();
  context.arc(1600, 160, 64, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#7a4f39";
  context.fillRect(1460, 230, 140, 330);
  context.fillStyle = "#ffe9a9";
  context.fillRect(1492, 270, 76, 180);
}

function drawGardenBackground() {
  const gardenX = 1540;
  const gardenWidth = 1740;
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#d3f4ff");
  sky.addColorStop(1, "#f0ffe3");
  context.fillStyle = sky;
  context.fillRect(gardenX, 0, gardenWidth, canvas.height);

  context.fillStyle = "#8ed081";
  context.fillRect(gardenX, 515, gardenWidth, 205);
  context.fillStyle = "#6fb063";
  for (let i = 0; i < 19; i += 1) {
    context.fillRect(gardenX + 20 + i * 90, 525 + (i % 2) * 6, 50, 40);
  }

  for (let i = 0; i < 6; i += 1) {
    const trunkX = gardenX + 180 + i * 250;
    context.fillStyle = "#785336";
    context.fillRect(trunkX, 400, 30, 125);
    context.fillStyle = i % 2 === 0 ? "#6cc57b" : "#85d58d";
    context.beginPath();
    context.arc(trunkX + 15, 370, 55, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "#7fc0e6";
  context.beginPath();
  context.ellipse(gardenX + 760, 560, 150, 42, 0, 0, Math.PI * 2);
  context.fill();
}

function drawLavaBackground() {
  const lavaX = world.hazards.lava.startX;
  const lavaWidth = world.width - lavaX;
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#3b2a42");
  sky.addColorStop(1, "#130d14");
  context.fillStyle = sky;
  context.fillRect(lavaX, 0, lavaWidth, canvas.height);

  for (let i = 0; i < 10; i += 1) {
    const peakX = lavaX + i * 150;
    context.fillStyle = i % 2 === 0 ? "#4f3c52" : "#2b212d";
    context.beginPath();
    context.moveTo(peakX, 500);
    context.lineTo(peakX + 90, 200 + (i % 3) * 40);
    context.lineTo(peakX + 180, 500);
    context.closePath();
    context.fill();
  }

  context.fillStyle = "#ff6b35";
  context.fillRect(lavaX, world.hazards.lava.surfaceY, lavaWidth, canvas.height - world.hazards.lava.surfaceY);
  context.fillStyle = "#ffd166";
  for (let i = 0; i < 11; i += 1) {
    context.beginPath();
    context.ellipse(lavaX + 40 + i * 130, world.hazards.lava.surfaceY + 22, 38, 10, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function drawDoorThreshold() {
  context.fillStyle = "rgba(255, 239, 174, 0.45)";
  context.fillRect(1540, 0, 220, canvas.height);
}

function drawPlatform(platform) {
  const theme = {
    room: ["#c96f4d", "#e5b07a"],
    doorway: ["#d9a24f", "#f3d28b"],
    garden: ["#5aa468", "#9ad98f"],
    "lava-rock": ["#51404e", "#8b7487"]
  }[platform.theme] || ["#c96f4d", "#e5b07a"];

  context.fillStyle = theme[0];
  context.fillRect(platform.x, platform.y, platform.width, platform.height);
  context.fillStyle = theme[1];
  context.fillRect(platform.x, platform.y, platform.width, 8);
}

function drawCollectible(collectible) {
  if (!collectible.active) {
    return;
  }

  const x = collectible.x;
  const y = collectible.y;

  if (collectible.kind === "fish") {
    context.fillStyle = "#ffd166";
    context.beginPath();
    context.ellipse(x, y, 16, 10, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#fca311";
    context.beginPath();
    context.moveTo(x + 14, y);
    context.lineTo(x + 24, y - 8);
    context.lineTo(x + 24, y + 8);
    context.closePath();
    context.fill();
  } else {
    context.fillStyle = "#ff6b6b";
    context.fillRect(x - 14, y - 14, 28, 28);
    context.fillStyle = "#ffd166";
    context.fillRect(x - 3, y - 14, 6, 28);
    context.fillRect(x - 14, y - 3, 28, 6);
  }

  context.fillStyle = "rgba(255,255,255,0.8)";
  context.beginPath();
  context.arc(x + 10, y - 12, 3, 0, Math.PI * 2);
  context.fill();
}

function getVisibleBubbleText(player) {
  if (player.meowing) {
    return "MEW!";
  }

  if (player.bubbleText) {
    return player.bubbleText.length > 24 ? `${player.bubbleText.slice(0, 21)}...` : player.bubbleText;
  }

  if (player.sleeping) {
    return "Zzz";
  }

  return "";
}

function drawSpeechBubble(x, y, text) {
  context.save();
  context.font = "bold 16px Trebuchet MS";
  const width = Math.max(84, context.measureText(text).width + 28);
  const height = 32;
  context.fillStyle = "rgba(255, 251, 245, 0.94)";
  context.strokeStyle = "#513726";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x - width / 2, y - height / 2, width, height, 14);
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(x - 10, y + height / 2 - 2);
  context.lineTo(x, y + height / 2 + 12);
  context.lineTo(x + 6, y + height / 2 - 2);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#513726";
  context.textAlign = "center";
  context.fillText(text, x, y + 5);
  context.restore();
}

function drawCat(player, isLocal) {
  const x = player.x;
  const y = player.y;
  const headOffsetY = player.sleeping ? -8 : -12;

  context.save();
  context.translate(x + player.width / 2, y + player.height / 2 + (player.sleeping ? 8 : 0));
  context.scale(player.facing, 1);

  context.fillStyle = "rgba(58, 34, 22, 0.18)";
  context.beginPath();
  context.ellipse(0, 24, 26, 9, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = player.style.coat;
  context.fillRect(-24, 2, 44, player.sleeping ? 16 : 24);
  context.fillRect(-20, 12, 10, player.sleeping ? 10 : 18);
  context.fillRect(2, 12, 10, player.sleeping ? 10 : 18);

  context.beginPath();
  context.arc(0, headOffsetY, 18, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.moveTo(-10, headOffsetY - 12);
  context.lineTo(-2, headOffsetY - 28);
  context.lineTo(3, headOffsetY - 10);
  context.fill();

  context.beginPath();
  context.moveTo(10, headOffsetY - 12);
  context.lineTo(18, headOffsetY - 28);
  context.lineTo(16, headOffsetY - 10);
  context.fill();

  context.fillStyle = player.style.stripe;
  context.fillRect(-18, 6, 12, 4);
  context.fillRect(-2, 6, 12, 4);
  context.fillRect(-4, 18, 16, 4);

  context.fillStyle = player.style.scarf;
  context.fillRect(-18, headOffsetY + 11, 28, 6);

  if (player.sleeping) {
    context.strokeStyle = "#2c1f1d";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-9, headOffsetY - 4);
    context.lineTo(-3, headOffsetY - 2);
    context.moveTo(4, headOffsetY - 2);
    context.lineTo(10, headOffsetY - 4);
    context.stroke();
  } else {
    context.fillStyle = "#2c1f1d";
    context.fillRect(-7, headOffsetY - 4, 4, 4);
    context.fillRect(5, headOffsetY - 4, 4, 4);
  }

  context.strokeStyle = "#2c1f1d";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(18, 4);
  context.quadraticCurveTo(36, -16, 42, 12);
  context.stroke();

  if (isLocal) {
    context.strokeStyle = "rgba(255,255,255,0.9)";
    context.lineWidth = 2;
    context.strokeRect(-30, -42, 60, 82);
  }

  context.restore();

  context.fillStyle = "rgba(40, 23, 17, 0.88)";
  context.font = "bold 14px Trebuchet MS";
  context.textAlign = "center";
  context.fillText(player.name ?? "Cat", x + player.width / 2, y - 16);

  const bubble = getVisibleBubbleText(player);
  if (bubble) {
    drawSpeechBubble(x + player.width / 2, y - 48, bubble);
  }
}

function drawHud() {
  context.fillStyle = "rgba(36, 24, 19, 0.58)";
  context.fillRect(20, 20, 430, 92);
  context.fillStyle = "#fff7f0";
  context.font = "bold 22px Trebuchet MS";
  context.textAlign = "left";
  context.fillText(localPlayer.areaName, 34, 52);
  context.font = "16px Trebuchet MS";
  context.fillStyle = "rgba(255, 247, 240, 0.86)";
  context.fillText("Press Z to sleep. Cross the garden to reach the lava leap.", 34, 82);
}

function drawWorld() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(view.scale, view.scale);
  context.translate(-camera.x, 0);

  drawRoomBackground();
  drawDoorThreshold();
  drawGardenBackground();
  drawLavaBackground();

  for (const collectible of world.collectibles) {
    drawCollectible(collectible);
  }

  for (const platform of world.platforms) {
    drawPlatform(platform);
  }

  for (const player of world.players) {
    if (player.id === localPlayer.id) {
      continue;
    }

    drawCat(
      {
        ...player,
        width: 56,
        height: 42
      },
      false
    );
  }

  drawCat(
    {
      ...localPlayer,
      bubbleText: performance.now() < localPlayer.bubbleUntil ? localPlayer.bubbleText : "",
      width: 56,
      height: 42
    },
    true
  );

  context.restore();
  drawHud();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function reconcileRemoteAudio(nextPlayers) {
  const nextMap = new Map(nextPlayers.map((player) => [player.id, player]));

  for (const player of nextPlayers) {
    if (player.id === localPlayer.id) {
      continue;
    }

    const previous = previousPlayerStates.get(player.id);
    if (player.meowing && !previous?.meowing) {
      const pitch = 0.85 + (player.id.charCodeAt(0) % 4) * 0.08;
      void playMeowSound(0.024, pitch);
    }
  }

  previousPlayerStates = nextMap;
}

function applyWorldState(nextWorld) {
  world.width = nextWorld.config.width;
  world.height = nextWorld.config.height;
  world.spawn = nextWorld.config.spawn;
  world.hazards = nextWorld.config.hazards;
  world.zones = nextWorld.config.zones;
  world.platforms = nextWorld.platforms;
  world.collectibles = nextWorld.collectibles;
  world.players = nextWorld.players;
  world.chatMessages = nextWorld.chatMessages ?? [];

  reconcileRemoteAudio(world.players);

  const me = world.players.find((player) => player.id === localPlayer.id);
  if (me) {
    const now = performance.now();
    localPlayer.name = me.name;
    localPlayer.treatsEaten = me.treatsEaten;
    localPlayer.giftsCollected = me.giftsCollected;
    localPlayer.score = me.score;
    localPlayer.deaths = me.deaths;
    localPlayer.areaName = me.areaName;

    if (now >= pendingSleepSyncUntil || me.sleeping === localPlayer.sleeping) {
      localPlayer.sleeping = me.sleeping;
      if (me.sleeping === localPlayer.sleeping) {
        pendingSleepSyncUntil = 0;
      }
    }

    if (me.meowing) {
      localPlayer.meowing = true;
      pendingMeowSyncUntil = 0;
    } else if (now >= pendingMeowSyncUntil && now >= localPlayer.meowUntil) {
      localPlayer.meowing = false;
    }

    if (me.meowing) {
      localPlayer.meowUntil = Math.max(localPlayer.meowUntil, now + 350);
    }
    if (me.bubbleText) {
      localPlayer.bubbleText = me.bubbleText;
      localPlayer.bubbleUntil = now + 450;
    }
    catNameInput.value = me.name;
  }

  playerCountText.textContent = `${world.players.length} cats online`;
  updateHud();
  renderChatMessages();
}

async function joinWorld() {
  const response = await postJson("/api/join", { name: localPlayer.name });
  localPlayer.id = response.playerId;
  localPlayer.x = response.player.x;
  localPlayer.y = response.player.y;
  localPlayer.name = response.player.name;
  localPlayer.style = response.player.style;
  applyWorldState(response.world);
  previousPlayerStates = new Map(response.world.players.map((player) => [player.id, player]));
  setStatus("Connected");
}

async function syncState(forceMeow = false) {
  if (!localPlayer.id) {
    return;
  }

  const collectIds = Array.from(pendingCollectIds);
  const died = pendingDeath;
  pendingCollectIds.clear();
  pendingDeath = false;

  try {
    const response = await postJson("/api/input", {
      playerId: localPlayer.id,
      x: localPlayer.x,
      y: localPlayer.y,
      vx: localPlayer.vx,
      vy: localPlayer.vy,
      facing: localPlayer.facing,
      name: localPlayer.name,
      sleeping: localPlayer.sleeping,
      meow: forceMeow,
      died,
      collectIds
    });

    if (response.player) {
      const now = performance.now();
      localPlayer.name = response.player.name;
      localPlayer.treatsEaten = response.player.treatsEaten;
      localPlayer.giftsCollected = response.player.giftsCollected;
      localPlayer.score = response.player.score;
      localPlayer.deaths = response.player.deaths;
      localPlayer.areaName = response.player.areaName;
      localPlayer.sleeping = response.player.sleeping;
      pendingSleepSyncUntil = 0;
      localPlayer.meowing = response.player.meowing || now < localPlayer.meowUntil;
      if (response.player.meowing) {
        pendingMeowSyncUntil = 0;
      }
      if (response.player.meowing) {
        localPlayer.meowUntil = Math.max(localPlayer.meowUntil, now + 450);
      }
      if (response.player.bubbleText) {
        localPlayer.bubbleText = response.player.bubbleText;
        localPlayer.bubbleUntil = now + 500;
      }
      updateHud();
    }
  } catch (error) {
    for (const collectId of collectIds) {
      pendingCollectIds.add(collectId);
    }

    if (died) {
      pendingDeath = true;
    }

    throw error;
  }
}

async function pollState() {
  if (!localPlayer.id) {
    return;
  }

  const response = await fetch("/api/state", { cache: "no-store" });
  const data = await response.json();
  applyWorldState(data.world);
}

async function saveCatName(nextName) {
  const normalized = normalizeName(nextName);
  localPlayer.name = normalized;
  window.localStorage.setItem("cat-world-name", normalized);
  catNameInput.value = normalized;
  updateHud();

  if (!localPlayer.id) {
    return;
  }

  await syncState(false);
}

async function sendChatMessage(rawMessage) {
  const message = rawMessage.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!message || !localPlayer.id) {
    return;
  }

  localPlayer.sleeping = false;
  triggerBubble(message, 5200);

  const response = await postJson("/api/chat", {
    playerId: localPlayer.id,
    name: localPlayer.name,
    message
  });

  if (response.player) {
    localPlayer.name = response.player.name;
    localPlayer.sleeping = response.player.sleeping;
    if (response.player.bubbleText) {
      localPlayer.bubbleText = response.player.bubbleText;
      localPlayer.bubbleUntil = performance.now() + 5200;
    }
    updateHud();
  }

  if (response.chatMessages) {
    world.chatMessages = response.chatMessages;
    renderChatMessages();
  }
}

function toggleSleep() {
  if (!localPlayer.grounded) {
    return;
  }

  localPlayer.sleeping = !localPlayer.sleeping;
  markSleepPending();
  if (localPlayer.sleeping) {
    localPlayer.vx = 0;
  }
  updateHud();
  syncState(false).catch(() => {
    setStatus("Sleep Sync Failed");
  });
}

function onKeyChange(event, pressed) {
  if (isTypingField(event.target)) {
    return;
  }

  if (["ArrowLeft", "a", "A"].includes(event.key)) {
    input.left = pressed;
  }

  if (["ArrowRight", "d", "D"].includes(event.key)) {
    input.right = pressed;
  }

  if (["ArrowUp", "w", "W", " "].includes(event.key)) {
    input.jump = pressed;
    event.preventDefault();
  }

  if (pressed && ["z", "Z"].includes(event.key)) {
    toggleSleep();
  }

  if (pressed && ["m", "M"].includes(event.key)) {
    localPlayer.sleeping = false;
    markSleepPending();
    localPlayer.meowing = true;
    localPlayer.meowUntil = performance.now() + 1600;
    markMeowPending(900);
    void playMeowSound(0.045, 1);
    syncState(true).catch(() => {
      setStatus("Connection Lost");
    });
  }
}

function frame(now) {
  const delta = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;

  applyPhysics(delta);
  detectCollectibles();
  drawWorld();

  if (now - lastSentAt > 90) {
    lastSentAt = now;
    syncState(false).catch(() => {
      setStatus("Reconnecting...");
    });
  }

  if (now - lastPolledAt > 120) {
    lastPolledAt = now;
    pollState().catch(() => {
      setStatus("Reconnecting...");
    });
  }

  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => onKeyChange(event, true));
window.addEventListener("keyup", (event) => onKeyChange(event, false));
window.addEventListener("pointerdown", () => {
  void unlockAudioAndMaybeStartMusic();
}, { once: true });
window.addEventListener("keydown", () => {
  if (!audioUnlocked) {
    void unlockAudioAndMaybeStartMusic();
  }
}, { once: true });

musicToggle.addEventListener("click", () => {
  if (musicEnabledState()) {
    window.localStorage.setItem("cat-world-music", "off");
    backgroundMusic.pause();
  } else {
    window.localStorage.setItem("cat-world-music", "on");
    void unlockAudioAndMaybeStartMusic();
  }
  updateHud();
});

catNameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCatName(catNameInput.value).catch(() => {
    setStatus("Name Save Failed");
  });
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendChatMessage(chatInput.value)
    .then(() => {
      chatInput.value = "";
    })
    .catch(() => {
      setStatus("Chat Failed");
    });
});

window.addEventListener("beforeunload", () => {
  if (localPlayer.id) {
    navigator.sendBeacon(
      "/api/leave",
      new Blob([JSON.stringify({ playerId: localPlayer.id })], { type: "application/json" })
    );
  }
});

joinWorld()
  .catch(() => {
    setStatus("Server Offline");
  })
  .finally(() => {
    catNameInput.value = localPlayer.name;
    updateHud();
    renderChatMessages();
    requestAnimationFrame(frame);
  });
