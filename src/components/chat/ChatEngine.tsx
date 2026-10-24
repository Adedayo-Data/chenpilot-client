'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  ABORT_ERROR,
  addMessage as addChatMessage,
  addPendingMessage,
  queueMessage,
  regenerateLastResponse,
  saveConversationLocally,
  sendMessage,
  updateMessage,
} from '@/store/slices/chatSlice';
import AgentMessage from '@/components/chat/AgentMessage';
import UserMessage from '@/components/chat/UserMessage';
import { AgentToolsMenu } from '@/components/chat/AgentToolsMenu';
import { OfflineIndicator } from '@/components/chat/OfflineIndicator';
import { QueryStopButton } from '@/components/chat/QueryStopButton';
import { TagWidget } from '@/components/chat/TagWidget';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ChatMessage } from '@/types';
import { Mic, Send, Sun } from 'lucide-react';
import toast from 'react-hot-toast';

type AbortableRequest = {
  abort: () => void;
  unwrap: () => Promise<unknown>;
};
  clearMessages,
  updateMessage,
  saveConversationLocally,
  queueMessage,
  addMessage as reduxAddMessage,
  setMessageDelivery,
  addPendingMessage,
  removeMessage,
} from "@/store/slices/chatSlice";
import AgentMessage from "@/components/chat/AgentMessage";
import { AgentRetryAction } from "@/components/chat/AgentRetryAction";
import { AgentMarkdown } from "@/components/chat/AgentMarkdown";
import { AgentTimeoutNotice } from "@/components/chat/AgentTimeoutNotice";
import agentConfig from "@/config/agent";
import UserMessage from "@/components/chat/UserMessage";

import { OfflineIndicator } from "@/components/chat/OfflineIndicator";
import { ChatComposerField } from "@/components/chat/ChatComposerField";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { useChatResync } from "@/hooks/useChatResync";
import {
  Send,
  Mic,
  Square,
  Sun,
  Clock,
  Copy,
} from "lucide-react";
import toast from "react-hot-toast";
import { ChatMessage } from "@/types";
import { usePathname, useRouter } from "next/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { AgentToolsMenu } from "@/components/chat/AgentToolsMenu";
import { ChatDraftComposer } from "@/components/chat/ChatDraftComposer";
import { QueryStopButton } from "@/components/chat/QueryStopButton";

// ─── Speech Recognition ambient types (used by the old transcription path) ────

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  onstart: () => void;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getErrorText(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error;
  return error instanceof Error ? error.message : fallback;
}

// After this long, the typing indicator explains the request is still running (#274)
const LONG_RUNNING_NOTICE_SECONDS = 10;

// ─── Component ────────────────────────────────────────────────────────────────

