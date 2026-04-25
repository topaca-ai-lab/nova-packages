import type { ConnectorCapabilityCheck } from "../envelope.js";
import type { FilesConnector } from "../interfaces/files.js";
import type {
	FileDownloadParams,
	FileDownloadResult,
	FileEntry,
	FileListParams,
	FileListResult,
	FileSearchParams,
	FileSearchResult,
	FileShareParams,
	FileShareResult,
	FileUploadParams,
	FileUploadResult,
} from "../types/files.js";

export class MockFilesConnector implements FilesConnector {
	readonly skillId = "files" as const;

	private readonly store = new Map<string, { entry: FileEntry; content: string }>();

	async check(): Promise<ConnectorCapabilityCheck> {
		return {
			skillId: "files",
			available: true,
			backend: "mock",
			capabilities: {
				list: true,
				upload: true,
				download: true,
				search: true,
				share: true,
			},
		};
	}

	async list(params: FileListParams): Promise<FileListResult> {
		const prefix = params.path.endsWith("/") ? params.path : `${params.path}/`;
		let entries = [...this.store.values()]
			.map((s) => s.entry)
			.filter((e) => {
				if (params.recursive) {
					return e.path.startsWith(prefix);
				}
				const relative = e.path.slice(prefix.length);
				return e.path.startsWith(prefix) && !relative.includes("/");
			});

		const limit = params.limit ?? 100;
		const sliced = entries.slice(0, limit);
		return { entries: sliced.map((e) => ({ ...e })), totalCount: entries.length };
	}

	async upload(params: FileUploadParams): Promise<FileUploadResult> {
		if (!params.overwrite && this.store.has(params.path)) {
			throw new Error(`File already exists: ${params.path}`);
		}
		const now = new Date().toISOString();
		const name = params.path.split("/").pop() ?? params.path;
		const entry: FileEntry = {
			path: params.path,
			name,
			isDirectory: false,
			sizeBytes: params.content.length,
			mimeType: params.mimeType ?? "application/octet-stream",
			modifiedAt: now,
			createdAt: now,
		};
		this.store.set(params.path, { entry, content: params.content });
		return { path: params.path, sizeBytes: params.content.length, uploadedAt: now };
	}

	async download(params: FileDownloadParams): Promise<FileDownloadResult> {
		const file = this.store.get(params.path);
		if (!file) {
			throw new Error(`File not found: ${params.path}`);
		}
		return {
			path: params.path,
			content: file.content,
			mimeType: file.entry.mimeType,
			sizeBytes: file.content.length,
		};
	}

	async search(params: FileSearchParams): Promise<FileSearchResult> {
		const q = params.query.toLowerCase();
		let entries = [...this.store.values()]
			.filter((s) => {
				if (params.path && !s.entry.path.startsWith(params.path)) return false;
				return s.entry.name.toLowerCase().includes(q) || s.content.toLowerCase().includes(q);
			})
			.map((s) => s.entry);

		const limit = params.limit ?? 20;
		const sliced = entries.slice(0, limit);
		return { entries: sliced.map((e) => ({ ...e })), totalCount: entries.length };
	}

	async share(params: FileShareParams): Promise<FileShareResult> {
		if (!this.store.has(params.path)) {
			throw new Error(`File not found: ${params.path}`);
		}
		const expiresAt = params.expiresInMs
			? new Date(Date.now() + params.expiresInMs).toISOString()
			: undefined;
		return {
			link: {
				url: `https://mock.example.com/share/${encodeURIComponent(params.path)}`,
				expiresAt,
				password: params.password,
			},
		};
	}

	/** Test helper: seed a file. */
	seedFile(path: string, content: string, mimeType?: string): void {
		const name = path.split("/").pop() ?? path;
		const now = new Date().toISOString();
		this.store.set(path, {
			entry: {
				path,
				name,
				isDirectory: false,
				sizeBytes: content.length,
				mimeType: mimeType ?? "text/plain",
				modifiedAt: now,
				createdAt: now,
			},
			content,
		});
	}
}
