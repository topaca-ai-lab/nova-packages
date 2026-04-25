import type { IsoTimestamp } from "../envelope.js";

// --- Messaging Types (Telegram-first, generic interface) ---

export interface MessagingMessage {
	id: string;
	channel: string;
	text: string;
	from?: string;
	replyTo?: string;
	sentAt: IsoTimestamp;
}

export interface MessagingCommand {
	name: string;
	description: string;
}

export interface MessagingChannelStatus {
	channel: string;
	connected: boolean;
	lastMessageAt?: IsoTimestamp;
	pendingCount: number;
}

// --- Action Params ---

export interface MessageSendParams {
	channel: string;
	text: string;
	replyTo?: string;
}

export interface MessageReceiveParams {
	channel: string;
	limit?: number;
	sinceId?: string;
}

export interface MessagingStatusParams {
	channel: string;
}

export interface CommandRegisterParams {
	commands: readonly MessagingCommand[];
}

// --- Action Results ---

export interface MessageSendResult {
	messageId: string;
	sentAt: IsoTimestamp;
}

export interface MessageReceiveResult {
	messages: readonly MessagingMessage[];
}

export interface MessagingStatusResult {
	status: MessagingChannelStatus;
}

export interface CommandRegisterResult {
	registered: number;
}
