/* AI Chat Panel – persistent right pane, collapsible like the sidebar */

import { Bot, ChevronDown, ChevronRight, MessageSquarePlus, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAiStore } from "../../stores/aiStore";

interface AiChatPanelProps {
  projectId?: string;
}

export function AiChatPanel({ projectId }: AiChatPanelProps) {
  const {
    chatOpen,
    setChatOpen,
    messages,
    isSending,
    conversations,
    activeConversationId,
    fetchConversations,
    startConversation,
    loadConversation,
    send,
  } = useAiStore();

  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (chatOpen && projectId) {
      fetchConversations(projectId);
    }
  }, [chatOpen, projectId, fetchConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (chatOpen) inputRef.current?.focus();
  }, [chatOpen]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending || !projectId) return;
    setInput("");

    let convId = activeConversationId;
    if (!convId) {
      const conv = await startConversation(projectId);
      convId = conv.id;
    }
    await send(convId, text);
  }, [input, isSending, activeConversationId, projectId, startConversation, send]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* Collapsed rail – vertical tab on right edge */
  if (!chatOpen) {
    return (
      <button
        onClick={() => setChatOpen(true)}
        className="fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 items-center gap-1.5 rounded-l-xl border border-r-0 border-ink-200 bg-white/95 px-2 py-4 text-ink-500 shadow-sm backdrop-blur transition hover:bg-teal-50 hover:text-teal-600 dark:border-ink-700 dark:bg-ink-800/95 dark:hover:bg-teal-900/20 dark:hover:text-teal-400 lg:flex"
        title="Open AI Assistant"
      >
        <ChevronRight className="h-3 w-3 rotate-180" />
        <Bot className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-30 hidden w-[320px] flex-col border-l border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-800 lg:flex">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2 dark:border-ink-700">
        <div className="flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-teal-500" />
          <span className="text-xs font-semibold text-ink-900 dark:text-white">AI</span>
        </div>
        <div className="flex items-center gap-0.5">
          {projectId && (
            <button
              onClick={() => { startConversation(projectId); setShowHistory(false); }}
              className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-700 dark:hover:text-white"
              title="New conversation"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-700 dark:hover:text-white"
            title="History"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition ${showHistory ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={() => setChatOpen(false)}
            className="rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-700 dark:hover:text-white"
            title="Collapse"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* History dropdown */}
      {showHistory && (
        <div className="max-h-36 overflow-y-auto border-b border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-900">
          {conversations.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-ink-400">No conversations yet</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => { loadConversation(c.id); setShowHistory(false); }}
                className={`block w-full px-3 py-1.5 text-left text-[11px] transition hover:bg-ink-100 dark:hover:bg-ink-800 ${
                  c.id === activeConversationId
                    ? "bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400"
                    : "text-ink-600 dark:text-ink-300"
                }`}
              >
                <span className="line-clamp-1">{c.title || "New conversation"}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center pt-12 text-center">
            <Bot className="mb-2 h-6 w-6 text-ink-200 dark:text-ink-600" />
            {projectId ? (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {["Summarize data", "Weibull fit", "Data quality"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="rounded-lg border border-ink-200 px-2 py-1 text-[11px] text-ink-500 transition hover:border-teal-400 hover:text-teal-700 dark:border-ink-600 dark:text-ink-400 dark:hover:border-teal-500"
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-ink-400">Select a project to chat</p>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[90%] rounded-xl px-3 py-1.5 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-teal-600 text-white"
                  : "bg-ink-100 text-ink-800 dark:bg-ink-700 dark:text-ink-100"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-xl bg-ink-100 px-3 py-2 dark:bg-ink-700">
              <span className="h-1 w-1 animate-bounce rounded-full bg-teal-500 [animation-delay:0ms]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-teal-500 [animation-delay:150ms]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-teal-500 [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-ink-200 p-2 dark:border-ink-700">
        <div className="flex items-end gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 focus-within:border-teal-400 dark:border-ink-600 dark:bg-ink-800 dark:focus-within:border-teal-500">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={projectId ? "Ask anything\u2026" : "Select project first\u2026"}
            disabled={!projectId}
            rows={1}
            className="max-h-16 flex-1 resize-none bg-transparent text-xs text-ink-900 outline-none placeholder:text-ink-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending || !projectId}
            className="rounded bg-teal-600 p-1.5 text-white transition hover:bg-teal-700 disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
