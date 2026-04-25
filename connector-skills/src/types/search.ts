// --- Search Types (Brave, SearXNG, DuckDuckGo) ---

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	source?: string;
}

export interface FetchedPage {
	url: string;
	title?: string;
	contentText: string;
	contentLength: number;
	fetchedAt: string;
}

// --- Action Params ---

export interface WebSearchParams {
	query: string;
	limit?: number;
	language?: string;
}

export interface WebFetchParams {
	url: string;
	maxLength?: number;
	timeoutMs?: number;
}

export interface WebSummarizeParams {
	url: string;
	maxLength?: number;
	query?: string;
}

// --- Action Results ---

export interface WebSearchResult {
	results: readonly SearchResult[];
	totalEstimate?: number;
}

export interface WebFetchResult {
	page: FetchedPage;
}

export interface WebSummarizeResult {
	url: string;
	summary: string;
	wordCount: number;
}
