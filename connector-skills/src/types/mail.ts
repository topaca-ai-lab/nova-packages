import type { IsoTimestamp } from "../envelope.js";

// --- Mail Types (IMAP + SMTP, optional JMAP) ---

export interface MailAddress {
	name?: string;
	address: string;
}

export interface MailAttachment {
	filename: string;
	mimeType: string;
	sizeBytes: number;
	contentId?: string;
}

export interface MailMessage {
	id: string;
	folder: string;
	from: MailAddress;
	to: readonly MailAddress[];
	cc?: readonly MailAddress[];
	subject: string;
	bodyText?: string;
	bodyHtml?: string;
	attachments: readonly MailAttachment[];
	receivedAt: IsoTimestamp;
	read: boolean;
	flagged: boolean;
}

export interface MailMessageSummary {
	id: string;
	folder: string;
	from: MailAddress;
	subject: string;
	receivedAt: IsoTimestamp;
	read: boolean;
	flagged: boolean;
}

// --- Action Params ---

export interface InboxListParams {
	folder?: string;
	query?: string;
	limit?: number;
	unreadOnly?: boolean;
}

export interface InboxReadParams {
	messageId: string;
}

export interface DraftCreateParams {
	to: readonly MailAddress[];
	cc?: readonly MailAddress[];
	subject: string;
	bodyText: string;
}

export interface MailSendParams {
	to: readonly MailAddress[];
	cc?: readonly MailAddress[];
	subject: string;
	bodyText: string;
}

export interface FolderListParams {
	parentFolder?: string;
}

// --- Action Results ---

export interface InboxListResult {
	messages: readonly MailMessageSummary[];
	totalCount: number;
}

export interface InboxReadResult {
	message: MailMessage;
}

export interface DraftCreateResult {
	draftId: string;
}

export interface MailSendResult {
	messageId: string;
	sentAt: IsoTimestamp;
}

export interface MailFolder {
	name: string;
	path: string;
	messageCount: number;
	unreadCount: number;
}

export interface FolderListResult {
	folders: readonly MailFolder[];
}
