import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockFilesConnector } from "../src/adapters/files.mock.ts";

describe("MockFilesConnector", () => {
	let files: MockFilesConnector;

	beforeEach(() => {
		files = new MockFilesConnector();
	});

	it("check returns available", async () => {
		const check = await files.check();
		assert.equal(check.available, true);
	});

	it("upload and download round-trip", async () => {
		await files.upload({ path: "/docs/test.txt", content: "hello", mimeType: "text/plain" });
		const result = await files.download({ path: "/docs/test.txt" });
		assert.equal(result.content, "hello");
		assert.equal(result.mimeType, "text/plain");
	});

	it("upload rejects duplicate without overwrite", async () => {
		await files.upload({ path: "/a.txt", content: "v1" });
		await assert.rejects(() => files.upload({ path: "/a.txt", content: "v2" }));
	});

	it("upload allows overwrite", async () => {
		await files.upload({ path: "/a.txt", content: "v1" });
		await files.upload({ path: "/a.txt", content: "v2", overwrite: true });
		const result = await files.download({ path: "/a.txt" });
		assert.equal(result.content, "v2");
	});

	it("list returns files in directory", async () => {
		files.seedFile("/docs/a.txt", "aaa");
		files.seedFile("/docs/b.txt", "bbb");
		files.seedFile("/other/c.txt", "ccc");
		const result = await files.list({ path: "/docs" });
		assert.equal(result.entries.length, 2);
	});

	it("search finds by filename", async () => {
		files.seedFile("/docs/readme.md", "content");
		files.seedFile("/docs/notes.txt", "content");
		const result = await files.search({ query: "readme" });
		assert.equal(result.entries.length, 1);
	});

	it("share returns a link", async () => {
		files.seedFile("/docs/file.txt", "data");
		const result = await files.share({ path: "/docs/file.txt" });
		assert.ok(result.link.url.includes("file.txt"));
	});
});
