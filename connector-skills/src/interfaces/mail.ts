import type { ConnectorCapabilityCheck } from "../envelope.js";
import type {
	DraftCreateParams,
	DraftCreateResult,
	FolderListParams,
	FolderListResult,
	InboxListParams,
	InboxListResult,
	InboxReadParams,
	InboxReadResult,
	MailSendParams,
	MailSendResult,
} from "../types/mail.js";

export interface MailConnector {
	readonly skillId: "mail";

	check(): Promise<ConnectorCapabilityCheck>;

	inboxList(params: InboxListParams, signal?: AbortSignal): Promise<InboxListResult>;
	inboxRead(params: InboxReadParams, signal?: AbortSignal): Promise<InboxReadResult>;
	draftCreate(params: DraftCreateParams, signal?: AbortSignal): Promise<DraftCreateResult>;
	send(params: MailSendParams, signal?: AbortSignal): Promise<MailSendResult>;
	folderList(params: FolderListParams, signal?: AbortSignal): Promise<FolderListResult>;
}
