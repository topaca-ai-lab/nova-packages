// --- Media Types (Whisper + YouTube Transcript) ---

export interface TranscriptSegment {
	startMs: number;
	endMs: number;
	text: string;
}

export interface TranscriptionResult {
	text: string;
	language: string;
	durationMs: number;
	segments?: readonly TranscriptSegment[];
}

export interface LanguageDetection {
	language: string;
	confidence: number;
}

// --- Action Params ---

export interface AudioTranscribeParams {
	filePath: string;
	language?: string;
	timestamps?: boolean;
}

export interface TranscriptFetchParams {
	videoUrl: string;
	language?: string;
}

export interface LanguageDetectParams {
	filePath: string;
}

// --- Action Results ---

export interface AudioTranscribeResult {
	transcription: TranscriptionResult;
}

export interface TranscriptFetchResult {
	videoUrl: string;
	transcription: TranscriptionResult;
}

export interface LanguageDetectResult {
	detection: LanguageDetection;
}
