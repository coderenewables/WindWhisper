"""Tests for the LLM client (mocked provider)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture
def llm():
    from app.ai.llm_client import LLMClient
    return LLMClient(provider="openai", api_key="test-key", model="gpt-4o-mini")


# ── Initialization ──────────────────────────────────────────────────

def test_llm_client_init():
    from app.ai.llm_client import LLMClient
    client = LLMClient(provider="openai", api_key="sk-test", model="gpt-4o", base_url="http://local")
    assert client.provider == "openai"
    assert client.api_key == "sk-test"
    assert client.model == "gpt-4o"
    assert client.base_url == "http://local"
    assert client.max_retries == 3


def test_llm_client_default_retries():
    from app.ai.llm_client import LLMClient
    client = LLMClient(provider="anthropic", api_key="k", model="claude-3")
    assert client.max_retries == 3


# ── _base_kwargs ────────────────────────────────────────────────────

def test_base_kwargs_no_tools(llm):
    msgs = [{"role": "user", "content": "hi"}]
    kw = llm._base_kwargs(msgs, None, 0.5, 1024, stream=False)
    assert kw["model"] == "gpt-4o-mini"
    assert kw["messages"] is msgs
    assert kw["temperature"] == 0.5
    assert kw["max_tokens"] == 1024
    assert kw["stream"] is False
    assert kw["api_key"] == "test-key"
    assert kw["timeout"] == 120
    assert "tools" not in kw
    assert "api_base" not in kw


def test_base_kwargs_with_tools(llm):
    tools = [{"type": "function", "function": {"name": "t"}}]
    kw = llm._base_kwargs([], tools, 0.1, 4096, stream=True)
    assert kw["tools"] is tools
    assert kw["stream"] is True
    assert kw["timeout"] == 300


def test_base_kwargs_with_base_url():
    from app.ai.llm_client import LLMClient
    client = LLMClient(provider="azure", api_key="k", model="m", base_url="http://my-endpoint")
    kw = client._base_kwargs([], None, 0.1, 100, stream=False)
    assert kw["api_base"] == "http://my-endpoint"


def test_resolve_model_prefixes_non_native_provider():
    """Non-native providers (e.g. openrouter) get their name prefixed to the model."""
    from app.ai.llm_client import LLMClient
    client = LLMClient(provider="openrouter", api_key="k", model="qwen/qwen3-plus:free")
    assert client._resolve_model() == "openrouter/qwen/qwen3-plus:free"


def test_resolve_model_skips_native_provider():
    """Native providers (openai, anthropic, etc.) keep the model as-is."""
    from app.ai.llm_client import LLMClient
    client = LLMClient(provider="openai", api_key="k", model="gpt-4o-mini")
    assert client._resolve_model() == "gpt-4o-mini"


def test_resolve_model_no_double_prefix():
    """If model already has the provider prefix, don't duplicate it."""
    from app.ai.llm_client import LLMClient
    client = LLMClient(provider="openrouter", api_key="k", model="openrouter/qwen/qwen3-plus:free")
    assert client._resolve_model() == "openrouter/qwen/qwen3-plus:free"


# ── chat_completion ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_chat_completion_returns_dict(llm):
    mock_response = MagicMock()
    mock_response.model_dump.return_value = {
        "choices": [{"message": {"role": "assistant", "content": "Hello"}, "finish_reason": "stop"}]
    }
    mock_litellm = MagicMock()
    mock_litellm.acompletion = AsyncMock(return_value=mock_response)
    mock_litellm.drop_params = True

    with patch("app.ai.llm_client._litellm", mock_litellm):
        result = await llm.chat_completion([{"role": "user", "content": "hi"}])

    assert result["choices"][0]["message"]["content"] == "Hello"
    mock_litellm.acompletion.assert_awaited_once()


@pytest.mark.asyncio
async def test_chat_completion_with_tools(llm):
    tools = [{"type": "function", "function": {"name": "run_weibull_fit"}}]
    mock_response = MagicMock()
    mock_response.model_dump.return_value = {
        "choices": [{"message": {"role": "assistant", "content": "", "tool_calls": [
            {"id": "call_1", "function": {"name": "run_weibull_fit", "arguments": "{}"}}
        ]}, "finish_reason": "tool_calls"}]
    }
    mock_litellm = MagicMock()
    mock_litellm.acompletion = AsyncMock(return_value=mock_response)
    mock_litellm.drop_params = True

    with patch("app.ai.llm_client._litellm", mock_litellm):
        result = await llm.chat_completion([{"role": "user", "content": "fit"}], tools=tools)

    assert result["choices"][0]["finish_reason"] == "tool_calls"
    call_kw = mock_litellm.acompletion.call_args
    assert "tools" in call_kw.kwargs or (len(call_kw.args) > 0)


@pytest.mark.asyncio
async def test_chat_completion_retries_on_failure(llm):
    mock_response = MagicMock()
    mock_response.model_dump.return_value = {"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}]}
    mock_litellm = MagicMock()
    mock_litellm.acompletion = AsyncMock(side_effect=[RuntimeError("rate limit"), mock_response])
    mock_litellm.drop_params = True

    with patch("app.ai.llm_client._litellm", mock_litellm), \
         patch("asyncio.sleep", new_callable=AsyncMock):
        result = await llm.chat_completion([{"role": "user", "content": "test"}])

    assert result["choices"][0]["message"]["content"] == "ok"
    assert mock_litellm.acompletion.await_count == 2


@pytest.mark.asyncio
async def test_chat_completion_raises_after_max_retries(llm):
    mock_litellm = MagicMock()
    mock_litellm.acompletion = AsyncMock(side_effect=RuntimeError("fail"))
    mock_litellm.drop_params = True

    with patch("app.ai.llm_client._litellm", mock_litellm), \
         patch("asyncio.sleep", new_callable=AsyncMock), \
         pytest.raises(RuntimeError, match="fail"):
        await llm.chat_completion([{"role": "user", "content": "x"}])

    assert mock_litellm.acompletion.await_count == 3


# ── stream_chat_completion ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_stream_chat_completion_yields_chunks(llm):
    chunk1 = MagicMock()
    chunk1.model_dump.return_value = {"choices": [{"delta": {"content": "Hel"}}]}
    chunk2 = MagicMock()
    chunk2.model_dump.return_value = {"choices": [{"delta": {"content": "lo"}}]}

    async def mock_stream():
        yield chunk1
        yield chunk2

    mock_litellm = MagicMock()
    mock_litellm.acompletion = AsyncMock(return_value=mock_stream())
    mock_litellm.drop_params = True

    with patch("app.ai.llm_client._litellm", mock_litellm):
        chunks = []
        async for c in llm.stream_chat_completion([{"role": "user", "content": "hi"}]):
            chunks.append(c)

    assert len(chunks) == 2
    assert chunks[0]["choices"][0]["delta"]["content"] == "Hel"


# ── count_tokens ────────────────────────────────────────────────────

def test_count_tokens_fallback(llm):
    """When tiktoken is not available, falls back to len(text)//4."""
    with patch.dict("sys.modules", {"tiktoken": None}):
        count = llm.count_tokens("Hello, world! This is a test.")
    assert isinstance(count, int)
    assert count > 0


def test_count_tokens_returns_int(llm):
    count = llm.count_tokens("test string")
    assert isinstance(count, int)
    assert count >= 1
