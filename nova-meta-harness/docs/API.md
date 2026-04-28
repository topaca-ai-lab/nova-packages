# Meta-Harness Nova API Reference

## Core Classes

### `MetaHarnessOrchestrator`

Manages the evolution loop for harness optimization.

```python
class MetaHarnessOrchestrator:
    def __init__(
        config: EvolutionConfig,
        proposer: Proposer,
        benchmark_client: BenchmarkClient,
        memory_client: MemoryClient,
    )
    
    async def run() -> EvolutionResult:
        """Execute full evolution (Phase 0 → Phase 1..N → Phase Final)."""
```

### `EvolutionConfig`

Configuration for the evolution loop.

```python
@dataclass
class EvolutionConfig:
    meta_harness_root: Path    # Path to nova-meta-harness framework
    config_path: Path            # Path to config.yaml
    logs_dir: Path               # Output directory
    iterations: int = 1          # Number of evolution iterations
    model: str = "gpt-4o"      # Solver model
    propose_timeout: int = 300    # Timeout per propose step
    skip_baseline: bool = False # Skip Phase 0
    run_name: str | None = None  # Run name for isolation
```

### `Proposer` / `NovaProposer`

Interface for the proposer agent that generates new candidates.

```python
class Proposer(ABC):
    @abstractmethod
    async def propose(self, context: ProposerContext) -> ProposalResult | None:
        """Generate new harness candidates."""

class NovaProposer(BaseProposer):
    def __init__(
        llm_bridge: NovaLLMBridge,
        agents_dir: Path,
        logs_dir: Path,
        task_prompt_template: str = "",
        allowed_tools: Sequence[str] | None = None,
    )
```

### `NovaLLMBridge`

Interface for LLM API calls.

```python
class NovaLLMBridge(ABC):
    @abstractmethod
    async def chat(
        self,
        messages: Sequence[LLMMessage],
        model: str = "",
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Send chat completion request."""

class NovaImplBridge(NovaLLMBridge):
    """Concrete implementation with API + CLI fallback."""
    def __init__(
        endpoint: str = "https://api.nova.ai/v1/chat/completions",
        api_key: str = "",
        nova_cli_path: str = "nova",
    )
```

## Data Classes

### `ProposerContext`

```python
@dataclass
class ProposerContext:
    iteration: int
    frontier_val: dict           # Current frontier_val.json content
    evolution_summary: list       # Parsed evolution_summary.jsonl
    available_datasets: list[str]
    config_model: str
```

### `ProposalResult`

```python
@dataclass
class ProposalResult:
    candidates: Sequence[dict]      # List of candidate metadata
    pending_eval_path: Path       # Where pending_eval.json was written
```

### `LLMMessage` / `LLMResponse`

```python
@dataclass
class LLMMessage:
    role: str        # "system", "user", "assistant"
    content: str

@dataclass
class LLMResponse:
    content: str
    tool_calls: Sequence[dict] | None = None
    finish_reason: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
```

## Utility Classes

### `NovaMemorySystem` / `NovaAgentHarness`

Wraps Nova as a MemorySystem for Meta-Harness.

```python
class NovaAgentHarness(MemorySystem):
    def __init__(self, llm, config: dict = None)
    
    def predict(self, input: str) -> tuple[str, dict]:
        """Generate prediction BEFORE seeing ground truth."""
    
    def learn_from_batch(self, batch_results: list[dict]) -> None:
        """Learn from evaluation results."""
    
    def get_state(self) -> str:
        """Return serializable state."""
    
    def set_state(self, state: str) -> None:
        """Restore state."""
    
    def get_context_length(self) -> int:
        """Return injected context length."""
```

### `BenchmarkClient`

Wraps benchmark execution and result parsing.

```python
class BenchmarkClient:
    def __init__(
        meta_harness_root: Path,
        logs_dir: Path,
        results_dir: Path,
        concurrency: int = 16,
    )
    
    def load_results(self, filename: str = "val.json") -> dict:
        """Load results from hierarchical directory structure."""
    
    async def run_benchmark(self, ...) -> tuple[bool, dict | None]:
        """Run a single benchmark."""
    
    def compute_frontier(self, results: dict, metric: str = "val") -> dict:
        """Compute frontier (best system per dataset)."""
```

### `MemoryClient`

Manages memory system state and evolution history.

```python
class MemoryClient:
    def __init__(self, meta_harness_root: Path)
    
    def load_state(self, state_path: Path) -> str | None:
        """Load serialized memory state."""
    
    def get_history(self, logs_dir: Path) -> list[dict]:
        """Load evolution_summary.jsonl."""
    
    def get_frontier(self, logs_dir: Path) -> dict:
        """Load frontier_val.json."""
```

## Configuration

### `ConfigBuilder`

Generates config.yaml and domain_spec.md files.

```python
class ConfigBuilder:
    @staticmethod
    def build_config_yaml(spec: dict) -> str:
        """Generate config.yaml YAML string."""
    
    @staticmethod
    def write_config(config_path: Path, spec: dict) -> None:
        """Write config.yaml to path."""
    
    @staticmethod
    def parse_domain_spec_md(content: str) -> dict:
        """Parse domain_spec.md to dict."""
    
    @staticmethod
    def build_domain_spec_md(spec: dict) -> str:
        """Generate domain_spec.md from dict."""
```

## Exceptions

The package uses standard Python exceptions. Key error conditions:

- `ImportError` - Failed to import candidate modules
- `json.JSONDecodeError` - Invalid JSON in config or LLM response
- `asyncio.TimeoutError` - Propose or benchmark timeout
- `FileNotFoundError` - Missing config or data files

## Examples

See `tests/` directory for comprehensive usage examples:
- `test_nova_wrapper.py` - Nova MemorySystem usage
- `test_text_classification.py` - Text classification workflow
- `test_integration.py` - Full integration tests
- `test_proposer.py` - Proposer interface
