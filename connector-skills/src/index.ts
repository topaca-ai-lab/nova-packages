// --- Envelope ---
export type { ConnectorCapabilityCheck, IsoTimestamp, SkillError, SkillRequest, SkillResponse } from "./envelope.js";
export { errorResponse, okResponse } from "./envelope.js";

// --- Errors ---
export {
	ConnectorAuthError,
	ConnectorNotAvailableError,
	ConnectorSkillError,
	ConnectorTimeoutError,
	ConnectorValidationError,
} from "./errors.js";

// --- Interfaces ---
export type {
	BrowserConnector,
	CalendarConnector,
	FilesConnector,
	IdeConnector,
	MailConnector,
	MediaConnector,
	MessagingConnector,
	SearchConnector,
} from "./interfaces/index.js";

// --- Mail Types ---
export type {
	DraftCreateParams,
	DraftCreateResult,
	FolderListParams,
	FolderListResult,
	InboxListParams,
	InboxListResult,
	InboxReadParams,
	InboxReadResult,
	MailAddress,
	MailAttachment,
	MailFolder,
	MailMessage,
	MailMessageSummary,
	MailSendParams,
	MailSendResult,
} from "./types/mail.js";

// --- Calendar Types ---
export type {
	CalendarAttendee,
	CalendarEvent,
	CalendarInfo,
	EventCreateParams,
	EventCreateResult,
	EventDeleteParams,
	EventDeleteResult,
	EventsListParams,
	EventsListResult,
	EventUpdateParams,
	EventUpdateResult,
	FreeBusyQueryParams,
	FreeBusyQueryResult,
	FreeBusySlot,
} from "./types/calendar.js";

// --- Files Types ---
export type {
	FileDownloadParams,
	FileDownloadResult,
	FileEntry,
	FileListParams,
	FileListResult,
	FileSearchParams,
	FileSearchResult,
	FileShareLink,
	FileShareParams,
	FileShareResult,
	FileUploadParams,
	FileUploadResult,
} from "./types/files.js";

// --- Messaging Types ---
export type {
	CommandRegisterParams,
	CommandRegisterResult,
	MessageReceiveParams,
	MessageReceiveResult,
	MessageSendParams,
	MessageSendResult,
	MessagingChannelStatus,
	MessagingCommand,
	MessagingMessage,
	MessagingStatusParams,
	MessagingStatusResult,
} from "./types/messaging.js";

// --- Search Types ---
export type {
	FetchedPage,
	SearchResult,
	WebFetchParams,
	WebFetchResult,
	WebSearchParams,
	WebSearchResult,
	WebSummarizeParams,
	WebSummarizeResult,
} from "./types/search.js";

// --- Browser Types ---
export type {
	BrowserElement,
	BrowserPageInfo,
	BrowserScreenshot,
	PageClickParams,
	PageClickResult,
	PageExtractParams,
	PageExtractResult,
	PageFillParams,
	PageFillResult,
	PageOpenParams,
	PageOpenResult,
	PageScreenshotParams,
	PageScreenshotResult,
} from "./types/browser.js";

// --- IDE Types ---
export type {
	IdeDiffEntry,
	IdeDiffHunk,
	IdeFileDiffParams,
	IdeFileDiffResult,
	IdeFileInfo,
	IdeFileOpenParams,
	IdeFileOpenResult,
	IdePatchProposeParams,
	IdePatchProposeResult,
	IdeSelection,
	IdeSelectionGetParams,
	IdeSelectionGetResult,
} from "./types/ide.js";

// --- Media Types ---
export type {
	AudioTranscribeParams,
	AudioTranscribeResult,
	LanguageDetectParams,
	LanguageDetectResult,
	LanguageDetection,
	TranscriptFetchParams,
	TranscriptFetchResult,
	TranscriptSegment,
	TranscriptionResult,
} from "./types/media.js";

// --- Mock Adapters ---
export { MockMailConnector } from "./adapters/mail.mock.js";
export { MockCalendarConnector } from "./adapters/calendar.mock.js";
export { MockFilesConnector } from "./adapters/files.mock.js";
export { MockMessagingConnector } from "./adapters/messaging.mock.js";
export { MockSearchConnector } from "./adapters/search.mock.js";
export { MockBrowserConnector } from "./adapters/browser.mock.js";
export { MockIdeConnector } from "./adapters/ide.mock.js";
export { MockMediaConnector } from "./adapters/media.mock.js";

// --- Real Adapters ---
export { ImapSmtpMailConnector } from "./adapters/mail.imap-smtp.js";
export type { ImapSmtpMailOptions } from "./adapters/mail.imap-smtp.js";
export { CalDavCalendarConnector } from "./adapters/calendar.caldav.js";
export type { CalDavCalendarOptions } from "./adapters/calendar.caldav.js";
export { WebDavFilesConnector } from "./adapters/files.webdav.js";
export type { WebDavFilesOptions } from "./adapters/files.webdav.js";
export { TelegramMessagingConnector } from "./adapters/messaging.telegram.js";
export type { TelegramMessagingOptions } from "./adapters/messaging.telegram.js";
export { FetchSearchConnector } from "./adapters/search.fetch.js";
export type { FetchSearchOptions, SearchProvider } from "./adapters/search.fetch.js";
export { PlaywrightBrowserConnector } from "./adapters/browser.playwright.js";
export type { PlaywrightBrowserOptions, PlaywrightPage } from "./adapters/browser.playwright.js";
export { LocalIdeConnector } from "./adapters/ide.local.js";
export type { LocalIdeOptions } from "./adapters/ide.local.js";
export { LocalMediaConnector } from "./adapters/media.local.js";
export type { LocalMediaOptions } from "./adapters/media.local.js";

// --- Package metadata ---
export const CONNECTOR_SKILLS_PHASE = "phase-4" as const;

export function createConnectorSkillsSkeleton(): { phase: typeof CONNECTOR_SKILLS_PHASE } {
	return { phase: CONNECTOR_SKILLS_PHASE };
}
