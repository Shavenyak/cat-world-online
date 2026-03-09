import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer } from "../server.js";

test("players can join, rename, chat, collect items, and leave", async () => {
  const { server } = createAppServer();
  server.listen(0);
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const joinResponse = await fetch(`${baseUrl}/api/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Milo" })
  });
  const joinData = await joinResponse.json();

  assert.equal(joinData.ok, true);
  assert.ok(joinData.playerId);
  assert.equal(joinData.world.players.length, 1);
  assert.equal(joinData.world.config.width, 3200);
  assert.equal(joinData.world.collectibles.length >= 4, true);
  assert.equal(joinData.player.name, "Milo");

  const fish = joinData.world.collectibles.find((entry) => entry.id === "fish-window");
  assert.ok(fish);

  const inputResponse = await fetch(`${baseUrl}/api/input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerId: joinData.playerId,
      x: fish.x,
      y: fish.y,
      vx: 4,
      vy: -3,
      facing: -1,
      name: "Milo Beans",
      meow: true,
      collectIds: [fish.id]
    })
  });
  const inputData = await inputResponse.json();

  assert.equal(inputData.ok, true);
  assert.equal(inputData.player.name, "Milo Beans");
  assert.equal(inputData.player.treatsEaten, 1);
  assert.equal(inputData.player.score, 5);

  const chatResponse = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerId: joinData.playerId,
      name: "Milo Beans",
      message: "hello cats"
    })
  });
  const chatData = await chatResponse.json();

  assert.equal(chatData.ok, true);
  assert.equal(chatData.chatMessages.length, 1);
  assert.equal(chatData.chatMessages[0].playerName, "Milo Beans");
  assert.equal(chatData.chatMessages[0].text, "hello cats");

  const stateResponse = await fetch(`${baseUrl}/api/state`);
  const stateData = await stateResponse.json();
  const player = stateData.world.players.find((entry) => entry.id === joinData.playerId);
  const collectedFish = stateData.world.collectibles.find((entry) => entry.id === fish.id);

  assert.equal(player.x, fish.x);
  assert.equal(player.y, fish.y);
  assert.equal(player.name, "Milo Beans");
  assert.equal(player.facing, -1);
  assert.equal(player.meowing, true);
  assert.equal(player.treatsEaten, 1);
  assert.equal(player.areaName.length > 0, true);
  assert.equal(collectedFish.active, false);
  assert.equal(stateData.world.chatMessages.length, 1);

  const leaveResponse = await fetch(`${baseUrl}/api/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId: joinData.playerId })
  });
  const leaveData = await leaveResponse.json();

  assert.equal(leaveData.ok, true);

  const stateAfterLeave = await fetch(`${baseUrl}/api/state`);
  const stateAfterLeaveData = await stateAfterLeave.json();

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
