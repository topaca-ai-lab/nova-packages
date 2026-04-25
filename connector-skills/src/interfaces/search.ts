import type { ConnectorCapabilityCheck } from "../envelope.js";
import type {
	WebFetchParams,
	WebFetchResult,
	WebSearchParams,
	WebSearchResult,
	WebSummarizeParams,
	WebSummarizeResult,
} from "../types/search.js";

export interface SearchConnector {
	readonly skillId: "search";

	check(): Promise<ConnectorCapabilityCheck>;

	webSearch(params: WebSearchParams, signal?: AbortSignal): Promise<WebSearchResult>;
	webFetch(params: WebFetchParams, signal?: AbortSignal): Promise<WebFetchResult>;
	webSummarize(params: WebSummarizeParams, signal?: AbortSignal): Promise<WebSummarizeResult>;
}
