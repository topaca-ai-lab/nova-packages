import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { ConnectorCapabilityCheck } from "../envelope.js";
import { ConnectorAuthError, ConnectorNotAvailableError, ConnectorTimeoutError } from "../errors.js";
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
	MailAddress,
	MailFolder,
	MailMessage,
	MailMessageSummary,
	MailSendParams,
	MailSendResult,
} from "../types/mail.js";

export interface ImapSmtpMailOptions {
	imap: {
		host: string;
		port: number;
		secure?: boolean;
		auth: { user: string; pass: string };
		timeoutMs?: number;
	};
	smtp: {
		host: string;
		port: number;
		secure?: boolean;
		auth: { user: string; pass: string };
	};
}

export class ImapSmtpMailConnector implements MailConnector {
	readonly skillId = "mail" as const;
	private readonly options: ImapSmtpMailOptions;

	constructor(options: ImapSmtpMailOptions) {
		this.options = options;
	}

	async check(): Promise<ConnectorCapabilityCheck> {
		try {
			const client = this.createImapClient();
			await client.connect();
			await client.logout();
			return {
				skillId: "mail",
				available: true,
				backend: "imap+smtp",
				capabilities: { inboxList: true, inboxRead: true, draftCreate: true, send: true, folderList: true },
			};
		} catch (err) {
			return {
				skillId: "mail",
				available: false,
				backend: "imap+smtp",
				message: err instanceof Error ? err.message : String(err),
				capabilities: { inboxList: false, inboxRead: false, draftCreate: false, send: false, folderList: false },
			};
		}
	}

	async inboxList(params: InboxListParams, signal?: AbortSignal): Promise<InboxListResult> {
		const client = this.createImapClient();
		try {
			await this.connectWithSignal(client, signal);
			const folder = params.folder ?? "INBOX";
			const lock = await client.getMailboxLock(folder);
			try {
				const limit = params.limit ?? 20;
				const searchQuery: Record<string, unknown> = {};
				if (params.unreadOnly) searchQuery.seen = false;
				if (params.query) searchQuery.subject = params.query;

				const uids = await client.search(
					Object.keys(searchQuery).length > 0 ? searchQuery : { all: true },
					{ uid: true },
				);
				if (!uids || uids.length === 0) {
					return { messages: [], totalCount: 0 };
				}

				const uidList = uids.slice(-limit);
				const summaries: MailMessageSummary[] = [];

				for await (const msg of client.fetch(uidList.join(","), { envelope: true, flags: true }, { uid: true })) {
					summaries.push({
						id: String(msg.uid),
						folder,
						from: envelopeAddress(msg.envelope?.from?.[0]),
						subject: msg.envelope?.subject ?? "",
						receivedAt: msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
						read: msg.flags?.has("\\Seen") ?? false,
						flagged: msg.flags?.has("\\Flagged") ?? false,
					});
				}

				return { messages: summaries, totalCount: uids.length };
			} finally {
				lock.release();
			}
		} catch (err) {
			throw this.mapError(err);
		} finally {
			await client.logout().catch(() => {});
		}
	}

	async inboxRead(params: InboxReadParams, signal?: AbortSignal): Promise<InboxReadResult> {
		const client = this.createImapClient();
		try {
			await this.connectWithSignal(client, signal);
			const lock = await client.getMailboxLock("INBOX");
			try {
				const msg = await client.fetchOne(params.messageId, {
					envelope: true,
					flags: true,
					source: true,
				}, { uid: true });

				if (!msg) throw new Error(`Message not found: ${params.messageId}`);

				await client.messageFlagsAdd(params.messageId, ["\\Seen"], { uid: true });

				const message: MailMessage = {
					id: String(msg.uid),
					folder: "INBOX",
					from: envelopeAddress(msg.envelope?.from?.[0]),
					to: (msg.envelope?.to ?? []).map(envelopeAddress),
					cc: msg.envelope?.cc ? msg.envelope.cc.map(envelopeAddress) : undefined,
					subject: msg.envelope?.subject ?? "",
					bodyText: msg.source?.toString() ?? "",
					attachments: [],
					receivedAt: msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
					read: true,
					flagged: msg.flags?.has("\\Flagged") ?? false,
				};
				return { message };
			} finally {
				lock.release();
			}
		} catch (err) {
			throw this.mapError(err);
		} finally {
			await client.logout().catch(() => {});
		}
	}

