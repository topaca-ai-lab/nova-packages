# Releasing `@topaca/memory-core`

## Preconditions

- `npm whoami` returns your expected npm account.
- You have publish rights for `@topaca/memory-core`.
- Working tree is clean.

## 1. Validate

```bash
npm run check
PATH=/Users/markusertel/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:$PATH npx tsx ../../node_modules/vitest/dist/cli.js --run test/in-memory-store.test.ts test/store.in-memory.contract.test.ts test/store.sqlite.test.ts test/vector-hybrid.test.ts test/markdown-ingestion.test.ts test/wiki-memory.test.ts test/policies.test.ts test/observability.test.ts
```

## 2. Build and inspect package payload

```bash
npm run build
npm pack --dry-run
```

Expected files include:

- `dist/*`
- `README.md`
- `CHANGELOG.md`
- `RELEASING.md`

## 3. Bump version

Update `version` in `package.json` according to `VERSIONING.md` policy:

- `PATCH`: compatible fixes
- `MINOR`: feature additions and early-stage breaking changes in `0.x`

## 4. Publish

```bash
npm publish --access public
```

## 5. Verify

```bash
npm view @topaca/memory-core version
npm view @topaca/memory-core dist-tags --json
```

## 6. Post-release updates

- Move release items from `## [Unreleased]` to a new version section in `CHANGELOG.md`.
- Keep `## [Unreleased]` section for the next cycle.
