# Releasing `@topaca/nova-status`

## Preconditions

- clean git status for `nova-status/` files
- `CHANGELOG.md` updated under `## [Unreleased]`
- npm account has publish rights for `@topaca/nova-status`
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

4. Bump package version.

5. Commit package files and push to `main`.

6. Create and push release tag:

```bash
git tag @topaca/nova-status@<version>
git push origin @topaca/nova-status@<version>
```

7. Publish package:

```bash
npm publish --access public
```

8. Verify package metadata:

```bash
npm view @topaca/nova-status version license repository.url
```

9. Create GitHub release from the pushed tag.

## Post-Release Validation

```bash
npm pack --dry-run
```

- verify exported package contains `dist`, `README.md`, `CHANGELOG.md`, `RELEASING.md`
- confirm docs page exists at `Nova-Dokumentation/packages/nova-status.md`