	async draftCreate(params: DraftCreateParams, signal?: AbortSignal): Promise<DraftCreateResult> {
		const client = this.createImapClient();
		try {
			await this.connectWithSignal(client, signal);
			const raw = buildRawMessage(this.options.imap.auth.user, params.to, params.cc, params.subject, params.bodyText);
			const result = await client.append("Drafts", raw, ["\\Draft", "\\Seen"]);
			return { draftId: result ? String((result as any).uid) : `draft-${Date.now()}` };
		} catch (err) {
			throw this.mapError(err);
		} finally {
			await client.logout().catch(() => {});
		}
	}

	async send(params: MailSendParams): Promise<MailSendResult> {
		const transport = nodemailer.createTransport({
			host: this.options.smtp.host,
			port: this.options.smtp.port,
			secure: this.options.smtp.secure,
			auth: { user: this.options.smtp.auth.user, pass: this.options.smtp.auth.pass },
		});

		try {
			const info = await transport.sendMail({
				from: this.options.smtp.auth.user,
				to: params.to.map((a) => (a.name ? `"${a.name}" <${a.address}>` : a.address)).join(", "),
				cc: params.cc?.map((a) => (a.name ? `"${a.name}" <${a.address}>` : a.address)).join(", "),
				subject: params.subject,
				text: params.bodyText,
			});
			return { messageId: info.messageId ?? `sent-${Date.now()}`, sentAt: new Date().toISOString() };
		} catch (err) {
			throw this.mapError(err);
		} finally {
			transport.close();
		}
	}

	async folderList(_params: FolderListParams, signal?: AbortSignal): Promise<FolderListResult> {
		const client = this.createImapClient();
		try {
			await this.connectWithSignal(client, signal);
			const mailboxes = await client.list();
			const folders: MailFolder[] = mailboxes.map((mb) => ({
				name: mb.name,
				path: mb.path,
				messageCount: 0,
				unreadCount: 0,
			}));
			return { folders };
		} catch (err) {
			throw this.mapError(err);
		} finally {
			await client.logout().catch(() => {});
		}
	}

	private createImapClient(): ImapFlow {
		return new ImapFlow({
			host: this.options.imap.host,
			port: this.options.imap.port,
			secure: this.options.imap.secure ?? true,
			auth: this.options.imap.auth,
			logger: false,
		});
	}

	private async connectWithSignal(client: ImapFlow, signal?: AbortSignal): Promise<void> {
		if (signal?.aborted) throw new ConnectorTimeoutError(0, "Operation aborted");
		const timeout = this.options.imap.timeoutMs ?? 10_000;
		const timer = setTimeout(() => client.close(), timeout);
		try {
			await client.connect();
		} catch (err) {
			throw this.mapError(err);
		} finally {
			clearTimeout(timer);
		}
	}

	private mapError(err: unknown): Error {
		if (err instanceof ConnectorAuthError || err instanceof ConnectorTimeoutError || err instanceof ConnectorNotAvailableError) {
			return err;
		}
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes("AUTHENTICATIONFAILED") || msg.includes("auth") || msg.includes("credentials")) {
			return new ConnectorAuthError(msg);
		}
		if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
			return new ConnectorTimeoutError(this.options.imap.timeoutMs ?? 10_000, msg);
		}
		if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
			return new ConnectorNotAvailableError("imap", msg);
		}
		return err instanceof Error ? err : new Error(msg);
	}
}

function envelopeAddress(addr?: { name?: string; address?: string }): MailAddress {
	return { name: addr?.name, address: addr?.address ?? "unknown@unknown" };
}

function buildRawMessage(
	from: string,
	to: readonly MailAddress[],
	cc: readonly MailAddress[] | undefined,
	subject: string,
	body: string,
): Buffer {
	const lines = [
		`From: ${from}`,
		`To: ${to.map((a) => a.address).join(", ")}`,
	];
	if (cc && cc.length > 0) lines.push(`Cc: ${cc.map((a) => a.address).join(", ")}`);
	lines.push(`Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, "", body);
	return Buffer.from(lines.join("\r\n"));
}
