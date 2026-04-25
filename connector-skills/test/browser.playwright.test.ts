import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlaywrightBrowserConnector } from "../src/adapters/browser.playwright.ts";
import { ConnectorNotAvailableError, ConnectorTimeoutError } from "../src/errors.ts";

function createBasePage() {
	return {
		async goto() {
			return { status: () => 200 };
		},
		async click() {},
		async fill() {},
		async $$eval<T>(_selector: string, fn: (elements: readonly { tagName?: string; textContent?: string | null; attributes?: readonly { name: string; value: string }[] }[]) => T): Promise<T> {
			return fn([]);
		},
		async screenshot() {
			return Buffer.from("x");
		},
		async title() {
			return "Page";
		},
		url() {
			return "https://example.com";
		},
	};
}

describe("PlaywrightBrowserConnector", () => {
	it("pageClick propagates timeout as ConnectorTimeoutError", async () => {
		const page = createBasePage();
		page.click = async () => {
			throw new Error("Timeout 5000ms exceeded.");
		};
		const connector = new PlaywrightBrowserConnector({ page });
		await assert.rejects(
			async () => connector.pageClick({ selector: "#submit", timeoutMs: 2000 }),
			ConnectorTimeoutError,
		);
	});

	it("pageFill propagates timeout as ConnectorTimeoutError", async () => {
		const page = createBasePage();
		page.fill = async () => {
			throw new Error("timeout while filling input");
		};
		const connector = new PlaywrightBrowserConnector({ page });
		await assert.rejects(
			async () => connector.pageFill({ selector: "#email", value: "a@b.c", timeoutMs: 1500 }),
			ConnectorTimeoutError,
		);
	});

	it("pageExtract propagates network errors as ConnectorNotAvailableError", async () => {
		const page = createBasePage();
		page.$$eval = async () => {
			throw new Error("net::ERR_CONNECTION_REFUSED");
		};
		const connector = new PlaywrightBrowserConnector({ page });
		await assert.rejects(
			async () => connector.pageExtract({ selector: ".row" }),
			ConnectorNotAvailableError,
		);
	});
});