export const ChatEngine: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const {
    messages,
    isLoading: isChatLoading,
    isTyping,
    currentConversation,
    isOnline,
    pendingMessages,
    streamingResponse,
  } = useAppSelector((state) => state.chat);
  const { processQueue } = useOfflineQueue();
  // Merge live chat events and catch up on ones missed during socket downtime (#277)
  useChatResync();
  const [inputValue, setInputValue] = useState("");
  // Seconds the current agent request has been running; drives the "still working" state (#274)
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlightRequestRef = useRef<AbortableRequest | null>(null);
  const lastDraftRef = useRef('');

  // ── Thread handlers ───────────────────────────────────────────────────────
  const handleOpenThread = (messageId: string) => {
    if (activeThread?.rootMessageId === messageId) {
      dispatch(closeThread());
    } else {
      dispatch(openThread(messageId));
    }
  };

  const handleCloseThread = () => dispatch(closeThread());

  // Listen for thread replies from other participants
  useSocketEvent('thread:new_reply', (data: unknown) => {
    const payload = data as { threadId: string; message: ChatMessage; userId: string };
    if (payload.userId === user?.id) return;
    dispatch(addReply(payload.message));
    toast(`New reply in thread`, { icon: '💬' });
  });

  // ── Effects ───────────────────────────────────────────────────────────────
  // Cancel a streaming/in-flight agent request when the route changes (#261). Uses the same
  // in-flight ref as the Stop button, so there is one source of truth for the active request.
  useEffect(() => {
    return () => {
      inflightRef.current?.abort();
      inflightRef.current = null;
    };
  }, [pathname]);

  useEffect(() => {
    if (!isTyping) {
      setPendingSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setPendingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isTyping]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [messages, isTyping, prefersReducedMotion]);

  useEffect(() => {
    if (currentConversation && messages.length > 0) {
      dispatch(saveConversationLocally(currentConversation));
    }
  }, [currentConversation, dispatch, messages.length]);

  useEffect(() => {
    if (currentConversation?.id && pathname === '/chat') {
      router.replace(`/chat/${encodeURIComponent(currentConversation.id)}`, { scroll: false });
    }
  }, [currentConversation?.id, pathname, router]);

  useEffect(() => () => inFlightRequestRef.current?.abort(), []);

  const handleSendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!inputValue.trim() || isChatLoading || isTyping) return;

    const message = inputValue.trim();
    const query = selectedTool ? `[Using ${selectedTool} tool] ${message}` : message;
    lastDraftRef.current = message;
    setInputValue('');

    if (!isOnline) {
      const id = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const optimisticMessage: ChatMessage = {
        id,
        type: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      dispatch(queueMessage({ id, query }));
      dispatch(addChatMessage(optimisticMessage));
      dispatch(addPendingMessage(id));
      toast.info("You're offline. Message queued and will send when back online.");
      return;
    }

    try {
      const request = dispatch(sendMessage(query));
      inFlightRequestRef.current = request;
      const queryWithTool = selectedTool
        ? `[Using ${selectedTool} tool] ${message}`
        : message;

      if (!isOnline) {
        // Queue message for offline
        const msgId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        dispatch(queueMessage({ id: msgId, query: queryWithTool }));

        // Add the user message as queued; the offline queue sends it with this id as tempId,
        // so the same row moves queued → sending → sent (#266)
        const userMessage: ChatMessage = {
          id: msgId,
          type: "user",
          content: message,
          timestamp: new Date().toISOString(),
          metadata: { delivery: "queued", status: "pending", optimisticId: msgId, tempId: msgId },
        };
        dispatch(reduxAddMessage(userMessage));

        toast.info(
          "You're offline. Message queued and will send when back online.",
        );
        return;
      }

      const request = dispatch(sendMessage(queryWithTool));
      inflightRef.current = request;
      await request.unwrap();
    } catch (error: unknown) {
      if (error === ABORT_ERROR || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')) {
        setInputValue(lastDraftRef.current);
        return;
      }
      setInputValue(lastDraftRef.current);
      toast.error(getErrorText(error, 'Failed to send message.'));
    } finally {
      inFlightRequestRef.current = null;
    }
  };

  // Retry is only offered for messages that never reached the service (#266)
  const handleRetryMessage = (failed: ChatMessage) => {
    const query = typeof failed.content === "string" ? failed.content : JSON.stringify(failed.content);
    if (!isOnline) {
      dispatch(queueMessage({ id: failed.id, query }));
      dispatch(setMessageDelivery({ id: failed.id, delivery: "queued" }));
      toast.info("You're offline. Message queued and will send when back online.");
      return;
    }
    dispatch(sendMessage({ query, tempId: failed.id }))
      .unwrap()
      .catch(() => toast.error("Message still couldn't be sent"));
  };

  // Resend a failed prompt exactly as typed, reusing its user bubble and request id (#262)
  const handleRetryFailed = (failed: ChatMessage) => {
    const meta = failed.metadata;
    if (!meta?.retryPrompt || isChatLoading || isTyping) return;
    dispatch(removeMessage(failed.id));
    dispatch(
      sendMessage({
        query: meta.retryPrompt,
        tempId: meta.retryTempId,
        clientRequestId: meta.requestId,
      }),
    )
      .unwrap()
      .catch((error: unknown) => toast.error(String(error || "Failed to send message")));
  };

  const handleResolveTimeout = (messageId: string, updates: Partial<ChatMessage>) => {
    dispatch(updateMessage({ id: messageId, updates }));
    if (updates.metadata?.actionStatus === "completed") {
      toast.success("The action completed");
    }
  };

  // Resend the user query that preceded a timed-out agent reply (read-only queries only)
  const handleRetryTimedOut = (messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    const original = messages
      .slice(0, idx)
      .reverse()
      .find((m) => m.type === "user");
    if (original && !isChatLoading && !isTyping) {
      dispatch(sendMessage(original.content));
    }
  };

  const handleStopQuery = () => {
    inFlightRequestRef.current?.abort();
    setInputValue(lastDraftRef.current);
  };

  const handleRegenerate = async () => {
    if (isChatLoading || isTyping || currentConversation?.isActive === false) return;
    try {
      const request = dispatch(regenerateLastResponse());
      inFlightRequestRef.current = request;
      await request.unwrap();
    } catch (error: unknown) {
      if (error === ABORT_ERROR || error === 'busy' || error === 'inactive') return;
      toast.error(getErrorText(error, 'Failed to regenerate the response.'));
    } finally {
      inFlightRequestRef.current = null;
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Unable to copy to clipboard.');
    }
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    dispatch(updateMessage({ id: messageId, updates: { content: newContent } }));
    toast.success('Message updated');
  };

  const renderComposer = (sticky = false) => (
    <form
      onSubmit={(event) => void handleSendMessage(event)}
      className={`w-full ${sticky ? 'mx-auto max-w-4xl px-4 py-5' : 'mb-8 max-w-3xl'}`}
    >
      <div className="relative bg-[#1A1A2E] rounded-2xl p-6 border border-gray-800/50 shadow-xl">
        <ChatDraftComposer
          inputRef={inputRef}
          conversationId={currentConversation?.id ?? null}
          value={inputValue}
          onChange={setInputValue}
          onEnter={() => {
            void handleSendMessage();
      <div className="rounded-2xl border border-gray-800/50 bg-[#1A1A2E] p-5 shadow-xl">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSendMessage();
            }
          }}
          placeholder="Ask ChenPilot..."
          disabled={isChatLoading || isTyping}
          className="mb-4 w-full border-none bg-transparent text-lg text-white outline-none placeholder:text-gray-500"
          aria-label="Message ChenPilot"
      <div className="relative bg-[#1A1A2E] rounded-2xl p-6 border border-gray-800/50 shadow-xl">
        <ChatComposerField
          value={inputValue}
          onChange={setInputValue}
          onSend={() => handleSendMessage()}
          onEscape={handleComposerEscape}
          placeholder={isRecording ? "Listening..." : "Ask ChenPilot..."}
          disabled={isRecording}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AgentToolsMenu selectedTool={selectedTool} onSelect={setSelectedTool} />
            <TagWidget />
          </div>
          <div className="flex items-center gap-2">
            <QueryStopButton inFlight={isChatLoading || isTyping} onStop={handleStopQuery} />
            <button
              type="submit"
              disabled={!inputValue.trim() || isChatLoading || isTyping}
              className="rounded-lg bg-purple-600 p-3 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              {inputValue.trim() ? <Send className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </form>
  );

  const lastAgentMessageId = [...messages].reverse().find((message) => message.type === 'agent')?.id;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0F0F23] text-white">
      <OfflineIndicator />
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8">
            <div className="mb-8 text-center">
              <div className="mb-4 flex items-center justify-center">
                <Sun className="mr-3 h-8 w-8 text-orange-400" />
                <h2 className="text-2xl font-light">
                  Happy {new Date().toLocaleDateString('en-US', { weekday: 'long' })}, {user?.name || 'User'}
                </h2>
              </div>
              <p className="text-lg text-gray-400">What can we do today?</p>
            </div>
            {renderComposer()}
            <div className="grid w-full max-w-2xl grid-cols-2 gap-2 md:grid-cols-3">
              {['Check wallet balance', 'Recent transactions', 'Deploy Stellar account', 'Create contact', 'Swap USDC to XLM', 'Bitcoin price'].map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => {
                    setInputValue(question);
                    inputRef.current?.focus();
                  }}
                  className="rounded-lg border border-gray-700/50 px-3 py-2 text-left text-gray-400 transition-colors hover:border-gray-600 hover:text-white"
                >
                  <span className="text-xs font-medium">{question}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.type === 'user' ? (
                  <UserMessage message={message} onCopy={copyToClipboard} onEdit={handleEditMessage} />
                ) : (
                  <div className="w-full max-w-2xl">
                    <AgentMessage
                      message={message}
                      onCopy={copyToClipboard}
                      onRegenerate={() => void handleRegenerate()}
                      canRegenerate={
                        message.type === 'agent' &&
                        message.id === lastAgentMessageId &&
                        !isChatLoading &&
                        !isTyping &&
                        currentConversation?.isActive !== false
                      }
                    />
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div role="status" className="flex justify-start">
                <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-6 py-4 text-sm text-gray-400">
                  ChenPilot is thinking...
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.type === "user" ? (
                <UserMessage
                  message={message}
                  onRetry={handleRetryMessage}
                  onCopy={copyToClipboard}
                  onEdit={handleEditMessage}
                />
              ) : (
                <div className="max-w-2xl w-full">
                  <AgentMessage
                    message={message}
                    onCopy={copyToClipboard}
                    onRegenerate={handleRegenerate}
                    canRegenerate={
                      message.type === "agent" &&
                      message.id === [...messages].reverse().find((item) => item.type === "agent")?.id &&
                      !isChatLoading &&
                      !isTyping &&
                      currentConversation?.isActive !== false
                    }
                  />
                  {/* Timeouts are handled by AgentTimeoutNotice (status check first); other
                      retryable failures get the #262 retry action */}
                  {message.metadata?.errorKind !== "timeout" && (
                    <AgentRetryAction
                      message={message}
                      onRetry={handleRetryFailed}
                      onResolve={(updates) => dispatch(updateMessage({ id: message.id, updates }))}
                    />
                  )}
                  <AgentTimeoutNotice
                    message={message}
                    onResolve={(updates) => handleResolveTimeout(message.id, updates)}
                    onRetry={() => handleRetryTimedOut(message.id)}
                  />
                </div>
              )}
            </div>
          ))}

          {isTyping && streamingResponse?.text ? (
            <div className="flex justify-start" data-testid="streaming-response">
              <div className="max-w-2xl w-full" aria-live="polite" aria-busy="true">
                <div className="text-white text-left prose prose-invert prose-lg max-w-none leading-relaxed pr-8">
                  <AgentMarkdown>{streamingResponse.text}</AgentMarkdown>
                </div>
              </div>
            </div>
          ) : isTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl px-6 py-4 shadow-lg">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 bg-purple-400 rounded-full ${prefersReducedMotion ? "" : "animate-bounce"}`} />
                    <div
                      className={`w-2 h-2 bg-pink-400 rounded-full ${prefersReducedMotion ? "" : "animate-bounce"}`}
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className={`w-2 h-2 bg-purple-400 rounded-full ${prefersReducedMotion ? "" : "animate-bounce"}`}
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                  <span className="text-sm text-gray-400" role="status" aria-live="polite">
                    {pendingSeconds >= LONG_RUNNING_NOTICE_SECONDS
                      ? `Still working on it (${pendingSeconds}s). Long actions can take up to ${Math.round(agentConfig.timeout / 1000)}s.`
                      : "ChenPilot is thinking..."}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      {messages.length > 0 && (
        <div className="relative z-10 border-t border-gray-800/50 bg-[#0F0F23]/80 backdrop-blur-xl">
          {renderComposer(true)}
        </div>
      )}
    </div>
  );
};

export default ChatEngine;
