"use client";

import { useCompletion } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";

type ReviewSource = "食べログ" | "Google" | "Instagram" | "Retty" | "その他";
type Tone = "casual" | "editorial" | "passionate";
type Language = "korean" | "japanese" | "both";

interface Review {
  id: number;
  source: ReviewSource;
  text: string;
}

type Store = {
  id: string;
  name: string;
  storeInfo: string;
  reviews: { source: string; text: string }[];
  createdAt: string;
  updatedAt: string;
};

type ArticleHistory = {
  id: string;
  storeId: string;
  storeName: string;
  tone: string;
  language: string;
  article: string;
  createdAt: string;
};

type Stats = {
  totalGenerations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  history: { date: string; count: number; costUSD: number }[];
};

type GenCost = { inputTokens: number; outputTokens: number; costUSD: number };

const STORES_KEY = "article-bot-stores";
const HISTORY_KEY = "article-bot-history";
const STATS_KEY = "article-bot-stats";
const MAX_HISTORY = 50;
const USD_TO_JPY = 150;
const INPUT_COST_PER_M = 3;
const OUTPUT_COST_PER_M = 15;
const USAGE_REGEX = /\n__USAGE__:(\d+):(\d+)$/;

const REVIEW_SOURCES: ReviewSource[] = [
  "食べログ",
  "Google",
  "Instagram",
  "Retty",
  "その他",
];

const TONES: { value: Tone; label: string; desc: string }[] = [
  {
    value: "casual",
    label: "カジュアル体験談",
    desc: "友達に話しかけるような親しみやすい口調",
  },
  {
    value: "editorial",
    label: "編集者目線",
    desc: "客観的で洗練された読み物スタイル",
  },
  {
    value: "passionate",
    label: "熱量系",
    desc: "興奮・感動を前面に出した熱い表現",
  },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "korean", label: "한국어" },
  { value: "japanese", label: "日本語" },
  { value: "both", label: "両方" },
];

function calcCostUSD(inputTokens: number, outputTokens: number): number {
  return (inputTokens * INPUT_COST_PER_M + outputTokens * OUTPUT_COST_PER_M) / 1_000_000;
}

function lsGetStores(): Store[] {
  try {
    return JSON.parse(localStorage.getItem(STORES_KEY) || "[]");
  } catch {
    return [];
  }
}

function lsSaveStore(store: Store) {
  const stores = lsGetStores();
  const idx = stores.findIndex((s) => s.id === store.id);
  if (idx >= 0) {
    stores[idx] = store;
  } else {
    stores.push(store);
  }
  localStorage.setItem(STORES_KEY, JSON.stringify(stores));
}

function lsGetHistory(): ArticleHistory[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function lsSaveHistory(entry: ArticleHistory) {
  const history = lsGetHistory();
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function lsGetStats(): Stats {
  const empty: Stats = {
    totalGenerations: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUSD: 0,
    history: [],
  };
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) || "null") ?? empty;
  } catch {
    return empty;
  }
}

