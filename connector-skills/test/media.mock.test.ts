import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockMediaConnector } from "../src/adapters/media.mock.ts";

describe("MockMediaConnector", () => {
	let media: MockMediaConnector;

	beforeEach(() => {
		media = new MockMediaConnector();
	});

	it("check returns available", async () => {
		const check = await media.check();
		assert.equal(check.available, true);
	});

	it("audioTranscribe returns transcription for seeded file", async () => {
		media.seedTranscription("/audio/test.wav", "Hello world", "en");
		const result = await media.audioTranscribe({ filePath: "/audio/test.wav" });
		assert.equal(result.transcription.text, "Hello world");
		assert.equal(result.transcription.language, "en");
	});

	it("audioTranscribe includes segments when timestamps=true", async () => {
		media.seedTranscription("/audio/test.wav", "Hello", "en");
		const result = await media.audioTranscribe({ filePath: "/audio/test.wav", timestamps: true });
		assert.ok(result.transcription.segments);
		assert.equal(result.transcription.segments.length, 1);
	});

	it("audioTranscribe throws for missing file", async () => {
		await assert.rejects(() => media.audioTranscribe({ filePath: "/nope.wav" }));
	});

	it("transcriptFetch returns transcript for seeded video", async () => {
		media.seedTranscript("https://youtube.com/watch?v=abc", "Video transcript", "de");
		const result = await media.transcriptFetch({ videoUrl: "https://youtube.com/watch?v=abc" });
		assert.equal(result.transcription.text, "Video transcript");
		assert.equal(result.transcription.language, "de");
	});

	it("transcriptFetch throws for missing video", async () => {
		await assert.rejects(() => media.transcriptFetch({ videoUrl: "https://missing.com" }));
	});

	it("languageDetect returns language for seeded file", async () => {
		media.seedTranscription("/audio/de.wav", "Hallo Welt", "de");
		const result = await media.languageDetect({ filePath: "/audio/de.wav" });
		assert.equal(result.detection.language, "de");
		assert.ok(result.detection.confidence > 0.9);
	});

	it("languageDetect returns default for unknown file", async () => {
		const result = await media.languageDetect({ filePath: "/unknown.wav" });
		assert.equal(result.detection.language, "en");
		assert.equal(result.detection.confidence, 0.5);
	});
});
