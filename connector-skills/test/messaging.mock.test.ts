import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockMessagingConnector } from "../src/adapters/messaging.mock.ts";

describe("MockMessagingConnector", () => {
	let msg: MockMessagingConnector;

	beforeEach(() => {
		msg = new MockMessagingConnector();
	});

	it("check returns available", async () => {
		const check = await msg.check();
		assert.equal(check.available, true);
	});

	it("sendMessage and receiveMessages round-trip", async () => {
		await msg.sendMessage({ channel: "general", text: "Hello" });
		const result = await msg.receiveMessages({ channel: "general" });
		assert.equal(result.messages.length, 1);
		assert.equal(result.messages[0]?.text, "Hello");
	});

	it("receiveMessages filters by sinceId", async () => {
		const r1 = await msg.sendMessage({ channel: "ch", text: "first" });
		await msg.sendMessage({ channel: "ch", text: "second" });
		const result = await msg.receiveMessages({ channel: "ch", sinceId: r1.messageId });
		assert.equal(result.messages.length, 1);
		assert.equal(result.messages[0]?.text, "second");
	});

	it("getStatus reports channel state", async () => {
		await msg.sendMessage({ channel: "ch", text: "ping" });
		const result = await msg.getStatus({ channel: "ch" });
		assert.equal(result.status.connected, true);
		assert.ok(result.status.lastMessageAt);
	});

	it("registerCommands registers commands", async () => {
		const result = await msg.registerCommands({
			commands: [
				{ name: "/status", description: "Show status" },
				{ name: "/stop", description: "Stop agent" },
			],
		});
		assert.equal(result.registered, 2);
	});
});
