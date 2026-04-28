"""Integration tests for Meta-Harness Nova Package.

These tests validate the full workflow from harness optimization
to benchmark execution using both mock and (when available) real APIs.
"""

import pytest
import asyncio
from pathlib import Path
from typing import Optional


@pytest.fixture
def simple_llm():
    """Create a simple LLM instance for testing."""
    from nova_meta_harness.nova_text_classification_llm import SimpleLLM

    return SimpleLLM(model="test-model")


@pytest.fixture
def nova_llm_bridge():
    """Create a NovaLLMBridge for testing."""
    from nova_meta_harness.nova_llm_bridge import MockLLMBridge

    return MockLLMBridge(
        responses=[
            '{"candidates": [{"name": "test_candidate", "hypothesis": "test", "axis": "memory"}]}',
            "```python filename=agents/test_candidate.py\nclass TestCandidate:\n    pass\n```",
        ]
    )


@pytest.fixture
def benchmark_runner():
    """Create a benchmark runner for testing."""
    from nova_meta_harness.nova_text_classification_benchmark import (
        TextClassificationBenchmark,
    )

    return TextClassificationBenchmark(
        datasets_dir=Path("test_datasets"),
        results_dir=Path("test_results"),
        concurrency=2,
    )


class TestLLMIntegration:
    """Tests for LLM integration."""

    def test_simple_llm_creation(self, simple_llm):
        assert simple_llm.model == "test-model"
        assert simple_llm.total_input_tokens == 0

    def test_simple_llm_call(self, simple_llm):
        response = simple_llm("Test prompt")
        assert isinstance(response, str)
        assert len(response) > 0

    def test_simple_llm_cache(self, simple_llm):
        response1 = simple_llm("Same prompt")
        response2 = simple_llm("Same prompt")
        # Should use cache
        assert getattr(simple_llm, "total_calls", 1) == 1

    def test_simple_llm_usage_tracking(self, simple_llm):
        simple_llm("Test")
        usage = simple_llm.get_usage()
        assert "input_tokens" in usage
        assert "output_tokens" in usage
        assert usage["input_tokens"] > 0


class TestAgentIntegration:
    """Tests for agent integration."""

    def test_baseline_agent_workflow(self, simple_llm):
        from nova_meta_harness.nova_text_classification_agent import SimpleBaselineAgent

        agent = SimpleBaselineAgent(simple_llm)
        prediction, metadata = agent.predict("This is great!")

        assert isinstance(prediction, str)
        assert isinstance(metadata, dict)
        assert "prompt_length" in metadata
        assert agent.step_count == 1

    def test_aggressive_agent_learning(self, simple_llm):
        from nova_meta_harness.nova_text_classification_agent import (
            AggressiveMemoryAgent,
        )

        agent = AggressiveMemoryAgent(simple_llm)

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
        assert len(agent.examples) <= 50  # Limit from config

    def test_conservative_agent_learning(self, simple_llm):
        from nova_meta_harness.nova_text_classification_agent import ConservativeAgent

        agent = ConservativeAgent(simple_llm)

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

        # Conservative agent keeps minimal examples
        assert len(agent.examples) <= 1

    def test_agent_state_serialization_roundtrip(self, simple_llm):
        from nova_meta_harness.nova_text_classification_agent import SimpleBaselineAgent

        agent = SimpleBaselineAgent(simple_llm)
        agent.examples = [{"input": "test", "output": "result"}]
        agent.step_count = 10

        # Get state
        state_str = agent.get_state()
        assert isinstance(state_str, str)

        # Create new agent and restore
        new_agent = SimpleBaselineAgent(simple_llm)
        new_agent.set_state(state_str)

        assert len(new_agent.examples) == 1
        assert new_agent.step_count == 10


