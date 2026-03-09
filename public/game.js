const canvas = document.getElementById("game");
const context = canvas.getContext("2d");
const connectionPill = document.getElementById("connection-pill");
const playerCountText = document.getElementById("player-count");
const areaNameText = document.getElementById("area-name");
const foodCountText = document.getElementById("food-count");
const giftCountText = document.getElementById("gift-count");
const scoreCountText = document.getElementById("score-count");
const catNameForm = document.getElementById("cat-name-form");
const catNameInput = document.getElementById("cat-name-input");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatLog = document.getElementById("chat-log");
const chatHint = document.getElementById("chat-hint");

const storedName = window.localStorage.getItem("cat-world-name") ?? "Captain Whiskers";

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
  meowTimer: 0,
  name: storedName,
  treatsEaten: 0,
  giftsCollected: 0,
  score: 0,
  areaName: "Cozy Cat Room",
  style: {
    coat: "#f2a65a",
    stripe: "#8a4f20",
    scarf: "#2f6fda"
  }
};

const world = {
  width: 1400,
  height: 680,
  spawn: { x: 120, y: 470 },
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
let lastFrame = performance.now();
let lastSentAt = 0;
let lastPolledAt = 0;

function setStatus(text) {
  connectionPill.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function updateHud() {
  areaNameText.textContent = localPlayer.areaName;
  foodCountText.textContent = String(localPlayer.treatsEaten);
  giftCountText.textContent = String(localPlayer.giftsCollected);
  scoreCountText.textContent = String(localPlayer.score);
  chatHint.textContent = `You are ${localPlayer.name}`;
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

function applyPhysics(delta) {
  const runSpeed = 360;
  const gravity = 1750;
  const jumpVelocity = -760;

  if (input.left === input.right) {
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

  if (input.jump && localPlayer.grounded) {
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

  if (localPlayer.y > world.height + 20) {
    localPlayer.x = world.spawn.x;
    localPlayer.y = world.spawn.y;
    localPlayer.vx = 0;
    localPlayer.vy = 0;
  }

  localPlayer.meowTimer = Math.max(0, localPlayer.meowTimer - delta * 1000);
  camera.x = clamp(localPlayer.x - canvas.width * 0.4, 0, Math.max(0, world.width - canvas.width));
}

function toScreenX(worldX) {
  return worldX - camera.x;
}

function drawRoomBackground() {
  const roomWidth = 1540;
  const x = toScreenX(0);
  context.fillStyle = "#f4d2b6";
  context.fillRect(x, 0, roomWidth, canvas.height);

  context.fillStyle = "#ffefda";
  context.fillRect(x + 70, 80, 260, 180);
  context.strokeStyle = "#b87443";
  context.lineWidth = 14;
  context.strokeRect(x + 70, 80, 260, 180);
  context.beginPath();
  context.moveTo(x + 200, 80);
  context.lineTo(x + 200, 260);
  context.moveTo(x + 70, 170);
  context.lineTo(x + 330, 170);
  context.stroke();

  context.fillStyle = "#b66b57";
  context.fillRect(x + 1040, 490, 240, 70);
  context.fillStyle = "#d98d78";
  context.fillRect(x + 1065, 455, 190, 50);

  context.fillStyle = "#f2b863";
  context.beginPath();
  context.arc(x + 1600, 160, 64, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#7a4f39";
  context.fillRect(x + 1460, 230, 140, 330);
  context.fillStyle = "#ffe9a9";
  context.fillRect(x + 1492, 270, 76, 180);
}

function drawGardenBackground() {
  const gardenX = toScreenX(1540);
  const gardenWidth = 1660;
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#d3f4ff");
  sky.addColorStop(1, "#f0ffe3");
  context.fillStyle = sky;
  context.fillRect(gardenX, 0, gardenWidth, canvas.height);

  context.fillStyle = "#8ed081";
  context.fillRect(gardenX, 515, gardenWidth, 165);
  context.fillStyle = "#6fb063";
  for (let i = 0; i < 18; i += 1) {
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

function drawDoorThreshold() {
  const x = toScreenX(1540);
  context.fillStyle = "rgba(255, 239, 174, 0.45)";
  context.fillRect(x, 0, 220, canvas.height);
}

function drawPlatform(platform) {
  const theme = {
    room: ["#c96f4d", "#e5b07a"],
    doorway: ["#d9a24f", "#f3d28b"],
    garden: ["#5aa468", "#9ad98f"]
  }[platform.theme] || ["#c96f4d", "#e5b07a"];

  context.fillStyle = theme[0];
  context.fillRect(toScreenX(platform.x), platform.y, platform.width, platform.height);
  context.fillStyle = theme[1];
  context.fillRect(toScreenX(platform.x), platform.y, platform.width, 8);
}

function drawCollectible(collectible) {
  if (!collectible.active) {
    return;
  }

  const x = toScreenX(collectible.x);
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

function drawCat(player, isLocal) {
  const x = toScreenX(player.x);
  const y = player.y;

  context.save();
  context.translate(x + player.width / 2, y + player.height / 2);
  context.scale(player.facing, 1);

  context.fillStyle = "rgba(58, 34, 22, 0.18)";
  context.beginPath();
  context.ellipse(0, 24, 26, 9, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = player.style.coat;
  context.fillRect(-24, -4, 44, 24);
  context.fillRect(-20, 12, 10, 18);
  context.fillRect(2, 12, 10, 18);

  context.beginPath();
  context.arc(0, -12, 18, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.moveTo(-10, -24);
  context.lineTo(-2, -40);
  context.lineTo(3, -22);
  context.fill();

  context.beginPath();
  context.moveTo(10, -24);
  context.lineTo(18, -40);
  context.lineTo(16, -22);
  context.fill();

  context.fillStyle = player.style.stripe;
  context.fillRect(-18, 0, 12, 4);
  context.fillRect(-2, 0, 12, 4);
  context.fillRect(-4, 18, 16, 4);

  context.fillStyle = player.style.scarf;
  context.fillRect(-18, -1, 28, 6);

  context.fillStyle = "#2c1f1d";
  context.fillRect(-7, -16, 4, 4);
  context.fillRect(5, -16, 4, 4);

  context.strokeStyle = "#2c1f1d";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(18, -2);
  context.quadraticCurveTo(36, -22, 42, 8);
  context.stroke();

  if (isLocal) {
    context.strokeStyle = "rgba(255,255,255,0.9)";
    context.lineWidth = 2;
    context.strokeRect(-30, -46, 60, 84);
  }

  context.restore();

  context.fillStyle = "rgba(40, 23, 17, 0.8)";
  context.font = "bold 14px Trebuchet MS";
  context.textAlign = "center";
  context.fillText(player.name ?? "Cat", x + player.width / 2, y - 12);

  if (player.meowing) {
    drawSpeechBubble(x + player.width / 2, y - 40, "MEW!");
  }
}

function drawSpeechBubble(x, y, text) {
  const width = 84;
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
  context.font = "bold 16px Trebuchet MS";
  context.textAlign = "center";
  context.fillText(text, x, y + 5);
}

function drawHud() {
  context.fillStyle = "rgba(36, 24, 19, 0.58)";
  context.fillRect(20, 20, 370, 86);
  context.fillStyle = "#fff7f0";
  context.font = "bold 22px Trebuchet MS";
  context.textAlign = "left";
  context.fillText(localPlayer.areaName, 34, 50);
  context.font = "16px Trebuchet MS";
  context.fillStyle = "rgba(255, 247, 240, 0.86)";
  context.fillText("Walk through the sun door to reach the garden.", 34, 78);
}

function render() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawRoomBackground();
  drawDoorThreshold();
  drawGardenBackground();

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

    drawCat({
      ...player,
      width: 56,
      height: 42
    }, false);
  }

  drawCat(
    {
      ...localPlayer,
      meowing: localPlayer.meowTimer > 0
    },
    true
  );
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

function applyWorldState(nextWorld) {
  world.width = nextWorld.config.width;
  world.height = nextWorld.config.height;
  world.spawn = nextWorld.config.spawn;
  world.zones = nextWorld.config.zones;
  world.platforms = nextWorld.platforms;
  world.collectibles = nextWorld.collectibles;
  world.players = nextWorld.players;
  world.chatMessages = nextWorld.chatMessages ?? [];

  const me = world.players.find((player) => player.id === localPlayer.id);
  if (me) {
    localPlayer.name = me.name;
    localPlayer.treatsEaten = me.treatsEaten;
    localPlayer.giftsCollected = me.giftsCollected;
    localPlayer.score = me.score;
    localPlayer.areaName = me.areaName;
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
  setStatus("Connected");
}

async function syncState(forceMeow = false) {
  if (!localPlayer.id) {
    return;
  }

  const collectIds = Array.from(pendingCollectIds);
  pendingCollectIds.clear();

  try {
    const response = await postJson("/api/input", {
      playerId: localPlayer.id,
      x: localPlayer.x,
      y: localPlayer.y,
      vx: localPlayer.vx,
      vy: localPlayer.vy,
      facing: localPlayer.facing,
      name: localPlayer.name,
      meow: forceMeow,
      collectIds
    });

    if (response.player) {
      localPlayer.name = response.player.name;
      localPlayer.treatsEaten = response.player.treatsEaten;
      localPlayer.giftsCollected = response.player.giftsCollected;
      localPlayer.score = response.player.score;
      localPlayer.areaName = response.player.areaName;
      updateHud();
    }
  } catch (error) {
    for (const collectId of collectIds) {
      pendingCollectIds.add(collectId);
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

  const response = await postJson("/api/chat", {
    playerId: localPlayer.id,
    name: localPlayer.name,
    message
  });

  if (response.chatMessages) {
    world.chatMessages = response.chatMessages;
    renderChatMessages();
  }
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

  if (pressed && ["m", "M"].includes(event.key)) {
    localPlayer.meowTimer = 1600;
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
  render();

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
