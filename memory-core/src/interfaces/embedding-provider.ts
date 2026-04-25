import type { EmbeddingRequest, EmbeddingResponse } from "../types.js";

export interface EmbeddingProvider {
	readonly provider: string;
	readonly model?: string;

	embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
