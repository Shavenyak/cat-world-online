import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createAppServer } from "../server.js";

function requestJson(baseUrl, route, method = "GET", payload = null) {
  const url = new URL(route, baseUrl);
  const body = payload ? JSON.stringify(payload) : null;

  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        method,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
              Connection: "close"
            }
          : {
              Connection: "close"
            }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

test("players can join, rename, sleep, chat, collect items, die in lava, and leave", async () => {
  const { server } = createAppServer();
  server.listen(0);
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const joinData = await requestJson(baseUrl, "/api/join", "POST", { name: "Milo" });

  assert.equal(joinData.ok, true);
  assert.ok(joinData.playerId);
  assert.equal(joinData.world.players.length, 1);
  assert.equal(joinData.world.config.width, 4700);
  assert.equal(joinData.world.collectibles.length >= 4, true);
  assert.equal(joinData.player.name, "Milo");

  const fish = joinData.world.collectibles.find((entry) => entry.id === "fish-window");
  assert.ok(fish);

  const inputData = await requestJson(baseUrl, "/api/input", "POST", {
    playerId: joinData.playerId,
    x: fish.x,
    y: fish.y,
    vx: 4,
    vy: -3,
    facing: -1,
    name: "Milo Beans",
    sleeping: false,
    meow: true,
    died: false,
    collectIds: [fish.id]
  });

  assert.equal(inputData.ok, true);
  assert.equal(inputData.player.name, "Milo Beans");
  assert.equal(inputData.player.treatsEaten, 1);
  assert.equal(inputData.player.score, 5);
  assert.equal(inputData.player.bubbleText, "MEW!");

  const sleepData = await requestJson(baseUrl, "/api/input", "POST", {
    playerId: joinData.playerId,
    x: fish.x,
    y: fish.y,
    vx: 0,
    vy: 0,
    facing: -1,
    name: "Milo Beans",
    sleeping: true,
    meow: false,
    died: false,
    collectIds: []
  });

  assert.equal(sleepData.ok, true);
  assert.equal(sleepData.player.sleeping, true);

  const chatData = await requestJson(baseUrl, "/api/chat", "POST", {
    playerId: joinData.playerId,
    name: "Milo Beans",
    message: "hello cats"
  });

  assert.equal(chatData.ok, true);
  assert.equal(chatData.chatMessages.length, 1);
  assert.equal(chatData.chatMessages[0].playerName, "Milo Beans");
  assert.equal(chatData.chatMessages[0].text, "hello cats");
  assert.equal(chatData.player.bubbleText, "hello cats");
  assert.equal(chatData.player.sleeping, false);

  const deathData = await requestJson(baseUrl, "/api/input", "POST", {
    playerId: joinData.playerId,
    x: 3360,
    y: 620,
    vx: 0,
    vy: 0,
    facing: 1,
    name: "Milo Beans",
    sleeping: false,
    meow: false,
    died: true,
    collectIds: []
  });

  assert.equal(deathData.ok, true);
  assert.equal(deathData.player.deaths, 1);
  assert.equal(deathData.player.areaName, "Ashen Lava Leap");

  const stateData = await requestJson(baseUrl, "/api/state");
  const player = stateData.world.players.find((entry) => entry.id === joinData.playerId);
  const collectedFish = stateData.world.collectibles.find((entry) => entry.id === fish.id);

  assert.equal(player.x, 3360);
  assert.equal(player.y, 620);
  assert.equal(player.name, "Milo Beans");
  assert.equal(player.facing, 1);
  assert.equal(player.treatsEaten, 1);
  assert.equal(player.deaths, 1);
  assert.equal(player.areaName, "Ashen Lava Leap");
  assert.equal(collectedFish.active, false);
  assert.equal(stateData.world.chatMessages.length, 1);
  assert.equal(stateData.world.players[0].bubbleText, "Ouch!");

  const leaveData = await requestJson(baseUrl, "/api/leave", "POST", { playerId: joinData.playerId });
  assert.equal(leaveData.ok, true);

  const stateAfterLeaveData = await requestJson(baseUrl, "/api/state");
  assert.equal(stateAfterLeaveData.world.players.length, 0);

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});
