import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { logger } from "../../utils/logger";
import { ChatMessage, Conversation } from "@/types";
import type { AgentCapabilities } from "@/types/agent";
import apiService from "@/services/api";

const OFFLINE_STORAGE_TTL = {
  queueMs: 7 * 24 * 60 * 60 * 1000,
  chatHistoryMs: 30 * 24 * 60 * 60 * 1000,
  conversationsMs: 30 * 24 * 60 * 60 * 1000,
};

interface ChatThunkState {
  auth: {
    user: { id?: string } | null;
  };
  chat: Pick<ChatState, 'currentConversation' | 'isLoading' | 'isTyping'>;
}

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== 'object') return fallback;

  const errorRecord = error as Record<string, unknown>;
  const response = errorRecord.response;
  if (response && typeof response === 'object') {
    const data = (response as Record<string, unknown>).data;
    if (data && typeof data === 'object') {
      const message = (data as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }
  }

  return typeof errorRecord.message === 'string' ? errorRecord.message : fallback;
};

const getTimestampMs = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (value instanceof Date) {
    const parsed = value.getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
};

const isStorageQuotaError = (error: unknown): boolean => {
  if (!error) return false;

  if (typeof error === 'object') {
    const candidate = error as { name?: string; code?: number };
    if (
      candidate.name === 'QuotaExceededError' ||
      candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      candidate.code === 22 ||
      candidate.code === 1014
    ) {
      return true;
    }
  }

  if (error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    );
  }

  return false;
};

const getSafeTimestamp = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') {
    return getTimestampMs(value);
  }

  const record = value as Record<string, unknown>;
  const candidates = [
    record.timestamp,
    record.serverTimestamp,
    record.updatedAt,
    record.createdAt,
    record.metadata,
  ];

  for (const candidate of candidates) {
    const ts = getTimestampMs(candidate);
    if (ts !== null) {
      return ts;
    }

    if (candidate && typeof candidate === 'object') {
      const nested = candidate as Record<string, unknown>;
      const nestedTs = getTimestampMs(nested.clientTimestamp) ?? getTimestampMs(nested.serverTimestamp);
      if (nestedTs !== null) {
        return nestedTs;
      }
    }
  }

  return null;
};

const getPrunedOfflineValue = (key: string, value: unknown): unknown => {
  if (typeof window === 'undefined') return value;

  const now = Date.now();

  if (key === 'messageQueue') {
    if (!Array.isArray(value)) return value;
    return value.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const ts = getSafeTimestamp(item);
      if (ts === null) return true;
      return ts >= now - OFFLINE_STORAGE_TTL.queueMs;
    });
  }

  if (key === 'chat_history') {
    if (!value || typeof value !== 'object') return value;

    const prunedHistory: Record<string, unknown> = {};
    for (const [conversationId, messages] of Object.entries(value as Record<string, unknown>)) {
      if (!Array.isArray(messages)) {
        prunedHistory[conversationId] = messages;
        continue;
      }

      const filteredMessages = messages.filter((message) => {
        const ts = getSafeTimestamp(message);
        if (ts === null) return true;
        return ts >= now - OFFLINE_STORAGE_TTL.chatHistoryMs;
      });

      if (filteredMessages.length > 0) {
        prunedHistory[conversationId] = filteredMessages;
      }
    }

    return prunedHistory;
  }

  if (key === 'conversations') {
    if (!Array.isArray(value)) return value;
    return value.filter((conversation) => {
      if (!conversation || typeof conversation !== 'object') return false;
      const updatedAt = getSafeTimestamp(conversation);
      if (updatedAt === null) return true;
      return updatedAt >= now - OFFLINE_STORAGE_TTL.conversationsMs;
    });
  }

  return value;
};

