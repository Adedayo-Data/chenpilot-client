"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/store";
import { getTransactionHistory } from "@/store/slices/accountSlice";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { formatDate, formatTokenAmount } from "@/utils/format";
import { RefreshCw, ReceiptText } from "lucide-react";

// ---------------------------------------------------------------------------
// Memo rendering helpers
// ---------------------------------------------------------------------------

/** Truncation limit for displayed memo values; full text is kept in title. */
const MEMO_TRUNCATE_LEN = 40;

function truncateMemo(value: string): string {
  return value.length > MEMO_TRUNCATE_LEN
    ? `${value.slice(0, MEMO_TRUNCATE_LEN)}…`
    : value;
}

type MemoType = "text" | "id" | "hash" | "return" | undefined;

function MemoDisplay({
  memo,
  memoType,
}: {
  memo: string | undefined;
  memoType: MemoType;
}) {
  if (!memo || !memoType) return null;

  const label: Record<NonNullable<MemoType>, string> = {
    text: "Text",
    id: "ID",
    hash: "Hash",
    return: "Return",
  };

  const tag = label[memoType] ?? memoType.toUpperCase();

  return (
    <div className="mt-2 flex items-start gap-2 text-xs">
      <span className="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 font-mono uppercase tracking-wide text-gray-300">
        {tag}
      </span>
      <span
        className="truncate text-gray-400"
        title={memo}
      >
        {truncateMemo(memo)}
      </span>
    </div>
  );
}

export default function TransactionsPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { status, transactions } = useSelector(
    (state: RootState) => state.account,
  );

  useEffect(() => {
    if (status?.publicKey) {
      dispatch(getTransactionHistory(status.publicKey));
    }
  }, [dispatch, status?.publicKey]);

  const getStatusColor = (successful: boolean) => {
    return successful ? "text-green-600" : "text-red-600";
  };

  const getOperationType = (type: string) => {
    switch (type) {
      case "create_account":
        return "Funding";
      case "payment":
        return "Payment";
      case "trust":
        return "Trust";
      default:
        return type.replace("_", " ").toUpperCase();
    }
  };

  if (transactions.isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Transaction History</h1>
        <div className="text-center">Loading transactions...</div>
      </div>
    );
  }

  if (transactions.error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Transaction History</h1>
        <Card className="border-red-200 dark:border-red-900">
          <div role="alert" className="space-y-4">
            <p className="text-red-700 dark:text-red-300">Error: {transactions.error}</p>
            {status?.publicKey && (
              <Button
                type="button"
                onClick={() => dispatch(getTransactionHistory(status.publicKey))}
                className="inline-flex items-center gap-2"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                Retry
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Transaction History</h1>

      {transactions.transactions.length === 0 ? (
        <EmptyState
          icon={<ReceiptText aria-hidden="true" className="h-8 w-8" />}
          title="No transactions yet"
          description="Your completed transactions will appear here. Start with a wallet transfer or payment."
          action={{ label: "Go to dashboard", onClick: () => router.push("/dashboard") }}
        />
      ) : (
        <div className="space-y-4">
          {transactions.transactions.map((tx) => (
            <Card key={tx.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold">
                    Transaction {tx.hash.slice(0, 8)}...
                  </h3>
                  <p className="text-sm text-gray-600">
                    {formatDate(tx.created_at)}
                  </p>
                </div>
                <div
                  className={`font-semibold ${getStatusColor(tx.successful)}`}
                >
                  {tx.successful ? "Confirmed" : "Failed"}
                </div>
              </div>

              <div className="space-y-2">
                {tx.operations.map((op) => (
                  <div
                    key={op.id}
                    className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded"
                  >
                    <div>
                      <span className="font-medium">
                        {getOperationType(op.type)}
                      </span>
                      {op.amount && (
                        <span className="ml-2 text-sm">
                          {formatTokenAmount(op.amount)} {op.asset || "XLM"}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {op.to && `To: ${op.to.slice(0, 8)}...`}
                      {op.from && `From: ${op.from.slice(0, 8)}...`}
                    </div>
                  </div>
                ))}
              </div>

              {/* Memo — rendered only when present; distinct styles per type */}
              <MemoDisplay memo={tx.memo} memoType={tx.memo_type} />

              <div className="mt-2 text-xs text-gray-500">
                Fee: {formatTokenAmount(tx.fee_charged)} XLM | Ledger:{" "}
                {tx.ledger}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
