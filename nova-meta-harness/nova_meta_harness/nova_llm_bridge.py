"""Nova LLM Bridge interface and base implementation."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Sequence, Optional


@dataclass
class LLMMessage:
    """A message in a chat conversation."""

    role: str  # "system", "user", "assistant"
    content: str


@dataclass
class LLMResponse:
    """Response from an LLM chat completion."""

    content: str
    tool_calls: Sequence[dict] | None = None
    finish_reason: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None


class NovaLLMBridge(ABC):
    """Abstract interface to Nova's LLM orchestration."""

    @abstractmethod
    async def chat(
        self,
        messages: Sequence[LLMMessage],
        model: str = "gpt-4o",
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Send a chat completion request via Nova."""
        ...


class MockLLMBridge(NovaLLMBridge):
    """Mock implementation for testing."""

    def __init__(self, responses: list[str] | None = None):
        self.responses = responses or []
        self.call_count = 0

    async def chat(
        self,
        messages: Sequence[LLMMessage],
        model: str = "gpt-4o",
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        if self.call_count < len(self.responses):
            content = self.responses[self.call_count]
        else:
            content = '{"candidates": []}'
        self.call_count += 1
        return LLMResponse(content=content)


class NovaImplBridge(NovaLLMBridge):
    """Concrete implementation using Nova's internal LLM API.

    Integrates with Nova's agent harness for generating proposals.
    """

    def __init__(
        self,
        endpoint: str = "https://api.nova.ai/v1/chat/completions",
        api_key: str = "",
        default_model: str = "nova-default",
        nova_cli_path: str = "nova",
    ):
        self.endpoint = endpoint
        self.api_key = api_key
        self.default_model = default_model
        self.nova_cli_path = nova_cli_path

    async def chat(
        self,
        messages: Sequence[LLMMessage],
        model: str = "",
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Call Nova's LLM API or CLI.

        Tries API first, falls back to CLI if available.
        """
        model = model or self.default_model

        # Try API call first
        try:
            return await self._call_api(messages, model, temperature, max_tokens)
        except Exception as e:
            print(f"API call failed ({e}), trying CLI fallback...")
            return await self._call_cli(messages, model, temperature, max_tokens)

    async def _call_api(
        self,
        messages: Sequence[LLMMessage],
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        """Call Nova API directly."""
        import json
        import urllib.request
        import urllib.error

        payload = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        try:
            req = urllib.request.Request(
                self.endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                choice = result["choices"][0]
                return LLMResponse(
                    content=choice["message"]["content"],
                    finish_reason=choice.get("finish_reason"),
                    input_tokens=result.get("usage", {}).get("prompt_tokens"),
                    output_tokens=result.get("usage", {}).get("completion_tokens"),
                )
        except (urllib.error.URLError, KeyError, json.JSONDecodeError) as e:
            raise e

    async def _call_cli(
        self,
        messages: Sequence[LLMMessage],
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        """Fallback: Call Nova CLI to generate proposal."""
        import subprocess
        import tempfile

        # Combine messages into a single prompt
        prompt = "\n\n".join([f"{m.role}: {m.content}" for m in messages])

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write(prompt)
            temp_path = f.name

        try:
            # Call nova CLI (adjust command as needed)
            result = subprocess.run(
                [self.nova_cli_path, "--prompt-file", temp_path, "--model", model],
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode == 0:
                return LLMResponse(
                    content=result.stdout,
                    finish_reason="stop",
                )
            else:
                print(f"Nova CLI error: {result.stderr}")
                return LLMResponse(content="", finish_reason="error")
        finally:
            import os

            os.unlink(temp_path)