const pruneExpiredOfflineData = () => {
  if (typeof window === 'undefined') return;

  const saveValue = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore cascade failures; keep the first failure as the user-facing signal.
    }
  };

  try {
    const rawQueue = localStorage.getItem('messageQueue');
    if (rawQueue) {
      const parsedQueue = JSON.parse(rawQueue);
      saveValue('messageQueue', getPrunedOfflineValue('messageQueue', parsedQueue));
    }
  } catch {
    // Ignore malformed queue data and continue with the rest of the cleanup.
  }

  try {
    const rawHistory = localStorage.getItem('chat_history');
    if (rawHistory) {
      const parsedHistory = JSON.parse(rawHistory);
      saveValue('chat_history', getPrunedOfflineValue('chat_history', parsedHistory));
    }
  } catch {
    // Ignore malformed chat history and continue.
  }

  try {
    const rawConversations = localStorage.getItem('conversations');
    if (rawConversations) {
      const parsedConversations = JSON.parse(rawConversations);
      saveValue('conversations', getPrunedOfflineValue('conversations', parsedConversations));
    }
  } catch {
    // Ignore malformed conversations data and continue.
  }
};

export const persistOfflineStorage = <T>(key: string, value: T, context: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
    return null;
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      return `Offline ${context} is unavailable because storage could not be saved.`;
    }

    pruneExpiredOfflineData();

    const sanitizedValue = getPrunedOfflineValue(key, value);

    try {
      localStorage.setItem(key, JSON.stringify(sanitizedValue));
      return null;
    } catch (retryError) {
      if (isStorageQuotaError(retryError)) {
        return `Offline ${context} is unavailable because browser storage is full. Old expired offline data was cleared to make space.`;
      }
      return `Offline ${context} is unavailable because the browser refused to save it.`;
    }
  }
};

export const isStorageQuotaFailure = (error: unknown): boolean => isStorageQuotaError(error);

// ─── Voice message payload ────────────────────────────────────────────────────
export interface SendVoiceMessagePayload {
  audioUrl: string;
  duration: number;
  mimeType: string;
  transcript: string;
  sizeBytes: number;
}

interface ChatState {
  messages: ChatMessage[];
  conversations: Conversation[];
  currentConversation: Conversation | null;
  isLoading: boolean;
  error: string | null;
  isTyping: boolean;
  agentStatus: {
    isConnected: boolean;
    lastHealthCheck: string | null;
    capabilities: AgentCapabilities | null;
  };
  chatHistory: { [conversationId: string]: ChatMessage[] };
  tags: { [userId: string]: string[] };
  selectedTags: string[];
  isOnline: boolean;
  messageQueue: Array<{ id: string; query: string; timestamp: string }>;
  pendingMessages: Set<string>;
  optimisticUpdates: Map<string, ChatMessage>;
}

const initialState: ChatState = {
  messages: [],
  conversations: [],
  currentConversation: null,
  isLoading: false,
  error: null,
  isTyping: false,
  agentStatus: {
    isConnected: false,
    lastHealthCheck: null,
    capabilities: null,
  },
  chatHistory: {},
  tags: {},
  selectedTags: [],
  isOnline: typeof window !== "undefined" && navigator.onLine,
  messageQueue: [],
  pendingMessages: new Set(),
  optimisticUpdates: new Map(),
};

// Async thunks
// Removed server-side conversation thunks - now handled client-side

// Helper function to sort messages by timestamp
const sortMessagesByTimestamp = (messages: ChatMessage[]): ChatMessage[] => {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    return aTime - bTime;
  });
};

export const getOrCreateActiveConversation = createAsyncThunk(
  "chat/getOrCreateActiveConversation",
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as ChatThunkState;
      const currentConversation = state.chat.currentConversation;

      // If we already have an active conversation, return it
      if (currentConversation) {
        return currentConversation;
      }

      // Create a new conversation locally
      const newConversation: Conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: "New Chat",
        description: "A new conversation",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: state.auth.user?.id || "anonymous",
        messageCount: 0,
      };

      return newConversation;
    } catch {
      return rejectWithValue("Failed to create conversation");
    }
  },
);

