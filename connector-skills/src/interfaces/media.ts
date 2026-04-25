import type { ConnectorCapabilityCheck } from "../envelope.js";
import type {
	AudioTranscribeParams,
	AudioTranscribeResult,
	LanguageDetectParams,
	LanguageDetectResult,
	TranscriptFetchParams,
	TranscriptFetchResult,
} from "../types/media.js";

export interface MediaConnector {
	readonly skillId: "media";

	check(): Promise<ConnectorCapabilityCheck>;

	audioTranscribe(params: AudioTranscribeParams, signal?: AbortSignal): Promise<AudioTranscribeResult>;
	transcriptFetch(params: TranscriptFetchParams, signal?: AbortSignal): Promise<TranscriptFetchResult>;
	languageDetect(params: LanguageDetectParams, signal?: AbortSignal): Promise<LanguageDetectResult>;
}