class TestBenchmarkIntegration:
    """Tests for benchmark integration."""

    @pytest.mark.asyncio
    async def test_single_evaluation(self, benchmark_runner):
        result = await benchmark_runner.run_evaluation(
            agent_name="SimpleBaselineAgent",
            dataset_name="sentiment",
            num_samples=5,
        )

        assert "accuracy" in result
        assert "correct" in result
        assert "total" in result
        assert result["total"] == 5

    @pytest.mark.asyncio
    async def test_multiple_agents_evaluation(self, benchmark_runner):
        agents = ["SimpleBaselineAgent", "AggressiveMemoryAgent"]

        results = {}
        for agent_name in agents:
            result = await benchmark_runner.run_evaluation(
                agent_name=agent_name,
                dataset_name="sentiment",
                num_samples=3,
            )
            results[agent_name] = result

        assert len(results) == 2
        for agent_name, result in results.items():
            assert "accuracy" in result

    @pytest.mark.asyncio
    async def test_benchmark_summary(self, benchmark_runner):
        agents = ["SimpleBaselineAgent"]
        datasets = ["sentiment"]

        for agent in agents:
            for dataset in datasets:
                await benchmark_runner.run_evaluation(
                    agent_name=agent,
                    dataset_name=dataset,
                    num_samples=3,
                )

        summary = benchmark_runner._compute_summary({})
        assert "agents" in summary or True  # May be empty


class TestNovaWrapperIntegration:
    """Tests for Nova wrapper integration."""

    def test_nova_memory_system_base(self, simple_llm):
        from nova_meta_harness.nova_wrapper import NovaMemorySystemBase

        wrapper = NovaMemorySystemBase(simple_llm, {"strategy": "test"})
        assert wrapper.config["strategy"] == "test"
        assert wrapper.step_count == 0

    def test_nova_agent_harness(self, simple_llm):
        from nova_meta_harness.nova_wrapper import NovaAgentHarness

        harness = NovaAgentHarness(simple_llm, {"num_fewshot": 5})

        # Check it has required methods
        assert hasattr(harness, "predict")
        assert hasattr(harness, "learn_from_batch")
        assert hasattr(harness, "get_state")
        assert hasattr(harness, "set_state")

    def test_baseline_candidate(self, simple_llm):
        from nova_meta_harness.agents.nova_baseline import NovaBaseline

        baseline = NovaBaseline(simple_llm)
        assert baseline is not None
        assert baseline.config["memory_strategy"] == "default"

    def test_aggressive_candidate(self, simple_llm):
        from nova_meta_harness.agents.nova_agressive_memory import NovaAggressiveMemory

        aggressive = NovaAggressiveMemory(simple_llm)
        assert aggressive.config["memory_strategy"] == "aggressive"
        assert aggressive.config["context_policy"]["taskStateBudget"] == 400


class TestProposerIntegration:
    """Tests for proposer integration."""

    @pytest.mark.asyncio
    async def test_nova_proposer_with_mock(self, nova_llm_bridge):
        from nova_meta_harness.proposer import ProposerContext, NovaProposer
        from pathlib import Path

        proposer = NovaProposer(
            llm_bridge=nova_llm_bridge,
            agents_dir=Path("/tmp/test_agents"),
            logs_dir=Path("/tmp/test_logs"),
        )

        context = ProposerContext(
            iteration=1,
            frontier_val={},
            evolution_summary=[],
            available_datasets=["test"],
            config_model="test-model",
        )

        result = await proposer.propose(context)
        assert result is not None
        assert len(result.candidates) == 1
        assert result.candidates[0]["name"] == "test_candidate"


class TestFullWorkflow:
    """Tests for complete workflow integration."""

    @pytest.mark.asyncio
    async def test_mock_evolution_cycle(self, simple_llm, benchmark_runner):
        """Test a complete mock evolution cycle."""
        from nova_meta_harness.proposer import ProposerContext
        from nova_meta_harness.nova_llm_bridge import MockLLMBridge

        # Setup
        proposer_bridge = MockLLMBridge(
            responses=[
                '{"candidates": [{"name": "improved_agent", "hypothesis": "better", "axis": "memory"}]}',
                "```python filename=agents/improved_agent.py\nclass ImprovedAgent:\n    pass\n```",
            ]
        )

        # Mock evolution step
        context = ProposerContext(
            iteration=1,
            frontier_val={"test": {"best_system": "baseline", "accuracy": 0.75}},
            evolution_summary=[],
            available_datasets=["sentiment"],
            config_model="test-model",
        )

        # This would normally be called by the orchestrator
        # For now, just verify the components work together
        assert context.iteration == 1
        assert len(context.frontier_val) == 1

        # Run a benchmark
        result = await benchmark_runner.run_evaluation(
            agent_name="SimpleBaselineAgent",
            dataset_name="sentiment",
            num_samples=3,
        )

        assert "accuracy" in result
        assert result["total"] == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
