import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  Leaf,
  LoaderCircle,
  MailSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";

type Money = {
  currency: string;
  amount: number;
};

type Subscription = {
  service_name: string;
  amount: number | null;
  currency: string | null;
  billed_at: string | null;
  billing_cycle: "monthly" | "yearly" | "unknown";
  source: "rule" | "ai";
  confidence: number;
  estimated_monthly_amount: number | null;
};

type ScanPayload = {
  subscriptions: Subscription[];
  summary: {
    monthly_totals: Money[];
    annual_savings_potential: Money[];
  };
  scanned_messages: number;
  ai_analyzed_messages: number;
  warnings: string[];
};

type ScanMessage =
  | {
      type: "subscription-scan-result";
      ok: true;
      payload: ScanPayload;
    }
  | {
      type: "subscription-scan-result";
      ok: false;
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isMoney(value: unknown): value is Money {
  return (
    isRecord(value) &&
    typeof value.currency === "string" &&
    isFiniteNumber(value.amount)
  );
}

function isSubscription(value: unknown): value is Subscription {
  return (
    isRecord(value) &&
    typeof value.service_name === "string" &&
    isNullableNumber(value.amount) &&
    isNullableString(value.currency) &&
    isNullableString(value.billed_at) &&
    ["monthly", "yearly", "unknown"].includes(
      value.billing_cycle as string,
    ) &&
    ["rule", "ai"].includes(value.source as string) &&
    isFiniteNumber(value.confidence) &&
    isNullableNumber(value.estimated_monthly_amount)
  );
}

function isScanPayload(value: unknown): value is ScanPayload {
  return (
    isRecord(value) &&
    Array.isArray(value.subscriptions) &&
    value.subscriptions.every(isSubscription) &&
    isRecord(value.summary) &&
    Array.isArray(value.summary.monthly_totals) &&
    value.summary.monthly_totals.every(isMoney) &&
    Array.isArray(value.summary.annual_savings_potential) &&
    value.summary.annual_savings_potential.every(isMoney) &&
    isFiniteNumber(value.scanned_messages) &&
    isFiniteNumber(value.ai_analyzed_messages) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  );
}

function isScanMessage(value: unknown): value is ScanMessage {
  if (
    !isRecord(value) ||
    value.type !== "subscription-scan-result" ||
    typeof value.ok !== "boolean"
  ) {
    return false;
  }
  return value.ok
    ? isScanPayload(value.payload)
    : typeof value.error === "string";
}

function configuredApiUrl() {
  return (import.meta.env.VITE_SUBSCRIPTION_SCANNER_API_URL ?? "")
    .trim()
    .replace(/\/$/, "");
}

function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function formatMoney({ amount, currency }: Money) {
  try {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("ja-JP")} ${currency}`;
  }
}

function formatTotals(values: Money[]) {
  return values.length > 0 ? values.map(formatMoney).join(" + ") : "—";
}

function formatDate(value: string | null) {
  if (!value) return "請求日不明";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(date);
}

const cycleLabels = {
  monthly: "月額",
  yearly: "年額",
  unknown: "周期不明",
} as const;

const SCAN_TIMEOUT_MS = 180_000;

export default function SubscriptionScanner() {
  const [result, setResult] = useState<ScanPayload | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");
  const popupRef = useRef<Window | null>(null);
  const apiUrl = configuredApiUrl();
  const apiOrigin = originOf(apiUrl);

  useEffect(() => {
    const receiveResult = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== apiOrigin ||
        event.source !== popupRef.current ||
        !isScanMessage(event.data)
      ) {
        return;
      }

      popupRef.current = null;
      setIsScanning(false);
      if (event.data.ok) {
        setResult(event.data.payload);
        setError("");
      } else {
        setError(event.data.error || "Gmailを確認できませんでした。");
      }
    };

    window.addEventListener("message", receiveResult);
    return () => window.removeEventListener("message", receiveResult);
  }, [apiOrigin]);

  useEffect(() => {
    if (!isScanning) return;
    const timer = window.setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setIsScanning(false);
        setError("Google連携画面が閉じられました。もう一度お試しください。");
      }
    }, 500);
    const timeout = window.setTimeout(() => {
      popupRef.current?.close();
      popupRef.current = null;
      setIsScanning(false);
      setError("Google連携がタイムアウトしました。もう一度お試しください。");
    }, SCAN_TIMEOUT_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [isScanning]);

  const startScan = () => {
    if (!apiOrigin) {
      setError("スキャンAPIが設定されていません。");
      return;
    }

    setError("");
    setResult(null);
    setIsScanning(true);
    const popup = window.open(
      `${apiUrl}/oauth/start?origin=${encodeURIComponent(window.location.origin)}&mode=popup`,
      "subscription-scanner-oauth",
      "popup,width=560,height=760",
    );
    if (!popup) {
      setIsScanning(false);
      setError("Google連携画面を開けませんでした。ポップアップを許可してください。");
      return;
    }
    popupRef.current = popup;
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#f3f8f3] text-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_20%_10%,rgba(52,211,153,0.24),transparent_38%),radial-gradient(circle_at_85%_25%,rgba(34,211,238,0.18),transparent_32%)]" />

      <header className="relative mx-auto max-w-6xl px-5 pb-10 pt-5 sm:px-8">
        <Link
          href="/"
          className="text-sm font-semibold text-slate-500 transition hover:text-emerald-700"
        >
          ← トップに戻る
        </Link>
        <div className="mt-12 grid items-end gap-8 lg:grid-cols-[1fr_360px]">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-xs font-bold tracking-[0.14em] text-emerald-800 shadow-sm backdrop-blur">
              <Leaf className="h-4 w-4" aria-hidden="true" />
              SUSTAINABLE SUBSCRIPTION CHECK
            </div>
            <h1 className="text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
              忘れていた固定費を、
              <span className="text-emerald-700">未来の余白</span>に。
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              Googleアカウントを一度連携するだけ。過去1年の請求・領収書メールから、
              継続中と思われるサブスクを自動で見つけます。
            </p>
          </div>

          <div className="rounded-3xl border border-white/80 bg-white/80 p-5 shadow-[0_18px_60px_rgba(15,118,110,0.10)] backdrop-blur">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
              <div>
                <p className="font-bold">読み取り専用・アプリ保存なし</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  トークンや本文を本アプリのDBへ保存しません。未判定メールの本文の一部はOpenAIで解析します。
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl sm:p-8">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                <MailSearch className="h-5 w-5" aria-hidden="true" />
                Gmailから自動発見
              </p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                手入力なしで、今すぐチェック
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                請求・領収書・更新通知を検索し、金額と請求周期を推定します。
              </p>
            </div>
            <button
              type="button"
              onClick={startScan}
              disabled={isScanning}
              className="inline-flex min-w-64 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-4 font-black text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-70"
            >
              {isScanning ? (
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              )}
              {isScanning ? "Gmailを確認しています…" : "Googleと連携して自動チェック"}
            </button>
          </div>

          {isScanning && (
            <div role="status" className="mt-6 rounded-2xl border border-emerald-900 bg-emerald-950/50 px-5 py-4 text-sm leading-6 text-emerald-100">
              Google連携画面で許可すると、過去1年のメールを走査します。この画面は閉じずにお待ちください。
            </div>
          )}
          {error && (
            <p role="alert" className="mt-6 rounded-2xl border border-rose-800 bg-rose-950/60 px-5 py-4 text-sm leading-6 text-rose-100">
              {error}
            </p>
          )}
        </section>

        {!result && !isScanning && (
          <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="利用の流れ">
            {[
              ["01", "Googleと連携", "Gmailの読み取り専用権限だけを許可します。"],
              ["02", "請求メールを探索", "過去1年の請求や更新通知を自動で見つけます。"],
              ["03", "一覧で見直す", "月額換算と年間の見直し余地を確認できます。"],
            ].map(([number, title, description]) => (
              <article key={number} className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
                <p className="font-mono text-sm font-black text-emerald-600">{number}</p>
                <h2 className="mt-3 text-lg font-black">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
              </article>
            ))}
          </section>
        )}

        {result && (
          <section className="mt-8" aria-labelledby="scan-results-heading" aria-live="polite">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-bold text-emerald-700">SCAN COMPLETE</p>
                <h2 id="scan-results-heading" className="mt-1 text-3xl font-black">
                  {result.subscriptions.length}件のサブスク候補
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {result.scanned_messages}通を確認 / AI判定 {result.ai_analyzed_messages}通
                </p>
              </div>
              <button
                type="button"
                onClick={startScan}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-emerald-500 hover:text-emerald-700"
              >
                もう一度チェック
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <article className="rounded-3xl bg-emerald-700 p-6 text-white shadow-lg shadow-emerald-900/10">
                <CircleDollarSign className="h-6 w-6 text-emerald-200" aria-hidden="true" />
                <p className="mt-5 text-sm font-bold text-emerald-100">推定月額合計</p>
                <p className="mt-1 text-3xl font-black">
                  {formatTotals(result.summary.monthly_totals)}
                </p>
              </article>
              <article className="rounded-3xl bg-cyan-950 p-6 text-white shadow-lg shadow-cyan-950/10">
                <Leaf className="h-6 w-6 text-cyan-300" aria-hidden="true" />
                <p className="mt-5 text-sm font-bold text-cyan-100">年間の見直し余地</p>
                <p className="mt-1 text-3xl font-black">
                  {formatTotals(result.summary.annual_savings_potential)}
                </p>
              </article>
            </div>

            {result.warnings.length > 0 && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                <p className="font-bold">一部を判定できませんでした</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.subscriptions.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-emerald-100 bg-white p-10 text-center shadow-sm">
                <Leaf className="mx-auto h-10 w-10 text-emerald-500" aria-hidden="true" />
                <p className="mt-4 text-lg font-black">サブスク候補は見つかりませんでした</p>
                <p className="mt-2 text-sm text-slate-500">新しい請求メールが届いたら、もう一度確認してみてください。</p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {result.subscriptions.map((subscription, index) => (
                  <article
                    key={`${subscription.service_name}-${subscription.billed_at}-${index}`}
                    className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-black">{subscription.service_name}</h3>
                        <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                          <CalendarDays className="h-4 w-4" aria-hidden="true" />
                          {formatDate(subscription.billed_at)}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                        {cycleLabels[subscription.billing_cycle]}
                      </span>
                    </div>

                    <div className="mt-6 flex items-end justify-between gap-4 border-t border-slate-100 pt-5">
                      <div>
                        <p className="text-xs font-bold text-slate-400">直近の請求</p>
                        <p className="mt-1 text-2xl font-black">
                          {subscription.amount !== null && subscription.currency
                            ? formatMoney({ amount: subscription.amount, currency: subscription.currency })
                            : "金額不明"}
                        </p>
                        {subscription.estimated_monthly_amount !== null && subscription.currency && (
                          <p className="mt-1 text-xs text-slate-500">
                            月額換算 {formatMoney({ amount: subscription.estimated_monthly_amount, currency: subscription.currency })}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        <p>{subscription.source === "rule" ? "既知サービス判定" : "AI判定"}</p>
                        <p className="mt-1">確度 {Math.round(subscription.confidence * 100)}%</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
