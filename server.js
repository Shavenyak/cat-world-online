import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const playerTimeoutMs = 15000;
const meowDurationMs = 1800;
const chatBubbleDurationMs = 5200;

const worldConfig = {
  width: 4700,
  height: 720,
  spawn: { x: 160, y: 470 },
  hazards: {
    lava: {
      startX: 3280,
      surfaceY: 610
    }
  },
  zones: [
    {
      id: "room",
      name: "Cozy Cat Room",
      x: 0,
      width: 1540,
      palette: { sky: "#fbe7cb", ground: "#d68958" }
    },
    {
      id: "doorway",
      name: "Sun Door",
      x: 1540,
      width: 220,
      palette: { sky: "#ffe5a8", ground: "#d68958" }
    },
    {
      id: "garden",
      name: "Whisker Garden",
      x: 1760,
      width: 1520,
      palette: { sky: "#d6f2ff", ground: "#5ea96f" }
    },
    {
      id: "lava",
      name: "Ashen Lava Leap",
      x: 3280,
      width: 1420,
      palette: { sky: "#37263d", ground: "#ff6b35" }
    }
  ]
};

const platformLayout = [
  { x: 0, y: 560, width: 1640, height: 160, theme: "room" },
  { x: 1640, y: 560, width: 1640, height: 160, theme: "garden" },
  { x: 110, y: 470, width: 220, height: 20, theme: "room" },
  { x: 390, y: 410, width: 180, height: 20, theme: "room" },
  { x: 640, y: 340, width: 170, height: 20, theme: "room" },
  { x: 950, y: 440, width: 210, height: 20, theme: "room" },
  { x: 1240, y: 360, width: 180, height: 20, theme: "room" },
  { x: 1510, y: 500, width: 160, height: 20, theme: "doorway" },
  { x: 1830, y: 470, width: 200, height: 20, theme: "garden" },
  { x: 2120, y: 390, width: 160, height: 20, theme: "garden" },
  { x: 2390, y: 320, width: 170, height: 20, theme: "garden" },
  { x: 2660, y: 430, width: 180, height: 20, theme: "garden" },
  { x: 2920, y: 350, width: 140, height: 20, theme: "garden" },
  { x: 3380, y: 560, width: 170, height: 20, theme: "lava-rock" },
  { x: 3620, y: 485, width: 140, height: 20, theme: "lava-rock" },
  { x: 3850, y: 405, width: 150, height: 20, theme: "lava-rock" },
  { x: 4090, y: 525, width: 120, height: 20, theme: "lava-rock" },
  { x: 4300, y: 440, width: 150, height: 20, theme: "lava-rock" },
  { x: 4520, y: 350, width: 140, height: 20, theme: "lava-rock" }
];

const collectibleSpawns = [
  { id: "fish-window", kind: "fish", label: "Sardine Snack", x: 425, y: 365, respawnMs: 8000 },
  { id: "gift-shelf", kind: "gift", label: "Ribbon Gift", x: 980, y: 395, respawnMs: 12000 },
  { id: "fish-door", kind: "fish", label: "Golden Tuna", x: 1555, y: 455, respawnMs: 8000 },
  { id: "gift-bush", kind: "gift", label: "Garden Gift", x: 2165, y: 345, respawnMs: 12000 },
  { id: "fish-pond", kind: "fish", label: "Pond Fish", x: 2435, y: 275, respawnMs: 8000 },
  { id: "gift-tree", kind: "gift", label: "Tree Present", x: 2950, y: 305, respawnMs: 12000 },
  { id: "gift-lava", kind: "gift", label: "Magma Gift", x: 4325, y: 395, respawnMs: 12000 }
];

function createCollectibles() {
  const collectibles = new Map();

  for (const collectible of collectibleSpawns) {
    collectibles.set(collectible.id, {
      ...collectible,
      collectedUntil: 0
    });
  }

  return collectibles;
}

function createWorldState() {
  return {
    tick: 0,
    players: new Map(),
    collectibles: createCollectibles(),
    chatMessages: []
  };
}

