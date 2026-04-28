"""Wrapper for memory_system.py storage and state management."""

import json
from pathlib import Path
from typing import Any


class MemoryClient:
    """Wraps memory_system.py for load/save of agent state."""

    def __init__(self, meta_harness_root: Path):
        self.meta_harness_root = meta_harness_root

    def load_state(self, state_path: Path) -> str | None:
        """Load serialized memory state from a file."""
        if not state_path.exists():
            return None
        return state_path.read_text()

    def save_state(self, state_path: Path, state: str) -> None:
        """Save serialized memory state to a file."""
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(state)

    def get_history(self, logs_dir: Path) -> list[dict[str, Any]]:
        """Load evolution_summary.jsonl from logs directory."""
        summary_path = logs_dir / "evolution_summary.jsonl"
        if not summary_path.exists():
            return []
        history = []
        with open(summary_path, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        history.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        return history

    def get_frontier(self, logs_dir: Path) -> dict[str, Any]:
        """Load frontier_val.json from logs directory."""
        frontier_path = logs_dir / "frontier_val.json"
        if not frontier_path.exists():
            return {}
        return json.loads(frontier_path.read_text())

    def append_summary_entry(self, logs_dir: Path, entry: dict[str, Any]) -> None:
        """Append an entry to evolution_summary.jsonl."""
        summary_path = logs_dir / "evolution_summary.jsonl"
        logs_dir.mkdir(parents=True, exist_ok=True)
        with open(summary_path, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def write_frontier(self, logs_dir: Path, frontier: dict[str, Any]) -> None:
        """Write frontier_val.json."""
        frontier_path = logs_dir / "frontier_val.json"
        logs_dir.mkdir(parents=True, exist_ok=True)
        frontier_path.write_text(json.dumps(frontier, indent=2))

    def save_pending_eval(
        self, logs_dir: Path, iteration: int, candidates: list[dict[str, Any]]
    ) -> None:
        """Write pending_eval.json with candidate metadata."""
        pending = {
            "iteration": iteration,
            "candidates": candidates,
        }
        pending_path = logs_dir / "pending_eval.json"
        pending_path.write_text(json.dumps(pending, indent=2))
