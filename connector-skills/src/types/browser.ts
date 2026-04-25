// --- Browser Types (Playwright adapter interface) ---

export interface BrowserPageInfo {
	url: string;
	title: string;
	statusCode?: number;
}

export interface BrowserElement {
	selector: string;
	tagName: string;
	text?: string;
	attributes?: Record<string, string>;
}

export interface BrowserScreenshot {
	format: "png" | "jpeg";
	base64: string;
	width: number;
	height: number;
}

// --- Action Params ---

export interface PageOpenParams {
	url: string;
	waitFor?: string;
	timeoutMs?: number;
}

export interface PageClickParams {
	selector: string;
	timeoutMs?: number;
}

export interface PageFillParams {
	selector: string;
	value: string;
	timeoutMs?: number;
}

export interface PageExtractParams {
	selector: string;
	attribute?: string;
	limit?: number;
}

export interface PageScreenshotParams {
	fullPage?: boolean;
	format?: "png" | "jpeg";
	selector?: string;
}

// --- Action Results ---

export interface PageOpenResult {
	page: BrowserPageInfo;
}

export interface PageClickResult {
	clicked: boolean;
	page: BrowserPageInfo;
}

export interface PageFillResult {
	filled: boolean;
	page: BrowserPageInfo;
}

export interface PageExtractResult {
	elements: readonly BrowserElement[];
}

export interface PageScreenshotResult {
	screenshot: BrowserScreenshot;
}
