'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAppSelector } from '@/store';
import { ChatLayout } from '@/components/layout/ChatLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { History, MessageCircle, Clock } from 'lucide-react';

export default function ChatHistoryPage() {
  const router = useRouter();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { conversations } = useAppSelector((state) => state.chat);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatLayout>
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Chat History
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                View and manage your previous conversations with the AI agent.
              </p>
            </div>

            {conversations.length === 0 ? (
              <EmptyState
                icon={<History aria-hidden="true" className="h-8 w-8" />}
                title="No chat history yet"
                description="Your previous conversations will appear here once you start chatting."
                action={{
                  label: 'Start new chat',
                  onClick: () => router.push('/chat'),
                  icon: <MessageCircle aria-hidden="true" className="h-4 w-4" />,
                }}
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Recent Conversations
                  </h2>
                  <Button
                    onClick={() => router.push('/chat')}
                    className="inline-flex items-center"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    New Chat
                  </Button>
                </div>

                <div className="grid gap-2">
                  {conversations.map((conversation) => (
                    <Card key={conversation.id} className="p-2 hover:shadow-md transition-shadow">
                      <button
                        type="button"
                        onClick={() => router.push(`/chat/${encodeURIComponent(conversation.id)}`)}
                        className="w-full text-left"
                      >
                        <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {conversation.title?.trim() || 'New Chat'}
                        </h3>
                        <div className="mt-1 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                          <MessageCircle aria-hidden="true" className="h-3 w-3" />
                          <span>{conversation.messageCount} messages</span>
                          <Clock aria-hidden="true" className="ml-2 h-3 w-3" />
                          <span>{new Date(conversation.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </button>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ChatLayout>
  );
}
