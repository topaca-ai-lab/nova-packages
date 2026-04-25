import type { ConnectorCapabilityCheck } from "../envelope.js";
import type { IdeConnector } from "../interfaces/ide.js";
import type {
	IdeFileDiffParams,
	IdeFileDiffResult,
	IdeFileInfo,
	IdeFileOpenParams,
	IdeFileOpenResult,
	IdePatchProposeParams,
	IdePatchProposeResult,
	IdeSelectionGetParams,
	IdeSelectionGetResult,
	IdeSelection,
} from "../types/ide.js";

export class MockIdeConnector implements IdeConnector {
	readonly skillId = "ide" as const;

	private readonly files = new Map<string, { info: IdeFileInfo; content: string }>();
	private currentSelection: IdeSelection | null = null;

	async check(): Promise<ConnectorCapabilityCheck> {
		return {
			skillId: "ide",
			available: true,
			backend: "mock",
			capabilities: { fileOpen: true, fileDiff: true, selectionGet: true, patchPropose: true },
		};
	}

	async fileOpen(params: IdeFileOpenParams): Promise<IdeFileOpenResult> {
		const file = this.files.get(params.path);
		if (!file) {
			return { file: { path: params.path, lineCount: 0, dirty: false }, opened: false };
		}
		return { file: { ...file.info }, opened: true };
	}

	async fileDiff(params: IdeFileDiffParams): Promise<IdeFileDiffResult> {
		const contentA = this.files.get(params.pathA)?.content ?? "";
		const contentB = this.files.get(params.pathB)?.content ?? "";
		return {
			diff: {
				path: params.pathA,
				oldContent: contentA,
				newContent: contentB,
				hunks: contentA !== contentB ? [{ startLine: 1, endLine: 1, content: contentB }] : [],
			},
		};
	}

	async selectionGet(_params: IdeSelectionGetParams): Promise<IdeSelectionGetResult> {
		return { selection: this.currentSelection ? { ...this.currentSelection } : null };
	}

	async patchPropose(params: IdePatchProposeParams): Promise<IdePatchProposeResult> {
		const file = this.files.get(params.path);
		if (!file) return { applied: false, path: params.path, linesChanged: 0 };
		const lines = file.content.split("\n");
		const replacement = params.replacement.split("\n");
		const removed = params.endLine - params.startLine + 1;
		lines.splice(params.startLine - 1, removed, ...replacement);
		file.content = lines.join("\n");
		file.info.lineCount = lines.length;
		file.info.dirty = true;
		return { applied: true, path: params.path, linesChanged: replacement.length };
	}

	seedFile(path: string, content: string, languageId?: string): void {
		const lines = content.split("\n");
		this.files.set(path, {
			info: { path, languageId, lineCount: lines.length, dirty: false },
			content,
		});
	}

	setSelection(selection: IdeSelection | null): void {
		this.currentSelection = selection ? { ...selection } : null;
	}
}
