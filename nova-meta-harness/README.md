# Meta-Harness Nova Package

Nova integration package for the [Meta-Harness framework](https://github.com/stanford-iris-lab/nova-meta-harness) - enabling automated optimization of model harnesses within the Nova ecosystem.

## Overview

This package bridges Meta-Harness with Nova, allowing Nova to:
- Orchestrate harness evolution loops
- Act as the proposer agent (replacing Claude Code dependency)
- Manage configuration and evaluation workflows

## Architecture

```
nova_meta_harness/
├── orchestrator.py        # Evolution loop orchestration
├── proposer.py            # Proposer interface + NovaProposer
├── nova_llm_bridge.py     # Nova LLM API bridge
├── config_builder.py      # config.yaml generation
├── benchmark_client.py    # Benchmark execution wrapper
├── memory_client.py       # Memory system state management
├── diff_parser.py         # LLM code diff parsing
└── utils.py               # Shared utilities
```

## Installation

```bash
cd dev/nova-packages/nova-meta-harness
uv sync
```

## Usage

```python
from nova_meta_harness import MetaHarnessOrchestrator, EvolutionConfig
from nova_meta_harness import NovaProposer, NovaImplBridge

# Setup
config = EvolutionConfig(
    meta_harness_root=Path("/path/to/nova-meta-harness"),
    config_path=Path("/path/to/config.yaml"),
    logs_dir=Path("/path/to/logs"),
    iterations=5,
)

bridge = NovaImplBridge(endpoint="...", api_key="...")
proposer = NovaProposer(
    llm_bridge=bridge,
    agents_dir=Path("/path/to/agents"),
    logs_dir=Path("/path/to/logs"),
)

# Run evolution
orchestrator = MetaHarnessOrchestrator(
    config=config,
    proposer=proposer,
    benchmark_client=...,
    memory_client=...,
)
result = await orchestrator.run()
```

## Roadmap Status - ✅ COMPLETE

- [x] Phase 1: Analysis & Architecture
- [x] Phase 2: Core Wrapper Implementation
- [x] Phase 3: Proposer Agent Integration + Nova Self-Optimization
- [x] Phase 4: Reference Implementation & Porting (Text Classification)
- [x] Phase 5: Validation, Testing & Polish (55 tests, docs)

**Current Version:** 0.1.0 (Production Ready)

## Dependencies

- `openai>=1.0` - LLM API client
- `pyyaml>=6.0` - YAML config parsing
- `pydantic>=2.0` - Data validation
- `jinja2>=3.0` - Template rendering
- `diff-match-patch>=2024` - Diff parsing
