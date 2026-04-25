import type { ConnectorCapabilityCheck } from "../envelope.js";
import type {
	CommandRegisterParams,
	CommandRegisterResult,
	MessageReceiveParams,
	MessageReceiveResult,
	MessageSendParams,
	MessageSendResult,
	MessagingStatusParams,
	MessagingStatusResult,
} from "../types/messaging.js";

export interface MessagingConnector {
	readonly skillId: "messaging";

	check(): Promise<ConnectorCapabilityCheck>;

	sendMessage(params: MessageSendParams, signal?: AbortSignal): Promise<MessageSendResult>;
	receiveMessages(params: MessageReceiveParams, signal?: AbortSignal): Promise<MessageReceiveResult>;
	getStatus(params: MessagingStatusParams, signal?: AbortSignal): Promise<MessagingStatusResult>;
	registerCommands(params: CommandRegisterParams, signal?: AbortSignal): Promise<CommandRegisterResult>;
}
