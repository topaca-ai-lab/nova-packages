import type { ConnectorCapabilityCheck } from "../envelope.js";
import type {
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

export interface BrowserConnector {
	readonly skillId: "browser";

	check(): Promise<ConnectorCapabilityCheck>;

	pageOpen(params: PageOpenParams, signal?: AbortSignal): Promise<PageOpenResult>;
	pageClick(params: PageClickParams, signal?: AbortSignal): Promise<PageClickResult>;
	pageFill(params: PageFillParams, signal?: AbortSignal): Promise<PageFillResult>;
	pageExtract(params: PageExtractParams, signal?: AbortSignal): Promise<PageExtractResult>;
	pageScreenshot(params: PageScreenshotParams, signal?: AbortSignal): Promise<PageScreenshotResult>;
}
