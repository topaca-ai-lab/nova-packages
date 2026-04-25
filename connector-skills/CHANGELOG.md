# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Real IMAP/SMTP adapter (`ImapSmtpMailConnector`) for Mail.
- Real CalDAV adapter (`CalDavCalendarConnector`) for Calendar using `tsdav`.
- Real WebDAV adapter (`WebDavFilesConnector`) for Files using `webdav`.
- Real Search adapter (`FetchSearchConnector`) with support for Brave, SearXNG, and DuckDuckGo via native fetch.
- Real Telegram adapter (`TelegramMessagingConnector`) for Messaging using `grammY`.
- Real Playwright adapter (`PlaywrightBrowserConnector`) for Browser using dependency injection for the Page.
- Real Local filesystem adapter (`LocalIdeConnector`) for IDE.
- Real Local media adapter (`LocalMediaConnector`) using local Whisper CLI and YouTube scraping.
- Package skeleton with unified skill envelope (`SkillRequest`/`SkillResponse`/`SkillError`)
- Typed error taxonomy (`ConnectorSkillError`, `ConnectorAuthError`, `ConnectorTimeoutError`, `ConnectorNotAvailableError`, `ConnectorValidationError`)
- Capability-check interface (`ConnectorCapabilityCheck`)
- Interface contracts for 8 skill families: Mail, Calendar, Files, Messaging, Search, Browser, IDE, Media
- In-memory mock adapters for all 8 skill families
- Unit tests for all mock adapters
