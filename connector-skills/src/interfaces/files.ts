import type { ConnectorCapabilityCheck } from "../envelope.js";
import type {
	FileDownloadParams,
	FileDownloadResult,
	FileListParams,
	FileListResult,
	FileSearchParams,
	FileSearchResult,
	FileShareParams,
	FileShareResult,
	FileUploadParams,
	FileUploadResult,
} from "../types/files.js";

export interface FilesConnector {
	readonly skillId: "files";

	check(): Promise<ConnectorCapabilityCheck>;

	list(params: FileListParams, signal?: AbortSignal): Promise<FileListResult>;
	upload(params: FileUploadParams, signal?: AbortSignal): Promise<FileUploadResult>;
	download(params: FileDownloadParams, signal?: AbortSignal): Promise<FileDownloadResult>;
	search(params: FileSearchParams, signal?: AbortSignal): Promise<FileSearchResult>;
	share(params: FileShareParams, signal?: AbortSignal): Promise<FileShareResult>;
}
