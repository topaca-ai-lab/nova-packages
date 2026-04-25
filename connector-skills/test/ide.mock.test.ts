import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockIdeConnector } from "../src/adapters/ide.mock.ts";

describe("MockIdeConnector", () => {
	let ide: MockIdeConnector;

	beforeEach(() => {
		ide = new MockIdeConnector();
	});

	it("check returns available", async () => {
		const check = await ide.check();
		assert.equal(check.available, true);
	});

	it("fileOpen returns opened=true for seeded file", async () => {
		ide.seedFile("/src/main.ts", "const x = 1;\nconst y = 2;", "typescript");
		const result = await ide.fileOpen({ path: "/src/main.ts" });
		assert.equal(result.opened, true);
		assert.equal(result.file.lineCount, 2);
	});

	it("fileOpen returns opened=false for missing file", async () => {
		const result = await ide.fileOpen({ path: "/nope.ts" });
		assert.equal(result.opened, false);
	});

	it("fileDiff detects differences", async () => {
		ide.seedFile("/a.ts", "line1\nline2");
		ide.seedFile("/b.ts", "line1\nline3");
		const result = await ide.fileDiff({ pathA: "/a.ts", pathB: "/b.ts" });
		assert.ok(result.diff.hunks.length > 0);
	});

	it("fileDiff shows no hunks for identical files", async () => {
		ide.seedFile("/a.ts", "same content");
		ide.seedFile("/b.ts", "same content");
		const result = await ide.fileDiff({ pathA: "/a.ts", pathB: "/b.ts" });
		assert.equal(result.diff.hunks.length, 0);
	});

	it("selectionGet returns null when no selection", async () => {
		const result = await ide.selectionGet({});
		assert.equal(result.selection, null);
	});

	it("selectionGet returns set selection", async () => {
		ide.setSelection({
			path: "/src/main.ts",
			startLine: 1, startColumn: 0,
			endLine: 1, endColumn: 5,
			text: "const",
		});
		const result = await ide.selectionGet({});
		assert.equal(result.selection?.text, "const");
	});

	it("patchPropose applies replacement", async () => {
		ide.seedFile("/src/main.ts", "line1\nline2\nline3");
		const result = await ide.patchPropose({
			path: "/src/main.ts",
			startLine: 2,
			endLine: 2,
			replacement: "replaced",
		});
		assert.equal(result.applied, true);
	});
});
