```tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  getAccountStatus,
  getBalance,
  getStellarNetworkStatus,
  getAccountTransactions,
} from '@/store/slices/accountSlice';
import { loadUser } from '@/store/slices/authSlice';
  deployAccount,
  fundAccount,
  getStellarNetworkStatus,
  getAccountTransactions,
} from '@/store/slices/accountSlice';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChatLayout } from '@/components/layout/ChatLayout';
import TransactionTable from '@/components/dashboard/TransactionTable';
import LiquidityPoolStats from '@/components/widgets/LiquidityPoolStats';
import {
  Activity,
  Clipboard,
  Copy,
  Loader2,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiService from '@/services/api';
import { PromptVersion, PromptVersionRecord } from '@/types';
import { formatAddress, formatTokenAmount } from '@/utils/format';

const DEFAULT_TEST_INPUT = 'Help a user move idle USDC into the highest-yield low-risk strategy.';
const DEFAULT_VARIABLES = JSON.stringify(
  {
    agentName: 'ChenPilot',
    userName: 'Ada',
    network: 'mainnet',
    riskLevel: 'low',
    tone: 'clear and confident',
  },
  null,
  2,
);

function isRecord(value: unknown): value is PromptVersionRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractVersionRecords(payload: unknown): PromptVersionRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  const directCollections = [payload.versions, payload.data, payload.items, payload.results];
  for (const candidate of directCollections) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }

  if (isRecord(payload.data)) {
    const nestedCollections = [payload.data.versions, payload.data.items, payload.data.results];
    for (const candidate of nestedCollections) {
      if (Array.isArray(candidate)) return candidate.filter(isRecord);
    }
  }
  return [];
}

function getTemplate(record: PromptVersionRecord): string {
  return (
    getString(record.template) ??
    getString(record.prompt) ??
    getString(record.systemPrompt) ??
    getString(record.content) ??
    getString(record.body) ??
    getString(record.text) ??
    ''
  );
}

function getLabel(record: PromptVersionRecord, fallbackIndex: number): string {
  return (
    getString(record.name) ??
    getString(record.title) ??
    getString(record.label) ??
    getString(record.version) ??
    `Template ${fallbackIndex + 1}`
  );
}

function normalizeVersion(record: PromptVersionRecord, index: number): PromptVersion {
  const id = getString(record.id) ?? getString(record._id) ?? getString(record.uuid) ?? `version-${index + 1}`;
  const tags = getArray(record.tags)
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
  const activeFlag =
    getBoolean(record.isActive) ??
    getBoolean(record.active) ??
    getBoolean(record.is_active) ??
    getString(record.status)?.toLowerCase() === 'active';

  return {
    id,
    label: getLabel(record, index),
    description:
      getString(record.description) ??
      getString(record.summary) ??
      getString(record.notes) ??
      'No description provided for this prompt version.',
    template: getTemplate(record),
    version: getString(record.version) ?? id,
    isActive: Boolean(activeFlag),
    createdAt: getString(record.createdAt) ?? getString(record.created_at) ?? getString(record.insertedAt) ?? null,
    updatedAt: getString(record.updatedAt) ?? getString(record.updated_at) ?? getString(record.modifiedAt) ?? null,
    tags,
    raw: record,
  };
}

function safelyFormatDate(value: string | null): string {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function parseVariables(rawValue: string): { parsed: Record<string, string>; error: string | null } {
  try {
    const value = JSON.parse(rawValue) as unknown;
    if (!isRecord(value)) return { parsed: {}, error: 'Variables must be a JSON object.' };

    const flattened = Object.entries(value).reduce<Record<string, string>>((accumulator, [key, entry]) => {
      accumulator[key] =
        entry === null || entry === undefined
          ? ''
          : typeof entry === 'string'
            ? entry
            : JSON.stringify(entry);
      return accumulator;
    }, {});
    return { parsed: flattened, error: null };
  } catch {
    return { parsed: {}, error: 'Variables JSON is invalid.' };
  }
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string) => variables[key] ?? match)
    .replace(/\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g, (match, key: string) => variables[key] ?? match);
}

function getPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g) ?? [];
  return Array.from(new Set(matches.map((placeholder) => placeholder.replace(/^\{\{\s*|\s*\}\}$|^\$\{\s*|\s*\}$/g, ''))));
}

export default function DashboardPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);
  const { status, balance, network, transactions } = useAppSelector((state) => state.account);
  const { messages } = useAppSelector((state) => state.chat);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testInput, setTestInput] = useState(DEFAULT_TEST_INPUT);
  const [variablesText, setVariablesText] = useState(DEFAULT_VARIABLES);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    dispatch(loadUser());
    dispatch(getAccountStatus());
    dispatch(getBalance());
    dispatch(getStellarNetworkStatus());
  }, [dispatch, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      dispatch(getAccountTransactions({ userId: user.id, page: currentPage, limit: pageSize }));
    }
  }, [currentPage, dispatch, isAuthenticated, pageSize, user?.id]);

  const loadVersions = async (showRefreshState = false) => {
    if (showRefreshState) setIsRefreshing(true);
    else setIsLoadingVersions(true);

    try {
      setError(null);
      const response = await apiService.getPromptVersions();
      const normalizedVersions = extractVersionRecords(response).map(normalizeVersion);
      setVersions(normalizedVersions);
      setSelectedId((currentSelectedId) =>
        currentSelectedId && normalizedVersions.some((version) => version.id === currentSelectedId)
          ? currentSelectedId
          : normalizedVersions.find((version) => version.isActive)?.id ?? normalizedVersions[0]?.id ?? null,
      );
    } catch (requestError: unknown) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load prompt versions.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoadingVersions(false);
      setIsRefreshing(false);
    }
  }, [dispatch, user?.id, currentPage, pageSize]);

  useEffect(() => {
    if (isAuthenticated) void loadVersions();
  }, [isAuthenticated]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedId) ?? versions[0] ?? null,
    [selectedId, versions],
  );
  const activeVersion = useMemo(() => versions.find((version) => version.isActive) ?? null, [versions]);
  const parsedVariables = useMemo(() => {
    const { parsed, error: parseError } = parseVariables(variablesText);
    return {
      variables: { ...parsed, input: testInput, userInput: testInput, user_query: testInput },
      error: parseError,
    };
  }, [testInput, variablesText]);
  const renderedPrompt = useMemo(
    () => selectedVersion ? renderTemplate(selectedVersion.template, parsedVariables.variables) : '',
    [parsedVariables.variables, selectedVersion],
  );
  const unresolvedPlaceholders = useMemo(
    () => selectedVersion
      ? getPlaceholders(selectedVersion.template).filter((placeholder) => parsedVariables.variables[placeholder] === undefined)
      : [],
    [parsedVariables.variables, selectedVersion],
  );

  const handleActivate = async () => {
    if (!selectedVersion || selectedVersion.isActive) return;
    setIsActivating(true);
    try {
      await apiService.activatePromptVersion(selectedVersion.id);
      setVersions((currentVersions) =>
        currentVersions.map((version) => ({ ...version, isActive: version.id === selectedVersion.id })),
      );
      toast.success(`${selectedVersion.label} is now active`);
    } catch (requestError: unknown) {
      toast.error(requestError instanceof Error ? requestError.message : 'Failed to activate the selected version.');
    } finally {
      setIsDeploying(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };
  const quickActions = [
    {
      title: 'Send Payment',
      description: 'Transfer native XLM or custom anchored assets',
      icon: <Send className="h-5 w-5 text-cyan-400" />,
      action: () => router.push('/send'),
    },
    {
      title: 'View Transactions',
      description: 'Check complete ledger history and operations',
      icon: <Coins className="h-5 w-5 text-emerald-400" />,
      action: () => router.push('/transactions'),
    },
    {
      title: 'Manage Contacts',
      description: 'Save Stellar addresses for fast recurring transfers',
      icon: <Users className="h-5 w-5 text-indigo-400" />,
      action: () => router.push('/contacts'),
    },
  ];

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060816] text-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-cyan-400" />
          <p className="mt-4 text-sm text-slate-300">
            Loading your Stellar account...
          </p>
        </div>
      </div>
    );
  }

  const activePublicKey =
    status?.publicKey ||
    status?.address ||
    user?.publicKey ||
    user?.address ||
    '';

  return (
    <ChatLayout>
      <div className="h-full overflow-auto bg-[#060816] text-white">
        <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <section className="grid gap-4 lg:grid-cols-3">
            <Card title={`Welcome back, ${user?.name || 'User'}`} subtitle="Your account overview">
              <p className="text-sm text-gray-300">
                Account {status?.isDeployed ? 'deployed' : 'not deployed'} · {status?.isFunded ? 'funded' : 'awaiting funding'}
              </p>
              {status?.address && (
                <div className="mt-3 flex items-center gap-2">
                  <code className="break-all text-xs">{formatAddress(status.address)}</code>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void copyText(status.address, 'Address')} aria-label="Copy account address">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={() => router.push('/chat')}>Chat with AI</Button>
                <Button type="button" variant="secondary" onClick={() => router.push('/contacts')}>Manage contacts</Button>
      <div className="relative h-full overflow-auto bg-[#060816] text-white">
        {/* Subtle ambient background gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_35%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,1))]" />

        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:48px_48px] opacity-25" />

        <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
          {/* Header and account summary */}
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-widest text-cyan-200">
                  <Activity className="h-3.5 w-3.5" />
                  Stellar Account Dashboard
                </div>

                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Welcome back, {user?.name || 'Stellar Pioneer'}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-300 sm:text-sm">
                  <span className="text-slate-400">Address:</span>

                  <code className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 font-mono text-cyan-300">
                    {formatAddress(activePublicKey)}
                  </code>

                  {activePublicKey && (
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(activePublicKey, 'Stellar address')
                      }
                      className="inline-flex items-center text-xs text-slate-400 transition hover:text-cyan-300"
                      title="Copy full address"
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Copy
                    </button>
                  )}
                </div>
              </div>
            </Card>

            <Card title="Wallet balance" subtitle="Current account balance">
              <div className="flex items-center gap-3">
                <Wallet className="h-6 w-6 text-cyan-300" />
                <span className="text-2xl font-semibold">{balance ? formatTokenAmount(balance.balance, 4, 'STRK') : '0.00 STRK'}</span>
              </div>
            </Card>

            <Card title="Stellar network" subtitle="Live network status">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-400" />
                <span className="capitalize">{network.status}</span>
              </div>
              <p className="mt-2 text-sm text-gray-400">Latest ledger: {network.latestLedger ?? 'Loading...'}</p>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card title="Liquidity pool statistics">
              <LiquidityPoolStats />
            </Card>
            <Card title="Recent activity">
              {messages.length ? (
                <p className="text-gray-300">{messages.length} recent chat message{messages.length === 1 ? '' : 's'}.</p>
              ) : (
                <p className="text-gray-400">No recent activity. Start a conversation with the AI agent.</p>
              )}
              <Button type="button" className="mt-4" onClick={() => router.push('/chat')}>Open chat</Button>
            </Card>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">On-chain transaction history</h2>
                <p className="text-sm text-gray-400">Recent transactions for your account.</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setCurrentPage(1)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
              {/* Network and balance */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center space-x-2 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      network.status === 'healthy'
                        ? 'animate-pulse bg-emerald-400'
                        : network.status === 'degraded'
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                    }`}
                  />

                  <div className="text-left">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">
                      Horizon Network
                    </p>
                    <p className="text-xs font-medium capitalize text-slate-200">
                      {network.status || 'Checking...'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 rounded-2xl border border-cyan-500/20 bg-cyan-950/30 px-5 py-2.5">
                  <div className="rounded-xl bg-cyan-500/20 p-2 text-cyan-300">
                    <Wallet className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase text-cyan-300/80">
                      Native Balance
                    </p>
                    <p className="font-mono text-lg font-bold text-white">
                      {balance?.nativeBalance ||
                        balance?.balance ||
                        '10,000.00'}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        XLM
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Account lifecycle and setup progress */}
          <section className="space-y-4">
            <h2 className="flex items-center text-lg font-semibold tracking-tight text-white">
              <ShieldCheck className="mr-2 h-5 w-5 text-cyan-400" />
              Account Status &amp; Readiness
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Step 1: Created */}
              <Card className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 backdrop-blur-md">
                <div className="mb-2 flex items-center space-x-3">
                  <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-2 text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-white">
                    1. Keypair Initialized
                  </h3>
                </div>

                <p className="mb-3 text-xs text-slate-400">
                  Ed25519 public key generated and active in session.
                </p>

                <div className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  Active
                </div>
              </Card>

              {/* Step 2: Funded */}
              <Card
                className={`rounded-2xl border p-5 transition-all ${
                  status?.isFunded
                    ? 'border-emerald-500/30 bg-emerald-950/20'
                    : 'border-white/10 bg-slate-900/50'
                }`}
              >
                <div className="mb-2 flex items-center space-x-3">
                  <div
                    className={`rounded-xl border p-2 ${
                      status?.isFunded
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                        : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    <Coins className="h-5 w-5" />
                  </div>

                  <h3 className="text-base font-semibold text-white">
                    2. Account Funded
                  </h3>
                </div>

                <p className="mb-3 text-xs text-slate-400">
                  Account has sufficient XLM balance for transaction reserves.
                </p>

                {status?.isFunded ? (
                  <div className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Funded
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleManualFund}
                    disabled={isFunding}
                    className="border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 hover:text-white"
                  >
                    {isFunding ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Coins className="mr-1 h-3 w-3" />
                    )}
                    Fund via Friendbot
                  </Button>
                )}
              </Card>

              {/* Step 3: Deployed */}
              <Card
                className={`rounded-2xl border p-5 transition-all ${
                  status?.isDeployed
                    ? 'border-cyan-500/30 bg-cyan-950/20'
                    : status?.isFunded
                      ? 'border-indigo-500/30 bg-indigo-950/20'
                      : 'border-white/10 bg-slate-900/50 opacity-60'
                }`}
              >
                <div className="mb-2 flex items-center space-x-3">
                  <div
                    className={`rounded-xl border p-2 ${
                      status?.isDeployed
                        ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'
                        : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400'
                    }`}
                  >
                    <Zap className="h-5 w-5" />
                  </div>

                  <h3 className="text-base font-semibold text-white">
                    3. Contract Deployed
                  </h3>
                </div>

                <p className="mb-3 text-xs text-slate-400">
                  Soroban smart contract account deployed and DeFi-ready.
                </p>

                {status?.isDeployed ? (
                  <div className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-400">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Deployed
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleManualDeploy}
                    disabled={isDeploying || !status?.isFunded}
                    className="border border-cyan-500/30 bg-cyan-500/10 text-xs text-cyan-300 hover:text-white"
                  >
                    {isDeploying ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="mr-1 h-3 w-3" />
                    )}
                    Deploy Account
                  </Button>
                )}
              </Card>
            </div>
          </section>

          {/* Deployment progress */}
          {showDeploymentStepper && (
            <Card className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl">
              <DeploymentStepper progress={progress} />

              <div className="mt-4 flex justify-end space-x-3 border-t border-white/10 pt-4">
                <Button
                  variant="ghost"
                  onClick={() => setShowDeploymentStepper(false)}
                  className="border border-white/10"
                >
                  Close
                </Button>
              </div>
            </Card>
          )}

          {/* Quick actions */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Quick Actions
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {quickActions.map((action) => (
                <Card
                  key={action.title}
                  onClick={action.action}
                  className="group cursor-pointer rounded-2xl border border-white/10 bg-slate-900/50 p-5 transition-all hover:border-cyan-500/40 hover:bg-slate-900/80"
                >
                  <div className="flex items-start justify-between">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 transition group-hover:border-cyan-500/30">
                      {action.icon}
                    </div>

                    <ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-1 group-hover:text-cyan-400" />
                  </div>

                  <h3 className="mt-4 text-base font-semibold text-white">
                    {action.title}
                  </h3>

                  <p className="mt-1 text-xs text-slate-400">
                    {action.description}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          {/* Stellar asset trustlines */}
          <section>
            <TrustlinesPanel />
          </section>

          {/* Liquidity pool statistics */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center text-lg font-semibold tracking-tight text-white">
                <Droplets className="mr-2 h-5 w-5 text-cyan-400" />
                Liquidity Pool Markets
              </h2>

              <div className="flex items-center space-x-2 rounded-full border border-white/10 bg-slate-900/70 px-3 py-1.5">
                <Activity className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
                <span className="text-xs font-medium text-slate-300">
                  Live SEP-0038 Feeds
                </span>
              </div>
            </div>

            <LiquidityPoolStats />
          </section>

          {/* Recent transaction activity */}
          <section className="space-y-4 pb-12">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-white">
                Ledger Transaction History
              </h2>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/transactions')}
                className="text-xs text-cyan-400 hover:text-cyan-300"
              >
                Full History
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>

            <TransactionTable
              transactions={transactions.transactions}
              isLoading={transactions.isLoading}
              error={transactions.error}
              currentPage={currentPage}
              pageSize={pageSize}
              totalCount={transactions.transactions.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              accountAddress={status?.address}
            />
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-cyan-950/20">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">Prompt version manager</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Inspect versions, simulate template output, and activate the selected prompt.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => void loadVersions(true)} disabled={isRefreshing}>
                {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh versions
              </Button>
            </div>

            {error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
            {isLoadingVersions ? (
              <div className="py-8 text-center text-slate-300">Loading prompt versions...</div>
            ) : versions.length === 0 ? (
              <div className="rounded-xl border border-white/10 p-5 text-sm text-slate-300">
                No prompt versions are available.
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="space-y-3">
                  {versions.map((version) => (
                    <button
                      type="button"
                      key={version.id}
                      onClick={() => setSelectedId(version.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${selectedId === version.id ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-slate-900/60 hover:border-white/30'}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-medium">{version.label}</span>
                        {version.isActive && <span className="text-xs text-emerald-300">Active</span>}
                      </span>
                      <span className="mt-2 block text-xs text-slate-400">{version.description}</span>
                    </button>
                  ))}
                </div>

                {selectedVersion && (
                  <div className="space-y-5">
                    <Card title={selectedVersion.label} subtitle={`Version ${selectedVersion.version} · Created ${safelyFormatDate(selectedVersion.createdAt)}`}>
                      <p className="text-sm text-slate-300">{selectedVersion.description}</p>
                      <p className="mt-2 text-xs text-slate-500">Currently active: {activeVersion?.label ?? 'None'}</p>
                      <Button type="button" className="mt-4" onClick={() => void handleActivate()} disabled={selectedVersion.isActive || isActivating}>
                        {isActivating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {selectedVersion.isActive ? 'Active version' : 'Activate version'}
                      </Button>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block text-sm text-slate-300">
                        Test input
                        <textarea value={testInput} onChange={(event) => setTestInput(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-white" />
                      </label>
                      <label className="block text-sm text-slate-300">
                        Variables (JSON)
                        <textarea value={variablesText} onChange={(event) => setVariablesText(event.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-white" />
                      </label>
                    </div>
                    {parsedVariables.error && <p role="alert" className="text-sm text-amber-300">{parsedVariables.error}</p>}
                    {unresolvedPlaceholders.length > 0 && (
                      <p className="text-sm text-amber-300">Unresolved variables: {unresolvedPlaceholders.join(', ')}</p>
                    )}
                    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-medium">Rendered prompt preview</h3>
                        <Button type="button" variant="ghost" size="sm" onClick={() => void copyText(renderedPrompt, 'Prompt')}>
                          <Clipboard className="mr-2 h-4 w-4" /> Copy
                        </Button>
                      </div>
                      <pre className="whitespace-pre-wrap break-words text-sm text-slate-200">{renderedPrompt || 'No template content available.'}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </ChatLayout>
  );
}
```