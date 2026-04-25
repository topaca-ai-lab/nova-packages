import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockMailConnector } from "../src/adapters/mail.mock.ts";
import type { MailMessage } from "../src/types/mail.ts";

function makeSeedMessage(overrides: Partial<MailMessage> = {}): MailMessage {
	return {
		id: "msg-seed-1",
		folder: "INBOX",
		from: { address: "alice@example.com" },
		to: [{ address: "bob@example.com" }],
		subject: "Test Subject",
		bodyText: "Hello World",
		attachments: [],
		receivedAt: "2026-04-25T10:00:00Z",
		read: false,
		flagged: false,
		...overrides,
	};
}

describe("MockMailConnector", () => {
	let mail: MockMailConnector;

	beforeEach(() => {
		mail = new MockMailConnector();
	});

	it("check returns available with all capabilities", async () => {
		const check = await mail.check();
		assert.equal(check.available, true);
		assert.equal(check.backend, "mock");
		assert.equal(check.capabilities.inboxList, true);
		assert.equal(check.capabilities.send, true);
	});

	it("inboxList returns seeded messages", async () => {
		mail.seedMessage(makeSeedMessage());
		const result = await mail.inboxList({ limit: 10 });
		assert.equal(result.messages.length, 1);
		assert.equal(result.messages[0]?.subject, "Test Subject");
	});

	it("inboxList filters by unreadOnly", async () => {
		mail.seedMessage(makeSeedMessage({ id: "m1", read: false }));
		mail.seedMessage(makeSeedMessage({ id: "m2", read: true }));
		const result = await mail.inboxList({ unreadOnly: true });
		assert.equal(result.messages.length, 1);
		assert.equal(result.messages[0]?.id, "m1");
	});

	it("inboxList filters by query", async () => {
		mail.seedMessage(makeSeedMessage({ id: "m1", subject: "Important" }));
		mail.seedMessage(makeSeedMessage({ id: "m2", subject: "Spam" }));
		const result = await mail.inboxList({ query: "important" });
		assert.equal(result.messages.length, 1);
	});

	it("inboxRead marks message as read", async () => {
		mail.seedMessage(makeSeedMessage({ read: false }));
		const result = await mail.inboxRead({ messageId: "msg-seed-1" });
		assert.equal(result.message.read, true);
	});

	it("inboxRead throws for missing message", async () => {
		await assert.rejects(() => mail.inboxRead({ messageId: "nope" }));
	});

	it("send creates a message in store", async () => {
		const result = await mail.send({
			to: [{ address: "charlie@example.com" }],
			subject: "Hi",
			bodyText: "Hey",
		});
		assert.ok(result.messageId);
		assert.ok(result.sentAt);
	});

	it("draftCreate returns a draft id", async () => {
		const result = await mail.draftCreate({
			to: [{ address: "dave@example.com" }],
			subject: "Draft",
			bodyText: "WIP",
		});
		assert.ok(result.draftId.startsWith("draft-"));
	});

	it("folderList returns default folders", async () => {
		const result = await mail.folderList({});
		assert.ok(result.folders.length >= 4);
	});
});
