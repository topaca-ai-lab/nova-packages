import type { ConnectorCapabilityCheck } from "../envelope.js";
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

export interface IdeConnector {
	readonly skillId: "ide";

	check(): Promise<ConnectorCapabilityCheck>;

	fileOpen(params: IdeFileOpenParams, signal?: AbortSignal): Promise<IdeFileOpenResult>;
	fileDiff(params: IdeFileDiffParams, signal?: AbortSignal): Promise<IdeFileDiffResult>;
	selectionGet(params: IdeSelectionGetParams, signal?: AbortSignal): Promise<IdeSelectionGetResult>;
	patchPropose(params: IdePatchProposeParams, signal?: AbortSignal): Promise<IdePatchProposeResult>;
}
