import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import type { ConnectorCapabilityCheck } from "../envelope.js";
import { ConnectorNotAvailableError, ConnectorTimeoutError } from "../errors.js";
import type { MediaConnector } from "../interfaces/media.js";
import type {
	AudioTranscribeParams,
	AudioTranscribeResult,
	LanguageDetectParams,
	LanguageDetectResult,
	TranscriptFetchParams,
	TranscriptFetchResult,
	TranscriptSegment,
} from "../types/media.js";

export interface LocalMediaOptions {
	/** Path to whisper CLI binary (whisper, whisper.cpp main, or faster-whisper). */
	whisperBinary?: string;
	/** Whisper model to use (e.g. "base", "small", "medium"). Default: "base". */
	whisperModel?: string;
	/** Timeout for transcription in ms. Default: 120_000. */
	timeoutMs?: number;
}

export class LocalMediaConnector implements MediaConnector {
	readonly skillId = "media" as const;
	private readonly whisperBin: string;
	private readonly whisperModel: string;
	private readonly timeout: number;

	constructor(options: LocalMediaOptions = {}) {
		this.whisperBin = options.whisperBinary ?? "whisper";
		this.whisperModel = options.whisperModel ?? "base";
		this.timeout = options.timeoutMs ?? 120_000;
	}

	async check(): Promise<ConnectorCapabilityCheck> {
		const whisperAvailable = await this.isWhisperAvailable();
		return {
			skillId: "media",
			available: whisperAvailable,
			backend: "local",
			message: whisperAvailable ? undefined : `Whisper binary not found: ${this.whisperBin}`,
			capabilities: {
				audioTranscribe: whisperAvailable,
				transcriptFetch: true,
				languageDetect: whisperAvailable,
			},
		};
	}

	async audioTranscribe(params: AudioTranscribeParams): Promise<AudioTranscribeResult> {
		await this.assertFileExists(params.filePath);

		const args = [
			params.filePath,
			"--model", this.whisperModel,
			"--output_format", "json",
		];
		if (params.language) args.push("--language", params.language);

		const output = await this.runWhisper(args);
		const parsed = this.parseWhisperOutput(output, params.timestamps);

		return {
			transcription: {
				text: parsed.text,
				language: parsed.language ?? params.language ?? "en",
				durationMs: parsed.durationMs,
				segments: parsed.segments,
			},
		};
	}

	async transcriptFetch(params: TranscriptFetchParams): Promise<TranscriptFetchResult> {
		const videoId = extractVideoId(params.videoUrl);
		if (!videoId) throw new Error(`Cannot extract video ID from: ${params.videoUrl}`);

		const url = `https://www.youtube.com/watch?v=${videoId}`;
		const res = await fetch(url);
		const html = await res.text();

		const captionTrack = extractCaptionTrack(html, params.language);
		if (!captionTrack) {
			throw new ConnectorNotAvailableError("youtube", `No transcript available for: ${params.videoUrl}`);
		}

		const captionRes = await fetch(captionTrack);
		const captionXml = await captionRes.text();
		const { text, segments, durationMs } = parseCaptionXml(captionXml);

		return {
			videoUrl: params.videoUrl,
			transcription: {
				text,
				language: params.language ?? "en",
				durationMs,
				segments,
			},
		};
	}

	async languageDetect(params: LanguageDetectParams): Promise<LanguageDetectResult> {
		await this.assertFileExists(params.filePath);

		const args = [params.filePath, "--model", this.whisperModel, "--task", "detect_language"];
		try {
			const output = await this.runWhisper(args);
			const langMatch = output.match(/Detected language:\s*(\w+)/i);
			const language = langMatch?.[1]?.toLowerCase() ?? "en";
			return { detection: { language, confidence: 0.9 } };
		} catch {
			return { detection: { language: "en", confidence: 0.5 } };
		}
	}

	private async isWhisperAvailable(): Promise<boolean> {
		return new Promise((resolve) => {
			execFile(this.whisperBin, ["--help"], { timeout: 5_000 }, (err) => {
				resolve(!err);
			});
		});
	}

	private async assertFileExists(filePath: string): Promise<void> {
		try {
			await access(filePath, constants.R_OK);
		} catch {
			throw new Error(`File not accessible: ${filePath}`);
		}
	}

	private runWhisper(args: string[]): Promise<string> {
		return new Promise((resolve, reject) => {
			execFile(this.whisperBin, args, { timeout: this.timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
				if (err) {
					if (err.killed || err.message.includes("ETIMEDOUT")) {
						reject(new ConnectorTimeoutError(this.timeout, `Whisper timed out after ${this.timeout}ms`));
					} else {
						reject(err);
					}
					return;
				}
				resolve(stdout || stderr);
			});
		});
	}

	private parseWhisperOutput(output: string, timestamps?: boolean): {
		text: string;
		language?: string;
		durationMs: number;
		segments?: TranscriptSegment[];
	} {
		try {
			const json = JSON.parse(output) as {
				text?: string;
				language?: string;
				segments?: Array<{ start: number; end: number; text: string }>;
			};
			const segments = timestamps && json.segments
				? json.segments.map((s) => ({
						startMs: Math.round(s.start * 1000),
						endMs: Math.round(s.end * 1000),
						text: s.text.trim(),
					}))
				: undefined;
			const lastSeg = json.segments?.[json.segments.length - 1];
			return {
				text: json.text?.trim() ?? "",
				language: json.language,
				durationMs: lastSeg ? Math.round(lastSeg.end * 1000) : 0,
				segments,
			};
		} catch {
			return { text: output.trim(), durationMs: 0 };
		}
	}
}

function extractVideoId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
		/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
	];
	for (const p of patterns) {
		const match = url.match(p);
		if (match?.[1]) return match[1];
	}
	return null;
}

function extractCaptionTrack(html: string, language?: string): string | null {
	const match = html.match(/"captionTracks":\s*(\[.*?\])/);
	if (!match?.[1]) return null;
	try {
		const tracks = JSON.parse(match[1]) as Array<{ baseUrl: string; languageCode: string }>;
		const preferred = language ? tracks.find((t) => t.languageCode === language) : undefined;
		const track = preferred ?? tracks[0];
		return track?.baseUrl ?? null;
	} catch {
		return null;
	}
}

function parseCaptionXml(xml: string): { text: string; segments: TranscriptSegment[]; durationMs: number } {
	const segments: TranscriptSegment[] = [];
	const regex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(xml)) !== null) {
		const start = parseFloat(match[1]!) * 1000;
		const dur = parseFloat(match[2]!) * 1000;
		const text = match[3]!.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
		segments.push({ startMs: Math.round(start), endMs: Math.round(start + dur), text });
	}
	const fullText = segments.map((s) => s.text).join(" ");
	const lastSeg = segments[segments.length - 1];
	return { text: fullText, segments, durationMs: lastSeg?.endMs ?? 0 };
}
