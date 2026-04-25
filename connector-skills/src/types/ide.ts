// --- IDE Types (Generic LSP/Editor interface) ---

export interface IdeFileInfo {
	path: string;
	languageId?: string;
	lineCount?: number;
	dirty?: boolean;
}

export interface IdeDiffEntry {
	path: string;
	oldContent: string;
	newContent: string;
	hunks: readonly IdeDiffHunk[];
}

export interface IdeDiffHunk {
	startLine: number;
	endLine: number;
	content: string;
}

export interface IdeSelection {
	path: string;
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
	text: string;
}

// --- Action Params ---

export interface IdeFileOpenParams {
	path: string;
	line?: number;
	column?: number;
}

export interface IdeFileDiffParams {
	pathA: string;
	pathB: string;
}

export interface IdeSelectionGetParams {
	path?: string;
}

export interface IdePatchProposeParams {
	path: string;
	startLine: number;
	endLine: number;
	replacement: string;
	description?: string;
}

// --- Action Results ---

export interface IdeFileOpenResult {
	file: IdeFileInfo;
	opened: boolean;
}

export interface IdeFileDiffResult {
	diff: IdeDiffEntry;
}

export interface IdeSelectionGetResult {
	selection: IdeSelection | null;
}

export interface IdePatchProposeResult {
	applied: boolean;
	path: string;
	linesChanged: number;
}
