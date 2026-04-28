"""Tests for diff_parser module."""

import pytest
from pathlib import Path
from nova_meta_harness.diff_parser import (
    parse_code_blocks,
    apply_file_updates,
    parse_pending_eval,
)


def test_parse_code_blocks_with_filename():
    text = """Here is the code:

```python filename=agents/test_agent.py
class TestAgent:
    pass
```

And another:

```python filename=agents/another.py
print("hello")
```
"""
    blocks = parse_code_blocks(text)
    assert len(blocks) == 2
    assert blocks[0][0] == "agents/test_agent.py"
    assert "class TestAgent" in blocks[0][1]
    assert blocks[1][0] == "agents/another.py"


def test_parse_code_blocks_without_filename():
    text = """Here is code:

```python
class FooBar:
    def hello(self):
        pass
```
"""
    blocks = parse_code_blocks(text)
    assert len(blocks) >= 1
    assert "class FooBar" in blocks[0][1]


def test_parse_pending_eval():
    text = """Here is the result:

```json
{
  "candidates": [
    {"name": "test", "hypothesis": "improvement"}
  ]
}
```
"""
    result = parse_pending_eval(text)
    assert result is not None
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["name"] == "test"


def test_parse_pending_eval_no_json():
    text = "This is just plain text without JSON."
    result = parse_pending_eval(text)
    assert result is None


def test_apply_file_updates(tmp_path):
    updates = [
        ("agents/test.py", "print('hello')"),
        ("agents/other.py", "x = 1"),
    ]
    written = apply_file_updates(tmp_path, updates)
    assert len(written) == 2
    assert (tmp_path / "agents" / "test.py").exists()
    assert (tmp_path / "agents" / "other.py").exists()