function pickCatStyle(count) {
  const styles = [
    { coat: "#f2a65a", stripe: "#8a4f20", scarf: "#2f6fda" },
    { coat: "#d9d2c3", stripe: "#675d50", scarf: "#e45f7d" },
    { coat: "#8fc27d", stripe: "#476540", scarf: "#f0cf65" },
    { coat: "#9cb5ff", stripe: "#4a5f99", scarf: "#ff8552" },
    { coat: "#f2d0ff", stripe: "#a76ec8", scarf: "#4db6ac" }
  ];

  return styles[count % styles.length];
}

function findZoneName(x) {
  const zone = worldConfig.zones.find((entry) => x >= entry.x && x < entry.x + entry.width);
  return zone ? zone.name : worldConfig.zones[worldConfig.zones.length - 1].name;
}

function sanitizeText(value, fallback, maxLength) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, maxLength);
}

function makePlayer(index) {
  const style = pickCatStyle(index);

  return {
    id: randomUUID(),
    name: `Cat ${index + 1}`,
    x: worldConfig.spawn.x + (index % 5) * 70,
    y: worldConfig.spawn.y,
    vx: 0,
    vy: 0,
    facing: 1,
    sleeping: false,
    meowUntil: 0,
    bubbleText: "",
    bubbleUntil: 0,
    treatsEaten: 0,
    giftsCollected: 0,
    deaths: 0,
    score: 0,
    joinedAt: Date.now(),
    updatedAt: Date.now(),
    style
  };
}

function json(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function notFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sanitizeNumber(value, fallback, min, max) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function serializePlayers(players) {
  const now = Date.now();

  return Array.from(players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy,
    facing: player.facing,
    sleeping: player.sleeping,
    meowing: player.meowUntil > now,
    bubbleText: player.bubbleUntil > now ? player.bubbleText : "",
    treatsEaten: player.treatsEaten,
    giftsCollected: player.giftsCollected,
    deaths: player.deaths,
    score: player.score,
    areaName: findZoneName(player.x),
    style: player.style
  }));
}

function serializeCollectibles(collectibles) {
  const now = Date.now();

  return Array.from(collectibles.values()).map((collectible) => ({
    id: collectible.id,
    kind: collectible.kind,
    label: collectible.label,
    x: collectible.x,
    y: collectible.y,
    active: collectible.collectedUntil <= now,
    respawnAt: collectible.collectedUntil
  }));
}

function cleanupInactivePlayers(world) {
  const now = Date.now();

  for (const [id, player] of world.players.entries()) {
    if (now - player.updatedAt > playerTimeoutMs) {
      world.players.delete(id);
      world.tick += 1;
    }
  }
}

function applyCollectedItems(world, player, collectIds) {
  if (!Array.isArray(collectIds) || collectIds.length === 0) {
    return false;
  }

  const now = Date.now();
  let changed = false;

  for (const collectId of new Set(collectIds)) {
    const collectible = world.collectibles.get(collectId);
    if (!collectible || collectible.collectedUntil > now) {
      continue;
    }

    const distance = Math.hypot(player.x - collectible.x, player.y - collectible.y);
    if (distance > 120) {
      continue;
    }

    collectible.collectedUntil = now + collectible.respawnMs;
    if (collectible.kind === "fish") {
      player.treatsEaten += 1;
      player.score += 5;
    } else {
      player.giftsCollected += 1;
      player.score += 10;
    }

    changed = true;
  }

  return changed;
}

function createWorldPayload(world) {
  return {
    config: worldConfig,
    platforms: platformLayout,
    players: serializePlayers(world.players),
    collectibles: serializeCollectibles(world.collectibles),
    chatMessages: world.chatMessages
  };
}

function addChatMessage(world, player, text) {
  const sanitized = sanitizeText(text, "", 120);
  if (!sanitized) {
    return false;
  }

  player.bubbleText = sanitized;
  player.bubbleUntil = Date.now() + chatBubbleDurationMs;
  player.sleeping = false;

  world.chatMessages.push({
    id: randomUUID(),
    playerId: player.id,
    playerName: player.name,
    text: sanitized,
    createdAt: Date.now()
  });

  if (world.chatMessages.length > 24) {
    world.chatMessages.shift();
  }

  return true;
}

