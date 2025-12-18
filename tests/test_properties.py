from pathlib import Path
import sys

from hypothesis import given

from .strategies import text_list_strategy

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from context_summarizer import ContextSummarizer  # noqa: E402


@given(text_list_strategy)
def test_context_summarizer_returns_string_and_never_crashes(chunks: list[str]) -> None:
    summary = ContextSummarizer.summarize(chunks)

    assert isinstance(summary, str)
    assert summary is not None
