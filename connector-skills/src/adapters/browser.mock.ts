import type { ConnectorCapabilityCheck } from "../envelope.js";
import type { BrowserConnector } from "../interfaces/browser.js";
import type {
	BrowserElement,
	BrowserPageInfo,
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

export class MockBrowserConnector implements BrowserConnector {
	readonly skillId = "browser" as const;

	private currentPage: BrowserPageInfo = { url: "about:blank", title: "" };
	private readonly elements = new Map<string, BrowserElement[]>();
	private readonly formValues = new Map<string, string>();

	async check(): Promise<ConnectorCapabilityCheck> {
		return {
			skillId: "browser",
			available: true,
			backend: "mock",
			capabilities: {
				pageOpen: true,
				pageClick: true,
				pageFill: true,
				pageExtract: true,
				pageScreenshot: true,
			},
		};
	}

	async pageOpen(params: PageOpenParams): Promise<PageOpenResult> {
		this.currentPage = {
			url: params.url,
			title: `Mock: ${params.url}`,
			statusCode: 200,
		};
		return { page: { ...this.currentPage } };
	}

	async pageClick(params: PageClickParams): Promise<PageClickResult> {
		const exists = this.elements.has(params.selector);
		return {
			clicked: exists,
			page: { ...this.currentPage },
		};
	}

	async pageFill(params: PageFillParams): Promise<PageFillResult> {
		this.formValues.set(params.selector, params.value);
		return {
			filled: true,
			page: { ...this.currentPage },
		};
	}

	async pageExtract(params: PageExtractParams): Promise<PageExtractResult> {
		const all = this.elements.get(params.selector) ?? [];
		const limit = params.limit ?? all.length;
		return { elements: all.slice(0, limit) };
	}

	async pageScreenshot(_params: PageScreenshotParams): Promise<PageScreenshotResult> {
		return {
			screenshot: {
				format: "png",
				base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
				width: 1,
				height: 1,
			},
		};
	}

	/** Test helper: seed extractable elements for a selector. */
	seedElements(selector: string, elements: BrowserElement[]): void {
		this.elements.set(selector, elements.map((e) => ({ ...e })));
	}
}
