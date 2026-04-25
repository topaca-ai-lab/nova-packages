import { createClient, type WebDAVClient } from "webdav";
import type { ConnectorCapabilityCheck } from "../envelope.js";
import { ConnectorAuthError, ConnectorNotAvailableError } from "../errors.js";
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

export interface WebDavFilesOptions {
	serverUrl: string;
	credentials: { username: string; password: string };
}

export class WebDavFilesConnector implements FilesConnector {
	readonly skillId = "files" as const;
	private readonly client: WebDAVClient;

	constructor(options: WebDavFilesOptions) {
		this.client = createClient(options.serverUrl, {
			username: options.credentials.username,
			password: options.credentials.password,
		});
	}

	async check(): Promise<ConnectorCapabilityCheck> {
		try {
			await this.client.getDirectoryContents("/");
			return {
				skillId: "files",
				available: true,
				backend: "webdav",
				capabilities: { list: true, upload: true, download: true, search: true, share: true },
			};
		} catch (err) {
			return {
				skillId: "files",
				available: false,
				backend: "webdav",
				message: err instanceof Error ? err.message : String(err),
				capabilities: { list: false, upload: false, download: false, search: false, share: false },
			};
		}
	}

	async list(params: FileListParams): Promise<FileListResult> {
		try {
			const items = await this.client.getDirectoryContents(params.path, {
				deep: params.recursive ?? false,
			});
			const itemsArray = Array.isArray(items) ? items : (items as any).data;
			const entries: FileEntry[] = itemsArray.map(mapFileStat);
			const limit = params.limit ?? 100;
			return { entries: entries.slice(0, limit), totalCount: entries.length };
		} catch (err) {
			throw this.mapError(err);
		}
	}

	async upload(params: FileUploadParams): Promise<FileUploadResult> {
		try {
			if (!params.overwrite) {
				const exists = await this.client.exists(params.path);
				if (exists) throw new Error(`File already exists: ${params.path}`);
			}
			await this.client.putFileContents(params.path, params.content, {
				contentLength: false,
			});
			return {
				path: params.path,
				sizeBytes: Buffer.byteLength(params.content),
				uploadedAt: new Date().toISOString(),
			};
		} catch (err) {
			throw this.mapError(err);
		}
	}

	async download(params: FileDownloadParams): Promise<FileDownloadResult> {
		try {
			const content = await this.client.getFileContents(params.path, { format: "text" });
			const stat = await this.client.stat(params.path);
			const info = Array.isArray(stat) ? stat[0] : ("data" in stat ? stat.data : stat);
			return {
				path: params.path,
				content: typeof content === "string" ? content : String(content),
				mimeType: info?.mime ?? undefined,
				sizeBytes: typeof content === "string" ? Buffer.byteLength(content) : 0,
			};
		} catch (err) {
			throw this.mapError(err);
		}
	}

	async search(params: FileSearchParams): Promise<FileSearchResult> {
		try {
			const basePath = params.path ?? "/";
			const items = await this.client.getDirectoryContents(basePath, { deep: true });
			const itemsArray = Array.isArray(items) ? items : (items as any).data;
			const allEntries = itemsArray.map(mapFileStat);

			const q = params.query.toLowerCase();
			const filtered = allEntries.filter((e: FileEntry) => e.name.toLowerCase().includes(q));
			const limit = params.limit ?? 20;
			return { entries: filtered.slice(0, limit), totalCount: filtered.length };
		} catch (err) {
			throw this.mapError(err);
		}
	}

	async share(_params: FileShareParams): Promise<FileShareResult> {
		return {
			link: {
				url: "share-not-supported-via-webdav",
			},
		};
	}

	private mapError(err: unknown): Error {
		if (err instanceof ConnectorAuthError || err instanceof ConnectorNotAvailableError) return err;
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes("401") || msg.includes("auth")) return new ConnectorAuthError(msg);
		if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) return new ConnectorNotAvailableError("webdav", msg);
		return err instanceof Error ? err : new Error(msg);
	}
}

function mapFileStat(item: Record<string, unknown>): FileEntry {
	return {
		path: String(item.filename ?? item.href ?? ""),
		name: String(item.basename ?? ""),
		isDirectory: item.type === "directory",
		sizeBytes: typeof item.size === "number" ? item.size : undefined,
		mimeType: typeof item.mime === "string" ? item.mime : undefined,
		modifiedAt: typeof item.lastmod === "string" ? new Date(item.lastmod).toISOString() : new Date().toISOString(),
	};
}
