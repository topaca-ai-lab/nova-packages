"""Tests for nova_llm_bridge module."""

import pytest
from nova_meta_harness.nova_llm_bridge import (
    NovaLLMBridge,
    MockLLMBridge,
    NovaImplBridge,
    LLMMessage,
    LLMResponse,
)


def test_llm_message_creation():
    msg = LLMMessage(role="user", content="Hello")
    assert msg.role == "user"
    assert msg.content == "Hello"


def test_llm_response_creation():
    resp = LLMResponse(content="Hi there")
    assert resp.content == "Hi there"
    assert resp.finish_reason is None


def test_mock_llm_bridge():
    bridge = MockLLMBridge(responses=['{"candidates": []}'])
    msg = LLMMessage(role="user", content="Test")

    import asyncio

    result = asyncio.run(bridge.chat([msg]))

    assert result.content == '{"candidates": []}'
    assert bridge.call_count == 1


def test_mock_llm_bridge_empty():
    bridge = MockLLMBridge()
    msg = LLMMessage(role="user", content="Test")

    import asyncio

    result = asyncio.run(bridge.chat([msg]))

    assert result.content == '{"candidates": []}'


@pytest.mark.asyncio
async def test_nova_impl_bridge_init():
    bridge = NovaImplBridge(
        endpoint="https://test.com/api",
        api_key="test-key",
        default_model="test-model",
    )
    assert bridge.endpoint == "https://test.com/api"
    assert bridge.api_key == "test-key"
