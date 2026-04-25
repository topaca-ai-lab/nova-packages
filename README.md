# Nova Packages

This repository contains standalone external packages for the Nova / Edgent ecosystem.

## Licensing

- Open source: AGPL-3.0-only ([LICENSE](LICENSE))
- Commercial licensing: see [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md)

## Versioning

- Versioning policy: [VERSIONING.md](VERSIONING.md)
- Package-specific versions are defined per package in each `package.json`.

## Current Packages

- `connector-skills` (`@topaca/connector-skills`)
- `orchestration-core` (`@topaca/orchestration-core`)
- `memory-core` (`@topaca/memory-core`)
- `workflow-skills` (`@topaca/workflow-skills`)
- `nova-status` (`@topaca/nova-status`)

## Scope

The goal of this repository is to keep reusable packages decoupled from the main `nova` application repository.
This keeps the main Nova codebase focused and avoids unnecessary growth of app-specific history.
