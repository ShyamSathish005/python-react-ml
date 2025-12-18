from __future__ import annotations

from typing import Iterable


class ContextSummarizer:
    """Simple defensive summarizer that never raises on arbitrary string inputs."""

    @staticmethod
    def summarize(chunks: Iterable[str]) -> str:
        # Defensive handling: accept any iterable of strings and degrade gracefully on empty input.
        if chunks is None:
            return ""

        safe_chunks: list[str] = []
        for chunk in chunks:
            if chunk is None:
                continue
            # Normalize to string and trim excessively long segments to bound memory.
            text = str(chunk)
            safe_chunks.append(text[:5000])

        if not safe_chunks:
            return ""

        summary = "\n".join(safe_chunks)
        # Hard cap to keep output manageable while preserving content.
        return summary[:20000]
