"""Aggressive memory Nova harness variant."""

from nova_meta_harness.nova_wrapper import NovaAgentHarness


class NovaAggressiveMemory(NovaAgentHarness):
    """Nova harness with aggressive memory strategy.

    Hypothesis: More aggressive memory retention and usage
    improves performance on coding tasks by providing more context.

    Changes from baseline:
    - memory_strategy: "aggressive" (stores more examples)
    - Higher budgets for context components
    - More few-shot examples
    """

    def __init__(self, llm):
        config = {
            "memory_strategy": "aggressive",
            "context_policy": {
                "taskStateBudget": 400,  # increased from 220
                "workingMemoryBudget": 1500,  # increased from 800
                "fileMemoryBudget": 2500,  # increased from 1400
                "sessionSummaryBudget": 800,  # increased from 450
                "toolPolicyBudget": 200,  # increased from 120
            },
            "tool_policy": {
                "repair_attempts": 3,  # increased from 2
                "maintenance_every_n_turns": 4,  # decreased from 6 (more frequent)
            },
            "prompt_variant": "detailed",
            "num_fewshot": 8,  # increased from 3
        }
        super().__init__(llm, config)
