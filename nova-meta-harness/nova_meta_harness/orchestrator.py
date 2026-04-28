"""Nova wrapper for the Meta-Harness evolution orchestrator."""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence, Optional
from .nova_llm_bridge import NovaLLMBridge, LLMMessage
from .proposer import Proposer, ProposerContext
from .benchmark_client import BenchmarkClient
from .memory_client import MemoryClient
from .diff_parser import parse_code_blocks, apply_file_updates, parse_pending_eval
from .config_builder import ConfigBuilder


@dataclass
class EvolutionConfig:
    """Nova-side configuration for the evolution loop."""

    meta_harness_root: Path
    config_path: Path
    logs_dir: Path
    iterations: int = 1
    model: str = "gpt-4o"
    propose_timeout: int = 300
    skip_baseline: bool = False
    run_name: Optional[str] = None


@dataclass
class EvolutionResult:
    """Final results after evolution completes."""

    frontier_val: dict
    evolution_summary: list[dict]
    test_results: dict = field(default_factory=dict)


class MetaHarnessOrchestrator:
    """Nova wrapper for the Meta-Harness evolution orchestrator."""

    def __init__(
        self,
        config: EvolutionConfig,
        proposer: Proposer,
        benchmark_client: BenchmarkClient,
        memory_client: MemoryClient,
    ):
        self.config = config
        self.proposer = proposer
        self.benchmark_client = benchmark_client
        self.memory_client = memory_client
        self.logs_dir = config.logs_dir
        if config.run_name:
            self.logs_dir = self.logs_dir / config.run_name
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    async def run(self) -> EvolutionResult:
        """Execute the full evolution loop (Phase 0 -> Phase 1..N -> Phase Final)."""
        # Phase 0: Baselines
        if not self.config.skip_baseline:
            await self._run_baselines()

        # Phase 1..N: Evolution iterations
        for i in range(1, self.config.iterations + 1):
            await self.run_iteration(i)

        # Phase Final: Test evaluation
        test_results = await self._run_test_evaluation()

        frontier = self.memory_client.get_frontier(self.logs_dir)
        summary = self.memory_client.get_history(self.logs_dir)

        return EvolutionResult(
            frontier_val=frontier,
            evolution_summary=summary,
            test_results=test_results,
        )

    async def _run_baselines(self) -> None:
        """Run baseline memory systems (Phase 0)."""
        print("Phase 0: Running baselines...")
        # Load config to get baseline names
        import yaml

        with open(self.config.config_path) as f:
            cfg = yaml.safe_load(f)
        baselines = cfg.get("memory_systems", {}).get("baselines", [])
        datasets = cfg.get("datasets", [])
        models = cfg.get("models", [])

        for model_cfg in models:
            model = model_cfg["model"]
            for dataset in datasets:
                for baseline in baselines:
                    print(f"  Running baseline: {baseline} on {dataset} with {model}")
                    # Baseline evaluation would go here
                    # This delegates to benchmark_client for actual execution

        print("Phase 0 complete.")

    async def run_iteration(self, iteration: int) -> dict:
        """Execute a single evolution iteration."""
        print(f"\nIteration {iteration}:")

        # 1. Get context
        frontier = self.memory_client.get_frontier(self.logs_dir)
        summary = self.memory_client.get_history(self.logs_dir)

        import yaml

        with open(self.config.config_path) as f:
            cfg = yaml.safe_load(f)

        context = ProposerContext(
            iteration=iteration,
            frontier_val=frontier,
            evolution_summary=summary,
            available_datasets=cfg.get("datasets", []),
            config_model=self.config.model,
        )

        # 2. Propose candidates
        print("  Proposing candidates...")
        proposal = await self.proposer.propose(context)
        if not proposal or not proposal.candidates:
            print("  No valid proposals generated.")
            return {"status": "no_proposals"}

        print(f"  Generated {len(proposal.candidates)} candidate(s).")

        # 3. Validate candidates (import check - simplified)
        # In full implementation, this would use subprocess to run import check

        # 4. Benchmark candidates
        print("  Benchmarking candidates...")
        # This would iterate over candidates and run benchmark_client.run_benchmark()

        # 5. Update frontier + summary
        # This would reload frontier and summary after benchmarking

        return {"status": "completed", "candidates": len(proposal.candidates)}

    async def _run_test_evaluation(self) -> dict:
        """Run final test evaluation (Phase Final)."""
        print("\nPhase Final: Test evaluation...")
        return {}
