# connector-skills: Implementation Plan (v0)

## Objective

Build `@topaca/connector-skills` as the unified connector skill package for Nova,
covering 8 skill families: Mail, Calendar, Files, Messaging, Search, Browser, IDE, Media.

## Design Principles

- One package, 8 skill modules (not 8 separate packages)
- Adapter-based: each family defines an interface, mock adapter ships with the package
- Small-model-first: flat schemas, max 8 params, no nested optionals
- Unified envelope (`SkillRequest`/`SkillResponse`/`SkillError`)
- Flat error taxonomy (5 base error classes)
- Capability self-check per family

## Delivery Phases

### Phase 0: Skeleton + Envelope + Errors (completed)

### Phase 1: Interface Contracts (completed)

### Phase 2: Mock Adapters + Tests (current)

### Phase 3: Real Adapters (Mail, Calendar, Files, Search)
- IMAP/SMTP adapter for Mail
- CalDAV adapter for Calendar
- WebDAV adapter for Files
- Brave/SearXNG adapter for Search

### Phase 4: Real Adapters (Messaging, Browser, IDE, Media)
- Telegram adapter for Messaging
- Playwright adapter for Browser
- LSP adapter for IDE
- Whisper adapter for Media

### Phase 5: Small-Model Validation + Hardening
- Validation gates with gemma4:e4b
- Benchmark matrix
- Schema optimization

## Testing Strategy

- Unit tests for each mock adapter
- Contract tests: all adapters implement their interface
- Envelope serialization tests
- Error taxonomy tests

## Open Decisions

1. Real adapter dependencies (imapflow, playwright, etc.) as optional peer deps vs bundled
2. Telegram bot token management (env var vs config file)
3. Whisper binary path resolution strategy
