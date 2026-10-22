'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { ChatMessage } from '@/types';
import { Copy, Check, Edit2, Check as CheckIcon, X, Clock, MessageSquare } from 'lucide-react';
import { useAppSelector } from '@/store';
import VoiceMessagePlayer from '@/components/chat/VoiceMessagePlayer';

interface UserMessageProps {
  message: ChatMessage;
  onCopy?: (text: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onReply?: (messageId: string) => void;
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
  const { pendingMessages } = useAppSelector((state) => state.chat);
  const isPending = pendingMessages.has(message.id);
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
    <div className="flex flex-col items-end">
      <div className={`group relative max-w-3xl rounded-2xl bg-[#7C3AED] px-6 py-4 text-white ${isPending ? 'opacity-75' : ''}`}>
        {isPending && (
          <div className="absolute -left-8 top-4 flex items-center gap-1 text-xs text-yellow-400">
            <Clock className="h-3 w-3 animate-spin" />
            <span>Sending...</span>
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
