from __future__ import annotations

import json
import os
import warnings
from datetime import datetime, timezone
from pathlib import Path
import sys
from typing import Any, Dict, List

from hypothesis import HealthCheck, settings
from hypothesis.errors import NonInteractiveExampleWarning

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from context_summarizer import ContextSummarizer  # noqa: E402
from tests.strategies import text_list_strategy  # noqa: E402

OUTPUT_PATH = PROJECT_ROOT / "examples" / "react-web" / "public" / "test_vectors.json"
VECTOR_COUNT = 50

# Enforce deterministic generation across runs.
os.environ.setdefault("HYPOTHESIS_SEED", "12345")
settings.register_profile(
    "cli_deterministic",
    settings(derandomize=True, database=None, suppress_health_check=[HealthCheck.too_slow]),
)
settings.load_profile("cli_deterministic")

warnings.filterwarnings("ignore", category=NonInteractiveExampleWarning)


def generate_vectors(count: int = VECTOR_COUNT) -> List[Dict[str, Any]]:
    vectors: List[Dict[str, Any]] = []

    for idx in range(count):
        chunks = text_list_strategy.example()
        expected = ContextSummarizer.summarize(chunks)
        vectors.append(
            {
                "id": f"vector_{idx}",
                "input": chunks,
                "expected_output": expected,
            }
        )

    return vectors


def write_manifest(vectors: List[Dict[str, Any]], path: Path) -> None:
    manifest = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "vectors": vectors,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    vectors = generate_vectors()
    write_manifest(vectors, OUTPUT_PATH)
    print(f"Wrote {len(vectors)} vectors to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
