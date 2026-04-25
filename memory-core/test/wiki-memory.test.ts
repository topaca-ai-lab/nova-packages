import { describe, expect, it } from "vitest";
import { createInMemoryMemoryStore, getWikiPage, listWikiPages, upsertWikiPage } from "../src/index.js";

describe("wiki memory", () => {
	it("upserts and reads wiki pages", async () => {
		const store = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});

		const page = await upsertWikiPage(store, {
			namespace: "wiki",
			slug: "memory-system",
			title: "Memory System",
			body: "The memory system stores facts and episodic entries.",
		});
		const loaded = await getWikiPage(store, "wiki", "memory-system");

		expect(page.id).toBe("wiki:memory-system");
		expect(loaded?.title).toBe("Memory System");
		expect(loaded?.body).toContain("stores facts");
		expect(loaded?.tags).toContain("wiki-page");
	});

	it("updates existing wiki page via same slug", async () => {
		const store = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});

		await upsertWikiPage(store, {
			namespace: "wiki",
			slug: "routing",
			title: "Routing",
			body: "Initial body",
		});
		const updated = await upsertWikiPage(store, {
			namespace: "wiki",
			slug: "routing",
			title: "Routing",
			body: "Updated body with new details",
		});
		const loaded = await getWikiPage(store, "wiki", "routing");

		expect(updated.id).toBe("wiki:routing");
		expect(loaded?.body).toBe("Updated body with new details");
	});

	it("lists wiki pages with wiki tag filter", async () => {
		const store = createInMemoryMemoryStore({
			now: () => new Date("2026-04-25T12:00:00.000Z"),
		});

		await upsertWikiPage(store, {
			namespace: "wiki",
			slug: "a-page",
			title: "A Page",
			body: "Alpha",
		});
		await upsertWikiPage(store, {
			namespace: "wiki",
			slug: "b-page",
			title: "B Page",
			body: "Beta",
		});

		const pages = await listWikiPages(store, "wiki");

		expect(pages.length).toBe(2);
		expect(pages.map((page) => page.slug).sort()).toEqual(["a-page", "b-page"]);
	});
});
