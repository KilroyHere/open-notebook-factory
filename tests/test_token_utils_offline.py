"""The tokenizer's offline fallback is fast: one failed load, then cached.

tiktoken downloads `o200k_base` on first use. Offline (or with the host
blocked) every `get_encoding()` call used to retry the download, and chunking
calls `token_count()` for every split, so a test run or a large source could
spend many minutes on retries — or hang, since tiktoken sets no timeout.
"""

import threading
import time
from unittest.mock import patch

from open_notebook.utils import token_utils
from open_notebook.utils.token_utils import get_tokenizer, token_count


class FakeEncoding:
    def encode(self, text, **_kwargs):
        return list(text)


def test_failed_load_is_attempted_once_and_cached():
    calls = 0

    def offline(_name):
        nonlocal calls
        calls += 1
        raise OSError("Tunnel connection failed: 403 Forbidden")

    with patch("tiktoken.get_encoding", side_effect=offline):
        counts = [token_count("one two three four five") for _ in range(200)]

    assert calls == 1
    assert set(counts) == {7}  # ceil(5 words * 1.3)


def test_failed_load_is_retried_after_the_retry_window():
    with patch("tiktoken.get_encoding", side_effect=OSError("offline")):
        assert get_tokenizer() is None

    encoding = FakeEncoding()
    with patch("tiktoken.get_encoding", return_value=encoding):
        assert get_tokenizer() is None  # still inside the retry window
        with patch.object(token_utils, "TOKENIZER_RETRY_SECONDS", 0.0):
            assert get_tokenizer() is encoding


def test_hanging_download_falls_back_after_timeout():
    release = threading.Event()

    def hang(_name):
        release.wait(5)
        raise OSError("gave up")

    try:
        with (
            patch("tiktoken.get_encoding", side_effect=hang),
            patch.object(token_utils, "TOKENIZER_LOAD_TIMEOUT_SECONDS", 0.05),
        ):
            started = time.monotonic()
            assert token_count("one two three") == 4
            assert token_count("one two three") == 4
            elapsed = time.monotonic() - started
    finally:
        release.set()

    assert elapsed < 2


def test_online_behaviour_is_unchanged():
    encoding = FakeEncoding()
    with patch("tiktoken.get_encoding", return_value=encoding) as get_encoding:
        assert token_count("hello") == 5
        assert token_count("hi") == 2
        assert get_tokenizer() is encoding

    get_encoding.assert_called_with("o200k_base")


def test_offline_estimate_counts_cjk_characters():
    from open_notebook.utils.token_utils import estimate_token_count

    # A run of Chinese has no spaces: counting words would call it one token.
    assert estimate_token_count("這是一段中文內容，用來驗證分塊邏輯。") == 18
    assert estimate_token_count("one two three four five") == 7
    assert estimate_token_count("mixes English and 中文內容 to") == 6 + 4


def test_offline_estimate_never_undercounts_merged_pieces():
    """The chunker sums piece counts; the merged text must not count higher."""
    from open_notebook.utils.token_utils import estimate_token_count

    pieces = ["Word"] * 309 + ["中文"] * 7
    assert sum(estimate_token_count(p) for p in pieces) >= estimate_token_count(
        " ".join(pieces)
    )
