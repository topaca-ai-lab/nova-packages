"""Baseline Nova harness - current/default configuration."""

from nova_meta_harness.nova_wrapper import NovaAgentHarness


class NovaBaseline(NovaAgentHarness):
    """Baseline Nova harness with default settings.

    This represents the current Nova configuration:
    - Default memory strategy
    - Standard context policy
    - Basic tool orchestration
    """

    def __init__(self, llm):
        config = {
            "memory_strategy": "default",
            "context_policy": {
                "taskStateBudget": 220,
                "workingMemoryBudget": 800,
                "fileMemoryBudget": 1400,
                "sessionSummaryBudget": 450,
                "toolPolicyBudget": 120,
            },
            "tool_policy": {
                "repair_attempts": 2,
                "maintenance_every_n_turns": 6,
            },
            "prompt_variant": "default",
            "num_fewshot": 3,
        }
        super().__init__(llm, config)
