# Versioning Policy

This repository uses **Semantic Versioning (SemVer)** for every package:

- `MAJOR`: incompatible API changes
- `MINOR`: backwards-compatible features
- `PATCH`: backwards-compatible fixes

## Initial Policy for Nova Packages

During early development (`0.x.y`):

- Breaking changes may happen in `MINOR` releases
- New features and fixes may both appear in `PATCH` releases when needed for fast iteration

Once a package reaches `1.0.0`, strict SemVer interpretation is applied.

## Release Scope

- Versions are managed **per package**, not lockstep across this repository.
- Each package owns its own release cadence and changelog.

## Package Metadata Requirements

Each published package must define in `package.json`:

- `name` (scoped package name)
- `version`
- `license` (SPDX identifier)
- `engines.node` (minimum supported Node.js version)
