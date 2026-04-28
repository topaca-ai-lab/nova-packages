"""Benchmark runner for text classification with Nova agents.

This module adapts the Meta-Harness benchmark pattern
for evaluating text classification agent variants.
"""

import json
import asyncio
from pathlib import Path
from typing import Optional


class TextClassificationBenchmark:
    """Runs text classification benchmarks against agent variants."""

    def __init__(
        self,
        datasets_dir: Path,
        results_dir: Path,
        concurrency: int = 4,
    ):
        self.datasets_dir = datasets_dir
        self.results_dir = results_dir
        self.concurrency = concurrency
        self.results_dir.mkdir(parents=True, exist_ok=True)

    async def run_evaluation(
        self,
        agent_name: str,
        dataset_name: str,
        model: str = "nova-default",
        num_samples: int = 100,
    ) -> dict:
        """Run evaluation for one agent on one dataset.

        Args:
            agent_name: Name of the agent (e.g., 'SimpleBaselineAgent')
            dataset_name: Name of the dataset (e.g., 'sentiment')
            model: Model identifier
            num_samples: Number of samples to evaluate

        Returns:
            Dict with metrics: accuracy, correct_count, total_count, etc.
        """
        print(f"Evaluating {agent_name} on {dataset_name}...")

        # Load dataset (mock for now)
        dataset = self._load_dataset(dataset_name, num_samples)

        # Create LLM instance
        from .nova_text_classification_llm import make_nova_llm

        llm = make_nova_llm(model=model)

        # Import agent class dynamically
        agent_class = self._get_agent_class(agent_name)
        if not agent_class:
            return {"error": f"Agent {agent_name} not found"}

        agent = agent_class(llm)

        # Run predictions
        correct = 0
        total = len(dataset)
        predictions = []

        for sample in dataset:
            input_text = sample["text"]
            ground_truth = sample["label"]

            prediction, metadata = agent.predict(input_text)
            was_correct = prediction == ground_truth

            if was_correct:
                correct += 1

            predictions.append(
                {
                    "input": input_text[:50] + "...",
                    "prediction": prediction,
                    "ground_truth": ground_truth,
                    "was_correct": was_correct,
                    "metadata": metadata,
                }
            )

        # Update agent with batch results
        agent.learn_from_batch(predictions)

        # Compute metrics
        accuracy = correct / total if total > 0 else 0.0

        result = {
            "agent": agent_name,
            "dataset": dataset_name,
            "model": model,
            "accuracy": accuracy,
            "correct": correct,
            "total": total,
            "predictions": predictions[:10],  # Save first 10 for inspection
        }

        # Save result
        result_path = self.results_dir / agent_name / f"{dataset_name}.json"
        result_path.parent.mkdir(parents=True, exist_ok=True)
        result_path.write_text(json.dumps(result, indent=2))

        print(f"  Accuracy: {accuracy * 100:.1f}% ({correct}/{total})")

        return result

    def _load_dataset(self, dataset_name: str, num_samples: int) -> list[dict]:
        """Load or generate dataset.

        Mock implementation - returns synthetic data.
        In real implementation, would load from datasets_dir.
        """
        # Mock dataset
        mock_data = []
        labels = ["positive", "negative", "neutral"]

        for i in range(num_samples):
            label = labels[i % len(labels)]
            mock_data.append(
                {
                    "text": f"This is a {label} example number {i}.",
                    "label": label,
                }
            )

        return mock_data

    def _get_agent_class(self, agent_name: str):
        """Dynamically import agent class.

        Tries to import from nova_text_classification_agent module.
        """
        try:
            from .nova_text_classification_agent import (
                SimpleBaselineAgent,
                AggressiveMemoryAgent,
                ConservativeAgent,
            )

            if agent_name == "SimpleBaselineAgent":
                return SimpleBaselineAgent
            elif agent_name == "AggressiveMemoryAgent":
                return AggressiveMemoryAgent
            elif agent_name == "ConservativeAgent":
                return ConservativeAgent

            return None
        except ImportError as e:
            print(f"Import error: {e}")
            return None

    async def run_all_evaluations(
        self,
        agents: list[str],
        datasets: list[str],
        model: str = "nova-default",
    ) -> dict[str, dict]:
        """Run all evaluations for all agents and datasets."""
        results = {}

        for agent in agents:
            results[agent] = {}
            for dataset in datasets:
                result = await self.run_evaluation(
                    agent_name=agent,
                    dataset_name=dataset,
                    model=model,
                )
                results[agent][dataset] = result

        # Compute summary
        summary = self._compute_summary(results)
        summary_path = self.results_dir / "summary.json"
        summary_path.write_text(json.dumps(summary, indent=2))

        return results

    def _compute_summary(self, results: dict) -> dict:
        """Compute summary across all agents and datasets."""
        summary = {
            "agents": {},
            "datasets": {},
            "overall": {},
        }

        # Per agent
        for agent, dataset_results in results.items():
            accuracies = [r["accuracy"] for r in dataset_results.values()]
            summary["agents"][agent] = {
                "avg_accuracy": sum(accuracies) / len(accuracies)
                if accuracies
                else 0.0,
                "num_datasets": len(dataset_results),
            }

        # Overall
        all_accuracies = [r["accuracy"] for a in results.values() for r in a.values()]
        if all_accuracies:
            summary["overall"]["avg_accuracy"] = sum(all_accuracies) / len(
                all_accuracies
            )

        return summary


async def main():
    """Example usage."""
    runner = TextClassificationBenchmark(
        datasets_dir=Path("datasets"),
        results_dir=Path("results"),
        concurrency=4,
    )

    agents = ["SimpleBaselineAgent", "AggressiveMemoryAgent", "ConservativeAgent"]
    datasets = ["sentiment", "topic", "emotion"]

    results = await runner.run_all_evaluations(agents, datasets)

    print("\n=== Summary ===")
    summary = runner._compute_summary(results)
    for agent, stats in summary["agents"].items():
        print(f"{agent}: {stats['avg_accuracy'] * 100:.1f}% avg accuracy")


if __name__ == "__main__":
    asyncio.run(main())
