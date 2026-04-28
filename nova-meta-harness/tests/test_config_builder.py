"""Tests for config_builder module."""

import pytest
import yaml
from pathlib import Path
from nova_meta_harness.config_builder import (
    build_config_yaml,
    parse_domain_spec_md,
    build_domain_spec_md,
)


def test_build_config_yaml_basic():
    spec = {
        "datasets": ["dataset1", "dataset2"],
        "models": [{"model": "test-model"}],
        "memory_systems": {
            "baselines": ["no_memory"],
            "proposed": ["candidate1"],
        },
    }
    yaml_str = build_config_yaml(spec)
    config = yaml.safe_load(yaml_str)

    assert config["datasets"] == ["dataset1", "dataset2"]
    assert config["models"][0]["model"] == "test-model"
    assert "no_memory" in config["memory_systems"]["baselines"]


def test_build_config_yaml_defaults():
    spec = {}
    yaml_str = build_config_yaml(spec)
    config = yaml.safe_load(yaml_str)

    assert "dataset" in config
    assert "models" in config
    assert config["dataset"]["num_train"] == 200


def test_parse_domain_spec_md():
    content = """# Domain Spec: Test

## Domain Summary

This is a test domain.

## Harness and Search Plan

We will search over memory systems.

## Evaluation Plan

Accuracy metric.

## Experience and Logging

Logs go to logs/.

## Open Questions and Unknowns

None.
"""
    spec = parse_domain_spec_md(content)
    assert "domain_summary" in spec
    assert "harness_and_search_plan" in spec
    assert "test domain" in spec["domain_summary"].lower()


def test_build_domain_spec_md():
    spec = {
        "domain_name": "TestDomain",
        "summary": "Test summary",
        "harness_plan": "Test harness plan",
        "evaluation_plan": "Test eval plan",
        "experience_logging": "Test logging",
        "open_questions": "None",
    }
    md = build_domain_spec_md(spec)
    assert "# Domain Spec: TestDomain" in md
    assert "Test summary" in md
