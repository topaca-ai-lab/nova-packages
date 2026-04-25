import type { MemoryStore } from "./interfaces/memory-store.js";
import type { MemoryEntry, MemoryKind } from "./types.js";

export interface WikiPageInput {
	namespace: string;
	slug: string;
	title: string;
	body: string;
	tags?: readonly string[];
	kind?: MemoryKind;
	now?: Date;
}

export interface WikiPage {
	id: string;
	namespace: string;
	slug: string;
	title: string;
	body: string;
	tags: readonly string[];
	updatedAt: string;
}

const WIKI_TAG = "wiki-page";
const WIKI_PREFIX = "wiki:";

export async function upsertWikiPage(store: MemoryStore, input: WikiPageInput): Promise<WikiPage> {
	const nowIso = (input.now ?? new Date()).toISOString();
	const id = wikiPageId(input.slug);
	const kind = input.kind ?? "semantic";
	const tags = normalizeTags([WIKI_TAG, `wiki:${input.slug}`, ...(input.tags ?? [])]);

	const entry = await store.upsert({
		id,
		namespace: input.namespace,
		kind,
		content: {
			text: renderWikiContent(input.title, input.body),
			structured: {
				wiki: {
					slug: input.slug,
					title: input.title,
					body: input.body,
				},
			},
		},
		tags,
		provenance: {
			source: "wiki",
			sourceRef: input.slug,
		},
		updatedAt: nowIso,
	});

	return toWikiPage(entry);
}

export async function getWikiPage(
	store: MemoryStore,
	namespace: string,
	slug: string,
): Promise<WikiPage | undefined> {
	const entry = await store.getById(wikiPageId(slug), namespace);
	if (!entry) {
		return undefined;
	}
	return toWikiPage(entry);
}

export async function listWikiPages(
	store: MemoryStore,
	namespace: string,
	limit = 100,
): Promise<readonly WikiPage[]> {
	const result = await store.query({
		filter: {
			namespaces: [namespace],
			tagsAny: [WIKI_TAG],
		},
		limit,
	});
	return result.hits.map((hit) => toWikiPage(hit.entry));
}

export function wikiPageId(slug: string): string {
	return `${WIKI_PREFIX}${slug.trim().toLowerCase()}`;
}

function renderWikiContent(title: string, body: string): string {
	return `# ${title.trim()}\n\n${body.trim()}`;
}

function toWikiPage(entry: MemoryEntry): WikiPage {
	const structured = entry.content.structured;
	const wikiRaw = structured?.wiki;
	let slug = entry.id.startsWith(WIKI_PREFIX) ? entry.id.slice(WIKI_PREFIX.length) : entry.id;
	let title = slug;
	let body = entry.content.text;

	if (wikiRaw && typeof wikiRaw === "object") {
		const candidate = wikiRaw as Record<string, unknown>;
		if (typeof candidate.slug === "string" && candidate.slug.trim().length > 0) {
			slug = candidate.slug;
		}
		if (typeof candidate.title === "string" && candidate.title.trim().length > 0) {
			title = candidate.title;
		}
		if (typeof candidate.body === "string") {
			body = candidate.body;
		}
	}

	return {
		id: entry.id,
		namespace: entry.namespace,
		slug,
		title,
		body,
		tags: entry.tags,
		updatedAt: entry.updatedAt,
	};
}

function normalizeTags(tags: readonly string[]): readonly string[] {
	const set = new Set<string>();
	for (const tag of tags) {
		const normalized = tag.trim();
		if (normalized.length > 0) {
			set.add(normalized);
		}
	}
	return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
}
