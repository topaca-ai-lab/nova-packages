# Architecture Design Document: Meta-Harness Nova Package

## 1. Overview

### 1.1 Purpose
This document defines the architecture for the `nova-meta-harness` Nova package, which bridges the [Meta-Harness framework](https://github.com/stanford-iris-lab/nova-meta-harness) (automated search over model harnesses) with the Nova ecosystem. The goal is to enable Nova to orchestrate harness evolution loops and act as the proposer agent — replacing the current Claude Code dependency.

### 1.2 Scope
- **In scope**: Nova wrapper for the Meta-Harness orchestrator, generic Proposer interface, Nova LLM Bridge, dynamic config generation, result parsing
- **Out of scope**: Modifying the Meta-Harness framework itself (used as-is), building a new benchmarking engine, replacing `memory_system.py` storage

### 1.3 Design Principles
1. **No Fork**: The Meta-Harness framework is consumed as-is (git submodule or pip package). We build the bridge on top.
2. **Interface Abstraction**: The `Proposer` interface abstracts the agent (Claude Code today, Nova tomorrow).
3. **Output Compatibility**: The Nova package produces identical output formats (JSONL, val.json, frontier_val.json) as the original framework.
4. **Zero-Config for Meta-Harness**: Nova generates config.yaml and domain_spec.md dynamically from user input.

---

## 2. Meta-Harness Framework Analysis

### 2.1 Framework Structure

```
dev/nova-meta-harness/
├── README.md
├── ONBOARDING.md                    # Onboarding conversation guide
├── config.yaml                      # Per-domain configuration
├── reference_examples/
│   ├── text_classification/
│   │   ├── meta_harness.py          # Evolution orchestrator (main entry)
│   │   ├── inner_loop.py            # Single iteration: propose → validate → benchmark
│   │   ├── benchmark.py             # Evaluation engine (validation + test)
│   │   ├── claude_wrapper.py        # Claude Code CLI wrapper (proposer)
│   │   ├── llm.py                   # Generic LLM interface (OpenAI-compatible)
│   │   ├── memory_system.py         # JSON-based storage for history/prompts
│   │   ├── agents/                  # Prompt templates for candidate agents
│   │   │   ├── no_memory.py
│   │   │   ├── fewshot_memory.py
│   │   │   └── fewshot_all.py
│   │   └── .claude/skills/nova-meta-harness/SKILL.md
│   └── terminal_bench_2/
│       ├── meta_harness.py
│       ├── claude_wrapper.py
│       └── agents/
```

### 2.2 Evolution Workflow

The Meta-Harness orchestrator (`meta_harness.py`) runs a three-phase evolution loop:

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 0: Baselines                                              │
│  1. Run benchmark.py --memory {baseline} for each baseline      │
│  2. Compute frontier_val.json (Pareto front of best candidates) │
│  3. Write evolution_summary.jsonl (aggregate results)           │
├─────────────────────────────────────────────────────────────────┤
│ Phase 1..N: Evolution Loop (per iteration)                     │
│  1. Propose:                                                    │
│     a. Build task_prompt from frontier + history                │
│     b. Call proposer agent (Claude Code)                        │
│     c. Agent writes candidate(s) to pending_eval.json           │
│     d. Agent creates new code files in agents/                  │
│  2. Validate:                                                   │
│     a. Import-check each candidate (uv run python -c ...)       │
│     b. Filter out invalid candidates                            │
│  3. Benchmark:                                                  │
│     a. Run benchmark.py --memory {name} for each valid candidate│
│     b. Store val.json per dataset                               │
│  4. Update:                                                     │
│     a. Recompute frontier_val.json                              │
│     b. Append to evolution_summary.jsonl                        │
├─────────────────────────────────────────────────────────────────┤
│ Phase Final: Test Evaluation                                    │
│  1. Run benchmark.py --memory {name} --test for all candidates  │
│  2. Compute frontier_val.json --test                            │
│  3. Output final results                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Key Observations

| Observation | Implication for Nova |
|---|---|
| `meta_harness.py` uses `subprocess.run` for everything | Nova can call `meta_harness.py` directly or replicate its logic |
| `claude_wrapper.py` is Claude-specific (CLI with tool access) | **Must be replaced by Nova LLM Bridge** |
| `llm.py` is OpenAI-compatible (generic) | Can potentially be reused as a base |
| `benchmark.py` is evaluation-agnostic | No changes needed |
| `memory_system.py` is JSON storage | No changes needed |
| `agents/` contains prompt templates | Useful reference library for Nova |
| `PROPOSER_ALLOWED_TOOLS` restricts Claude Code tools | Nova needs equivalent tool set (Read, Write, Edit, Bash, Agent) |
| Output formats are JSONL + JSON | Nova package must produce identical formats |
| Config is YAML, domain-specific | Nova generates config dynamically from domain_spec.md |

---

## 3. Nova Package Architecture

### 3.1 Package Structure

```
dev/nova-packages/nova-meta-harness/
├── README.md                          # Package documentation
├── pyproject.toml                     # Package dependencies
├── nova_meta_harness/                # Python package
│   ├── __init__.py
│   ├── orchestrator.py                # Nova wrapper for meta_harness.py orchestration
│   ├── proposer.py                    # Generic Proposer interface + base class
│   ├── nova_llm_bridge.py             # Nova LLM Bridge (replaces claude_wrapper.py)
│   ├── config_builder.py              # Generates config.yaml from domain spec
│   ├── memory_client.py               # Wrapper for memory_system.py
│   ├── benchmark_client.py            # Wrapper for benchmark.py
│   ├── diff_parser.py                 # Parses LLM-generated code diffs
│   └── utils.py                       # Shared utilities
├── templates/
│   └── domain_spec.md.j2              # Jinja2 template for domain_spec.md
└── tests/
    ├── test_orchestrator.py
    ├── test_proposer.py
    ├── test_config_builder.py
    └── test_nova_llm_bridge.py
```

### 3.2 Core Interfaces

#### 3.2.1 Proposer Interface

```python
# nova_meta_harness/proposer.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


@dataclass
class ProposerContext:
    """Context passed to the proposer on each iteration."""
    iteration: int
    frontier_val: dict                  # Current frontier_val.json content
    evolution_summary: list             # Parsed evolution_summary.jsonl
    available_datasets: list            # From config.yaml
    config_model: str                   # Model to use for solver


@dataclass
class ProposalResult:
    """Output from a successful propose step."""
    candidates: Sequence[dict]           # Each: {"name": str, "hypothesis": str, ...}
    pending_eval_path: Path              # Where pending_eval.json was written


class Proposer(ABC):
    """Abstract interface for the proposer agent.
    
    The proposer receives context about the current evolution state
    and produces candidate harness modifications.
    """
    
    @abstractmethod
    async def propose(self, context: ProposerContext) -> ProposalResult | None:
        """Propose new harness candidates.
        
        Returns ProposalResult with candidate metadata, or None on failure.
        The proposer is responsible for:
        1. Generating/modifying code in the agents directory
        2. Writing pending_eval.json with candidate metadata
        """
        ...


class NovaProposer(Proposer):
    """Default proposer implementation using Nova's LLM capabilities."""
    
    def __init__(
        self,
        llm_bridge: "NovaLLMBridge",
        task_prompt_template: str = ...,
        allowed_tools: Sequence[str] = ...,
    ):
        self.llm_bridge = llm_bridge
        self.task_prompt_template = task_prompt_template
        self.allowed_tools = allowed_tools
    
    async def propose(self, context: ProposerContext) -> ProposalResult:
        # 1. Build task prompt from context
        # 2. Call Nova LLM with task prompt
        # 3. Parse LLM response (code diffs + metadata)
        # 4. Write candidates to pending_eval.json
        # 5. Apply code changes to agents/
        ...
```

#### 3.2.2 Nova LLM Bridge

```python
# nova_meta_harness/nova_llm_bridge.py

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class LLMMessage:
    role: str        # "system", "user", "assistant"
    content: str


@dataclass
class LLMResponse:
    content: str
    tool_calls: Sequence[dict] | None = None
    finish_reason: str | None = None


class NovaLLMBridge(ABC):
    """Abstract interface to Nova's LLM orchestration."""
    
    @abstractmethod
    async def chat(
        self,
        messages: Sequence[LLMMessage],
        model: str = ...,
        temperature: float = ...,
        max_tokens: int = ...,
    ) -> LLMResponse:
        """Send a chat completion request via Nova."""
        ...


class NovaImplBridge(NovaLLMBridge):
    """Concrete implementation using Nova's internal LLM API."""
    
    async def chat(self, messages, model, temperature, max_tokens):
        # Call Nova's LLM API
        ...
```

#### 3.2.3 Orchestrator Interface

```python
# nova_meta_harness/orchestrator.py

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


@dataclass
class EvolutionConfig:
    """Nova-side configuration for the evolution loop."""
    meta_harness_root: Path               # Path to nova-meta-harness framework
    config_path: Path                     # Path to config.yaml
    logs_dir: Path                        # Output directory
    iterations: int                       # Number of evolution iterations
    model: str                            # Solver model
    propose_timeout: int                  # Timeout per propose step (seconds)
    skip_baseline: bool                   # Skip Phase 0
    run_name: str | None                  # Run name for output isolation


@dataclass
class EvolutionResult:
    """Final results after evolution completes."""
    frontier_val: dict                    # Final frontier_val.json content
    evolution_summary: list               # Parsed evolution_summary.jsonl
    test_results: dict                    # Final test evaluation results


class MetaHarnessOrchestrator:
    """Nova wrapper for the Meta-Harness evolution orchestrator."""
    
    def __init__(
        self,
        config: EvolutionConfig,
        proposer: Proposer,
        benchmark_client: "BenchmarkClient",
        memory_client: "MemoryClient",
    ):
        self.config = config
        self.proposer = proposer
        self.benchmark_client = benchmark_client
        self.memory_client = memory_client
    
    async def run(self) -> EvolutionResult:
        """Execute the full evolution loop (Phase 0 → Phase 1..N → Phase Final)."""
        # Phase 0: Baselines
        # Phase 1..N: Evolution iterations
        # Phase Final: Test evaluation
        # Return EvolutionResult
        ...
    
    async def run_iteration(self, iteration: int) -> dict:
        """Execute a single evolution iteration.
        
        Replicates the loop in meta_harness.py run_evolve():
        1. Render task prompt
        2. Propose candidates
        3. Validate candidates
        4. Benchmark candidates
        5. Update frontier + summary
        """
        ...
```

### 3.3 Module Responsibilities

| Module | Responsibility | Depends On |
|---|---|---|
| `orchestrator.py` | Manages evolution loop phases, coordinates all components | proposer, benchmark_client, memory_client, config_builder |
| `proposer.py` | Abstract Proposer interface + NovaProposer implementation | nova_llm_bridge |
| `nova_llm_bridge.py` | Connects to Nova's LLM orchestration | None (abstract base) |
| `config_builder.py` | Generates config.yaml and domain_spec.md from user input | None |
| `memory_client.py` | Wraps memory_system.py (load/save history) | None |
| `benchmark_client.py` | Wraps benchmark.py (executes + parses results) | None |
| `diff_parser.py` | Parses LLM-generated code diffs into file updates | None |
| `utils.py` | Shared utilities (timing, formatting, JSON helpers) | None |

---

## 4. Integration Points with Meta-Harness Framework

### 4.1 Reused Components (No Changes)

| Component | Location | How Used |
|---|---|---|
| `meta_harness.py` | Original framework | Reference for evolution loop logic |
| `benchmark.py` | Original framework | Executed via subprocess or wrapped by BenchmarkClient |
| `memory_system.py` | Original framework | Executed via subprocess or wrapped by MemoryClient |
| `llm.py` | Original framework | Potential base for LLM interface (OpenAI-compatible) |
| `agents/` templates | Original framework | Reference for prompt design |
| `config.yaml` format | Original framework | Nova generates compatible YAML |
| Output formats | Original framework | JSONL, val.json, frontier_val.json |

### 4.2 Replaced Components

| Original | Nova Replacement | Reason |
|---|---|---|
| `claude_wrapper.py` | `nova_llm_bridge.py` + `NovaProposer` | Claude Code CLI is proprietary and claude-specific |
| Hardcoded `PROPOSER_ALLOWED_TOOLS` | Configurable tool set in Proposer | Nova uses different tool names/capabilities |
| Claude Code CLI invocation | Nova LLM API call | Different runtime environment |

### 4.3 Proposer Replacement Strategy

The critical integration point is replacing `claude_wrapper.py` with Nova:

```
ORIGINAL FLOW:                          NOVA FLOW:
                                      
  task_prompt                          task_prompt
       │                                  │
       ▼                                  ▼
  claude_wrapper.run()            NovaProposer.propose()
  (Claude Code CLI)               │
       │                          NovaLLMBridge.chat()
       │                                  │
       ▼                                  ▼
  pending_eval.json           pending_eval.json
  (written by Claude)         (written by NovaProposer)
       │                                  │
       ▼                                  ▼
  agents/*.py (created)     agents/*.py (created)
  (by Claude)               (by NovaProposer)
```

**Key differences to handle:**
1. **Tool access**: Claude Code has Read/Edit/Write/Glob/Grep/Bash/Agent. Nova uses its own tool set.
2. **Session model**: Claude Code uses CLI sessions. Nova uses API calls.
3. **Output format**: Both must write `pending_eval.json` in the same format.
4. **Code generation**: Claude Code generates code via Edit tool. Nova must generate via LLM text output + diff_parser.

---

## 5. Configuration Model

### 5.1 Dynamic Config Generation

The `config_builder.py` generates config.yaml from a domain spec:

```python
# Example config.yaml structure generated by config_builder
# This matches the format expected by the original meta_harness.py

datasets: ["snli", "mnli", "rte"]

models:
  - model: "gpt-4o"          # solver model (not base model!)
    provider: "openai"

memory_systems:
  baselines:
    - "no_memory"
    - "fewshot_memory"
    - "fewshot_all"
  search_space:
    - "type": "retrieval_strategy"
      candidates: ["dense", "keyword", "hybrid"]
    - "type": "context_window"
      candidates: [4096, 8192, 16384]

eval_config:
  validation_set: "val_split_0"
  held_out_test: "test_split"
  metric: "accuracy"
  num_fewshot: 0
  max_new_tokens: 1024
```

### 5.2 Domain Spec Integration

The config builder reads from the `domain_spec.md` template (see Section 7):

| Domain Spec Field | Config Field |
|---|---|
| Problem framing → unit of evaluation | `datasets` |
| Problem framing → frozen base model | `models[].model` |
| Harness definition → harness shape | `memory_systems.search_space` |
| Evaluation → metrics | `eval_config.metric` |
| Evaluation → search set | `eval_config.validation_set` |
| Evaluation → test set | `eval_config.held_out_test` |
| Budget → candidate count | `iterations` |

---

## 6. Dependency Mapping

### 6.1 Required Dependencies

| Dependency | Version | Purpose |
|---|---|---|
| `uv` | latest | Python package/environment management (used by nova-meta-harness) |
| `openai` | >=1.0 | LLM API client (used by llm.py) |
| `anthropic` | >=0.28 | Claude API (for reference compatibility) |
| `pyyaml` | >=6.0 | YAML config parsing |
| `pydantic` | >=2.0 | Config/data validation (for Nova package) |
| `jinja2` | >=3.0 | Template rendering (for domain_spec.md) |
| `diff-match-patch` | >=2024 | Diff parsing (for NovaProposer) |

### 6.2 Environment Configuration

```python
# pyproject.toml dependencies
[project]
name = "nova-meta-harness-nova"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "openai>=1.0",
    "pyyaml>=6.0",
    "pydantic>=2.0",
    "jinja2>=3.0",
    "diff-match-patch>=2024",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.23"]
claude = ["anthropic>=0.28"]  # For reference compatibility testing
```

### 6.3 Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `OPENAI_API_KEY` | LLM API access | Yes |
| `ANTHROPIC_API_KEY` | Claude compatibility testing | Optional |
| `NOVA_LLM_ENDPOINT` | Nova LLM API endpoint | Yes (Nova integration) |
| `NOVA_LLM_API_KEY` | Nova LLM API auth | Yes (Nova integration) |

---

## 7. Output Formats (Compatibility Contract)

The Nova package must produce identical output formats as the original Meta-Harness:

### 7.1 evolution_summary.jsonl

```jsonl
{"iteration": 1, "system": "retrieval_v2", "avg_val": 72.3, "axis": "retrieval_strategy", "hypothesis": "dense retrieval improves accuracy", "delta": 2.1, "outcome": "72.3% (+2.1)"}
{"iteration": 1, "system": "context_v2", "avg_val": 68.5, "axis": "context_window", "hypothesis": "wider context helps with long docs", "delta": -1.7, "outcome": "68.5% (-1.7)"}
```

### 7.2 pending_eval.json

```json
{
  "iteration": 3,
  "candidates": [
    {
      "name": "hybrid_retrieval",
      "hypothesis": "combining dense + keyword retrieval improves accuracy",
      "axis": "retrieval_strategy",
      "components": ["dense_encoder", "keyword_index"]
    }
  ]
}
```

### 7.3 frontier_val.json

```json
{
  "best": {"system": "fewshot_memory", "val_accuracy": 0.745},
  "_pareto": [
    {"system": "fewshot_memory", "val_accuracy": 0.745},
    {"system": "hybrid_retrieval", "val_accuracy": 0.738},
    {"system": "dense_v3", "val_accuracy": 0.732}
  ],
  "gpt_4o": {
    "snli": {"val_accuracy": 0.82, "best_system": "fewshot_memory"},
    "mnli": {"val_accuracy": 0.61, "best_system": "hybrid_retrieval"},
    "rte": {"val_accuracy": 0.74, "best_system": "fewshot_memory"}
  }
}
```

### 7.4 val.json (per run, per dataset)

```json
{
  "accuracy": 0.745,
  "config": {
    "model": "gpt_4o",
    "dataset": "snli",
    "memory_system": "fewshot_memory",
    "num_fewshot": 0
  }
}
```

---

## 8. Error Handling & Resilience

### 8.1 Failure Modes

| Failure | Detection | Recovery |
|---|---|---|
| Proposer timeout | `timeout` in `NovaProposer.propose()` | Log warning, continue to next iteration |
| Invalid candidate (import fails) | `validate_candidates()` returns None | Skip candidate, log error |
| Benchmark crash | `benchmark_client.run()` returns non-zero | Skip candidate, log error |
| LLM API error | `NovaLLMBridge.chat()` raises | Retry with exponential backoff (3 attempts) |
| Missing frontier_val.json | File not found | Treat as fresh start, run baselines |
| Config parse error | YAML parsing fails | Raise, halt evolution |

### 8.2 Signal Handling

The orchestrator handles `SIGINT`/`SIGTERM` gracefully:
- Finishes current iteration
- Saves partial results
- Outputs "Evolution interrupted" summary

---

## 9. Testing Strategy

### 9.1 Unit Tests

| Test | Covers |
|---|---|
| `test_orchestrator.py` | Evolution loop phases, frontier computation, summary updates |
| `test_proposer.py` | Proposal generation, candidate metadata creation |
| `test_nova_llm_bridge.py` | LLM message formatting, response parsing |
| `test_config_builder.py` | Config generation from domain spec |
| `test_diff_parser.py` | Diff parsing into file updates |

### 9.2 Integration Tests

| Test | Covers |
|---|---|
| End-to-end minimal run (1 iteration, 1 dataset) | Full loop with mock LLM |
| Baseline-only run | Phase 0 execution |
| Test evaluation | Phase Final execution |

### 9.3 Reference Reproduction Tests

| Test | Covers |
|---|---|
| Reproduce text_classification baselines | Compatibility with original framework |
| Reproduce text_classification 1 iteration | Proposer + benchmark integration |

---

## 10. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Nova LLM produces worse proposals than Claude Code | **High** | Start with Claude as proposer, migrate gradually |
| Nova tool set doesn't match Claude Code tools | **Medium** | Abstract tools via Proposer interface, map as needed |
| Config generation produces incompatible YAML | **Medium** | Validate against original framework's schema |
| LLM latency higher than Claude Code CLI | **Low** | Configurable timeouts, async execution |
| Meta-Harness API changes break our bridge | **Low** | Pin version, integration tests catch regressions |

---

## 11. Next Steps (Post-Architecture)

1. **Create package skeleton** (pyproject.toml, directory structure, __init__.py)
2. **Implement BenchmarkClient** (wrap benchmark.py, parse val.json/frontier_val.json)
3. **Implement MemoryClient** (wrap memory_system.py)
4. **Implement ConfigBuilder** (generate config.yaml from domain spec)
5. **Implement Proposer interface** (abstract base + NovaProposer)
6. **Implement NovaLLMBridge** (connect to Nova LLM API)
7. **Implement Orchestrator** (full evolution loop)
8. **Integration test with text_classification** (reproduce baseline results)
