"""Nova MemorySystem wrapper for Meta-Harness optimization.

This module defines how Nova's agent harness is wrapped as a MemorySystem
so that Meta-Harness can optimize Nova's components.
"""

import json
import subprocess
from pathlib import Path
from typing import Optional

# Import the base MemorySystem from the original framework
# We need to make this work relative to nova-meta-harness root
import sys


class NovaMemorySystemBase:
    """Base class that wraps Nova's functionality as a MemorySystem.

    This is a template - candidates will be generated as subclasses
    with different configurations for memory, context, and tool orchestration.
    """

    def __init__(self, llm, config: dict = None):
        self.llm = llm
        self.config = config or {}
        self.state = {
            "memory_strategy": self.config.get("memory_strategy", "default"),
            "context_policy": self.config.get("context_policy", {}),
            "tool_policy": self.config.get("tool_policy", {}),
            "prompt_variant": self.config.get("prompt_variant", "default"),
        }
        self.examples = []
        self.step_count = 0

    def predict(self, input: str) -> tuple[str, dict]:
        """Generate prediction using Nova's agent harness.

        Args:
            input: The task/query to process

        Returns:
            Tuple of (answer, metadata)
        """
        # Build prompt based on current state
        prompt = self._build_prompt(input)

        # Call LLM (which would be Nova's inference in real implementation)
        response = self.llm(prompt)

        # Extract answer
        answer = self._extract_answer(response)

        metadata = {
            "prompt_length": len(prompt),
            "response_length": len(response),
            "step_count": self.step_count,
            "memory_state_size": len(json.dumps(self.state)),
        }

        self.step_count += 1
        return answer, metadata

    def learn_from_batch(self, batch_results: list[dict]) -> None:
        """Update Nova's state based on batch results.

        Args:
            batch_results: List of dicts with keys:
                - input: str
                - prediction: str
                - ground_truth: str
                - was_correct: bool
                - metadata: dict
        """
        # Analyze what worked and what didn't
        correct = [r for r in batch_results if r.get("was_correct", False)]
        incorrect = [r for r in batch_results if not r.get("was_correct", False)]

        # Update examples for few-shot
        for r in correct[:5]:  # Keep top 5 correct examples
            self.examples.append(
                {
                    "input": r["input"],
                    "output": r["prediction"],
                }
            )

        # Update state based on patterns
        if len(incorrect) > len(correct):
            # More failures -> adjust strategy
            self.state["memory_strategy"] = "aggressive"
        else:
            self.state["memory_strategy"] = "conservative"

    def get_state(self) -> str:
        """Return serializable state for checkpointing."""
        return json.dumps(
            {
                "state": self.state,
                "examples": self.examples[-20:],  # Last 20 examples
                "step_count": self.step_count,
            }
        )

    def set_state(self, state: str) -> None:
        """Restore state from serialized representation."""
        data = json.loads(state)
        self.state = data.get("state", {})
        self.examples = data.get("examples", [])
        self.step_count = data.get("step_count", 0)

    def get_context_length(self) -> int:
        """Return character length of context injected per query."""
        return len(json.dumps(self.state)) + len(json.dumps(self.examples))

    def _build_prompt(self, input: str) -> str:
        """Build prompt based on current memory state and examples."""
        parts = []

        # Add system prompt based on variant
        if self.state["prompt_variant"] == "detailed":
            parts.append("You are an expert coding assistant. Think step by step.")
        elif self.state["prompt_variant"] == "concise":
            parts.append("You are a coding assistant.")
        else:
            parts.append("You are Nova, a coding assistant.")

        # Add examples if available
        if self.examples and self.state["memory_strategy"] != "none":
            parts.append("\nExamples:")
            for ex in self.examples[-self.config.get("num_fewshot", 3) :]:
                parts.append(f"Input: {ex['input']}\nOutput: {ex['output']}")

        # Add current input
        parts.append(f"\nCurrent task: {input}")
        parts.append("\nAnswer:")

        return "\n".join(parts)

    def _extract_answer(self, response: str) -> str:
        """Extract the final answer from LLM response."""
        # Simple extraction - in real Nova this would be more sophisticated
        lines = response.strip().split("\n")
        return lines[-1] if lines else ""


# For the actual MemorySystem interface that Meta-Harness expects,
# we need to import from the original framework. Since we can't directly
# import from nova-meta-harness (it's a separate repo), we define a compatible
# interface here that the generated candidates will use.


class MemorySystem:
    """Compatible interface with nova-meta-harness MemorySystem."""

    def __init__(self, llm):
        self._llm = llm
        self._prompt_local = type("Local", (), {})()

    def call_llm(self, prompt: str) -> str:
        self._prompt_local.last_prompt_len = len(prompt)
        return self._llm(prompt)

    def get_last_prompt_info(self) -> dict:
        return {
            "prompt_len": getattr(self._prompt_local, "last_prompt_len", None),
            "prompt_hash": None,
            "prompt_text": None,
        }

    def predict(self, input: str) -> tuple[str, dict]:
        raise NotImplementedError

    def learn_from_batch(self, batch_results: list[dict]) -> None:
        raise NotImplementedError

    def get_context_length(self) -> int:
        return 0

    def get_state(self) -> str:
        raise NotImplementedError

    def set_state(self, state: str) -> None:
        raise NotImplementedError


class NovaAgentHarness(MemorySystem):
    """Concrete implementation wrapping Nova as a MemorySystem.

    This is the base candidate that Meta-Harness will modify.
    Different variants will override methods or change configuration.
    """

    def __init__(self, llm, config: dict = None):
        super().__init__(llm)
        self.config = config or {}
        self.wrapped = NovaMemorySystemBase(llm, config)

    def predict(self, input: str) -> tuple[str, dict]:
        return self.wrapped.predict(input)

    def learn_from_batch(self, batch_results: list[dict]) -> None:
        return self.wrapped.learn_from_batch(batch_results)

    def get_state(self) -> str:
        return self.wrapped.get_state()

    def set_state(self, state: str) -> None:
        return self.wrapped.set_state(state)

    def get_context_length(self) -> int:
        return self.wrapped.get_context_length()
