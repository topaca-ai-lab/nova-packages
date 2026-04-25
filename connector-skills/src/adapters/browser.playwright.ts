import type { ConnectorCapabilityCheck } from "../envelope.js";
import { ConnectorNotAvailableError, ConnectorTimeoutError } from "../errors.js";
import type { BrowserConnector } from "../interfaces/browser.js";
import type {
	BrowserElement,
	PageClickParams,
	PageClickResult,
	PageExtractParams,
	PageExtractResult,
	PageFillParams,
	PageFillResult,
	PageOpenParams,
	PageOpenResult,
	PageScreenshotParams,
	PageScreenshotResult,
} from "../types/browser.js";

/**
 * Playwright adapter interface. The consumer must pass a Playwright Page instance.
 * This avoids bundling Playwright (~100MB) as a hard dependency.
 *
 * Usage:
 * ```ts
 * import { chromium } from "playwright";
 * const browser = await chromium.launch();
 * const page = await browser.newPage();
 * const connector = new PlaywrightBrowserConnector({ page });
 * ```
 */

export interface PlaywrightPage {
	goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<{ status(): number | null } | null>;
	click(selector: string, options?: { timeout?: number }): Promise<void>;
	fill(selector: string, value: string, options?: { timeout?: number }): Promise<void>;
	$$eval(selector: string, fn: (elements: any[]) => unknown): Promise<unknown>;
	screenshot(options?: { fullPage?: boolean; type?: string; path?: string }): Promise<Buffer>;
	title(): Promise<string>;
	url(): string;
}

export interface PlaywrightBrowserOptions {
	page: PlaywrightPage;
	defaultTimeoutMs?: number;
}

export class PlaywrightBrowserConnector implements BrowserConnector {
	readonly skillId = "browser" as const;
	private readonly page: PlaywrightPage;
	private readonly defaultTimeout: number;

	constructor(options: PlaywrightBrowserOptions) {
		this.page = options.page;
		this.defaultTimeout = options.defaultTimeoutMs ?? 10_000;
	}

	async check(): Promise<ConnectorCapabilityCheck> {
		return {
			skillId: "browser",
			available: true,
			backend: "playwright",
			capabilities: { pageOpen: true, pageClick: true, pageFill: true, pageExtract: true, pageScreenshot: true },
		};
	}

	async pageOpen(params: PageOpenParams): Promise<PageOpenResult> {
		const timeout = params.timeoutMs ?? this.defaultTimeout;
		try {
			const response = await this.page.goto(params.url, { timeout });
			const title = await this.page.title();
			return {
				page: {
					url: this.page.url(),
					title,
					statusCode: response?.status() ?? undefined,
				},
			};
		} catch (err) {
			throw this.mapError(err, timeout);
		}
	}

	async pageClick(params: PageClickParams): Promise<PageClickResult> {
		const timeout = params.timeoutMs ?? this.defaultTimeout;
		try {
			await this.page.click(params.selector, { timeout });
			const title = await this.page.title();
			return { clicked: true, page: { url: this.page.url(), title } };
		} catch {
			const title = await this.page.title();
			return { clicked: false, page: { url: this.page.url(), title } };
		}
	}

	async pageFill(params: PageFillParams): Promise<PageFillResult> {
		const timeout = params.timeoutMs ?? this.defaultTimeout;
		try {
			await this.page.fill(params.selector, params.value, { timeout });
			const title = await this.page.title();
			return { filled: true, page: { url: this.page.url(), title } };
		} catch {
			const title = await this.page.title();
			return { filled: false, page: { url: this.page.url(), title } };
		}
	}

	async pageExtract(params: PageExtractParams): Promise<PageExtractResult> {
		try {
			const raw = await this.page.$$eval(params.selector, (els: any[]) => {
				return els.map((el) => ({
					selector: "",
					tagName: el.tagName.toLowerCase(),
					text: el.textContent?.trim() ?? undefined,
					attributes: Object.fromEntries(
						Array.from(el.attributes || []).map((a: any) => [a.name, a.value]),
					),
				}));
			});

			const elements = raw as BrowserElement[];
			const limit = params.limit ?? elements.length;
			return { elements: elements.slice(0, limit) };
		} catch {
			return { elements: [] };
		}
	}

	async pageScreenshot(params: PageScreenshotParams): Promise<PageScreenshotResult> {
		const format = params.format ?? "png";
		const buffer = await this.page.screenshot({
			fullPage: params.fullPage ?? false,
			type: format,
		});
		return {
			screenshot: {
				format,
				base64: buffer.toString("base64"),
				width: 0,
				height: 0,
			},
		};
	}

	private mapError(err: unknown, timeout: number): Error {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes("Timeout") || msg.includes("timeout")) {
			return new ConnectorTimeoutError(timeout, msg);
		}
		if (msg.includes("net::ERR")) {
			return new ConnectorNotAvailableError("playwright", msg);
		}
		return err instanceof Error ? err : new Error(msg);
	}
}