function serveStatic(request, response) {
  const requestPath = request.url === "/" ? "/index.html" : request.url;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    notFound(response);
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      notFound(response);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png"
    };

    response.writeHead(200, {
      "Content-Type": types[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}

function createAppServer() {
  const world = createWorldState();

  const server = http.createServer(async (request, response) => {
    cleanupInactivePlayers(world);

    try {
      if (request.method === "POST" && request.url === "/api/join") {
        const body = await readJson(request);
        const player = makePlayer(world.players.size);
        player.name = sanitizeText(body.name, player.name, 18);
        world.players.set(player.id, player);
        world.tick += 1;

        json(response, 200, {
          ok: true,
          playerId: player.id,
          player,
          world: createWorldPayload(world)
        });
        return;
      }

      if (request.method === "POST" && request.url === "/api/input") {
        const body = await readJson(request);
        const player = world.players.get(body.playerId);

        if (!player) {
          json(response, 404, { ok: false, error: "player_missing" });
          return;
        }

        player.x = sanitizeNumber(body.x, player.x, 0, worldConfig.width - 56);
        player.y = sanitizeNumber(body.y, player.y, 0, worldConfig.height - 120);
        player.vx = sanitizeNumber(body.vx, 0, -30, 30);
        player.vy = sanitizeNumber(body.vy, 0, -30, 30);
        player.facing = body.facing === -1 ? -1 : 1;
        player.name = sanitizeText(body.name, player.name, 18);
        player.sleeping = body.sleeping === true;
        player.updatedAt = Date.now();

        if (body.died === true) {
          player.deaths += 1;
          player.score = Math.max(0, player.score - 3);
          player.sleeping = false;
          player.bubbleText = "Ouch!";
          player.bubbleUntil = Date.now() + 1800;
        }

        if (body.meow === true) {
          player.meowUntil = Date.now() + meowDurationMs;
          player.bubbleText = "MEW!";
          player.bubbleUntil = Date.now() + meowDurationMs;
          player.sleeping = false;
        }

        const collectedSomething = applyCollectedItems(world, player, body.collectIds);

        world.tick += 1;
        json(response, 200, {
          ok: true,
          tick: world.tick,
          collectedSomething,
          player: serializePlayers(new Map([[player.id, player]])).at(0)
        });
        return;
      }

      if (request.method === "POST" && request.url === "/api/chat") {
        const body = await readJson(request);
        const player = world.players.get(body.playerId);

        if (!player) {
          json(response, 404, { ok: false, error: "player_missing" });
          return;
        }

        player.name = sanitizeText(body.name, player.name, 18);
        player.updatedAt = Date.now();

        const sent = addChatMessage(world, player, body.message);
        if (sent) {
          world.tick += 1;
        }

        json(response, 200, {
          ok: sent,
          tick: world.tick,
          chatMessages: world.chatMessages,
          player: serializePlayers(new Map([[player.id, player]])).at(0)
        });
        return;
      }

      if (request.method === "GET" && request.url?.startsWith("/api/state")) {
        json(response, 200, {
          ok: true,
          tick: world.tick,
          world: createWorldPayload(world)
        });
        return;
      }

      if (request.method === "POST" && request.url === "/api/leave") {
        const body = await readJson(request);

        if (body.playerId && world.players.has(body.playerId)) {
          world.players.delete(body.playerId);
          world.tick += 1;
        }

        json(response, 200, { ok: true, tick: world.tick });
        return;
      }

      if (request.method === "GET") {
        serveStatic(request, response);
        return;
      }

      notFound(response);
    } catch (error) {
      json(response, 500, {
        ok: false,
        error: "server_error",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  return { server, world };
}

function startServer(
  port = Number.parseInt(process.env.PORT ?? "3000", 10),
  host = process.env.HOST ?? "0.0.0.0"
) {
  const { server } = createAppServer();

  server.listen(port, host, () => {
    console.log(`Cat World server running on http://${host}:${port}`);
  });

  return server;
}

if (process.argv[1] === __filename) {
  startServer();
}

export { createAppServer, startServer, worldConfig, platformLayout, collectibleSpawns };
