import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { LocalIdeConnector } from "../src/adapters/ide.local.ts";
import { ConnectorValidationError } from "../src/errors.ts";

describe("LocalIdeConnector", () => {
	let workspaceRoot = "";
	let ide: LocalIdeConnector;

	beforeEach(() => {
		workspaceRoot = mkdtempSync(join(tmpdir(), "connector-skills-ide-"));
		writeFileSync(join(workspaceRoot, "main.ts"), "line1\nline2\nline3", "utf-8");
		ide = new LocalIdeConnector({ workspaceRoot });
	});

	afterEach(() => {
		if (workspaceRoot) {
			rmSync(workspaceRoot, { recursive: true, force: true });
		}
	});

	it("opens file within workspace root", async () => {
		const result = await ide.fileOpen({ path: "main.ts" });
		assert.equal(result.opened, true);
		assert.equal(result.file.lineCount, 3);
	});

	it("rejects path traversal outside workspace root", async () => {
		await assert.rejects(async () => ide.fileOpen({ path: "../outside.ts" }), ConnectorValidationError);
	});

	it("rejects absolute paths outside workspace root for patch", async () => {
		await assert.rejects(
			async () =>
				ide.patchPropose({
					path: "/etc/passwd",
					startLine: 1,
					endLine: 1,
					replacement: "x",
				}),
			ConnectorValidationError,
		);
	});
});
