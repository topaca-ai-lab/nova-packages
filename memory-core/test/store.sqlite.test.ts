import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MemoryStore } from "../src/interfaces/memory-store.js";
import { SqliteMemoryStore, createSqliteMemoryStore } from "../src/index.js";
import { runMemoryStoreContractSuite } from "./store-contract.js";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function createTempSqliteStore(): SqliteMemoryStore {
	const dir = mkdtempSync(join(tmpdir(), "nova-memory-sqlite-"));
	tempDirs.push(dir);
	const path = join(dir, "memory.sqlite");
	return createSqliteMemoryStore({ path });
}

describe("SqliteMemoryStore", () => {
	it("applies migrations and exposes schema version", () => {
		const store = createTempSqliteStore();
		try {
			expect(store.getSchemaVersion()).toBe(1);
		} finally {
			store.close();
		}
	});
});

runMemoryStoreContractSuite({
	name: "sqlite",
	createStore: (): MemoryStore => createTempSqliteStore(),
	disposeStore: async (store) => {
		(store as SqliteMemoryStore).close();
	},
});
