import type {
	MemoryCursor,
	MemoryEntry,
	MemoryFilter,
	MemoryQuery,
	MemoryQueryHit,
	RetrievalProfile,
} from "./types.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

export function normalizeLimit(limit: number | undefined): number {
	if (limit === undefined) {
		return DEFAULT_LIMIT;
	}
	if (!Number.isFinite(limit) || limit <= 0) {
		return DEFAULT_LIMIT;
	}
	return Math.min(Math.floor(limit), MAX_LIMIT);
}

export function encodeCursor(offset: number): MemoryCursor {
	return `offset:${offset}`;
}

export function decodeCursor(cursor: MemoryCursor | undefined): number {
	if (!cursor) {
		return 0;
	}
	const parts = cursor.split(":");
	if (parts.length !== 2 || parts[0] !== "offset") {
		return 0;
	}
	const value = Number.parseInt(parts[1] ?? "0", 10);
	if (!Number.isFinite(value) || value < 0) {
		return 0;
	}
	return value;
}

export function normalizeTags(tags: readonly string[]): readonly string[] {
	const unique = new Set<string>();
	for (const tag of tags) {
		const value = tag.trim();
		if (!value) {
			continue;
		}
		unique.add(value);
	}
	return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
}

export function cloneEntry(entry: MemoryEntry): MemoryEntry {
	return {
		...entry,
		content: { ...entry.content },
		tags: [...entry.tags],
		provenance: entry.provenance ? { ...entry.provenance } : undefined,
	};
}

export function isVisible(entry: MemoryEntry, filter: MemoryFilter, now: Date): boolean {
	if (!filter.includeDeleted && entry.deletedAt) {
		return false;
	}
	if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= now.getTime()) {
		return false;
	}
	if (filter.namespaces && filter.namespaces.length > 0 && !filter.namespaces.includes(entry.namespace)) {
		return false;
	}
	if (filter.kinds && filter.kinds.length > 0 && !filter.kinds.includes(entry.kind)) {
		return false;
	}
	if (filter.tagsAll && filter.tagsAll.length > 0) {
		const set = new Set(entry.tags);
		for (const tag of filter.tagsAll) {
			if (!set.has(tag)) {
				return false;
			}
		}
	}
	if (filter.tagsAny && filter.tagsAny.length > 0) {
		const set = new Set(entry.tags);
		if (!filter.tagsAny.some((tag) => set.has(tag))) {
			return false;
		}
	}
	if (filter.createdAfter && new Date(entry.createdAt).getTime() <= new Date(filter.createdAfter).getTime()) {
		return false;
	}
	if (filter.createdBefore && new Date(entry.createdAt).getTime() >= new Date(filter.createdBefore).getTime()) {
		return false;
	}
	if (filter.updatedAfter && new Date(entry.updatedAt).getTime() <= new Date(filter.updatedAfter).getTime()) {
		return false;
	}
	if (filter.updatedBefore && new Date(entry.updatedAt).getTime() >= new Date(filter.updatedBefore).getTime()) {
		return false;
	}
	return true;
}

function tokenize(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z0-9]+/g)
		.filter((token) => token.length > 0);
}

export function lexicalScore(queryText: string | undefined, entryText: string): number {
	if (!queryText) {
		return 0;
	}
	const queryTokens = tokenize(queryText);
	if (queryTokens.length === 0) {
		return 0;
	}
	const entryTokens = new Set(tokenize(entryText));
	let matches = 0;
	for (const token of queryTokens) {
		if (entryTokens.has(token)) {
			matches += 1;
		}
	}
	return matches / queryTokens.length;
}

export function recencyScore(updatedAt: string, now: Date): number {
	const updated = new Date(updatedAt).getTime();
	const ageMs = Math.max(0, now.getTime() - updated);
	const ageHours = ageMs / (1000 * 60 * 60);
	return 1 / (1 + ageHours);
}

function weightsForProfile(profile: RetrievalProfile, request: MemoryQuery): { lexical: number; vector: number; recency: number } {
	const defaults =
		profile === "vector"
			? { lexical: 0.15, vector: 0.7, recency: 0.15 }
			: profile === "hybrid"
				? { lexical: 0.45, vector: 0.4, recency: 0.15 }
				: { lexical: 0.8, vector: 0, recency: 0.2 };
	return {
		lexical: request.weights?.lexical ?? defaults.lexical,
		vector: request.weights?.vector ?? defaults.vector,
		recency: request.weights?.recency ?? defaults.recency,
	};
}

export function toScoredHit(
	entry: MemoryEntry,
	request: MemoryQuery,
	profile: RetrievalProfile,
	now: Date,
	vectorScore: number,
): MemoryQueryHit {
	const lexical = lexicalScore(request.text, entry.content.text);
	const recency = recencyScore(entry.updatedAt, now);
	const weights = weightsForProfile(profile, request);
	const final = lexical * weights.lexical + vectorScore * weights.vector + recency * weights.recency;

	return {
		entry: cloneEntry(entry),
		score: final,
		breakdown: {
			lexical,
			vector: vectorScore,
			recency,
			final,
		},
	};
}

export function compareHits(a: MemoryQueryHit, b: MemoryQueryHit): number {
	if (a.score !== b.score) {
		return b.score - a.score;
	}
	const updatedDiff = new Date(b.entry.updatedAt).getTime() - new Date(a.entry.updatedAt).getTime();
	if (updatedDiff !== 0) {
		return updatedDiff;
	}
	const createdDiff = new Date(b.entry.createdAt).getTime() - new Date(a.entry.createdAt).getTime();
	if (createdDiff !== 0) {
		return createdDiff;
	}
	return a.entry.id.localeCompare(b.entry.id);
}
