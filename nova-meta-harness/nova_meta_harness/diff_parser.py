"""Parses LLM-generated code diffs into file updates."""

import json
import re
from pathlib import Path
from typing import Optional


def parse_code_blocks(text: str) -> list[tuple[str, str]]:
    """Extract code blocks from LLM response.

    Returns list of (filename, code) tuples.
    Detects two patterns:
    1. ```python filename=agents/foo.py ... ```
    2. ```python ... ``` (uses heuristic to determine filename)
    """
    results = []

    # Pattern 1: Explicit filename in code block
    pattern_with_filename = r"```[\w]*\s+filename=([^\s`]+)\s*\n(.*?)```"
    for match in re.finditer(pattern_with_filename, text, re.DOTALL):
        filename = match.group(1).strip()
        code = match.group(2).strip()
        results.append((filename, code))

    if results:
        return results

    # Pattern 2: Python code blocks without filename
    pattern_python = r"```python\s*\n(.*?)```"
    blocks = list(re.finditer(pattern_python, text, re.DOTALL))

    if not blocks:
        return results

    # Heuristic: try to extract filename from surrounding text
    for block in blocks:
        code = block.group(1).strip()
        # Look for class definition to guess agent name
        class_match = re.search(r"class\s+(\w+)", code)
        if class_match:
            class_name = class_match.group(1)
            # Convert class name to snake_case
            snake = re.sub(r"(?<!^)(?=[A-Z])", "_", class_name).lower()
            filename = f"agents/{snake}.py"
        else:
            filename = "agents/unknown.py"
        results.append((filename, code))

    return results


def apply_file_updates(base_dir: Path, updates: list[tuple[str, str]]) -> list[str]:
    """Apply code updates to files.

    Args:
        base_dir: Base directory for relative file paths.
        updates: List of (filename, code) tuples.

    Returns:
        List of successfully written file paths (as strings).
    """
    written = []
    for filename, code in updates:
        file_path = base_dir / filename
        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(code)
            written.append(str(file_path))
        except (OSError, IOError) as e:
            print("Failed to write {}: {}".format(file_path, e))
    return written


def parse_pending_eval(text: str) -> Optional[dict]:
    """Extract pending_eval.json structure from LLM response.

    Looks for JSON in code blocks or inline JSON.
    """
    # Try to find JSON in code blocks - handle both ```json and ``` patterns
    # Pattern for ```json ... ``` or ``` ... ```
    pattern = r"```(?:json)?\s*\n?(.*?)```"
    matches = re.findall(pattern, text, re.DOTALL)
    for block in matches:
        try:
            data = json.loads(block.strip())
            if "candidates" in data:
                return data
        except Exception:
            pass

    # Try to find inline JSON with "candidates" key
    try:
        # Find the JSON object by looking for balanced braces
        start = text.find("{")
        while start != -1:
            depth = 0
            pos = start
            while pos < len(text):
                if text[pos] == "{":
                    depth += 1
                elif text[pos] == "}":
                    depth -= 1
                    if depth == 0:
                        candidate = text[start : pos + 1]
                        try:
                            data = json.loads(candidate)
                            if "candidates" in data:
                                return data
                        except Exception:
                            pass
                        break
                pos += 1
            start = text.find("{", start + 1)
    except Exception:
        pass

    return None