// Helper functions for message ordering & timestamps (#86)
export const getMessageTimestamp = (message: ChatMessage): number => {
  // 1. Root serverTimestamp (number or string)
  if (message.serverTimestamp !== undefined && message.serverTimestamp !== null) {
    const ts = typeof message.serverTimestamp === 'number'
      ? message.serverTimestamp
      : new Date(message.serverTimestamp).getTime();
    if (!isNaN(ts)) return ts;
  }

  // 2. metadata.serverTimestamp (number or string)
  if (message.metadata?.serverTimestamp !== undefined && message.metadata?.serverTimestamp !== null) {
    const ts = typeof message.metadata.serverTimestamp === 'number'
      ? message.metadata.serverTimestamp
      : new Date(message.metadata.serverTimestamp).getTime();
    if (!isNaN(ts)) return ts;
  }

  // 3. metadata.clientTimestamp (number or string)
  if (message.metadata?.clientTimestamp !== undefined && message.metadata?.clientTimestamp !== null) {
    const ts = typeof message.metadata.clientTimestamp === 'number'
      ? message.metadata.clientTimestamp
      : new Date(message.metadata.clientTimestamp).getTime();
    if (!isNaN(ts)) return ts;
  }

  // 4. Root timestamp (ISO string or unix ms or numeric string)
  if (message.timestamp) {
    const num = Number(message.timestamp);
    if (!isNaN(num) && num > 1000000000) {
      return num;
    }
    const ts = new Date(message.timestamp).getTime();
    if (!isNaN(ts)) return ts;
  }

  // 5. Fallback to 0
  return 0;
};

export const sortMessagesChronologically = (messages: ChatMessage[]): ChatMessage[] => {
  return [...messages].sort((a, b) => {
    const timeA = getMessageTimestamp(a);
    const timeB = getMessageTimestamp(b);
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    // Stable tie-breaker: user message comes before agent/system message for same timestamp
    if (a.type === 'user' && b.type !== 'user') return -1;
    if (a.type !== 'user' && b.type === 'user') return 1;
    return a.id.localeCompare(b.id);
  });
};

