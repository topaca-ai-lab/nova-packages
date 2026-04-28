"""Abstract Proposer interface and base class."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence, Optional

from .nova_llm_bridge import LLMMessage


@dataclass
class ProposerContext:
    """Context passed to the proposer on each iteration."""

    iteration: int
    frontier_val: dict
    evolution_summary: list[dict]
    available_datasets: list[str]
    config_model: str


@dataclass
class ProposalResult:
    """Output from a successful propose step."""

    candidates: Sequence[dict]
    pending_eval_path: Path


class Proposer(ABC):
    """Abstract interface for the proposer agent.

    The proposer receives context about the current evolution state
    and produces candidate harness modifications.
    """

    @abstractmethod
    async def propose(self, context: ProposerContext) -> Optional[ProposalResult]:
        """Propose new harness candidates.

        Returns ProposalResult with candidate metadata, or None on failure.
        The proposer is responsible for:
        1. Generating/modifying code in the agents directory
        2. Writing pending_eval.json with candidate metadata
        """
        ...


class BaseProposer(Proposer, ABC):
    """Base implementation with common utilities."""

    def __init__(
        self,
        agents_dir: Path,
        logs_dir: Path,
    ):
        self.agents_dir = agents_dir
        self.logs_dir = logs_dir
        self.agents_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    def build_task_prompt(self, context: ProposerContext) -> str:
        """Build the task prompt from evolution state."""
        frontier = context.frontier_val
        summary = context.evolution_summary

        prompt = "You are optimizing a model harness for {}.\n\n".format(
            ", ".join(context.available_datasets)
        )
        prompt += "Current iteration: {}\n".format(context.iteration)
        prompt += "Frozen base model: {}\n\n".format(context.config_model)
        prompt += "CURRENT FRONTIER (best systems per dataset):\n"

        for dataset, info in frontier.items():
            if dataset.startswith("_"):
                continue
            prompt += "  {}: {} ({}%)\n".format(
                dataset,
                info.get("best_system", "N/A"),
                info.get("accuracy", 0),
            )

        prompt += "\nEVOLUTION HISTORY:\n"
        for entry in summary[-10:]:
            prompt += "  Iteration {}: {} -> {}\n".format(
                entry.get("iteration", "?"),
                entry.get("system", "?"),
                entry.get("outcome", "?"),
            )

        prompt += """
TASK:
Propose 1-3 new candidate harness modifications. For each candidate, provide:
1. A name for the candidate (snake_case, e.g. "improved_retrieval")
2. A hypothesis explaining the expected improvement
3. The axis of change (e.g. "retrieval_strategy", "context_window", "memory_format")
4. The full Python code implementing the MemorySystem class

Write the output in the following JSON format inside a code block:
```json
{
  "candidates": [
    {
      "name": "candidate_name",
      "hypothesis": "what this candidate does",
      "axis": "category_of_change",
      "components": []
    }
  ]
}
```

Also write the full Python code for each candidate in separate code blocks with filename:
```python filename=agents/candidate_name.py
# Full implementation here
```

The code must implement a MemorySystem subclass with predict() and learn_from_batch() methods.
"""
        return prompt

    def write_pending_eval(self, iteration: int, candidates: Sequence[dict]) -> Path:
        """Write pending_eval.json to logs directory."""
        import json

        pending = {
            "iteration": iteration,
            "candidates": list(candidates),
        }
        pending_path = self.logs_dir / "pending_eval.json"
        pending_path.write_text(json.dumps(pending, indent=2))
        return pending_path

    async def propose(self, context: ProposerContext) -> Optional[ProposalResult]:
        """Default propose implementation."""
        return await self._do_propose(context)

    @abstractmethod
    async def _do_propose(self, context: ProposerContext) -> Optional[ProposalResult]:
        """Subclasses implement actual proposal logic here."""
        ...


class NovaProposer(BaseProposer):
    """Default proposer implementation using Nova's LLM capabilities."""

    def __init__(
        self,
        llm_bridge: "NovaLLMBridge",
        agents_dir: Path,
        logs_dir: Path,
        task_prompt_template: str = "",
        allowed_tools: Sequence[str] | None = None,
    ):
        super().__init__(agents_dir, logs_dir)
        self.llm_bridge = llm_bridge
        self.task_prompt_template = task_prompt_template
        self.allowed_tools = allowed_tools or []

    async def _do_propose(self, context: ProposerContext) -> Optional[ProposalResult]:
        """Generate proposals using Nova LLM."""
        from .diff_parser import (
            parse_code_blocks,
            parse_pending_eval,
            apply_file_updates,
        )

        # Build prompt
        if self.task_prompt_template:
            prompt = self.task_prompt_template.format(
                context=context, **context.__dict__
            )
        else:
            prompt = self.build_task_prompt(context)

        # Call Nova LLM
        messages = [LLMMessage(role="user", content=prompt)]
        response = await self.llm_bridge.chat(
            messages=messages,
            model=context.config_model,
            temperature=0.0,
            max_tokens=8192,
        )

        if not response.content or response.finish_reason == "error":
            print("LLM call failed or returned empty response.")
            return None

        # Parse pending_eval.json structure
        pending_data = parse_pending_eval(response.content)
        if not pending_data or "candidates" not in pending_data:
            print("Failed to parse candidates from LLM response.")
            return None

        candidates = pending_data["candidates"]

        # Parse and apply code blocks
        code_blocks = parse_code_blocks(response.content)
        if code_blocks:
            written = apply_file_updates(self.agents_dir.parent, code_blocks)
            print("  Written {} file(s): {}".format(len(written), written))

        # Write pending_eval.json
        pending_path = self.write_pending_eval(context.iteration, candidates)

        return ProposalResult(candidates=candidates, pending_eval_path=pending_path)
