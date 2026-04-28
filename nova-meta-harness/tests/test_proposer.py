"""Tests for proposer module."""

import pytest
from pathlib import Path
from nova_meta_harness.proposer import (
    Proposer,
    ProposerContext,
    ProposalResult,
    BaseProposer,
    NovaProposer,
)
from nova_meta_harness.nova_llm_bridge import MockLLMBridge, LLMMessage


def test_proposer_context_creation():
    ctx = ProposerContext(
        iteration=1,
        frontier_val={},
        evolution_summary=[],
        available_datasets=["test"],
        config_model="test-model",
    )
    assert ctx.iteration == 1
    assert ctx.config_model == "test-model"


def test_proposal_result_creation():
    result = ProposalResult(
        candidates=[{"name": "test"}],
        pending_eval_path=Path("/tmp/test.json"),
    )
    assert len(result.candidates) == 1
    assert result.pending_eval_path == Path("/tmp/test.json")


def test_base_proposer_build_task_prompt():
    # BaseProposer is abstract, so we need to create a concrete subclass
    class ConcreteProposer(BaseProposer):
        async def _do_propose(
            self, context: ProposerContext
        ) -> Optional[ProposalResult]:
            return None

    proposer = ConcreteProposer(
        agents_dir=Path("/tmp/agents"),
        logs_dir=Path("/tmp/logs"),
    )
    ctx = ProposerContext(
        iteration=1,
        frontier_val={"dataset1": {"best_system": "baseline", "accuracy": 70.0}},
        evolution_summary=[],
        available_datasets=["dataset1"],
        config_model="test-model",
    )
    prompt = proposer.build_task_prompt(ctx)
    assert "iteration: 1" in prompt.lower()
    assert "dataset1" in prompt
    assert "baseline" in prompt


@pytest.mark.asyncio
async def test_nova_proposer(tmp_path):
    # Setup
    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()

    # Mock LLM that returns a valid proposal
    mock_response = """```json
{
  "candidates": [
    {"name": "test_candidate", "hypothesis": "test", "axis": "memory"}
  ]
}
```
```python filename=agents/test_candidate.py
class TestCandidate:
    pass
```
"""
    bridge = MockLLMBridge(responses=[mock_response])
    proposer = NovaProposer(
        llm_bridge=bridge,
        agents_dir=agents_dir,
        logs_dir=logs_dir,
    )

    ctx = ProposerContext(
        iteration=1,
        frontier_val={},
        evolution_summary=[],
        available_datasets=["test"],
        config_model="test-model",
    )

    result = await proposer.propose(ctx)
    assert result is not None
    assert len(result.candidates) == 1
    assert result.candidates[0]["name"] == "test_candidate"
    assert (agents_dir / "test_candidate.py").exists()
