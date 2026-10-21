// Format utility functions for the ChenPilot client

/**
 * Format a Starknet address for display
 * @param address - The full Starknet address
 * @param startChars - Number of characters to show at the start (default: 6)
 * @param endChars - Number of characters to show at the end (default: 4)
 * @returns Formatted address string
 */
export function formatAddress(address: string, startChars: number = 6, endChars: number = 4): string {
  if (!address || address.length < startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format a token amount for display
 * @param amount - The amount as a string
 * @param decimals - Number of decimal places to show (default: 4)
 * @param tokenSymbol - Token symbol to append (optional)
 * @returns Formatted amount string
 */
export function formatTokenAmount(amount: string | number, decimals: number = 4, tokenSymbol?: string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return '0';
  }

  const formatted = numAmount.toFixed(decimals);
  const trimmed = parseFloat(formatted).toString();
  
  return tokenSymbol ? `${trimmed} ${tokenSymbol}` : trimmed;
}

/**
 * Format a large number with appropriate suffixes (K, M, B)
 * @param num - The number to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted number string
 */
export function formatLargeNumber(num: number, decimals: number = 1): string {
  if (num >= 1e9) {
    return (num / 1e9).toFixed(decimals) + 'B';
  }
  if (num >= 1e6) {
    return (num / 1e6).toFixed(decimals) + 'M';
  }
  if (num >= 1e3) {
    return (num / 1e3).toFixed(decimals) + 'K';
  }
  return num.toString();
}

/**
 * Format a date for display
 * @param date - Date string or Date object
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  return dateObj.toLocaleDateString('en-US', { ...defaultOptions, ...options });
}

/**
 * Format a relative time (e.g., "2 hours ago")
 * @param date - Date string or Date object
 * @returns Relative time string
 */
export function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`;
  }

  return formatDate(dateObj, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Format a transaction hash for display
 * @param hash - The transaction hash
 * @param startChars - Number of characters to show at the start (default: 8)
 * @param endChars - Number of characters to show at the end (default: 8)
 * @returns Formatted hash string
 */
export function formatTransactionHash(hash: string, startChars: number = 8, endChars: number = 8): string {
  if (!hash || hash.length < startChars + endChars) {
    return hash;
  }
  return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
}

/**
 * Format a percentage for display
 * @param value - The percentage value (0-100)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a file size in bytes to human readable format
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted file size string
 */
export function formatFileSize(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Capitalize the first letter of a string
 * @param str - The string to capitalize
 * @returns Capitalized string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert a string to title case
 * @param str - The string to convert
 * @returns Title case string
 */
export function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

/**
 * Truncate text to a specified length
 * @param text - The text to truncate
 * @param maxLength - Maximum length of the text
 * @param suffix - Suffix to add when truncating (default: '...')
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - suffix.length) + suffix;
}

export const CHAT_DRAFTS_STORAGE_KEY = "chat_drafts_v1";
export const CHAT_DRAFT_LIMIT = 20;

export interface StoredChatDraft {
  text: string;
  updatedAt: number;
}

export type ChatDraftMap = Record<string, StoredChatDraft>;

function isStoredChatDraft(value: unknown): value is StoredChatDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as { text?: unknown; updatedAt?: unknown };
  return typeof draft.text === "string" && typeof draft.updatedAt === "number";
}

export function readChatDrafts(): ChatDraftMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CHAT_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const drafts: ChatDraftMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isStoredChatDraft(value)) drafts[id] = value;
    }
    return drafts;
  } catch {
    return {};
  }
}

export function pruneChatDrafts(
  drafts: ChatDraftMap,
  activeId?: string | null,
  limit: number = CHAT_DRAFT_LIMIT,
): ChatDraftMap {
  const recent = Object.entries(drafts)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, limit);
  const kept = Object.fromEntries(recent) as ChatDraftMap;
  if (activeId && drafts[activeId] && !kept[activeId]) {
    kept[activeId] = drafts[activeId];
  }
  return kept;
}

export function writeChatDrafts(drafts: ChatDraftMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAT_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

export function getChatDraft(conversationId: string): string {
  return readChatDrafts()[conversationId]?.text ?? "";
}

export function setChatDraft(conversationId: string, text: string, now: number = Date.now()): void {
  const drafts = readChatDrafts();
  if (!text) {
    delete drafts[conversationId];
  } else {
    drafts[conversationId] = { text, updatedAt: now };
  }
  writeChatDrafts(pruneChatDrafts(drafts, conversationId));
}

export function clearChatDraft(conversationId: string): void {
  const drafts = readChatDrafts();
  if (!(conversationId in drafts)) return;
  delete drafts[conversationId];
  writeChatDrafts(drafts);
}
