import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockSearchConnector } from "../src/adapters/search.mock.ts";

describe("MockSearchConnector", () => {
	let search: MockSearchConnector;

	beforeEach(() => {
		search = new MockSearchConnector();
	});

	it("check returns available", async () => {
		const check = await search.check();
		assert.equal(check.available, true);
	});

	it("webSearch filters by query", async () => {
		search.seedSearchResult({ title: "TypeScript Docs", url: "https://ts.dev", snippet: "TS info" });
		search.seedSearchResult({ title: "Python Docs", url: "https://py.org", snippet: "Py info" });
		const result = await search.webSearch({ query: "typescript" });
		assert.equal(result.results.length, 1);
		assert.equal(result.results[0]?.title, "TypeScript Docs");
	});

	it("webFetch returns seeded page", async () => {
		search.seedPage("https://example.com", "Example", "Page content here");
		const result = await search.webFetch({ url: "https://example.com" });
		assert.equal(result.page.title, "Example");
		assert.equal(result.page.contentText, "Page content here");
	});

	it("webFetch throws for missing page", async () => {
		await assert.rejects(() => search.webFetch({ url: "https://missing.com" }));
	});

	it("webSummarize returns truncated content", async () => {
		search.seedPage("https://example.com", "Example", "A long text that should be summarized");
		const result = await search.webSummarize({ url: "https://example.com", maxLength: 10 });
		assert.equal(result.summary.length, 10);
	});
});
