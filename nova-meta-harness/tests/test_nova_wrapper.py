"""Tests for Nova MemorySystem wrapper."""

import pytest
from pathlib import Path
from nova_meta_harness.nova_wrapper import (
    NovaMemorySystemBase,
    NovaAgentHarness,
    MemorySystem,
)


class MockLLM:
    """Mock LLM for testing."""

    def __init__(self, response: str = "test answer"):
        self.response = response
        self.call_count = 0

    def __call__(self, prompt: str) -> str:
        self.call_count += 1
        return self.response


def test_nova_memory_system_base_init():
    llm = MockLLM()
    wrapper = NovaMemorySystemBase(llm, {"memory_strategy": "test"})
    assert wrapper.config["memory_strategy"] == "test"
    assert wrapper.step_count == 0
    assert len(wrapper.examples) == 0


def test_nova_memory_system_predict():
    llm = MockLLM(response="final answer here")
    wrapper = NovaMemorySystemBase(llm, {"prompt_variant": "concise"})

    answer, metadata = wrapper.predict("test input")

    assert answer == "final answer here"
    assert "prompt_length" in metadata
    assert "step_count" in metadata
    assert wrapper.step_count == 1


def test_nova_memory_system_learn_from_batch():
    llm = MockLLM()
    wrapper = NovaMemorySystemBase(llm, {"memory_strategy": "default"})

    batch = [
        {
            "input": "task1",
            "prediction": "ans1",
            "ground_truth": "ans1",
            "was_correct": True,
            "metadata": {},
        },
        {
            "input": "task2",
            "prediction": "ans2",
            "ground_truth": "wrong",
            "was_correct": False,
            "metadata": {},
        },
    ]

    wrapper.learn_from_batch(batch)

    # Should have saved correct example
    assert len(wrapper.examples) == 1
    assert wrapper.examples[0]["input"] == "task1"


def test_nova_memory_system_state():
    llm = MockLLM()
    wrapper = NovaMemorySystemBase(llm)

    # Set some state
    wrapper.state["memory_strategy"] = "aggressive"
    wrapper.examples = [{"input": "test", "output": "result"}]
    wrapper.step_count = 5

    # Get state
    state_str = wrapper.get_state()
    assert isinstance(state_str, str)

    # Set state
    new_wrapper = NovaMemorySystemBase(llm)
    new_wrapper.set_state(state_str)

    assert new_wrapper.state["memory_strategy"] == "aggressive"
    assert len(new_wrapper.examples) == 1
    assert new_wrapper.step_count == 5


def test_nova_agent_harness_implements_memory_system():
    """Check that NovaAgentHarness has the required methods."""
    llm = MockLLM()
    harness = NovaAgentHarness(llm, {"num_fewshot": 5})

    # Check it has required methods
    assert hasattr(harness, "predict")
    assert hasattr(harness, "learn_from_batch")
    assert hasattr(harness, "get_state")
    assert hasattr(harness, "set_state")
    assert hasattr(harness, "get_context_length")

    # Test predict
    answer, metadata = harness.predict("test")
    assert isinstance(answer, str)
    assert isinstance(metadata, dict)


def test_nova_agent_harness_state_passthrough():
    llm = MockLLM()
    harness = NovaAgentHarness(llm)

    # Set state on wrapped object
    harness.wrapped.state["test_key"] = "test_value"

    # Get state should include it
    state = harness.get_state()
    assert "test_value" in state

    # Set state should restore it
    new_harness = NovaAgentHarness(llm)
    new_harness.set_state(state)
    assert new_harness.wrapped.state["test_key"] == "test_value"


def test_baseline_candidate_import():
    """Test that baseline candidates can be imported."""
    import sys

    sys.path.insert(0, str(Path(__file__).parent.parent / "nova_meta_harness"))

    # Try importing baseline
    from agents.nova_baseline import NovaBaseline

    llm = MockLLM()
    baseline = NovaBaseline(llm)

    assert baseline is not None
    assert baseline.config["memory_strategy"] == "default"
    assert baseline.config["context_policy"]["taskStateBudget"] == 220


def test_agressive_memory_candidate():
    """Test aggressive memory variant."""
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent.parent / "nova_meta_harness"))

    # The file is named nova_agressive_memory.py (one 'g')
    # The class inside is NovaAggressiveMemory (two 'g's)
    from agents.nova_agressive_memory import NovaAggressiveMemory

    llm = MockLLM()
    aggressive = NovaAggressiveMemory(llm)

    assert aggressive.config["memory_strategy"] == "aggressive"
    assert aggressive.config["context_policy"]["taskStateBudget"] == 400
    assert aggressive.config["num_fewshot"] == 8


def test_conservative_candidate():
    """Test conservative variant."""
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent.parent / "nova_meta_harness"))

    from agents.nova_conservative import NovaConservative

    llm = MockLLM()
    conservative = NovaConservative(llm)

    assert conservative.config["memory_strategy"] == "conservative"
    assert conservative.config["context_policy"]["taskStateBudget"] == 100
    assert conservative.config["num_fewshot"] == 1
