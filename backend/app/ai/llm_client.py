"""Unified LLM client supporting multiple providers via litellm."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

logger = logging.getLogger(__name__)

# Lazy import – litellm is an optional dependency
_litellm = None


def _get_litellm():
    global _litellm
    if _litellm is None:
        try:
            import litellm as _mod
            _litellm = _mod
            _litellm.drop_params = True
        except ImportError:
            raise ImportError("litellm is required for AI features. Install with: pip install litellm tiktoken")
    return _litellm


class LLMClient:
    """Thin wrapper around litellm for chat completions with tools."""

    def __init__(self, *, provider: str, api_key: str, model: str, base_url: str | None = None, max_retries: int = 3):
        self.provider = provider
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.max_retries = max_retries

    # --- public API ---

    async def chat_completion(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.1,
        max_tokens: int | None = 4096,
    ) -> dict[str, Any]:
        litellm = _get_litellm()
        kwargs = self._base_kwargs(messages, tools, temperature, max_tokens, stream=False)
        for attempt in range(1, self.max_retries + 1):
            try:
                response = await litellm.acompletion(**kwargs)
                return response.model_dump()
            except Exception as exc:
                if attempt == self.max_retries:
                    raise
                wait = 2 ** (attempt - 1)
                logger.warning("LLM request failed (attempt %d/%d): %s – retrying in %ds", attempt, self.max_retries, exc, wait)
                await asyncio.sleep(wait)
        raise RuntimeError("Unreachable")

    async def stream_chat_completion(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.1,
        max_tokens: int | None = 4096,
    ) -> AsyncIterator[dict[str, Any]]:
        litellm = _get_litellm()
        kwargs = self._base_kwargs(messages, tools, temperature, max_tokens, stream=True)
        response = await litellm.acompletion(**kwargs)
        async for chunk in response:
            yield chunk.model_dump()

    def count_tokens(self, text: str) -> int:
        try:
            import tiktoken
            enc = tiktoken.encoding_for_model(self.model)
            return len(enc.encode(text))
        except Exception:
            return len(text) // 4

    # --- internals ---

    # Providers whose models litellm can resolve without an explicit prefix.
    _NATIVE_PROVIDERS = frozenset({"openai", "anthropic", "azure", "cohere", "bedrock", "vertex_ai"})

    def _resolve_model(self) -> str:
        """Return a litellm-compatible model string, adding a provider prefix when needed."""
        model = self.model
        provider = (self.provider or "").lower().strip()
        # If the model already contains a provider prefix that litellm understands, keep it.
        # Otherwise, prepend the provider so litellm can route the request.
        if provider and provider not in self._NATIVE_PROVIDERS:
            if not model.startswith(f"{provider}/"):
                model = f"{provider}/{model}"
        return model

    def _base_kwargs(self, messages, tools, temperature, max_tokens, *, stream: bool) -> dict:
        kwargs: dict[str, Any] = {
            "model": self._resolve_model(),
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
            "api_key": self.api_key,
            "timeout": 300 if stream else 120,
        }
        if self.base_url:
            kwargs["api_base"] = self.base_url
        if tools:
            kwargs["tools"] = tools
        return kwargs
