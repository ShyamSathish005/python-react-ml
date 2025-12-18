from __future__ import annotations

from hypothesis import strategies as st

# Shared strategy: lists of text snippets up to 5k chars, list capped at 50 entries.
text_list_strategy = st.lists(st.text(max_size=5000), max_size=50)

__all__ = ["text_list_strategy"]
