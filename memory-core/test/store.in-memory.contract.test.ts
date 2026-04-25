import type { MemoryStore } from "../src/interfaces/memory-store.js";
import { createInMemoryMemoryStore } from "../src/index.js";
import { runMemoryStoreContractSuite } from "./store-contract.js";

runMemoryStoreContractSuite({
	name: "in-memory",
	createStore: (): MemoryStore =>
		createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		}),
});
