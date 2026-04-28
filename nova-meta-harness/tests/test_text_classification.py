"""Tests for Nova text classification port."""

import pytest
from pathlib import Path
from nova_meta_harness.nova_text_classification_llm import SimpleLLM, make_mock_llm


def test_simple_llm_creation():
    llm = SimpleLLM(model="test-model")
    assert llm.model == "test-model"
    assert llm.total_input_tokens == 0


def test_simple_llm_call():
    llm = SimpleLLM()
    response = llm("Test prompt")
    assert isinstance(response, str)
    assert len(response) > 0


def test_simple_llm_cache():
    llm = SimpleLLM()
    response1 = llm("Same prompt")
    response2 = llm("Same prompt")
    # Should return cached response
    assert getattr(llm, "total_calls", 1) == 1  # Only one actual call


def test_simple_llm_usage():
    llm = SimpleLLM()
    llm("Test")
    usage = llm.get_usage()
    assert "input_tokens" in usage
    assert "output_tokens" in usage


def test_mock_llm():
    mock = make_mock_llm(response='{"prediction": "positive"}')
    result = mock("test")
    assert "positive" in result


def test_text_classification_agent_import():
    """Test that agent classes can be imported."""
    from nova_meta_harness.nova_text_classification_agent import (
        TextClassificationAgent,
        SimpleBaselineAgent,
        AggressiveMemoryAgent,
        ConservativeAgent,
    )

    assert TextClassificationAgent is not None
    assert SimpleBaselineAgent is not None
    assert AggressiveMemoryAgent is not None
    assert ConservativeAgent is not None


def test_baseline_agent_predict():
    from nova_meta_harness.nova_text_classification_agent import SimpleBaselineAgent

    llm = SimpleLLM()
    agent = SimpleBaselineAgent(llm)

    prediction, metadata = agent.predict("This is great!")
    assert isinstance(prediction, str)
    assert isinstance(metadata, dict)
    assert "prompt_length" in metadata


def test_aggressive_agent_learn():
    from nova_meta_harness.nova_text_classification_agent import AggressiveMemoryAgent

    llm = SimpleLLM()
    agent = AggressiveMemoryAgent(llm)

    batch = [
        {
            "input": "text1",
            "prediction": "pos",
            "ground_truth": "pos",
            "was_correct": True,
            "metadata": {},
        },
        {
            "input": "text2",
            "prediction": "neg",
            "ground_truth": "pos",
            "was_correct": False,
            "metadata": {},
        },
    ]

    agent.learn_from_batch(batch)

    # Aggressive agent keeps more examples
    assert len(agent.examples) > 0


def test_conservative_agent_learn():
    from nova_meta_harness.nova_text_classification_agent import ConservativeAgent

    llm = SimpleLLM()
    agent = ConservativeAgent(llm)

    batch = [
        {
            "input": "text1",
            "prediction": "pos",
            "ground_truth": "pos",
            "was_correct": True,
            "metadata": {},
        },
        {
            "input": "text2",
            "prediction": "neg",
            "ground_truth": "neg",
            "was_correct": True,
            "metadata": {},
        },
    ]

    agent.learn_from_batch(batch)

    # Conservative agent keeps only best example
    assert len(agent.examples) <= 1


def test_agent_state_serialization():
    from nova_meta_harness.nova_text_classification_agent import SimpleBaselineAgent

    llm = SimpleLLM()
    agent = SimpleBaselineAgent(llm)

    # Set some state
    agent.examples = [{"input": "test", "output": "result"}]
    agent.step_count = 10

    # Get state
    state_str = agent.get_state()
    assert isinstance(state_str, str)

    # Create new agent and restore state
    new_agent = SimpleBaselineAgent(llm)
    new_agent.set_state(state_str)

    assert len(new_agent.examples) == 1
    assert new_agent.step_count == 10


@pytest.mark.asyncio
async def test_benchmark_runner():
    from nova_meta_harness.nova_text_classification_benchmark import (
        TextClassificationBenchmark,
    )

    runner = TextClassificationBenchmark(
        datasets_dir=Path("datasets"),
        results_dir=Path("test_results"),
    )

    result = await runner.run_evaluation(
        agent_name="SimpleBaselineAgent",
        dataset_name="sentiment",
        num_samples=10,
    )

    assert "accuracy" in result
    assert "correct" in result
    assert result["total"] == 10
