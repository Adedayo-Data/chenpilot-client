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

function getErrorText(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error;
  return error instanceof Error ? error.message : fallback;
}

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
  } = useAppSelector((state) => state.chat);
  const [inputValue, setInputValue] = useState('');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlightRequestRef = useRef<AbortableRequest | null>(null);
  const lastDraftRef = useRef('');

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
