import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockBrowserConnector } from "../src/adapters/browser.mock.ts";

describe("MockBrowserConnector", () => {
	let browser: MockBrowserConnector;

	beforeEach(() => {
		browser = new MockBrowserConnector();
	});

	it("check returns available", async () => {
		const check = await browser.check();
		assert.equal(check.available, true);
	});

	it("pageOpen sets current page", async () => {
		const result = await browser.pageOpen({ url: "https://example.com" });
		assert.equal(result.page.url, "https://example.com");
		assert.equal(result.page.statusCode, 200);
	});

	it("pageClick returns clicked status based on seeded elements", async () => {
		browser.seedElements("button.submit", [
			{ selector: "button.submit", tagName: "button", text: "Submit" },
		]);
		const result = await browser.pageClick({ selector: "button.submit" });
		assert.equal(result.clicked, true);
	});

	it("pageClick returns false for unknown selector", async () => {
		const result = await browser.pageClick({ selector: ".missing" });
		assert.equal(result.clicked, false);
	});

	it("pageFill stores a value", async () => {
		const result = await browser.pageFill({ selector: "#email", value: "test@test.com" });
		assert.equal(result.filled, true);
	});

	it("pageExtract returns seeded elements", async () => {
		browser.seedElements("div.card", [
			{ selector: "div.card", tagName: "div", text: "Card 1" },
			{ selector: "div.card", tagName: "div", text: "Card 2" },
		]);
		const result = await browser.pageExtract({ selector: "div.card", limit: 1 });
		assert.equal(result.elements.length, 1);
	});

	it("pageScreenshot returns a valid screenshot", async () => {
		const result = await browser.pageScreenshot({});
		assert.equal(result.screenshot.format, "png");
		assert.ok(result.screenshot.base64.length > 0);
	});
});
