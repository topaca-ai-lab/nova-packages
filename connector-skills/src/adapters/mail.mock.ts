import type { ConnectorCapabilityCheck } from "../envelope.js";
import type { MailConnector } from "../interfaces/mail.js";
import type {
	DraftCreateParams,
	DraftCreateResult,
	FolderListParams,
	FolderListResult,
	InboxListParams,
	InboxListResult,
	InboxReadParams,
	InboxReadResult,
	MailMessage,
	MailMessageSummary,
	MailSendParams,
	MailSendResult,
} from "../types/mail.js";

export class MockMailConnector implements MailConnector {
	readonly skillId = "mail" as const;

	private readonly messages = new Map<string, MailMessage>();
	private readonly drafts = new Map<string, MailMessage>();
	private nextId = 1;

	async check(): Promise<ConnectorCapabilityCheck> {
		return {
			skillId: "mail",
			available: true,
			backend: "mock",
			capabilities: {
				inboxList: true,
				inboxRead: true,
				draftCreate: true,
				send: true,
				folderList: true,
			},
		};
	}

	async inboxList(params: InboxListParams): Promise<InboxListResult> {
		const folder = params.folder ?? "INBOX";
		let messages = [...this.messages.values()].filter((m) => m.folder === folder);

		if (params.unreadOnly) {
			messages = messages.filter((m) => !m.read);
		}
		if (params.query) {
			const q = params.query.toLowerCase();
			messages = messages.filter(
				(m) => m.subject.toLowerCase().includes(q) || m.bodyText?.toLowerCase().includes(q),
			);
		}

		const limit = params.limit ?? 20;
		const sliced = messages.slice(0, limit);

		const summaries: MailMessageSummary[] = sliced.map((m) => ({
			id: m.id,
			folder: m.folder,
			from: m.from,
			subject: m.subject,
			receivedAt: m.receivedAt,
			read: m.read,
			flagged: m.flagged,
		}));

		return { messages: summaries, totalCount: messages.length };
	}

	async inboxRead(params: InboxReadParams): Promise<InboxReadResult> {
		const message = this.messages.get(params.messageId);
		if (!message) {
			throw new Error(`Message not found: ${params.messageId}`);
		}
		message.read = true;
		return { message: { ...message } };
	}

	async draftCreate(params: DraftCreateParams): Promise<DraftCreateResult> {
		const draftId = `draft-${this.nextId++}`;
		const draft: MailMessage = {
			id: draftId,
			folder: "Drafts",
			from: { address: "mock@example.com" },
			to: [...params.to],
			cc: params.cc ? [...params.cc] : undefined,
			subject: params.subject,
			bodyText: params.bodyText,
			attachments: [],
			receivedAt: new Date().toISOString(),
			read: true,
			flagged: false,
		};
		this.drafts.set(draftId, draft);
		return { draftId };
	}

	async send(params: MailSendParams): Promise<MailSendResult> {
		const messageId = `sent-${this.nextId++}`;
		const sentAt = new Date().toISOString();
		const message: MailMessage = {
			id: messageId,
			folder: "Sent",
			from: { address: "mock@example.com" },
			to: [...params.to],
			cc: params.cc ? [...params.cc] : undefined,
			subject: params.subject,
			bodyText: params.bodyText,
			attachments: [],
			receivedAt: sentAt,
			read: true,
			flagged: false,
		};
		this.messages.set(messageId, message);
		return { messageId, sentAt };
	}

	async folderList(_params: FolderListParams): Promise<FolderListResult> {
		const folders = [
			{ name: "INBOX", path: "INBOX", messageCount: this.messages.size, unreadCount: 0 },
			{ name: "Sent", path: "Sent", messageCount: 0, unreadCount: 0 },
			{ name: "Drafts", path: "Drafts", messageCount: this.drafts.size, unreadCount: 0 },
			{ name: "Trash", path: "Trash", messageCount: 0, unreadCount: 0 },
		];
		return { folders };
	}

	/** Test helper: seed a message into the mock inbox. */
	seedMessage(message: MailMessage): void {
		this.messages.set(message.id, { ...message });
	}
}
