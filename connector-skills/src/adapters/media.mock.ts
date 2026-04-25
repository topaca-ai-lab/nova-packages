import type { ConnectorCapabilityCheck } from "../envelope.js";
import type { MediaConnector } from "../interfaces/media.js";
import type {
	AudioTranscribeParams,
	AudioTranscribeResult,
	LanguageDetectParams,
	LanguageDetectResult,
	TranscriptFetchParams,
	TranscriptFetchResult,
} from "../types/media.js";

export class MockMediaConnector implements MediaConnector {
	readonly skillId = "media" as const;

	private readonly transcriptions = new Map<string, { text: string; language: string }>();
	private readonly transcripts = new Map<string, { text: string; language: string }>();

	async check(): Promise<ConnectorCapabilityCheck> {
		return {
			skillId: "media",
			available: true,
			backend: "mock",
			capabilities: { audioTranscribe: true, transcriptFetch: true, languageDetect: true },
		};
	}

	async audioTranscribe(params: AudioTranscribeParams): Promise<AudioTranscribeResult> {
		const entry = this.transcriptions.get(params.filePath);
		if (!entry) throw new Error(`Audio file not found: ${params.filePath}`);
		return {
			transcription: {
				text: entry.text,
				language: params.language ?? entry.language,
				durationMs: entry.text.length * 50,
				segments: params.timestamps
					? [{ startMs: 0, endMs: entry.text.length * 50, text: entry.text }]
					: undefined,
			},
		};
	}

	async transcriptFetch(params: TranscriptFetchParams): Promise<TranscriptFetchResult> {
		const entry = this.transcripts.get(params.videoUrl);
		if (!entry) throw new Error(`Transcript not found: ${params.videoUrl}`);
		return {
			videoUrl: params.videoUrl,
			transcription: {
				text: entry.text,
				language: params.language ?? entry.language,
				durationMs: entry.text.length * 50,
			},
		};
	}

	async languageDetect(params: LanguageDetectParams): Promise<LanguageDetectResult> {
		const entry = this.transcriptions.get(params.filePath);
		return { detection: { language: entry?.language ?? "en", confidence: entry ? 0.95 : 0.5 } };
	}

	seedTranscription(filePath: string, text: string, language: string): void {
		this.transcriptions.set(filePath, { text, language });
	}

	seedTranscript(videoUrl: string, text: string, language: string): void {
		this.transcripts.set(videoUrl, { text, language });
	}
}
