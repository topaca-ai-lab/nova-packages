"""Wrapper for benchmark.py execution and result parsing."""

import asyncio
import json
from pathlib import Path
from typing import Any


class BenchmarkClient:
    """Wraps benchmark.py execution and parses results."""

    def __init__(
        self,
        meta_harness_root: Path,
        logs_dir: Path,
        results_dir: Path,
        concurrency: int = 16,
    ):
        self.meta_harness_root = meta_harness_root
        self.logs_dir = logs_dir
        self.results_dir = results_dir
        self.concurrency = concurrency
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.results_dir.mkdir(parents=True, exist_ok=True)

    def _get_run_dir(
        self, dataset: str, memory: str, model: str, seed: int = 42
    ) -> Path:
        leaf = model if seed == 42 else f"{model}_seed{seed}"
        return self.logs_dir / dataset / memory / leaf

    def load_results(
        self, filename: str = "val.json"
    ) -> dict[tuple[str, str, str], dict]:
        """Load results from hierarchical dir structure.

        Returns dict mapping (model, dataset, memory) -> data dict.
        """
        results = {}
        for filepath in self.logs_dir.rglob(filename):
            try:
                parts = filepath.parent.relative_to(self.logs_dir).parts
                if len(parts) != 3:
                    continue
                dataset, memory, model_leaf = parts
                import re

                m = re.match(r"^(.+)_seed(\d+)$", model_leaf)
                if m:
                    model = m.group(1)
                    seed = int(m.group(2))
                else:
                    model = model_leaf
                    seed = 42
                data = json.loads(filepath.read_text())
                results[(model, dataset, memory)] = data
            except (ValueError, json.JSONDecodeError, KeyError):
                continue
        return results

    def print_results(self, results: dict, metric_label: str = "val") -> None:
        """Print results table (simplified version of benchmark.py's print_results)."""
        if not results:
            print("No results found")
            return

        memory_names = sorted(set(mem for _, _, mem in results.keys()))
        datasets = sorted(set(ds for _, ds, _ in results.keys()))

        print(f"\n{'=' * 60}")
        print(f"Results [{metric_label}]")
        print("=" * 60)

        header = f"{'memory':<25}" + "".join(f"{d[:8]:>10}" for d in datasets)
        print(header)
        print("-" * len(header))

        for mem in memory_names:
            cells = []
            for ds in datasets:
                found = False
                for (model, d, m), data in results.items():
                    if d == ds and m == mem:
                        acc = data.get("accuracy")
                        if acc is not None:
                            cells.append(f"{acc * 100:.1f}")
                        else:
                            cells.append("-")
                        found = True
                        break
                if not found:
                    cells.append("-")
            print(f"{mem:<25}" + "".join(f"{c:>10}" for c in cells))

    async def run_benchmark(
        self,
        memory_path: str,
        dataset: str,
        model: str,
        seed: int = 42,
        api_base: str | None = None,
        mode: str = "online",
        num_epochs: int = 1,
        temperature: float | None = None,
        num_train: int = 200,
        num_val: int = 50,
        num_test: int = 100,
        is_test: bool = False,
    ) -> tuple[bool, dict | None]:
        """Run a single benchmark and return (success, data)."""
        if is_test:
            base_dir = self.results_dir
            output_flag = "--test-output"
        else:
            base_dir = self.logs_dir
            output_flag = "--val-output"

        model_short = model.split("/")[-1].lower()
        rd = self._get_run_dir(dataset, Path(memory_path).stem, model_short, seed)
        rd.mkdir(parents=True, exist_ok=True)

        output_file = rd / ("test.json" if is_test else "val.json")
        if output_file.exists():
            return True, json.loads(output_file.read_text())

        cmd = [
            "env",
            "PYTHONPATH=..",
            "uv",
            "run",
            "python",
            "-m",
            "text_classification.inner_loop",
            "--memory",
            memory_path,
            "--dataset",
            dataset,
            "--seed",
            str(seed),
            "--model",
            model,
            "--mode",
            mode,
            output_flag,
            str(output_file),
            "--num-train",
            str(num_train),
            "--num-val",
            str(num_val),
            "--num-test",
            str(num_test),
        ]
        if api_base:
            cmd.extend(["--api-base", api_base])
        if temperature is not None:
            cmd.extend(["--temperature", str(temperature)])
        if is_test:
            memory_file = (
                self.logs_dir
                / dataset
                / Path(memory_path).stem
                / model_short
                / "memory.json"
            )
            if memory_file.exists():
                cmd.extend(["--load-memory", str(memory_file)])
            else:
                return False, None

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=self.meta_harness_root,
        )
        try:
            await asyncio.wait_for(proc.wait(), timeout=7200)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return False, None

        if proc.returncode == 0 and output_file.exists():
            return True, json.loads(output_file.read_text())
        return False, None

    def compute_frontier(self, results: dict, metric: str = "val") -> dict:
        """Compute frontier (best system per dataset)."""
        by_dataset = {}
        for (model, dataset, memory), data in results.items():
            acc = (data.get("accuracy") or 0) * 100
            if dataset not in by_dataset:
                by_dataset[dataset] = []
            by_dataset[dataset].append({"memory": memory, "accuracy": acc})

        frontier = {}
        for dataset, entries in by_dataset.items():
            best = max(entries, key=lambda x: x["accuracy"])
            frontier[dataset] = {
                "best_system": best["memory"],
                "accuracy": best["accuracy"],
            }
        return frontier
