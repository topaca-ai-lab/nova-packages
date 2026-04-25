import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { ConnectorCapabilityCheck } from "../envelope.js";
import { ConnectorValidationError } from "../errors.js";
import type { IdeConnector } from "../interfaces/ide.js";
import type {
	IdeFileDiffParams,
	IdeFileDiffResult,
	IdeFileOpenParams,
	IdeFileOpenResult,
	IdePatchProposeParams,
	IdePatchProposeResult,
	IdeSelectionGetParams,
	IdeSelectionGetResult,
} from "../types/ide.js";

export interface LocalIdeOptions {
	/** Root workspace directory. All paths are resolved relative to this. */
	workspaceRoot: string;
}

const LANGUAGE_MAP: Record<string, string> = {
	".ts": "typescript",
	".tsx": "typescriptreact",
	".js": "javascript",
	".jsx": "javascriptreact",
	".py": "python",
	".rs": "rust",
	".go": "go",
	".md": "markdown",
	".json": "json",
	".yaml": "yaml",
	".yml": "yaml",
	".html": "html",
	".css": "css",
	".sh": "shellscript",
};

/**
 * Filesystem-based IDE connector. Operates directly on the file system
 * without requiring a running editor. Suitable for headless/agent workflows.
 */
export class LocalIdeConnector implements IdeConnector {
	readonly skillId = "ide" as const;
	private readonly root: string;
	private readonly rootResolved: string;

	constructor(options: LocalIdeOptions) {
		this.root = options.workspaceRoot;
		this.rootResolved = resolve(options.workspaceRoot);
	}

	async check(): Promise<ConnectorCapabilityCheck> {
		try {
			await readdir(this.root);
			return {
				skillId: "ide",
				available: true,
				backend: "local-fs",
				capabilities: { fileOpen: true, fileDiff: true, selectionGet: false, patchPropose: true },
			};
		} catch {
			return {
				skillId: "ide",
				available: false,
				backend: "local-fs",
				message: `Workspace not accessible: ${this.root}`,
				capabilities: { fileOpen: false, fileDiff: false, selectionGet: false, patchPropose: false },
			};
		}
	}

	async fileOpen(params: IdeFileOpenParams): Promise<IdeFileOpenResult> {
		const fullPath = this.resolvePathWithinRoot(params.path);
		try {
			const content = await readFile(fullPath, "utf-8");
			const lines = content.split("\n");
			const ext = extname(fullPath);
			return {
				file: {
					path: params.path,
					languageId: LANGUAGE_MAP[ext],
					lineCount: lines.length,
					dirty: false,
				},
				opened: true,
			};
		} catch (err) {
			if (err instanceof ConnectorValidationError) {
				throw err;
			}
			return {
				file: { path: params.path, lineCount: 0, dirty: false },
				opened: false,
			};
		}
	}

	async fileDiff(params: IdeFileDiffParams): Promise<IdeFileDiffResult> {
		const [contentA, contentB] = await Promise.all([
			readFile(this.resolvePathWithinRoot(params.pathA), "utf-8").catch(() => ""),
			readFile(this.resolvePathWithinRoot(params.pathB), "utf-8").catch(() => ""),
		]);

		const linesA = contentA.split("\n");
		const linesB = contentB.split("\n");

		const hunks: { startLine: number; endLine: number; content: string }[] = [];
		const maxLen = Math.max(linesA.length, linesB.length);
		let hunkStart = -1;
		let hunkLines: string[] = [];

		for (let i = 0; i < maxLen; i++) {
			if (linesA[i] !== linesB[i]) {
				if (hunkStart < 0) hunkStart = i + 1;
				hunkLines.push(linesB[i] ?? "");
			} else if (hunkStart >= 0) {
				hunks.push({ startLine: hunkStart, endLine: i, content: hunkLines.join("\n") });
				hunkStart = -1;
				hunkLines = [];
			}
		}
		if (hunkStart >= 0) {
			hunks.push({ startLine: hunkStart, endLine: maxLen, content: hunkLines.join("\n") });
		}

		return {
			diff: { path: params.pathA, oldContent: contentA, newContent: contentB, hunks },
		};
	}

	async selectionGet(_params: IdeSelectionGetParams): Promise<IdeSelectionGetResult> {
		return { selection: null };
	}

	async patchPropose(params: IdePatchProposeParams): Promise<IdePatchProposeResult> {
		const fullPath = this.resolvePathWithinRoot(params.path);
		try {
			const content = await readFile(fullPath, "utf-8");
			const lines = content.split("\n");
			const replacementLines = params.replacement.split("\n");
			const removed = params.endLine - params.startLine + 1;
			lines.splice(params.startLine - 1, removed, ...replacementLines);

			await writeFile(fullPath, lines.join("\n"), "utf-8");

			return { applied: true, path: params.path, linesChanged: replacementLines.length };
		} catch {
			return { applied: false, path: params.path, linesChanged: 0 };
		}
	}

	private resolvePathWithinRoot(path: string): string {
		const candidate = path.startsWith("/") ? resolve(path) : resolve(this.rootResolved, path);
		const insideRoot = candidate === this.rootResolved || candidate.startsWith(`${this.rootResolved}${sep}`);
		if (!insideRoot) {
			throw new ConnectorValidationError(
				`Path escapes workspace root: ${path}`,
				"path",
				{ workspaceRoot: this.rootResolved, resolvedPath: candidate },
			);
		}
		return candidate;
	}
}
