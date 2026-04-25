import { Bot, type Context } from "grammy";
import type { ConnectorCapabilityCheck } from "../envelope.js";
import { ConnectorAuthError, ConnectorNotAvailableError } from "../errors.js";
import type { MessagingConnector } from "../interfaces/messaging.js";
import type {
	CommandRegisterParams,
	CommandRegisterResult,
	MessageReceiveParams,
	MessageReceiveResult,
	MessageSendParams,
	MessageSendResult,
	MessagingMessage,
	MessagingStatusParams,
	MessagingStatusResult,
} from "../types/messaging.js";

export interface TelegramMessagingOptions {
	botToken: string;
	/** If true, start long polling to receive messages. Default: false (send-only mode). */
	enablePolling?: boolean;
}

export class TelegramMessagingConnector implements MessagingConnector {
	readonly skillId = "messaging" as const;
	private readonly bot: Bot;
	private readonly enablePolling: boolean;
	private readonly inboxBuffer: MessagingMessage[] = [];
	private started = false;

	constructor(options: TelegramMessagingOptions) {
		this.bot = new Bot(options.botToken);
		this.enablePolling = options.enablePolling ?? false;

		if (this.enablePolling) {
			this.bot.on("message:text", (ctx: Context) => {
				this.inboxBuffer.push({
					id: String(ctx.message?.message_id ?? Date.now()),
					channel: String(ctx.chat?.id ?? ""),
					text: ctx.message?.text ?? "",
					from: ctx.from?.username ?? ctx.from?.first_name ?? "unknown",
					sentAt: new Date((ctx.message?.date ?? 0) * 1000).toISOString(),
				});
			});
		}
	}

	async check(): Promise<ConnectorCapabilityCheck> {
		try {
			const me = await this.bot.api.getMe();
			return {
				skillId: "messaging",
				available: true,
				backend: "telegram",
				message: `Bot: @${me.username}`,
				capabilities: {
					sendMessage: true,
					receiveMessages: this.enablePolling,
					getStatus: true,
					registerCommands: true,
				},
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				skillId: "messaging",
				available: false,
				backend: "telegram",
				message: msg,
				capabilities: { sendMessage: false, receiveMessages: false, getStatus: false, registerCommands: false },
			};
		}
	}

	async sendMessage(params: MessageSendParams): Promise<MessageSendResult> {
		try {
			const result = await this.bot.api.sendMessage(params.channel, params.text, {
				reply_to_message_id: params.replyTo ? Number(params.replyTo) : undefined,
			});
			return {
				messageId: String(result.message_id),
				sentAt: new Date(result.date * 1000).toISOString(),
			};
		} catch (err) {
			throw this.mapError(err);
		}
	}

	async receiveMessages(params: MessageReceiveParams): Promise<MessageReceiveResult> {
		if (!this.enablePolling) {
			throw new ConnectorNotAvailableError(
				"telegram",
				"Receiving messages requires enablePolling=true.",
			);
		}
		if (!this.started) {
			this.bot.start().catch(() => {});
			this.started = true;
			await new Promise((r) => setTimeout(r, 500));
		}

		let messages = this.inboxBuffer.filter((m) => m.channel === params.channel);
		if (params.sinceId) {
			const idx = messages.findIndex((m) => m.id === params.sinceId);
			if (idx >= 0) messages = messages.slice(idx + 1);
		}
		const limit = params.limit ?? 20;
		return { messages: messages.slice(0, limit) };
	}

	async getStatus(params: MessagingStatusParams): Promise<MessagingStatusResult> {
		const channelMessages = this.inboxBuffer.filter((m) => m.channel === params.channel);
		const last = channelMessages[channelMessages.length - 1];
		return {
			status: {
				channel: params.channel,
				connected: this.started,
				lastMessageAt: last?.sentAt,
				pendingCount: channelMessages.length,
			},
		};
	}

	async registerCommands(params: CommandRegisterParams): Promise<CommandRegisterResult> {
		try {
			await this.bot.api.setMyCommands(
				params.commands.map((c) => ({
					command: c.name.replace(/^\//, ""),
					description: c.description,
				})),
			);
			return { registered: params.commands.length };
		} catch (err) {
			throw this.mapError(err);
		}
	}

	/** Stop the bot polling. Call this when shutting down. */
	stop(): void {
		if (this.started) {
			this.bot.stop();
			this.started = false;
		}
	}

	private mapError(err: unknown): Error {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("token")) {
			return new ConnectorAuthError(msg);
		}
		if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
			return new ConnectorNotAvailableError("telegram", msg);
		}
		return err instanceof Error ? err : new Error(msg);
	}
}
