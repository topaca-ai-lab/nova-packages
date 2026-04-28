"""Generates config.yaml and domain_spec.md from domain specifications."""

import yaml
from pathlib import Path
from typing import Any


def build_config_yaml(spec: dict) -> str:
    """Generate config.yaml YAML string from a domain spec dict."""
    config = {
        "dataset": spec.get(
            "dataset",
            {
                "num_train": 200,
                "num_val": 50,
                "num_test": 100,
            },
        ),
        "inner_loop": spec.get(
            "inner_loop",
            {
                "mode": "online",
                "num_epochs": 1,
                "temperature": 0.0,
                "eval_interval": 0,
                "batch_size": 1,
                "seed": 42,
            },
        ),
        "models": spec.get("models", [{"model": "openrouter/openai/gpt-oss-120b"}]),
        "benchmark": spec.get(
            "benchmark",
            {
                "seeds": [42],
                "concurrency": 16,
            },
        ),
        "datasets": spec.get("datasets", []),
        "memory_systems": spec.get(
            "memory_systems",
            {
                "baselines": [],
                "proposed": [],
            },
        ),
    }
    return yaml.dump(config, sort_keys=False, default_flow_style=False)


def write_config(config_path: Path, spec: dict) -> None:
    """Write config.yaml to the given path."""
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(build_config_yaml(spec))


def parse_domain_spec_md(content: str) -> dict:
    """Parse a domain_spec.md file into a spec dict."""
    spec = {}
    current_section = None
    current_text = []

    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("## "):
            if current_section and current_text:
                spec[current_section] = "\n".join(current_text).strip()
            current_section = stripped[3:].strip().lower().replace(" ", "_")
            current_text = []
        elif current_section:
            current_text.append(line)

    if current_section and current_text:
        spec[current_section] = "\n".join(current_text).strip()

    return spec


def build_domain_spec_md(spec: dict) -> str:
    """Generate domain_spec.md from a spec dict."""
    template = """# Domain Spec: {domain_name}

## Domain Summary

{summary}

## Harness and Search Plan

{harness_plan}

## Evaluation Plan

{evaluation_plan}

## Experience and Logging

{experience_logging}

## Open Questions and Unknowns

{open_questions}
"""
    return template.format(
        domain_name=spec.get("domain_name", "Unknown"),
        summary=spec.get("summary", ""),
        harness_plan=spec.get("harness_plan", ""),
        evaluation_plan=spec.get("evaluation_plan", ""),
        experience_logging=spec.get("experience_logging", ""),
        open_questions=spec.get("open_questions", "None"),
    )


def write_domain_spec(spec_path: Path, spec: dict) -> None:
    """Write domain_spec.md to the given path."""
    spec_path.parent.mkdir(parents=True, exist_ok=True)
    spec_path.write_text(build_domain_spec_md(spec))


class ConfigBuilder:
    """Builds configuration files for Meta-Harness."""

    @staticmethod
    def build_config_yaml(spec: dict) -> str:
        """Alias for build_config_yaml function."""
        return build_config_yaml(spec)

    @staticmethod
    def write_config(config_path: Path, spec: dict) -> None:
        """Alias for write_config function."""
        return write_config(config_path, spec)

    @staticmethod
    def parse_domain_spec_md(content: str) -> dict:
        """Alias for parse_domain_spec_md function."""
        return parse_domain_spec_md(content)

    @staticmethod
    def build_domain_spec_md(spec: dict) -> str:
        """Alias for build_domain_spec_md function."""
        return build_domain_spec_md(spec)

    @staticmethod
    def write_domain_spec(spec_path: Path, spec: dict) -> None:
        """Alias for write_domain_spec function."""
        return write_domain_spec(spec_path, spec)
