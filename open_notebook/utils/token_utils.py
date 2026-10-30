"""
Token utilities for Open Notebook.
Handles token counting and cost calculations for language models.
"""

import math
import os
import re
import threading
import time
from typing import Any, Optional

from loguru import logger

from open_notebook.config import TIKTOKEN_CACHE_DIR

# Set tiktoken cache directory before importing tiktoken to ensure
# tokenizer encodings are cached persistently in the data folder
os.environ["TIKTOKEN_CACHE_DIR"] = TIKTOKEN_CACHE_DIR

TOKENIZER_ENCODING = "o200k_base"
# tiktoken downloads the encoding file on first use with no request timeout.
# Wait this long for that first load before using the word-count estimate.
TOKENIZER_LOAD_TIMEOUT_SECONDS = 15.0
# After a failed load (offline, blocked host, timeout), use the estimate
# without touching the network until this many seconds have passed.
TOKENIZER_RETRY_SECONDS = 300.0

# Scripts written without spaces between words (Chinese, Japanese, Korean
# syllables, and their full-width punctuation). tiktoken spends at least one
# token per character here, so the offline estimate counts them one by one.
_CJK_CHARS = (
    "\u3000-\u303f"  # CJK symbols and punctuation
    "\u3040-\u30ff"  # Hiragana, Katakana
    "\u3400-\u4dbf"  # CJK Extension A
    "\u4e00-\u9fff"  # CJK Unified Ideographs
    "\uac00-\ud7af"  # Hangul syllables
    "\uf900-\ufaff"  # CJK Compatibility Ideographs
    "\uff00-\uffef"  # Half-width and full-width forms
    "\U00020000-\U0002fa1f"  # CJK Extensions B-F, compatibility supplement
)
# One estimate unit: a single CJK character, or a run of other non-space text.
ESTIMATE_UNIT_RE = re.compile(f"[{_CJK_CHARS}]|[^\\s{_CJK_CHARS}]+")
_CJK_CHAR_RE = re.compile(f"[{_CJK_CHARS}]")

_tokenizer_lock = threading.Lock()
_tokenizer_loaded = False
_tokenizer_failed_at: Optional[float] = None
_tokenizer_loader: Optional[threading.Thread] = None


def reset_tokenizer_cache() -> None:
    """Forget a cached tokenizer load failure (used by tests)."""
    global _tokenizer_loaded, _tokenizer_failed_at, _tokenizer_loader
    with _tokenizer_lock:
        _tokenizer_loaded = False
        _tokenizer_failed_at = None
        _tokenizer_loader = None


def _load_encoding_with_timeout(timeout: float) -> Any:
    """Run ``tiktoken.get_encoding`` in a daemon thread, bounded by ``timeout``.

    The thread is a daemon so a download hanging on a blackholed connection
    can't block interpreter exit. If it finishes later, tiktoken caches the
    encoding and the next retry picks it up immediately.
    """
    global _tokenizer_loader
    import tiktoken

    if _tokenizer_loader is not None and _tokenizer_loader.is_alive():
        raise TimeoutError("an earlier tokenizer download is still running")

    result: dict[str, Any] = {}

    def load() -> None:
        try:
            result["encoding"] = tiktoken.get_encoding(TOKENIZER_ENCODING)
        except BaseException as e:  # re-raised in the caller's thread
            result["error"] = e

    loader = threading.Thread(target=load, name="tiktoken-load", daemon=True)
    _tokenizer_loader = loader
    loader.start()
    loader.join(timeout)
    if loader.is_alive():
        raise TimeoutError(
            f"loading the {TOKENIZER_ENCODING} tokenizer took over {timeout:g}s"
        )
    if "error" in result:
        raise result["error"]
    return result["encoding"]


def estimate_token_count(text: str) -> int:
    """Offline token estimate: 1.3 per word (rounded up), plus one per CJK character.

    Whitespace-separated words alone would count a whole paragraph of Chinese
    or Japanese as one token, so token-budgeted splitting could never make it
    smaller. Rounding up keeps the estimate subadditive-safe for the chunker,
    which sums the counts of the pieces it merges: the sum of the pieces'
    estimates is never below the estimate of the merged chunk, so a chunk
    accepted as fitting CHUNK_SIZE really does fit.
    """
    cjk_chars = len(_CJK_CHAR_RE.findall(text))
    words = len(_CJK_CHAR_RE.sub(" ", text).split())
    return math.ceil(words * 1.3) + cjk_chars


def get_tokenizer() -> Optional[Any]:
    """Return the shared ``o200k_base`` tiktoken encoding, or ``None`` offline.

    Online this is ``tiktoken.get_encoding("o200k_base")`` (tiktoken keeps the
    loaded encoding in memory). When the encoding can't be loaded — tiktoken
    missing, the download blocked, or it takes longer than
    ``TOKENIZER_LOAD_TIMEOUT_SECONDS`` — the failure is remembered for
    ``TOKENIZER_RETRY_SECONDS`` so callers get ``None`` (word-count estimate)
    immediately instead of retrying the download on every call.
    """
    global _tokenizer_loaded, _tokenizer_failed_at
    with _tokenizer_lock:
        if (
            _tokenizer_failed_at is not None
            and time.monotonic() - _tokenizer_failed_at < TOKENIZER_RETRY_SECONDS
        ):
            return None
        try:
            if _tokenizer_loaded:
                # Already in tiktoken's in-memory cache: no network involved.
                import tiktoken

                encoding = tiktoken.get_encoding(TOKENIZER_ENCODING)
            else:
                encoding = _load_encoding_with_timeout(TOKENIZER_LOAD_TIMEOUT_SECONDS)
        except (ImportError, OSError) as e:
            # OSError covers TimeoutError and network errors such as
            # urllib.error.URLError or requests' ConnectionError, raised in
            # offline environments when the encoding can't be downloaded.
            _tokenizer_failed_at = time.monotonic()
            logger.warning(
                "tiktoken unavailable, falling back to word-count estimation "
                "for the next {:g}s: {}",
                TOKENIZER_RETRY_SECONDS,
                e,
            )
            return None
        _tokenizer_loaded = True
        _tokenizer_failed_at = None
        return encoding


def token_count(input_string: str) -> int:
    """
    Count the number of tokens in the input string using the 'o200k_base' encoding.

    Args:
        input_string (str): The input string to count tokens for.

    Returns:
        int: The number of tokens in the input string.
    """
    encoding = get_tokenizer()
    if encoding is not None:
        # disallowed_special=() treats sequences like "<|endoftext|>" as ordinary
        # text instead of raising ValueError. User/source content can legitimately
        # contain these substrings, and we only need a token count here.
        return len(encoding.encode(input_string, disallowed_special=()))
    return estimate_token_count(input_string)


def token_cost(token_count: int, cost_per_million: float = 0.150) -> float:
    """
    Calculate the cost of tokens based on the token count and cost per million tokens.

    Args:
        token_count (int): The number of tokens.
        cost_per_million (float): The cost per million tokens. Default is 0.150.

    Returns:
        float: The calculated cost for the given token count.
    """
    return cost_per_million * (token_count / 1_000_000)
