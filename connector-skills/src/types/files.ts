import type { IsoTimestamp } from "../envelope.js";

// --- Files Types (WebDAV / S3-compatible) ---

export interface FileEntry {
	path: string;
	name: string;
	isDirectory: boolean;
	sizeBytes?: number;
	mimeType?: string;
	modifiedAt: IsoTimestamp;
	createdAt?: IsoTimestamp;
}

export interface FileShareLink {
	url: string;
	expiresAt?: IsoTimestamp;
	password?: string;
}

// --- Action Params ---

export interface FileListParams {
	path: string;
	recursive?: boolean;
	limit?: number;
}

export interface FileUploadParams {
	path: string;
	content: string;
	mimeType?: string;
	overwrite?: boolean;
}

export interface FileDownloadParams {
	path: string;
}

export interface FileSearchParams {
	query: string;
	path?: string;
	limit?: number;
}

export interface FileShareParams {
	path: string;
	expiresInMs?: number;
	password?: string;
}

// --- Action Results ---

export interface FileListResult {
	entries: readonly FileEntry[];
	totalCount: number;
}

export interface FileUploadResult {
	path: string;
	sizeBytes: number;
	uploadedAt: IsoTimestamp;
}

export interface FileDownloadResult {
	path: string;
	content: string;
	mimeType?: string;
	sizeBytes: number;
}

export interface FileSearchResult {
	entries: readonly FileEntry[];
	totalCount: number;
}

export interface FileShareResult {
	link: FileShareLink;
}
