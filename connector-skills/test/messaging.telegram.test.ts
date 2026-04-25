import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TelegramMessagingConnector } from "../src/adapters/messaging.telegram.ts";
import { ConnectorNotAvailableError } from "../src/errors.ts";

describe("TelegramMessagingConnector", () => {
	it("receiveMessages requires enablePolling=true", async () => {
		const connector = new TelegramMessagingConnector({
			botToken: "test-token",
			enablePolling: false,
		});

		await assert.rejects(
			async () => connector.receiveMessages({ channel: "chat-1" }),
			ConnectorNotAvailableError,
		);
	});

	it("getStatus returns disconnected before polling starts", async () => {
		const connector = new TelegramMessagingConnector({
			botToken: "test-token",
			enablePolling: false,
		});
		const status = await connector.getStatus({ channel: "chat-1" });
		assert.equal(status.status.connected, false);
		assert.equal(status.status.pendingCount, 0);
	});
});
