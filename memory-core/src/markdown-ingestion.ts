import { createHash } from "node:crypto";
import type { MemoryStore } from "./interfaces/memory-store.js";
import type { MemoryKind, MemoryUpsertEntry } from "./types.js";

export interface MarkdownIngestionOptions {
	namespace: string;
	sourceId: string;
	markdown: string;
	kind?: MemoryKind;
	tags?: readonly string[];
	chunkSize?: number;
	chunkOverlap?: number;
	now?: Date;
}

export interface MarkdownIngestionChunk {
	id: string;
	index: number;
	totalChunks: number;
	text: string;
	sourceRef: string;
}

export interface MarkdownIngestionResult {
	sourceId: string;
	namespace: string;
	kind: MemoryKind;
	chunkCount: number;
	chunks: readonly MarkdownIngestionChunk[];
}

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 150;

export async function ingestMarkdownDocument(
	store: MemoryStore,
	options: MarkdownIngestionOptions,
): Promise<MarkdownIngestionResult> {
	const kind = options.kind ?? "semantic";
	const chunkSize = normalizeChunkSize(options.chunkSize);
	const chunkOverlap = normalizeChunkOverlap(options.chunkOverlap, chunkSize);
	const chunksText = chunkMarkdown(options.markdown, chunkSize, chunkOverlap);
	const nowIso = (options.now ?? new Date()).toISOString();
	const totalChunks = chunksText.length;
	const chunks: MarkdownIngestionChunk[] = [];
	const entries: MemoryUpsertEntry[] = [];

	for (let i = 0; i < chunksText.length; i += 1) {
		const text = chunksText[i] ?? "";
		const chunkId = deterministicChunkId(options.sourceId, i, text);
		const sourceRef = `${options.sourceId}#chunk-${i + 1}`;
		chunks.push({
			id: chunkId,
			index: i,
			totalChunks,
			text,
			sourceRef,
		});
		entries.push({
			id: chunkId,
			namespace: options.namespace,
			kind,
			content: {
				text,
				structured: {
					sourceId: options.sourceId,
					chunkIndex: i,
					totalChunks,
				},
			},
			tags: mergeTags(options.tags, ["markdown", "source", `source:${options.sourceId}`]),
			provenance: {
				source: "markdown",
				sourceRef,
			},
			updatedAt: nowIso,
		});
	}

	await store.upsertMany(entries);

	return {
		sourceId: options.sourceId,
		namespace: options.namespace,
		kind,
		chunkCount: chunks.length,
		chunks,
	};
}

export function chunkMarkdown(markdown: string, chunkSize: number, chunkOverlap: number): string[] {
	const normalized = markdown.replace(/\r\n/g, "\n").trim();
	if (!normalized) {
		return [];
	}
	const paragraphs = normalized
		.split(/\n{2,}/g)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
	if (paragraphs.length === 0) {
		return [];
	}

	const chunks: string[] = [];
	let buffer = "";

	for (const paragraph of paragraphs) {
		const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
		if (candidate.length <= chunkSize) {
			buffer = candidate;
			continue;
		}

		if (buffer) {
			chunks.push(buffer);
		}

		if (paragraph.length <= chunkSize) {
			buffer = paragraph;
			continue;
		}

		let start = 0;
		while (start < paragraph.length) {
			const end = Math.min(start + chunkSize, paragraph.length);
			const part = paragraph.slice(start, end).trim();
			if (part.length > 0) {
				chunks.push(part);
			}
			if (end >= paragraph.length) {
				break;
			}
			start = Math.max(0, end - chunkOverlap);
		}
		buffer = "";
	}

	if (buffer) {
		chunks.push(buffer);
	}
	return chunks;
}

function deterministicChunkId(sourceId: string, index: number, text: string): string {
	const hash = createHash("sha256");
	hash.update(sourceId);
	hash.update(":");
	hash.update(String(index));
	hash.update(":");
	hash.update(text.trim());
	return `md_${hash.digest("hex").slice(0, 24)}`;
}

function mergeTags(base: readonly string[] | undefined, extra: readonly string[]): readonly string[] {
	const set = new Set<string>();
	for (const tag of base ?? []) {
		const normalized = tag.trim();
		if (normalized.length > 0) {
			set.add(normalized);
		}
	}
	for (const tag of extra) {
		const normalized = tag.trim();
		if (normalized.length > 0) {
			set.add(normalized);
		}
	}
	return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
}

function normalizeChunkSize(value: number | undefined): number {
	if (!value || !Number.isFinite(value)) {
		return DEFAULT_CHUNK_SIZE;
	}
	return Math.max(250, Math.floor(value));
}

function normalizeChunkOverlap(value: number | undefined, chunkSize: number): number {
	if (!value || !Number.isFinite(value)) {
		return DEFAULT_CHUNK_OVERLAP;
	}
	return Math.max(0, Math.min(Math.floor(value), chunkSize - 50));
}