export type SendMessageArg = string | { query: string; tempId?: string; clientTimestamp?: number };

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (arg: SendMessageArg, { getState, rejectWithValue, requestId }) => {
    const query = typeof arg === 'string' ? arg : arg.query;
    const tempId = typeof arg === 'object' && arg.tempId ? arg.tempId : `msg_optimistic_${requestId}`;
    const clientTimestamp = typeof arg === 'object' && arg.clientTimestamp ? arg.clientTimestamp : Date.now();

    try {
      const state = getState() as ChatThunkState;
      const userId = state.auth.user?.id;
      const currentConversation = state.chat.currentConversation;

      if (!userId) {
        return rejectWithValue("User not authenticated");
      }

      let conversation = currentConversation;
      if (!conversation) {
        conversation = {
          id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          title: "New Chat",
          description: "A new conversation",
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          userId: userId,
          messageCount: 0,
        };
      }

      const response = await apiService.queryAgent({ userId, query });

      const content = response.result.data;
      if (
        typeof content === "string" &&
        (content.trim().startsWith("{") || content.trim().startsWith("["))
      ) {
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === "object") {
            logger.debug("[ChatSlice] Structured agent response:", parsed);
          }
        } catch {
          logger.debug("[ChatSlice] Response is not valid JSON, keeping as string");
        }
      }

      const rawServerTimestamp =
        ("serverTimestamp" in response.result ? response.result.serverTimestamp : undefined) ??
        ("timestamp" in response.result ? response.result.timestamp : undefined) ??
        ("serverTimestamp" in response ? response.serverTimestamp : undefined) ??
        ("timestamp" in response ? response.timestamp : undefined) ??
        Date.now();

      const serverTimestampMs =
        typeof rawServerTimestamp === 'string' && isNaN(Number(rawServerTimestamp))
          ? new Date(rawServerTimestamp).getTime()
          : Number(rawServerTimestamp);
      const messageTimestamp = new Date(serverTimestampMs).toISOString();

      const userMessage: ChatMessage = {
        id: tempId,
        type: 'user',
        content: query,
        timestamp: messageTimestamp,
        serverTimestamp: serverTimestampMs,
        metadata: {
          status: 'success',
          clientTimestamp: clientTimestamp,
          serverTimestamp: serverTimestampMs,
          optimisticId: tempId,
          tempId,
        },
      };

      const agentMessage: ChatMessage = {
        id: `msg_agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "agent",
        content,
        timestamp: messageTimestamp,
        serverTimestamp: serverTimestampMs,
        metadata: {
          status: 'success',
          success: response.result.success,
          error: response.result.error,
          executionTrace: response.result.executionTrace,
          serverTimestamp: serverTimestampMs,
          rawData: typeof content !== "string" ? content : undefined,
        },
      };

      return { response, conversation, userMessage, agentMessage, tempId };
    } catch (error: unknown) {
      return rejectWithValue(getErrorMessage(error, "Failed to send message"));
    }
  },
);

// ─── sendVoiceMessage thunk ───────────────────────────────────────────────────

export const sendVoiceMessage = createAsyncThunk(
  'chat/sendVoiceMessage',
  async (payload: SendVoiceMessagePayload, { getState, rejectWithValue }) => {
    const state = getState() as ChatThunkState;

    if (state.chat.isLoading || state.chat.isTyping) {
      return rejectWithValue('A message is already in progress');
    }

    const userId = state.auth.user?.id;
    if (!userId) {
      return rejectWithValue('User not authenticated');
    }

    // Storage guard — warn if total voice data in history is getting large
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('chat_history') || '';
      if (stored.length > VOICE_MESSAGE.STORAGE_WARN_BYTES) {
        console.warn('[sendVoiceMessage] chat_history localStorage is large; consider pruning old voice messages');
      }
    }

    let conversation = state.chat.currentConversation;
    if (!conversation) {
      conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: 'New Chat',
        description: 'A new conversation',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId,
        messageCount: 0,
      };
    }

    // Display text is the transcript (or a placeholder)
    const displayText = payload.transcript
      ? `🎙 *Voice message* — "${payload.transcript}"`
      : '🎙 *Voice message*';

    const voiceMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'user',
      messageType: 'voice',
      content: displayText,
      timestamp: new Date().toISOString(),
      voice: {
        audioUrl: payload.audioUrl,
        duration: payload.duration,
        mimeType: payload.mimeType,
        transcript: payload.transcript,
        sizeBytes: payload.sizeBytes,
      },
    };

    // If there is a transcript, forward it to the agent as a regular text query
    let agentMessage: ChatMessage | null = null;
    if (payload.transcript.trim()) {
      try {
        const response = await apiService.queryAgent({ userId, query: payload.transcript });
        let content = response.result.data;
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === 'object') content = parsed;
        } catch { /* not JSON */ }

        agentMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'agent',
          content,
          timestamp: new Date().toISOString(),
          metadata: {
            success: response.result.success,
            error: response.result.error,
            executionTrace: response.result.executionTrace,
          },
        };
      } catch {
        // Non-fatal — voice message is still stored even if agent call fails
      }
    }

    return { conversation, voiceMessage, agentMessage };
  },
);

// ─── Slice ────────────────────────────────────────────────────────────────────

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    addMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.messages.push(action.payload);
      state.messages = sortMessagesChronologically(state.messages);
    },
    addUserMessage: (state, action: PayloadAction<string>) => {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "user",
        content: action.payload,
        timestamp: new Date().toISOString(),
        serverTimestamp: Date.now(),
      };
      state.messages.push(userMessage);
      state.messages = sortMessagesChronologically(state.messages);
    },
    addSystemMessage: (
      state,
      action: PayloadAction<{ content: string; metadata?: ChatMessage['metadata'] }>,
    ) => {
      const systemMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "system",
        content: action.payload.content,
        timestamp: new Date().toISOString(),
        serverTimestamp: Date.now(),
        metadata: action.payload.metadata,
      };
      state.messages.push(systemMessage);
      state.messages = sortMessagesChronologically(state.messages);
    },
    clearMessages: (state) => {
      state.messages = [];
    },
    setMessages: (state, action: PayloadAction<ChatMessage[]>) => {
      state.messages = sortMessagesChronologically(action.payload);
    },
    setConversations: (state, action: PayloadAction<Conversation[]>) => {
      state.conversations = action.payload;
    },
    setCurrentConversation: (
      state,
      action: PayloadAction<Conversation | null>,
    ) => {
      state.currentConversation = action.payload;
    },
    setTyping: (state, action: PayloadAction<boolean>) => {
      state.isTyping = action.payload;
    },
    updateMessage: (
      state,
      action: PayloadAction<{ id: string; updates: Partial<ChatMessage> }>,
    ) => {
      const index = state.messages.findIndex(
        (msg) => msg.id === action.payload.id,
      );
      if (index !== -1) {
state.messages[index] = {
          ...state.messages[index],
          ...action.payload.updates,
        };
        state.messages = sortMessagesChronologically(state.messages);
      }
    },
    removeMessage: (state, action: PayloadAction<string>) => {
      state.messages = state.messages.filter(
        (msg) => msg.id !== action.payload,
      );
    },
    updateAgentStatus: (
      state,
      action: PayloadAction<{
        isConnected: boolean;
        lastHealthCheck: string | null;
        capabilities?: AgentCapabilities | null;
      }>,
    ) => {
      state.agentStatus = { ...state.agentStatus, ...action.payload };
    },
    setAgentConnected: (state, action: PayloadAction<boolean>) => {
      state.agentStatus.isConnected = action.payload;
    },
    startNewChat: (state) => {
      // Save current conversation messages to history
      if (state.currentConversation && state.messages.length > 0) {
        state.chatHistory[state.currentConversation.id] = [...state.messages];
      }
      // Clear current messages and conversation
      state.messages = [];
      state.currentConversation = null;
      // Save to localStorage
      if (typeof window !== "undefined") {
        const storageError = persistOfflineStorage("chat_history", state.chatHistory, "chat history");
        if (storageError) {
          state.error = storageError;
        } else {
          state.error = null;
        }
      }
    },
    loadChatHistory: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      const conversation = state.conversations.find((item) => item.id === conversationId);
      state.currentConversation = conversation ?? state.currentConversation;
      const loadedMessages = state.chatHistory[conversationId] ?? conversation?.messages ?? [];
      state.messages = sortMessagesChronologically(loadedMessages);
      if (state.chatHistory[conversationId]) {
        state.messages = sortMessagesByTimestamp(
          state.chatHistory[conversationId],
        );
      } else {
        state.messages = [];
      }
    },
    saveChatHistory: (state) => {
      if (state.currentConversation && state.messages.length > 0) {
        state.chatHistory[state.currentConversation.id] = [...state.messages];
        // Save to localStorage
        if (typeof window !== "undefined") {
          const storageError = persistOfflineStorage("chat_history", state.chatHistory, "chat history");
          if (storageError) {
            state.error = storageError;
          } else {
            state.error = null;
          }
        }
      }
    },
    deleteChatHistory: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      delete state.chatHistory[conversationId];
      // Save to localStorage
      if (typeof window !== "undefined") {
        const storageError = persistOfflineStorage("chat_history", state.chatHistory, "chat history");
        if (storageError) {
          state.error = storageError;
        } else {
          state.error = null;
        }
      }
    },
    initializeChatHistory: (state) => {
      if (typeof window !== "undefined") {
        const savedHistory = localStorage.getItem("chat_history");
        if (savedHistory) {
          try {
            state.chatHistory = JSON.parse(savedHistory);
          } catch (error) {
            console.error("Failed to parse chat history:", error);
            state.chatHistory = {};
          }
        }
      }
    },
    saveConversationLocally: (state, action: PayloadAction<Conversation>) => {
      const conversation = {
        ...action.payload,
        messages: [...state.messages],
        messageCount: state.messages.length,
      };
      state.chatHistory[conversation.id] = [...state.messages];
      const existingIndex = state.conversations.findIndex((item) => item.id === conversation.id);
      if (existingIndex >= 0) {
        state.conversations[existingIndex] = conversation;
      } else {
        state.conversations.unshift(conversation);
      }

      // Save to localStorage
      if (typeof window !== "undefined") {
        const conversations = JSON.parse(
          localStorage.getItem("conversations") || "[]",
        );
        const existingIndex = conversations.findIndex((item: Conversation) => item.id === conversation.id);
        if (existingIndex >= 0) conversations[existingIndex] = conversation;
        else conversations.unshift(conversation);

        const conversationsError = persistOfflineStorage("conversations", conversations, "conversation list");
        const chatHistoryError = persistOfflineStorage("chat_history", state.chatHistory, "chat history");

        if (conversationsError || chatHistoryError) {
          state.error = conversationsError || chatHistoryError;
        } else {
          state.error = null;
        }
      }
    },
    loadConversationsLocally: (state) => {
      if (typeof window !== "undefined") {
        try {
          const conversations = JSON.parse(localStorage.getItem("conversations") || "[]");
          state.conversations = Array.isArray(conversations) ? conversations : [];
        } catch {
          state.conversations = [];
        }
      }
    },
    deleteConversationLocally: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      state.conversations = state.conversations.filter(
        (conv) => conv.id !== conversationId,
      );
      delete state.chatHistory[conversationId];

      // Update localStorage
      if (typeof window !== "undefined") {
        const conversations = JSON.parse(
          localStorage.getItem("conversations") || "[]",
        );
        const updatedConversations = conversations.filter(
          (conv: Conversation) => conv.id !== conversationId,
        );
        const conversationsError = persistOfflineStorage("conversations", updatedConversations, "conversation list");

        const chatHistory = JSON.parse(
          localStorage.getItem("chat_history") || "{}",
        );
        delete chatHistory[conversationId];
        const chatHistoryError = persistOfflineStorage("chat_history", chatHistory, "chat history");

        if (conversationsError || chatHistoryError) {
          state.error = conversationsError || chatHistoryError;
        } else {
          state.error = null;
        }
      }
    },
    addTag: (
      state,
      action: PayloadAction<{ conversationId: string; tag: string }>,
    ) => {
      const { conversationId, tag } = action.payload;
      const conversation = state.conversations.find(
        (c) => c.id === conversationId,
      );
      if (conversation) {
        if (!conversation.tags) conversation.tags = [];
        if (!conversation.tags.includes(tag)) {
          conversation.tags.push(tag);
        }
        // Persist to localStorage
        if (typeof window !== "undefined") {
          const conversations = JSON.parse(
            localStorage.getItem("conversations") || "[]",
          );
          const index = conversations.findIndex(
            (c: Conversation) => c.id === conversationId,
          );
          if (index !== -1) {
            conversations[index] = conversation;
            localStorage.setItem(
              "conversations",
              JSON.stringify(conversations),
            );
          }
        }
      }
    },
    removeTag: (
      state,
      action: PayloadAction<{ conversationId: string; tag: string }>,
    ) => {
      const { conversationId, tag } = action.payload;
      const conversation = state.conversations.find(
        (c) => c.id === conversationId,
      );
      if (conversation && conversation.tags) {
        conversation.tags = conversation.tags.filter((t) => t !== tag);
        // Persist to localStorage
        if (typeof window !== "undefined") {
          const conversations = JSON.parse(
            localStorage.getItem("conversations") || "[]",
          );
          const index = conversations.findIndex(
            (c: Conversation) => c.id === conversationId,
          );
          if (index !== -1) {
            conversations[index] = conversation;
            localStorage.setItem(
              "conversations",
              JSON.stringify(conversations),
            );
          }
        }
      }
    },
    setSelectedTags: (state, action: PayloadAction<string[]>) => {
      state.selectedTags = action.payload;
    },
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    queueMessage: (
      state,
      action: PayloadAction<{ id: string; query: string }>,
    ) => {
      state.messageQueue.push({
        id: action.payload.id,
        query: action.payload.query,
        timestamp: new Date().toISOString(),
      });
      // Persist queue to localStorage
      if (typeof window !== "undefined") {
        const storageError = persistOfflineStorage("messageQueue", state.messageQueue, "queued message");
        if (storageError) {
          state.error = storageError;
        } else {
          state.error = null;
        }
      }
    },
    dequeueMessage: (state, action: PayloadAction<string>) => {
      state.messageQueue = state.messageQueue.filter(
        (msg) => msg.id !== action.payload,
      );
      // Persist queue to localStorage
      if (typeof window !== "undefined") {
        const storageError = persistOfflineStorage("messageQueue", state.messageQueue, "queued message");
        if (storageError) {
          state.error = storageError;
        } else {
          state.error = null;
        }
      }
    },
    clearMessageQueue: (state) => {
      state.messageQueue = [];
      if (typeof window !== "undefined") {
        const storageError = persistOfflineStorage("messageQueue", state.messageQueue, "queued message");
        if (storageError) {
          state.error = storageError;
        } else {
          state.error = null;
        }
        if (!storageError) {
          localStorage.removeItem("messageQueue");
        }
      }
    },
    loadMessageQueue: (state) => {
      if (typeof window !== "undefined") {
        const savedQueue = localStorage.getItem("messageQueue");
        if (savedQueue) {
          try {
            state.messageQueue = JSON.parse(savedQueue);
          } catch (error) {
            console.error("Failed to parse message queue:", error);
            state.messageQueue = [];
          }
        }
      }
    },
    addPendingMessage: (state, action: PayloadAction<string>) => {
      state.pendingMessages.add(action.payload);
    },
    removePendingMessage: (state, action: PayloadAction<string>) => {
      state.pendingMessages.delete(action.payload);
    },
    storeOptimisticUpdate: (state, action: PayloadAction<ChatMessage>) => {
      state.optimisticUpdates.set(action.payload.id, action.payload);
    },
    removeOptimisticUpdate: (state, action: PayloadAction<string>) => {
      state.optimisticUpdates.delete(action.payload);
    },
    resolveOptimisticUpdate: (
      state,
      action: PayloadAction<{ clientId: string; serverMessage: ChatMessage }>,
    ) => {
      const { clientId, serverMessage } = action.payload;
      // Remove optimistic update and add resolved message
      state.optimisticUpdates.delete(clientId);
      // Remove the old optimistic message if it exists
      state.messages = state.messages.filter((msg) => msg.id !== clientId);
      // Add the server version and resort
      state.messages.push(serverMessage);
      state.messages = sortMessagesByTimestamp(state.messages);
    },
  },
  extraReducers: (builder) => {
    builder
      // Removed server conversation extraReducers - now handled client-side

      // Get or Create Active Conversation
      .addCase(getOrCreateActiveConversation.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getOrCreateActiveConversation.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentConversation = action.payload;
        state.messages = action.payload.messages || [];
        state.error = null;
      })
      .addCase(getOrCreateActiveConversation.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })

      // Send Message
      .addCase(sendMessage.pending, (state, action) => {
        state.isLoading = true;
        state.isTyping = true;
        state.error = null;

        const query = typeof action.meta.arg === 'string' ? action.meta.arg : action.meta.arg.query;
        const tempId = typeof action.meta.arg === 'object' && action.meta.arg.tempId
          ? action.meta.arg.tempId
          : `msg_optimistic_${action.meta.requestId}`;
        const clientTimestamp = typeof action.meta.arg === 'object' && action.meta.arg.clientTimestamp
          ? action.meta.arg.clientTimestamp
          : Date.now();

        // Check if optimistic message already exists
        const exists = state.messages.some(
          m => m.id === tempId || m.metadata?.optimisticId === tempId || m.metadata?.tempId === tempId
        );
        if (!exists) {
          const optimisticUserMessage: ChatMessage = {
            id: tempId,
            type: 'user',
            content: query,
            timestamp: new Date(clientTimestamp).toISOString(),
            metadata: {
              status: 'pending',
              clientTimestamp: clientTimestamp,
              optimisticId: tempId,
              tempId: tempId,
            },
          };
          state.messages.push(optimisticUserMessage);
          state.messages = sortMessagesChronologically(state.messages);
        }
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isTyping = false;
        state.currentConversation = action.payload.conversation;

        // Debug logging to see what the server is returning
        logger.debug("[ChatSlice] Full response:", action.payload.response);
        logger.debug(
          "[ChatSlice] Response result:",
          action.payload.response.result,
        );
        logger.debug(
          "[ChatSlice] Response data:",
          action.payload.response.result.data,
        );

        // Handle different response formats
        let content = action.payload.response.result.data;

        // If the response data is an object with structured data, use it directly
        if (typeof content === "object" && content !== null) {
          // The content is already structured, use it as is
          logger.debug("[ChatSlice] Using structured content:", content);
        } else if (typeof content === "string") {
          // Try to parse if it's a JSON string
          try {
            const parsed = JSON.parse(content);
            if (typeof parsed === "object" && parsed !== null) {
              content = parsed;
              logger.debug("[ChatSlice] Parsed JSON content:", content);
            }
          } catch {
            // Not JSON, use as string
            logger.debug("[ChatSlice] Using string content:", content);
          }
        }

        const { userMessage, agentMessage, tempId } = action.payload;

        // Resolve optimistic user message
        const optimisticIdx = state.messages.findIndex(
          (m) =>
            m.id === tempId ||
            m.id === userMessage?.id ||
            m.metadata?.optimisticId === tempId ||
            m.metadata?.tempId === tempId,
        );

        if (optimisticIdx !== -1 && userMessage) {
          state.messages[optimisticIdx] = {
            ...state.messages[optimisticIdx],
            ...userMessage,
            metadata: {
              ...state.messages[optimisticIdx].metadata,
              ...userMessage.metadata,
              status: "success",
            },
          };
        } else if (userMessage) {
          state.messages.push(userMessage);
        }

        if (agentMessage) {
          state.messages.push(agentMessage);
        }

        // Re-sort all messages chronologically based on serverTimestamp
        state.messages = sortMessagesChronologically(state.messages);

        // Save chat history after each message
        if (state.currentConversation) {
          state.chatHistory[state.currentConversation.id] = [...state.messages];
          if (typeof window !== "undefined") {
            localStorage.setItem(
              "chat_history",
              JSON.stringify(state.chatHistory),
            );
          }
        }

        state.error = null;
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.isLoading = false;
        state.isTyping = false;
        state.error = action.payload as string;

const tempId = typeof action.meta.arg === 'object' && action.meta.arg.tempId
          ? action.meta.arg.tempId
          : `msg_optimistic_${action.meta.requestId}`;

        // Find the optimistic message and mark it as failed
        const optimisticIdx = state.messages.findIndex(
          m => m.id === tempId || m.metadata?.optimisticId === tempId || m.metadata?.tempId === tempId
        );

        if (optimisticIdx !== -1) {
          state.messages[optimisticIdx].metadata = {
            ...state.messages[optimisticIdx].metadata,
            status: 'failed',
            error: String(action.payload),
          };
        }

        // Add error message with friendly content
        const errorContent =
          action.payload instanceof Error
            ? action.payload.message
            : String(action.payload);

        // Convert technical error messages to user-friendly ones
        let friendlyMessage = errorContent;
        if (errorContent.toLowerCase().includes('network') || errorContent.toLowerCase().includes('connection')) {
          friendlyMessage = "I'm having trouble connecting. Please check your internet connection and try again.";
        } else if (errorContent.includes('invalid query')) {
          friendlyMessage = "I didn't understand that. Could you please rephrase your question?";
        } else if (errorContent.includes('Failed to send message')) {
          friendlyMessage = "I'm having trouble processing your request. Please try again.";
        } else if (errorContent.includes('User not authenticated')) {
          friendlyMessage = "Please log in to continue the conversation.";
        }

        const errorMessage: ChatMessage = {
id: `msg_err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "agent",
          content: friendlyMessage,
          timestamp: new Date().toISOString(),
          serverTimestamp: Date.now(),
          metadata: {
            success: false,
type: "error",
            status: "failed",
            error: errorContent,
          },
        };
        state.messages.push(errorMessage);
        state.messages = sortMessagesChronologically(state.messages);
      })

      // ── sendVoiceMessage ───────────────────────────────────────────────────
      .addCase(sendVoiceMessage.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(sendVoiceMessage.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentConversation = action.payload.conversation;

        state.messages.push(action.payload.voiceMessage);

        if (action.payload.agentMessage) {
          state.messages.push(action.payload.agentMessage);
        }

        if (state.currentConversation) {
          state.chatHistory[state.currentConversation.id] = [...state.messages];
          if (typeof window !== 'undefined') {
            localStorage.setItem('chat_history', JSON.stringify(state.chatHistory));
          }
        }

        state.error = null;
      })
      .addCase(sendVoiceMessage.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  clearError,
  addMessage,
  addUserMessage,
  addSystemMessage,
  clearMessages,
  setMessages,
  setConversations,
  setCurrentConversation,
  setTyping,
  updateMessage,
  removeMessage,
  updateAgentStatus,
  setAgentConnected,
  startNewChat,
  loadChatHistory,
  saveChatHistory,
  deleteChatHistory,
  initializeChatHistory,
  saveConversationLocally,
  loadConversationsLocally,
  deleteConversationLocally,
  addTag,
  removeTag,
  setSelectedTags,
  setOnlineStatus,
  queueMessage,
  dequeueMessage,
  clearMessageQueue,
  loadMessageQueue,
  addPendingMessage,
  removePendingMessage,
  storeOptimisticUpdate,
  removeOptimisticUpdate,
  resolveOptimisticUpdate,
} = chatSlice.actions;
export default chatSlice.reducer;
