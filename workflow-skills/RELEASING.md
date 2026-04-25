# Releasing `@topaca/workflow-skills`

## Preconditions

- clean git status for `workflow-skills/` files
- `CHANGELOG.md` updated under `## [Unreleased]`
- npm account has publish rights for `@topaca/workflow-skills`
- npm auth is valid (`npm whoami`)

## Release Steps

1. Run static checks:

```bash
npm run check
```

2. Run package tests:

```bash
PATH=/Users/markusertel/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:$PATH npx tsx --test test/*.test.ts
```

3. Build artifacts:

```bash
npm run build
```

4. Bump package version (`patch` for fixes/features, `minor` for breaking changes).

5. Commit package files and push to `main`.

6. Create and push release tag:

```bash
git tag @topaca/workflow-skills@<version>
git push origin @topaca/workflow-skills@<version>
```

7. Publish package:

```bash
npm publish --access public
```

8. Verify published package metadata:

```bash
npm view @topaca/workflow-skills version license repository.url
```

9. Create GitHub release from pushed tag and include changelog section for that version.

## Post-Release Validation

- install smoke test:

```bash
npm pack --dry-run
```

- verify exported files include `dist`, `README.md`, `CHANGELOG.md`, `RELEASING.md`
- confirm docs page exists at `Nova-Dokumentation/packages/workflow-skills.md`
