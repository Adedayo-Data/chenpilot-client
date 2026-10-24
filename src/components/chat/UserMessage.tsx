'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { ChatMessage } from '@/types';
import { useAppSelector } from '@/store';
import VoiceMessagePlayer from '@/components/chat/VoiceMessagePlayer';

import { ChatMessage } from "@/types";
import { Copy, Check, Edit2, Check as CheckIcon, X, Clock, AlertCircle, RefreshCw, CloudOff,MessageSquare } from "lucide-react";
import { canRetry, getDeliveryState } from "@/store/messageDelivery";

interface UserMessageProps {
  message: ChatMessage;
  onCopy?: (text: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onReply?: (messageId: string) => void;
  /** Resend a message that failed to reach the service (#266). */
  onRetry?: (message: ChatMessage) => void;
}

const markdownComponents: Components = {
  p: ({ children, ...props }) => <p className="mb-2 last:mb-0" {...props}>{children}</p>,
  strong: ({ children, ...props }) => <strong className="font-semibold text-white" {...props}>{children}</strong>,
  em: ({ children, ...props }) => <em className="italic text-gray-200" {...props}>{children}</em>,
  code: ({ children, ...props }) => (
    <code className="rounded bg-gray-800 px-1 py-0.5 text-sm text-green-400" {...props}>{children}</code>
  ),
  pre: ({ children, ...props }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-gray-100" {...props}>{children}</pre>
  ),
  ul: ({ children, ...props }) => <ul className="mb-2 list-inside list-disc space-y-1" {...props}>{children}</ul>,
  ol: ({ children, ...props }) => <ol className="mb-2 list-inside list-decimal space-y-1" {...props}>{children}</ol>,
  li: ({ children, ...props }) => <li className="text-gray-200" {...props}>{children}</li>,
};

export default function UserMessage({ message, onCopy, onEdit, onReply }: UserMessageProps) {
export default function UserMessage({
  message,
  onCopy,
  onEdit,
  onRetry,
}: UserMessageProps) {
  const { pendingMessages } = useAppSelector((state) => state.chat);
  const delivery = getDeliveryState(message);
  const isPending = delivery === "sending" || (delivery === undefined && pendingMessages.has(message.id));
  const isQueued = delivery === "queued";
  const isFailed = delivery === "failed";
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      onCopy?.(message.content);
      setTimeout(() => setCopied(false), 2000);
    } catch (error: unknown) {
      console.error('Failed to copy text:', error);
    }
  };

  const handleSaveEdit = () => {
    const updatedContent = editContent.trim();
    if (updatedContent && updatedContent !== message.content) {
      onEdit?.(message.id, updatedContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSaveEdit();
    } else if (event.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div
      className={`max-w-3xl ${isPending || isQueued ? "opacity-75" : ""} ${isFailed ? "ring-1 ring-red-400" : ""} bg-[#7C3AED] text-white rounded-2xl px-6 py-4 group relative`}
      data-delivery={delivery ?? "unknown"}
    >
      {isPending && (
        <div role="status" className="absolute -left-8 top-4 flex items-center gap-1 text-xs text-yellow-400">
          <Clock className="h-3 w-3 animate-spin" />
          <span>Sending...</span>
        </div>
      )}
      {isQueued && (
        <div role="status" className="mb-2 flex items-center gap-1 text-xs text-yellow-200">
          <CloudOff className="h-3 w-3" aria-hidden="true" />
          <span>Queued. Will send when you&apos;re back online.</span>
        </div>
      )}
      {isFailed && (
        <div role="alert" className="mb-2 flex items-center gap-2 text-xs text-red-200">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          <span>Not sent</span>
          {onRetry && canRetry(message) && (
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="inline-flex items-center gap-1 underline hover:text-white"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      )}
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-white placeholder:text-gray-300 focus:outline-none resize-none"
            rows={Math.max(1, editContent.split("\n").length)}
            autoFocus
          />
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSaveEdit}
              className="p-1 text-green-400 hover:text-green-300 transition-colors"
              title="Save changes"
            >
              <CheckIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancelEdit}
              className="p-1 text-red-400 hover:text-red-300 transition-colors"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="prose prose-invert prose-lg max-w-none leading-relaxed pr-12">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children, ...props }: any) => (
                  <p className="mb-2 last:mb-0" {...props}>
                    {children}
                  </p>
                ),
                strong: ({ children, ...props }: any) => (
                  <strong className="font-semibold text-white" {...props}>
                    {children}
                  </strong>
                ),
                em: ({ children, ...props }: any) => (
                  <em className="italic text-gray-200" {...props}>
                    {children}
                  </em>
                ),
                code: ({ children, ...props }: any) => (
                  <code
                    className="bg-gray-800 text-green-400 px-1 py-0.5 rounded text-sm"
                    {...props}
                  >
                    {children}
                  </code>
                ),
                pre: ({ children, ...props }: any) => (
                  <pre
                    className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto my-2"
                    {...props}
                  >
                    {children}
                  </pre>
                ),
                ul: ({ children, ...props }: any) => (
                  <ul
                    className="list-disc list-inside mb-2 space-y-1"
                    {...props}
                  >
                    {children}
                  </ul>
                ),
                ol: ({ children, ...props }: any) => (
                  <ol
                    className="list-decimal list-inside mb-2 space-y-1"
                    {...props}
                  >
                    {children}
                  </ol>
                ),
                li: ({ children, ...props }: any) => (
                  <li className="text-gray-200" {...props}>
                    {children}
                  </li>
                ),
              }}
            >
              {typeof message.content === "string"
                ? message.content
                : JSON.stringify(message.content, null, 2)}
            </ReactMarkdown>
          </div>
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1">
            <button
              onClick={handleCopy}
              className="p-1 text-gray-400 hover:text-white transition-colors"
              title="Copy transcript"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            {onReply && (
              <button
                onClick={() => onReply(message.id)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
                title="Reply in thread"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full resize-none bg-transparent text-white placeholder:text-gray-300 focus:outline-none"
              rows={Math.max(1, editContent.split('\n').length)}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleSaveEdit} className="p-1 text-green-400 hover:text-green-300" title="Save changes">
                <CheckIcon className="h-4 w-4" />
              </button>
              <button type="button" onClick={handleCancelEdit} className="p-1 text-red-400 hover:text-red-300" title="Cancel">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : message.messageType === 'voice' && message.voice ? (
          <VoiceMessagePlayer
            audioUrl={message.voice.audioUrl}
            duration={message.voice.duration}
            transcript={message.voice.transcript}
            variant="user"
          />
        ) : (
          <div className="prose prose-invert prose-lg max-w-none pr-12 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {!isEditing && (
          <div className="absolute right-2 top-2 flex items-center space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={() => void handleCopy()} className="p-1 text-gray-300 hover:text-white" title="Copy message" aria-label="Copy message">
              {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
            {onEdit && message.messageType !== 'voice' && (
              <button
                type="button"
                onClick={() => {
                  setEditContent(message.content);
                  setIsEditing(true);
                }}
                className="p-1 text-gray-300 hover:text-white"
                title="Edit message"
                aria-label="Edit message"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            )}
            {onReply && (
              <button type="button" onClick={() => onReply(message.id)} className="p-1 text-gray-300 hover:text-white" title="Reply in thread" aria-label="Reply in thread">
                <MessageSquare className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {!!message.replyCount && (
        <button type="button" onClick={() => onReply?.(message.id)} className="mt-1 text-xs text-purple-300 hover:text-purple-200">
          {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
        </button>
      )}
    </div>
  );
}
