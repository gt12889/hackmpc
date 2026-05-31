"""Gemini access with per-model fallback, mirroring the TS `lib/gemini.ts` chain.

Google's free tier meters quota PER MODEL, so on a 429 (or a 404 for a retired
model) we transparently retry the same request against the next model. The
`llm_factory` is injectable so tests exercise the fallback logic without Gemini.
"""

from __future__ import annotations

import os
from typing import Callable, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

# Mirror of lib/gemini.ts MODEL_CHAIN. Override with GEMINI_MODELS (comma-sep).
_PRIMARY = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


def model_chain() -> list[str]:
    override = os.environ.get("GEMINI_MODELS")
    if override:
        chain = [m.strip() for m in override.split(",") if m.strip()]
    else:
        chain = [
            _PRIMARY,
            "gemini-2.5-flash-lite",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-3.5-flash",
            "gemini-3.1-flash-lite",
            "gemini-flash-latest",
            "gemini-flash-lite-latest",
        ]
    # de-dupe, preserve order
    seen: set[str] = set()
    out: list[str] = []
    for m in chain:
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out


MODEL_CHAIN = model_chain()


def api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def should_try_next(exc: Exception) -> bool:
    """True when the error means 'this model can't serve - try another':
    quota exhaustion (429) or model unavailable (404 NOT_FOUND). Other errors
    are real bugs and should surface immediately."""
    msg = str(exc)
    return (
        "429" in msg
        or "404" in msg
        or "RESOURCE_EXHAUSTED" in msg
        or "NOT_FOUND" in msg
        or "is not found" in msg
        or "not supported for generateContent" in msg
    )


def make_llm(model: str):
    """Construct a Gemini chat model. Imported lazily so tests that inject a
    fake `llm_factory` never require the langchain_google_genai dependency at
    import time and never need an API key."""
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=model,
        api_key=api_key(),
        temperature=0.3,
    )


def invoke_structured(
    prompt: str,
    schema: type[T],
    *,
    llm_factory: Callable[[str], object] = make_llm,
    models: list[str] | None = None,
) -> tuple[T, str]:
    """Invoke a model with structured (Pydantic) output, walking the model chain
    on quota/unavailability. Returns (parsed_result, model_that_served)."""
    chain = models if models is not None else MODEL_CHAIN
    last_err: Exception | None = None
    for model in chain:
        try:
            llm = llm_factory(model)
            structured = llm.with_structured_output(schema)  # type: ignore[attr-defined]
            result = structured.invoke(prompt)
            return result, model
        except Exception as e:  # noqa: BLE001 - classify then re-raise
            if should_try_next(e):
                last_err = e
                continue
            raise
    raise last_err or RuntimeError("All Gemini models exhausted")
