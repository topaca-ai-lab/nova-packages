"""Conservative Nova harness variant."""

from nova_meta_harness.nova_wrapper import NovaAgentHarness


class NovaConservative(NovaAgentHarness):
    """Nova harness with conservative settings.

    Hypothesis: Less context and fewer examples reduces
    distraction and improves focus on the current task.

    Changes from baseline:
    - memory_strategy: "conservative" (minimal examples)
    - Lower budgets for context components
    - Concise prompting
    """

    def __init__(self, llm):
        config = {
            "memory_strategy": "conservative",
            "context_policy": {
                "taskStateBudget": 100,  # reduced from 220
                "workingMemoryBudget": 400,  # reduced from 800
                "fileMemoryBudget": 800,  # reduced from 1400
                "sessionSummaryBudget": 200,  # reduced from 450
                "toolPolicyBudget": 60,  # reduced from 120
            },
            "tool_policy": {
                "repair_attempts": 1,  # reduced from 2
                "maintenance_every_n_turns": 10,  # increased from 6 (less frequent)
            },
            "prompt_variant": "concise",
            "num_fewshot": 1,  # reduced from 3
        }
        super().__init__(llm, config)
