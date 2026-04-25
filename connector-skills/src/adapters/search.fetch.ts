import type { ConnectorCapabilityCheck } from "../envelope.js";
import { ConnectorNotAvailableError, ConnectorTimeoutError } from "../errors.js";
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

export type SearchProvider = "brave" | "searxng" | "duckduckgo";

export interface FetchSearchOptions {
	provider: SearchProvider;
	apiKey?: string;
	baseUrl?: string;
	timeoutMs?: number;
}

export class FetchSearchConnector implements SearchConnector {
	readonly skillId = "search" as const;
	private readonly options: FetchSearchOptions;

	constructor(options: FetchSearchOptions) {
		this.options = options;
	}

	async check(): Promise<ConnectorCapabilityCheck> {
		return {
			skillId: "search",
			available: true,
			backend: this.options.provider,
			capabilities: { webSearch: true, webFetch: true, webSummarize: true },
		};
	}

	async webSearch(params: WebSearchParams, signal?: AbortSignal): Promise<WebSearchResult> {
		const limit = params.limit ?? 10;
		const timeout = this.options.timeoutMs ?? 10_000;

		switch (this.options.provider) {
			case "brave":
				return this.searchBrave(params.query, limit, params.language, signal, timeout);
			case "searxng":
				return this.searchSearxng(params.query, limit, params.language, signal, timeout);
			case "duckduckgo":
				return this.searchDuckDuckGo(params.query, limit, signal, timeout);
			default:
				throw new ConnectorNotAvailableError(this.options.provider, `Unknown provider: ${this.options.provider}`);
		}
	}

	async webFetch(params: WebFetchParams, signal?: AbortSignal): Promise<WebFetchResult> {
		const timeout = params.timeoutMs ?? this.options.timeoutMs ?? 10_000;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);
		if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

		try {
			const res = await fetch(params.url, { signal: controller.signal });
			let text = await res.text();
			const maxLength = params.maxLength ?? 50_000;
			if (text.length > maxLength) text = text.slice(0, maxLength);

			const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
			const contentText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

			return {
				page: {
					url: params.url,
					title: titleMatch?.[1]?.trim(),
					contentText: contentText.slice(0, maxLength),
					contentLength: contentText.length,
					fetchedAt: new Date().toISOString(),
				},
			};
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				throw new ConnectorTimeoutError(timeout, `Fetch timed out: ${params.url}`);
			}
			throw err;
		} finally {
			clearTimeout(timer);
		}
	}

	async webSummarize(params: WebSummarizeParams, signal?: AbortSignal): Promise<WebSummarizeResult> {
		const fetched = await this.webFetch({
			url: params.url,
			maxLength: params.maxLength ?? 10_000,
		}, signal);

		const maxLength = params.maxLength ?? 500;
		const summary = fetched.page.contentText.slice(0, maxLength);

		return {
			url: params.url,
			summary,
			wordCount: summary.split(/\s+/).length,
		};
	}

	private async searchBrave(query: string, limit: number, language: string | undefined, signal: AbortSignal | undefined, timeout: number): Promise<WebSearchResult> {
		if (!this.options.apiKey) throw new ConnectorNotAvailableError("brave", "Brave API key required");
		const url = new URL("https://api.search.brave.com/res/v1/web/search");
		url.searchParams.set("q", query);
		url.searchParams.set("count", String(limit));
		if (language) url.searchParams.set("search_lang", language);

		const res = await this.fetchWithTimeout(url.toString(), {
			headers: { "X-Subscription-Token": this.options.apiKey, Accept: "application/json" },
			signal,
		}, timeout);

		const json = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
		const results: SearchResult[] = (json.web?.results ?? []).map((r) => ({
			title: r.title,
			url: r.url,
			snippet: r.description,
			source: "brave",
		}));
		return { results, totalEstimate: results.length };
	}

	private async searchSearxng(query: string, limit: number, language: string | undefined, signal: AbortSignal | undefined, timeout: number): Promise<WebSearchResult> {
		const baseUrl = this.options.baseUrl ?? "https://searx.be";
		const url = new URL(`${baseUrl}/search`);
		url.searchParams.set("q", query);
		url.searchParams.set("format", "json");
		if (language) url.searchParams.set("language", language);

		const res = await this.fetchWithTimeout(url.toString(), { signal }, timeout);
		const json = await res.json() as { results?: Array<{ title: string; url: string; content: string }> };
		const results: SearchResult[] = (json.results ?? []).slice(0, limit).map((r) => ({
			title: r.title,
			url: r.url,
			snippet: r.content,
			source: "searxng",
		}));
		return { results, totalEstimate: results.length };
	}

	private async searchDuckDuckGo(query: string, limit: number, signal: AbortSignal | undefined, timeout: number): Promise<WebSearchResult> {
		const url = new URL("https://api.duckduckgo.com/");
		url.searchParams.set("q", query);
		url.searchParams.set("format", "json");
		url.searchParams.set("no_html", "1");

		const res = await this.fetchWithTimeout(url.toString(), { signal }, timeout);
		const json = await res.json() as { RelatedTopics?: Array<{ Text?: string; FirstURL?: string }> };
		const results: SearchResult[] = (json.RelatedTopics ?? []).slice(0, limit)
			.filter((r): r is { Text: string; FirstURL: string } => Boolean(r.Text && r.FirstURL))
			.map((r) => ({
				title: r.Text.slice(0, 80),
				url: r.FirstURL,
				snippet: r.Text,
				source: "duckduckgo",
			}));
		return { results, totalEstimate: results.length };
	}

	private async fetchWithTimeout(url: string, init: RequestInit | undefined, timeout: number): Promise<Response> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);
		const mergedSignal = init?.signal
			? AbortSignal.any([controller.signal, init.signal])
			: controller.signal;

		try {
			return await fetch(url, { ...init, signal: mergedSignal });
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				throw new ConnectorTimeoutError(timeout);
			}
			throw err;
		} finally {
			clearTimeout(timer);
		}
	}
}
