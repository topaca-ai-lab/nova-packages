import type { ConnectorCapabilityCheck } from "../envelope.js";
import type { SearchConnector } from "../interfaces/search.js";
import type {
	SearchResult,
	WebFetchParams,
	WebFetchResult,
	WebSearchParams,
	WebSearchResult,
	WebSummarizeParams,
	WebSummarizeResult,
} from "../types/search.js";

export class MockSearchConnector implements SearchConnector {
	readonly skillId = "search" as const;

	private readonly searchResults: SearchResult[] = [];
	private readonly pages = new Map<string, { title: string; content: string }>();

	async check(): Promise<ConnectorCapabilityCheck> {
		return {
			skillId: "search",
			available: true,
			backend: "mock",
			capabilities: {
				webSearch: true,
				webFetch: true,
				webSummarize: true,
			},
		};
	}

	async webSearch(params: WebSearchParams): Promise<WebSearchResult> {
		const q = params.query.toLowerCase();
		const filtered = this.searchResults.filter(
			(r) => r.title.toLowerCase().includes(q) || r.snippet.toLowerCase().includes(q),
		);
		const limit = params.limit ?? 10;
		return { results: filtered.slice(0, limit), totalEstimate: filtered.length };
	}

	async webFetch(params: WebFetchParams): Promise<WebFetchResult> {
		const page = this.pages.get(params.url);
		if (!page) {
			throw new Error(`Page not found: ${params.url}`);
		}
		const maxLength = params.maxLength ?? 10000;
		const content = page.content.slice(0, maxLength);
		return {
			page: {
				url: params.url,
				title: page.title,
				contentText: content,
				contentLength: content.length,
				fetchedAt: new Date().toISOString(),
			},
		};
	}

	async webSummarize(params: WebSummarizeParams): Promise<WebSummarizeResult> {
		const page = this.pages.get(params.url);
		if (!page) {
			throw new Error(`Page not found: ${params.url}`);
		}
		const maxLength = params.maxLength ?? 200;
		const summary = page.content.slice(0, maxLength);
		return {
			url: params.url,
			summary,
			wordCount: summary.split(/\s+/).length,
		};
	}

	/** Test helper: seed a search result. */
	seedSearchResult(result: SearchResult): void {
		this.searchResults.push({ ...result });
	}

	/** Test helper: seed a fetchable page. */
	seedPage(url: string, title: string, content: string): void {
		this.pages.set(url, { title, content });
	}
}
