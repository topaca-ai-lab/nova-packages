# Meta-Harness for Nova - User Guide

## Overview

Meta-Harness is a framework for automated search over model harnesses. This package integrates Meta-Harness with Nova, enabling:

1. **Nova as the system being optimized** - Search over different harness configurations
2. **Nova as the proposer** - Generate new harness variants using Nova's LLM
3. **Automated optimization** - Find the best harness for your domain

## Quick Start

### Installation

```bash
cd dev/nova-packages/nova-meta-harness
uv sync --extra dev
```

### Basic Usage: Optimizing Nova's Harness

1. **Create a domain specification** (`domain_spec.md`):

```markdown
# Domain Spec: My Coding Assistant

## Domain Summary
Optimizing Nova for Python coding tasks. Unit of evaluation: one coding problem.

## Harness and Search Plan
Search over memory strategies, context window policies, and tool orchestration.

## Evaluation Plan
Metric: pass_rate on HumanEval benchmark.

## Experience and Logging
Logs in `logs/`, candidates in `nova_meta_harness/agents/`.
```

2. **Create configuration** (`config_nova.yaml`):

```yaml
datasets:
  - humaeval
  - mbpp

models:
  - model: nova-default

memory_systems:
  baselines:
    - nova_baseline
    - nova_agressive_memory
    - nova_conservative
  proposed: []

evaluation:
  primary_metric: pass_rate
```

3. **Run optimization**:

```python
import asyncio
from pathlib import Path

from nova_meta_harness import MetaHarnessOrchestrator, EvolutionConfig
from nova_meta_harness import NovaProposer, NovaImplBridge

async def main():
    # Setup
    config = EvolutionConfig(
        meta_harness_root=Path("../../nova-meta-harness"),
        config_path=Path("config_nova.yaml"),
        logs_dir=Path("logs"),
        iterations=5,
        model="nova-default",
    )
    
    # Create Nova LLM Bridge
    bridge = NovaImplBridge(
        endpoint="https://api.nova.ai/v1/chat/completions",
        api_key="your-api-key",
    )
    
    # Create proposer
    from nova_meta_harness.agents import nova_baseline
    # ... setup proposer with bridge
    
    # Run evolution
    orchestrator = MetaHarnessOrchestrator(config, proposer, benchmark_client, memory_client)
    result = await orchestrator.run()
    
    print(f"Best system: {result.frontier_val}")

asyncio.run(main())
```

## Text Classification Example

The package includes a ported text classification example:

```python
from nova_meta_harness import SimpleLLM
from nova_meta_harness.nova_text_classification_agent import SimpleBaselineAgent

# Create LLM
llm = SimpleLLM(model="nova-default")

# Create agent
agent = SimpleBaselineAgent(llm)

# Predict
prediction, metadata = agent.predict("This is great!")
print(f"Prediction: {prediction}")
```

### Run Text Classification Benchmark

```python
from nova_meta_harness.nova_text_classification_benchmark import TextClassificationBenchmark

runner = TextClassificationBenchmark(
    datasets_dir=Path("datasets"),
    results_dir=Path("results"),
)

result = await runner.run_evaluation(
    agent_name="SimpleBaselineAgent",
    dataset_name="sentiment",
    num_samples=100,
)
```

## Architecture

```
nova_meta_harness/
├── orchestrator.py         # Evolution loop management
├── proposer.py             # Proposer interface + NovaProposer
├── nova_llm_bridge.py      # LLM API integration
├── config_builder.py       # Config generation
├── benchmark_client.py     # Benchmark execution
├── memory_client.py        # State management
├── diff_parser.py          # Code diff parsing
├── nova_wrapper.py          # Nova MemorySystem wrapper
├── nova_text_classification_*  # Ported examples
└── agents/                 # Candidate implementations
    ├── nova_baseline.py
    ├── nova_aggressive_memory.py
    └── nova_conservative.py
```

## Creating Custom Candidates

Create a new candidate harness:

```python
# agents/my_custom_agent.py
from nova_meta_harness.nova_wrapper import NovaAgentHarness

class MyCustomAgent(NovaAgentHarness):
    def __init__(self, llm):
        config = {
            "memory_strategy": "custom",
            "context_policy": {
                "taskStateBudget": 300,
                "workingMemoryBudget": 1000,
            },
            "prompt_variant": "detailed",
        }
        super().__init__(llm, config)
    
    def predict(self, input_text):
        # Custom prediction logic
        pass
```

## Key Concepts

### MemorySystem Interface
Candidates must implement:
- `predict(input) -> (answer, metadata)`
- `learn_from_batch(batch_results)`
- `get_state() -> str`
- `set_state(state)`
- `get_context_length() -> int`

### Evolution Loop
1. **Baselines** - Evaluate baseline candidates
2. **Propose** - Generate new candidates using Nova
3. **Validate** - Check candidate code
4. **Benchmark** - Evaluate candidates
5. **Update** - Update frontier (best candidates)

## Troubleshooting

### Tests Failing
```bash
cd /home/markus/dev/nova-packages/nova-meta-harness
.venv/bin/python -m pytest tests/ -v
```

### Import Errors
Make sure you're running from the correct directory and the package is installed:
```bash
uv pip install -e .
```

### API Connection Issues
Check your Nova API endpoint and key in `NovaImplBridge` configuration.

## Advanced Usage

### Custom Proposer Prompts
```python
proposer = NovaProposer(
    llm_bridge=bridge,
    task_prompt_template="""
    Generate a new harness variant focusing on {context.available_datasets}.
    Current frontier: {context.frontier_val}
    """
)
```

### State Serialization
```python
# Save state
state = agent.get_state()
# Restore state
agent.set_state(state)
```

## References

- [Meta-Harness Paper](https://arxiv.org/abs/2603.28052)
- [Meta-Harness Repository](https://github.com/stanford-iris-lab/nova-meta-harness)
- [Nova Documentation](../../nova-documentation/)
