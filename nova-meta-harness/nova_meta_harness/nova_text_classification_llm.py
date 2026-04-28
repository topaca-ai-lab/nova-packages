"""LLM abstraction adapted for Nova Package.

Thin wrapper around LLM calls for text classification tasks.
This version is adapted to work with the Nova Package structure.
"""

import hashlib
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CACHE_DIR = Path(
    os.path.expanduser(
        os.environ.get(
            "NOVA_TEXT_CLASSIFICATION_LLM_CACHE_DIR",
            "~/.cache/nova-text-classification/llm",
        )
    )
)
CACHE_VERSION = 1


def _compute_cache_key(
    prompt: str, system_prompt: str | None, model: str, kwargs: dict[str, Any]
) -> str:
    """Compute cache key for LLM response."""
    payload = {
        "version": CACHE_VERSION,
        "model": model,
        "system_prompt": system_prompt,
        "prompt": prompt,
        "kwargs": kwargs,
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()


def _load_cache(cache_path: Path) -> dict[str, Any] | None:
    """Load cached response."""
    if not cache_path.exists():
        return None
    try:
        return json.loads(cache_path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def _save_cache(cache_path: Path, payload: dict[str, Any]) -> None:
    """Save response to cache."""
    tmp = cache_path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(payload))
        tmp.replace(cache_path)
    except OSError:
        pass


class LLMCallable:
    """Protocol for LLM call functions."""

    def __call__(self, prompt: str) -> str:
        raise NotImplementedError


class SimpleLLM:
    """Simple LLM caller for testing without external dependencies.

    In production, this would call Nova's LLM API or another provider.
    """

    def __init__(
        self,
        model: str = "nova-default",
        api_endpoint: str = "",
        api_key: str = "",
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ):
        self.model = model
        self.api_endpoint = api_endpoint
        self.api_key = api_key
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self._lock = threading.Lock()
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def __call__(self, prompt: str) -> str:
        """Call LLM with prompt."""
        self._last_prompt = prompt
        result = self._generate_one(prompt, None, {})
        self._last_response = result
        return result

    def _generate_one(
        self, prompt: str, system_prompt: str | None, kwargs: dict[str, Any]
    ) -> str:
        """Generate one response."""
        cache_path = (
            CACHE_DIR
            / f"{_compute_cache_key(prompt, system_prompt, self.model, kwargs)}.json"
        )

        # Try cache
        cached = _load_cache(cache_path)
        if cached is not None:
            return cached["content"]

        # Call LLM (mock implementation for now)
        content = self._mock_generate(prompt)

        result = {
            "content": content,
            "input_tokens": len(prompt) // 4,  # Rough estimate
            "output_tokens": len(content) // 4,
        }

        _save_cache(cache_path, result)

        with self._lock:
            self.total_input_tokens += result["input_tokens"]
            self.total_output_tokens += result["output_tokens"]
            self.total_calls = getattr(self, "total_calls", 0) + 1

        return content

    def _mock_generate(self, prompt: str) -> str:
        """Mock generation for testing.

        In real implementation, this would call:
        - Nova API
        - OpenAI API
        - Local model server
        """
        # Simple mock: return a fixed format response
        if "classify" in prompt.lower():
            return '{"prediction": "positive", "confidence": 0.85}'
        elif "reasoning" in prompt.lower():
            return "Based on the input, I think..."
        else:
            return "Response to: " + prompt[:50]

    def get_usage(self) -> dict[str, Any]:
        """Return token usage stats."""
        with self._lock:
            # Estimate tokens (rough approximation: 1 token ≈ 4 chars)
            est_input = self.total_input_tokens
            est_output = self.total_output_tokens
            if est_input == 0 and hasattr(self, "_last_prompt"):
                est_input = len(getattr(self, "_last_prompt", "")) // 4
            if est_output == 0 and hasattr(self, "_last_response"):
                est_output = len(getattr(self, "_last_response", "")) // 4
            return {
                "model": self.model,
                "input_tokens": est_input,
                "output_tokens": est_output,
                "total_tokens": est_input + est_output,
            }

    def reset_usage(self):
        """Reset token counters."""
        with self._lock:
            self.total_input_tokens = 0
            self.total_output_tokens = 0


def make_nova_llm(
    model: str = "nova-default",
    api_endpoint: str = "https://api.nova.ai/v1/chat/completions",
    api_key: str = "",
    temperature: float = 0.0,
    max_tokens: int = 4096,
) -> SimpleLLM:
    """Create an LLM caller that uses Nova's API."""
    return SimpleLLM(
        model=model,
        api_endpoint=api_endpoint,
        api_key=api_key,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def make_mock_llm(response: str = "mock response") -> LLMCallable:
    """Create a mock LLM for testing."""

    class MockLLM:
        def __call__(self, prompt: str) -> str:
            return response

    return MockLLM()
