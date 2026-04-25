# @topaca/connector-skills

Connector skill contracts and real/mock adapters for Nova / Edgent.

## Status

Phase 4 (envelope, interfaces, mock adapters, and real adapters for all 8 skill families).

## Skill Families

| Family | Actions | Protocol/Backend |
|--------|---------|--------------------|
| Mail | `inbox.list`, `inbox.read`, `draft.create`, `mail.send`, `folder.list` | IMAP + SMTP (`imapflow`, `nodemailer`) |
| Calendar | `events.list`, `event.create`, `event.update`, `event.delete`, `freebusy.query` | CalDAV + ICS (`tsdav`) |
| Files | `file.list`, `file.upload`, `file.download`, `file.search`, `file.share` | WebDAV / S3 (`webdav`) |
| Messaging | `message.send`, `message.receive`, `status.get`, `command.register` | Telegram Gateway (`grammY`) |
| Search | `web.search`, `web.fetch`, `web.summarize` | Brave / SearXNG / DuckDuckGo |
| Browser | `page.open`, `page.click`, `page.fill`, `page.extract`, `page.screenshot` | Playwright (Interface Injection) |
| IDE | `file.open`, `file.diff`, `selection.get`, `patch.propose` | Local Filesystem (`fs`) |
| Media | `audio.transcribe`, `transcript.fetch`, `language.detect` | Whisper CLI / YouTube HTML |

## Development

```bash
npm run build
npm run check
npm run test
```

## Usage

```ts
import { FetchSearchConnector } from "@topaca/connector-skills";

const search = new FetchSearchConnector({
  provider: "duckduckgo",
  timeoutMs: 5000
});

// Capability check
const check = await search.check();
console.log(check.available, check.capabilities);

// Use the connector
const result = await search.webSearch({ query: "typescript record type", limit: 5 });
console.log(result.results);
```

## Architecture

Each skill family provides:

1. **Types** (`src/types/<family>.ts`) -- deterministic I/O schemas
2. **Interface** (`src/interfaces/<family>.ts`) -- capability contract
3. **Mock adapter** (`src/adapters/<family>.mock.ts`) -- in-memory test implementation
4. **Real adapter** (`src/adapters/<family>.<backend>.ts`) -- production implementation

All adapters share a unified envelope (`SkillRequest`/`SkillResponse`) and error taxonomy.

## Small-Model-First Design

Schemas are designed for reliable tool-calling with small LLMs (Gemma 4 E4B):

- Max 8 parameters per action, no nested optionals
- Deterministic tool contracts, no union types in params
- Flat error taxonomy (5 error classes)
- Minimal response payloads

## Playwright Note
The `PlaywrightBrowserConnector` requires you to pass a `PlaywrightPage` instance. This prevents `@topaca/connector-skills` from pulling in the massive Playwright binaries as a hard dependency.