function lsAddStats(inputTokens: number, outputTokens: number): Stats {
  const stats = lsGetStats();
  const costUSD = calcCostUSD(inputTokens, outputTokens);
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;

  stats.totalGenerations++;
  stats.totalInputTokens += inputTokens;
  stats.totalOutputTokens += outputTokens;
  stats.totalCostUSD += costUSD;

  const idx = stats.history.findIndex((h) => h.date === date);
  if (idx >= 0) {
    stats.history[idx].count++;
    stats.history[idx].costUSD += costUSD;
  } else {
    stats.history.push({ date, count: 1, costUSD });
    if (stats.history.length > 90) stats.history.shift();
  }

  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  return stats;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [storeName, setStoreName] = useState("");
  const [storeInfo, setStoreInfo] = useState("");
  const [reviews, setReviews] = useState<Review[]>([
    { id: 1, source: "食べログ", text: "" },
    { id: 2, source: "食べログ", text: "" },
    { id: 3, source: "食べログ", text: "" },
  ]);
  const [memo, setMemo] = useState("");
  const [tone, setTone] = useState<Tone>("casual");
  const [language, setLanguage] = useState<Language>("japanese");
  const [nextReviewId, setNextReviewId] = useState(4);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [history, setHistory] = useState<ArticleHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<ArticleHistory | null>(null);
  const [historyCopied, setHistoryCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"text" | "preview">("text");

  const [currentGenCost, setCurrentGenCost] = useState<GenCost | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showStats, setShowStats] = useState(false);

  const pendingHistoryRef = useRef<{
    storeId: string;
    storeName: string;
    tone: Tone;
    language: Language;
  } | null>(null);

  const { completion, isLoading, complete, setCompletion } = useCompletion({
    api: "/api/generate",
    streamProtocol: "text",
  });

  // Strip usage marker from completion for display and copy
  const displayCompletion = completion.replace(USAGE_REGEX, "");

  // For the text tab: convert markdown links to "text: URL" readable format
  const textDisplay = displayCompletion.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    "$1: $2"
  );

  useEffect(() => {
    setStores(lsGetStores());
    setHistory(lsGetHistory());
    setStats(lsGetStats());
  }, []);

  useEffect(() => {
    if (!isLoading && completion && pendingHistoryRef.current) {
      const pending = pendingHistoryRef.current;
      pendingHistoryRef.current = null;

      // Parse usage marker
      const usageMatch = completion.match(USAGE_REGEX);
      const inputTokens = usageMatch ? parseInt(usageMatch[1]) : 0;
      const outputTokens = usageMatch ? parseInt(usageMatch[2]) : 0;

      if (inputTokens > 0 || outputTokens > 0) {
        const costUSD = calcCostUSD(inputTokens, outputTokens);
        setCurrentGenCost({ inputTokens, outputTokens, costUSD });
        const updated = lsAddStats(inputTokens, outputTokens);
        setStats(updated);
      }

      // Save history without the usage marker
      const cleanArticle = completion.replace(USAGE_REGEX, "");
      lsSaveHistory({
        id: crypto.randomUUID(),
        ...pending,
        article: cleanArticle,
        createdAt: new Date().toISOString(),
      });
      setHistory(lsGetHistory());
    }
  }, [isLoading, completion]);

  function addReview() {
    setReviews((prev) => [
      ...prev,
      { id: nextReviewId, source: "食べログ", text: "" },
    ]);
    setNextReviewId((n) => n + 1);
  }

  function removeReview(id: number) {
    setReviews((prev) => prev.filter((r) => r.id !== id));
  }

  function updateReview(id: number, field: "source" | "text", value: string) {
    setReviews((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, [field]: value as ReviewSource } : r
      )
    );
  }

  function selectStore(storeId: string) {
    const store = stores.find((s) => s.id === storeId);
    if (!store) return;
    setSelectedStoreId(storeId);
    setStoreName(store.name);
    setStoreInfo(store.storeInfo);
    const loaded: Review[] = store.reviews.map((r, i) => ({
      id: i + 1,
      source: r.source as ReviewSource,
      text: r.text,
    }));
    while (loaded.length < 3) {
      loaded.push({ id: loaded.length + 1, source: "食べログ", text: "" });
    }
    setReviews(loaded);
    setNextReviewId(loaded.length + 1);
  }

  function saveCurrentStore() {
    if (!selectedStoreId) return;
    const existing = stores.find((s) => s.id === selectedStoreId);
    const now = new Date().toISOString();
    lsSaveStore({
      id: selectedStoreId,
      name: storeName || existing?.name || "店舗",
      storeInfo,
      reviews: reviews
        .filter((r) => r.text.trim())
        .map((r) => ({ source: r.source, text: r.text })),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    setStores(lsGetStores());
  }

  async function handleGenerate() {
    setCompletion("");
    setActiveTab("text");
    setCurrentGenCost(null);
    setStep(3);
    setTimeout(() => {
      outputRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);

    const body = {
      storeInfo,
      reviews: reviews.filter((r) => r.text.trim()),
      memo,
      tone,
      language,
    };
    console.log("[page] sending to API:", body);

    const now = new Date().toISOString();
    let storeId: string;

    if (selectedStoreId) {
      storeId = selectedStoreId;
      const existing = stores.find((s) => s.id === selectedStoreId);
      lsSaveStore({
        id: storeId,
        name: storeName,
        storeInfo,
        reviews: reviews
          .filter((r) => r.text.trim())
          .map((r) => ({ source: r.source, text: r.text })),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
    } else {
      storeId = crypto.randomUUID();
      lsSaveStore({
        id: storeId,
        name: storeName,
        storeInfo,
        reviews: reviews
          .filter((r) => r.text.trim())
          .map((r) => ({ source: r.source, text: r.text })),
        createdAt: now,
        updatedAt: now,
      });
      setSelectedStoreId(storeId);
    }
    setStores(lsGetStores());

    pendingHistoryRef.current = { storeId, storeName: storeName, tone, language };

    await complete("", { body });
  }

  function markdownToHtml(text: string): string {
    function processInlineMd(line: string): string {
      return line
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    }

    return text
      .split("\n")
      .map((line) => {
        const t = line.trim();
        if (!t) return "<br>";
        if (/^# /.test(t)) return `<h1>${processInlineMd(t.slice(2))}</h1>`;
        if (/^## /.test(t)) return `<h2>${processInlineMd(t.slice(3))}</h2>`;
        if (t === "---") return "<hr>";
        if (/^(#\S+ *)+$/.test(t))
          return `<span style="color:#1e88e5">${t}</span><br>`;
        return `${processInlineMd(t)}<br>`;
      })
      .join("\n");
  }

  async function copyToClipboard() {
    if (!displayCompletion) return;
    try {
      const html = markdownToHtml(displayCompletion);
      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([displayCompletion], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob }),
      ]);
    } catch {
      // Fallback to plain text if ClipboardItem is not supported
      await navigator.clipboard.writeText(displayCompletion);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function renderNaverPreview(text: string) {
    function processInline(line: string) {
      return line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link)
          return (
            <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer"
              style={{ color: "#1e88e5", textDecoration: "underline" }}>
              {link[1]}
            </a>
          );
        return <span key={i}>{part}</span>;
      });
    }

    return text.split("\n").map((line, i) => {
      const t = line.trim();
      if (!t) return <div key={i} style={{ height: "12px" }} />;
      if (/^# /.test(t))
        return (
          <h1 key={i} style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", marginBottom: "16px" }}>
            {t.slice(2)}
          </h1>
        );
      if (/^## /.test(t))
        return (
          <h2 key={i} style={{ fontSize: "17px", fontWeight: 700, color: "#1a1a1a", marginTop: "28px", marginBottom: "8px" }}>
            {t.slice(3)}
          </h2>
        );
      if (t === "---")
        return <hr key={i} style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "20px 0" }} />;
      if (/^(#\S+ *)+$/.test(t))
        return (
          <p key={i} style={{ color: "#1e88e5", fontSize: "14px", marginTop: "24px", lineHeight: 1.9 }}>
            {t}
          </p>
        );
      return (
        <p key={i} style={{ fontSize: "15px", color: "#333", marginBottom: "12px", lineHeight: 1.9 }}>
          {processInline(t)}
        </p>
      );
    });
  }

  function getToneLabel(v: string) {
    return TONES.find((t) => t.value === v)?.label ?? v;
  }
  function getLangLabel(v: string) {
    return LANGUAGES.find((l) => l.value === v)?.label ?? v;
  }

  // Stats modal computed values
  const thisMonth = (() => {
    if (!stats) return { count: 0, costUSD: 0 };
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const prefix = `${d.getFullYear()}/${p(d.getMonth() + 1)}/`;
    return stats.history
      .filter((h) => h.date.startsWith(prefix))
      .reduce((acc, h) => ({ count: acc.count + h.count, costUSD: acc.costUSD + h.costUSD }), { count: 0, costUSD: 0 });
  })();

  const last7Days = (() => {
    const days: { label: string; date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const p = (n: number) => String(n).padStart(2, "0");
      const date = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
      const label = `${p(d.getMonth() + 1)}/${p(d.getDate())}`;
      const count = stats?.history.find((h) => h.date === date)?.count ?? 0;
      days.push({ label, date, count });
    }
    return days;
  })();
  const maxDayCount = Math.max(...last7Days.map((d) => d.count), 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Naver블로그 記事ジェネレーター
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              韓国人観光客向けグルメ記事を自動生成
            </p>
          </div>
          <button
            onClick={() => { setStats(lsGetStats()); setShowStats(true); }}
            className="text-2xl hover:opacity-70 transition-opacity"
            title="利用統計"
          >
            📊
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Step 1 */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            className="w-full text-left px-6 py-4 flex items-center justify-between"
            onClick={() => setStep(step === 1 ? 0 : 1)}
          >
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                1
              </span>
              <span className="font-semibold text-gray-800">基本情報を入力</span>
            </div>
            <span className="text-gray-400 text-lg">{step === 1 ? "▲" : "▼"}</span>
          </button>

          {step === 1 && (
            <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">
              {/* Saved stores */}
              <div className="rounded-xl border border-gray-200 p-4 bg-gray-50 space-y-2">
                <p className="text-sm font-medium text-gray-700">保存済み店舗から選ぶ</p>
                {stores.length === 0 ? (
                  <p className="text-sm text-gray-400">保存済みの店舗はありません</p>
                ) : (
                  <>
                    <select
                      value={selectedStoreId ?? ""}
                      onChange={(e) => {
                        if (e.target.value === "") {
                          setSelectedStoreId(null);
                        } else {
                          selectStore(e.target.value);
                        }
                      }}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    >
                      <option value="">（新規作成）</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {selectedStoreId && (
                      <button
                        onClick={saveCurrentStore}
                        className="w-full py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-medium hover:bg-indigo-50 transition-colors"
                      >
                        更新して保存
                      </button>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  店名
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="例：KAMERA、リバーサイドヤオヤ"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  店舗情報を貼り付けてください
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <textarea
                  value={storeInfo}
                  onChange={(e) => setStoreInfo(e.target.value)}
                  placeholder={`店名・住所・営業時間・メニュー・価格帯など\nGoogle マップや食べログのテキストをそのまま貼り付けてOK`}
                  rows={7}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    口コミ
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <button
                    onClick={addReview}
                    className="text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1"
                  >
                    <span className="text-lg leading-none">+</span> 口コミを追加
                  </button>
                </div>

                <div className="space-y-3">
                  {reviews.map((review, index) => (
                    <div
                      key={review.id}
                      className="rounded-xl border border-gray-200 p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <select
                          value={review.source}
                          onChange={(e) =>
                            updateReview(review.id, "source", e.target.value)
                          }
                          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                        >
                          {REVIEW_SOURCES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        {index >= 3 && (
                          <button
                            onClick={() => removeReview(review.id)}
                            className="ml-auto text-sm text-red-400 hover:text-red-600"
                          >
                            削除
                          </button>
                        )}
                      </div>
                      <textarea
                        value={review.text}
                        onChange={(e) =>
                          updateReview(review.id, "text", e.target.value)
                        }
                        placeholder="口コミの内容を貼り付けてください"
                        rows={3}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                      />
                    </div>
                  ))}
                </div>

                {!reviews.slice(0, 3).every((r) => r.text.trim()) && (
                  <p className="text-sm text-red-500 mt-2">
                    口コミを3件以上入力してください
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  取材メモ・補足情報（任意）
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="実際に訪問して感じたこと、こだわり情報、写真の説明など"
                  rows={4}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={
                  !storeName.trim() ||
                  !storeInfo.trim() ||
                  !reviews.slice(0, 3).every((r) => r.text.trim())
                }
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                次へ：記事スタイルを選ぶ →
              </button>
            </div>
          )}
        </section>

        {/* Step 2 */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            className="w-full text-left px-6 py-4 flex items-center justify-between"
            onClick={() => setStep(step === 2 ? 0 : 2)}
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0 ${
                  step >= 2
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                2
              </span>
              <span className="font-semibold text-gray-800">
                記事スタイルを選ぶ
              </span>
            </div>
            <span className="text-gray-400 text-lg">{step === 2 ? "▲" : "▼"}</span>
          </button>

          {step === 2 && (
            <div className="px-6 pb-6 space-y-5 border-t border-gray-100 pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  記事のトーン
                </label>
                <div className="space-y-2">
                  {TONES.map((t) => (
                    <label
                      key={t.value}
                      className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
                        tone === t.value
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="tone"
                        value={t.value}
                        checked={tone === t.value}
                        onChange={() => setTone(t.value)}
                        className="mt-0.5 accent-indigo-600"
                      />
                      <div>
                        <p className="font-medium text-sm text-gray-800">
                          {t.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  出力言語
                </label>
                <div className="flex gap-2">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => setLanguage(l.value)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                        language === l.value
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!storeInfo.trim() || isLoading}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "生成中..." : "記事を生成する ✨"}
              </button>
            </div>
          )}
        </section>

        {/* Step 3 - Output */}
        {(step === 3 || completion) && (
          <section
            ref={outputRef}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span
                  className={`w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0 ${
                    completion
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  3
                </span>
                <span className="font-semibold text-gray-800">
                  生成された記事
                </span>
              </div>
              {displayCompletion && !isLoading && (
                <button
                  onClick={copyToClipboard}
                  className="text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-lg"
                >
                  {copied ? "✓ コピー済み" : "📋 コピー"}
                </button>
              )}
            </div>

            {/* Tabs — appear only after streaming finishes */}
            {displayCompletion && !isLoading && (
              <div className="flex border-b border-gray-100">
                {(["text", "preview"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? "text-indigo-600 border-b-2 border-indigo-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab === "text" ? "テキスト" : "Naverプレビュー"}
                  </button>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="px-6 py-5">
              {isLoading && !completion && (
                <div className="flex items-center gap-3 text-gray-500">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-sm">記事を生成しています...</span>
                </div>
              )}

              {/* Text tab (also shown during streaming) */}
              {completion && (isLoading || activeTab === "text") && (
                <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
                  {textDisplay}
                  {isLoading && (
                    <span className="inline-block w-1.5 h-4 bg-indigo-500 ml-0.5 animate-pulse" />
                  )}
                </div>
              )}

              {/* Naver preview tab */}
              {displayCompletion && !isLoading && activeTab === "preview" && (
                <>
                  <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');`}</style>
                  <div
                    style={{
                      fontFamily: "'Noto Sans KR', sans-serif",
                      maxWidth: "680px",
                      margin: "0 auto",
                      background: "#fff",
                      lineHeight: 1.9,
                    }}
                  >
                    {renderNaverPreview(displayCompletion)}
                  </div>
                </>
              )}
            </div>

            {/* Token cost summary */}
            {currentGenCost && !isLoading && (
              <div className="px-6 pb-2">
                <p className="text-xs text-gray-400">
                  今回：入力 {currentGenCost.inputTokens.toLocaleString()} tokens / 出力 {currentGenCost.outputTokens.toLocaleString()} tokens / 約¥{Math.ceil(currentGenCost.costUSD * USD_TO_JPY)}
                  {stats && stats.totalGenerations > 0 && (
                    <> | 累計：{stats.totalGenerations}回 / 約¥{Math.ceil(stats.totalCostUSD * USD_TO_JPY).toLocaleString()}</>
                  )}
                </p>
              </div>
            )}

            {displayCompletion && !isLoading && (
              <div className="px-6 pb-5 space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors"
                  >
                    {copied ? "✓ コピーしました" : "📋 記事をコピー"}
                  </button>
                  <button
                    onClick={() => {
                      setCompletion("");
                      setStep(2);
                    }}
                    className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    再生成
                  </button>
                </div>
                <button
                  onClick={() => {
                    setHistory(lsGetHistory());
                    setViewingHistory(null);
                    setShowHistory(true);
                  }}
                  className="w-full py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  履歴を見る
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* History Modal */}
      {showHistory && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowHistory(false);
              setViewingHistory(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="font-semibold text-gray-800">生成履歴</h2>
              <button
                onClick={() => {
                  setShowHistory(false);
                  setViewingHistory(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {viewingHistory ? (
              <>
                <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0">
                  <button
                    onClick={() => setViewingHistory(null)}
                    className="text-indigo-600 text-sm hover:text-indigo-800"
                  >
                    ← 一覧に戻る
                  </button>
                  <p className="text-xs text-gray-500 mt-1">
                    {viewingHistory.storeName} · {getToneLabel(viewingHistory.tone)} · {getLangLabel(viewingHistory.language)} · {formatDateTime(viewingHistory.createdAt)}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
                    {viewingHistory.article}
                  </p>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(viewingHistory.article);
                      setHistoryCopied(true);
                      setTimeout(() => setHistoryCopied(false), 2000);
                    }}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                  >
                    {historyCopied ? "✓ コピーしました" : "📋 この記事をコピー"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {history.length === 0 ? (
                  <div className="px-6 py-10 text-center text-gray-400 text-sm">
                    履歴はありません
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {history.map((entry) => (
                      <li key={entry.id}>
                        <button
                          className="w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                          onClick={() => setViewingHistory(entry)}
                        >
                          <p className="font-medium text-sm text-gray-800">
                            {entry.storeName}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {getToneLabel(entry.tone)} · {getLangLabel(entry.language)} · {formatDateTime(entry.createdAt)}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStats && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowStats(false);
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="font-semibold text-gray-800">利用統計</h2>
              <button
                onClick={() => setShowStats(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Totals */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">累計</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {stats?.totalGenerations ?? 0}
                      <span className="text-sm font-normal text-gray-500 ml-1">回</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">生成回数</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      ¥{Math.ceil((stats?.totalCostUSD ?? 0) * USD_TO_JPY).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      ${((stats?.totalCostUSD ?? 0)).toFixed(4)} USD
                    </p>
                  </div>
                </div>
              </div>

              {/* This month */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">今月</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {thisMonth.count}
                      <span className="text-sm font-normal text-gray-500 ml-1">回</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">生成回数</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-2xl font-bold text-gray-900">
                      ¥{Math.ceil(thisMonth.costUSD * USD_TO_JPY).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      ${thisMonth.costUSD.toFixed(4)} USD
                    </p>
                  </div>
                </div>
              </div>

              {/* Last 7 days bar chart */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">直近7日間の生成回数</p>
                <div className="space-y-2">
                  {last7Days.map(({ label, count }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-10 shrink-0 text-right">{label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                        <div
                          className="bg-indigo-400 h-full rounded-full transition-all duration-300"
                          style={{ width: `${(count / maxDayCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-4 text-right shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
