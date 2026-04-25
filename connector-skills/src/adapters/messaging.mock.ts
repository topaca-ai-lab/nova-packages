import type { ConnectorCapabilityCheck } from "../envelope.js";
import type { MessagingConnector } from "../interfaces/messaging.js";
import type {
	CommandRegisterParams,
	CommandRegisterResult,
	MessageReceiveParams,
	MessageReceiveResult,
	MessageSendParams,
	MessageSendResult,
	MessagingCommand,
	MessagingMessage,
	MessagingStatusParams,
	MessagingStatusResult,
} from "../types/messaging.js";

export class MockMessagingConnector implements MessagingConnector {
	readonly skillId = "messaging" as const;

	private readonly messages: MessagingMessage[] = [];
	private readonly commands = new Map<string, MessagingCommand>();
	private nextId = 1;

	async check(): Promise<ConnectorCapabilityCheck> {
		return {
			skillId: "messaging",
			available: true,
			backend: "mock",
			capabilities: {
				sendMessage: true,
				receiveMessages: true,
				getStatus: true,
				registerCommands: true,
			},
		};
	}

	async sendMessage(params: MessageSendParams): Promise<MessageSendResult> {
		const messageId = `msg-${this.nextId++}`;
		const sentAt = new Date().toISOString();
		const message: MessagingMessage = {
			id: messageId,
			channel: params.channel,
			text: params.text,
			from: "mock-bot",
			replyTo: params.replyTo,
			sentAt,
		};
		this.messages.push(message);
		return { messageId, sentAt };
	}

	async receiveMessages(params: MessageReceiveParams): Promise<MessageReceiveResult> {
		let filtered = this.messages.filter((m) => m.channel === params.channel);

		if (params.sinceId) {
			const idx = filtered.findIndex((m) => m.id === params.sinceId);
			if (idx >= 0) {
				filtered = filtered.slice(idx + 1);
			}
		}

		const limit = params.limit ?? 20;
		return { messages: filtered.slice(0, limit) };
	}

	async getStatus(params: MessagingStatusParams): Promise<MessagingStatusResult> {
		const channelMessages = this.messages.filter((m) => m.channel === params.channel);
		const lastMessage = channelMessages[channelMessages.length - 1];
		return {
			status: {
				channel: params.channel,
				connected: true,
				lastMessageAt: lastMessage?.sentAt,
				pendingCount: 0,
			},
		};
	}

	async registerCommands(params: CommandRegisterParams): Promise<CommandRegisterResult> {
		for (const cmd of params.commands) {
			this.commands.set(cmd.name, { ...cmd });
		}
		return { registered: params.commands.length };
	}

	/** Test helper: seed a message. */
	seedMessage(message: MessagingMessage): void {
		this.messages.push({ ...message });
	}
}
