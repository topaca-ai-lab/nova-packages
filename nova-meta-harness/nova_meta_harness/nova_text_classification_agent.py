"""Text classification agent harness for Meta-Harness optimization.

This module defines agent variants for text classification tasks.
Each variant is a MemorySystem that can be optimized by Meta-Harness.
"""

import json
from typing import Optional

from .nova_wrapper import NovaAgentHarness
from .nova_text_classification_llm import SimpleLLM


class TextClassificationAgent:
    """Base text classification agent.

    This is the base class for text classification variants.
    Different variants will override methods or change configuration.
    """

    def __init__(self, llm: SimpleLLM, config: dict = None):
        self.llm = llm
        self.config = config or {}
        self.state = {
            "memory_strategy": self.config.get("memory_strategy", "default"),
            "prompt_variant": self.config.get("prompt_variant", "default"),
        }
        self.examples = []
        self.step_count = 0
        self.task_type = "text_classification"

    def predict(self, input_text: str) -> tuple[str, dict]:
        """Predict class for input text."""
        prompt = self._build_prompt(input_text)
        response = self.llm(prompt)
        prediction = self._extract_prediction(response)

        metadata = {
            "prompt_length": len(prompt),
            "response_length": len(response),
            "raw_response": response,
        }

        self.step_count += 1
        return prediction, metadata

    def learn_from_batch(self, batch_results: list[dict]) -> None:
        """Learn from batch results."""
        for r in batch_results:
            if r.get("was_correct", False):
                self.examples.append(
                    {
                        "input": r["input"],
                        "output": r["prediction"],
                    }
                )
        # Keep last 20 examples by default
        self.examples = self.examples[-20:]

    def get_state(self) -> str:
        """Return serializable state."""
        return json.dumps(
            {
                "state": self.state,
                "examples": self.examples[-20:],
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

    def _build_prompt(self, input_text: str) -> str:
        """Build prompt for text classification."""
        parts = []

        # System prompt based on variant
        if self.config.get("prompt_variant") == "detailed":
            parts.append("You are an expert text classification assistant.")
            parts.append("Think step by step about the text.")
        elif self.config.get("prompt_variant") == "concise":
            parts.append("Classify the text.")
        else:
            parts.append("You are a text classification agent.")

        # Add examples if available
        if self.examples and self.state.get("memory_strategy") != "none":
            parts.append("\nExamples:")
            for ex in self.examples[-self.config.get("num_fewshot", 3) :]:
                parts.append(f"Text: {ex['input']}\nClass: {ex['output']}")

        # Add current input
        parts.append(f"\nText to classify: {input_text}")
        parts.append("\nClassification (JSON format):")

        return "\n".join(parts)

    def _extract_prediction(self, response: str) -> str:
        """Extract prediction from LLM response."""
        try:
            data = json.loads(response)
            return data.get("prediction", "unknown")
        except json.JSONDecodeError:
            # Fallback: look for common patterns
            if "positive" in response.lower():
                return "positive"
            elif "negative" in response.lower():
                return "negative"
            return "unknown"


class SimpleBaselineAgent(TextClassificationAgent):
    """Baseline agent with minimal configuration."""

    def __init__(self, llm: SimpleLLM):
        config = {
            "memory_strategy": "default",
            "prompt_variant": "default",
            "num_fewshot": 3,
        }
        super().__init__(llm, config)


class AggressiveMemoryAgent(TextClassificationAgent):
    """Agent with aggressive memory strategy."""

    def __init__(self, llm: SimpleLLM):
        config = {
            "memory_strategy": "aggressive",
            "prompt_variant": "detailed",
            "num_fewshot": 8,
        }
        super().__init__(llm, config)

    def learn_from_batch(self, batch_results: list[dict]) -> None:
        """More aggressive learning from batch."""
        for r in batch_results:
            if r.get("was_correct", False):
                self.examples.append(
                    {
                        "input": r["input"],
                        "output": r["prediction"],
                    }
                )
        # Keep last 50 examples
        self.examples = self.examples[-50:]


class ConservativeAgent(TextClassificationAgent):
    """Agent with conservative settings."""

    def __init__(self, llm: SimpleLLM):
        config = {
            "memory_strategy": "conservative",
            "prompt_variant": "concise",
            "num_fewshot": 1,
        }
        super().__init__(llm, config)

    def learn_from_batch(self, batch_results: list[dict]) -> None:
        """Minimal learning - only keep best examples."""
        correct = [r for r in batch_results if r.get("was_correct", False)]
        if correct:
            # Only keep the first correct example
            self.examples = [
                {
                    "input": correct[0]["input"],
                    "output": correct[0]["prediction"],
                }
            ]
