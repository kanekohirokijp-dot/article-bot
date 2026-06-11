"use client";

import { useCompletion } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";

type Tone = "casual" | "editorial" | "passionate";
type Language = "korean" | "japanese" | "both";
type ArticleMode = "intro" | "menu";

interface Review {
  id: number;
  text: string;
}

type Store = {
  id: string;
  name: string;
  storeInfo: string;
  reviews: { text: string }[];
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

const TONES: { value: Tone; label: string; desc: string }[] = [
  {
    value: "casual",
    label: "CASUAL",
    desc: "友達に話しかけるような親しみやすい口調",
  },
  {
    value: "editorial",
    label: "EDITORIAL",
    desc: "客観的で洗練された読み物スタイル",
  },
  {
    value: "passionate",
    label: "HYPE",
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

function lsDeleteStore(id: string) {
  const stores = lsGetStores().filter((s) => s.id !== id);
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
  const [articleMode, setArticleMode] = useState<ArticleMode>("intro");
  const [menuStoreName, setMenuStoreName] = useState("");
  const [menuInfo, setMenuInfo] = useState("");
  const [menuStoreInfo, setMenuStoreInfo] = useState("");
  const [menuArticleUrl, setMenuArticleUrl] = useState("");

  const [step, setStep] = useState(1);
  const [storeName, setStoreName] = useState("");
  const [storeInfo, setStoreInfo] = useState("");
  const [reviews, setReviews] = useState<Review[]>([
    { id: 1, text: "" },
    { id: 2, text: "" },
    { id: 3, text: "" },
  ]);
  const [memo, setMemo] = useState("");
  const [tone, setTone] = useState<Tone>("casual");
  const [language, setLanguage] = useState<Language>("japanese");
  const [nextReviewId, setNextReviewId] = useState(4);
  const [copied, setCopied] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const [photoUrl, setPhotoUrl] = useState("");

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
  const [showToast, setShowToast] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const wasLoadingRef = useRef(false);
  const pendingHistoryRef = useRef<{
    storeId: string;
    storeName: string;
    tone: string;
    language: Language;
  } | null>(null);

  const { completion: introCompletion, isLoading: introIsLoading, complete: introComplete, setCompletion: setIntroCompletion } = useCompletion({
    api: "/api/generate",
    streamProtocol: "text",
  });

  const { completion: menuCompletion, isLoading: menuIsLoading, complete: menuComplete, setCompletion: setMenuCompletion } = useCompletion({
    api: "/api/menu",
    streamProtocol: "text",
  });

  const completion = articleMode === "intro" ? introCompletion : menuCompletion;
  const isLoading = articleMode === "intro" ? introIsLoading : menuIsLoading;
  const setCompletion = (v: string) => {
    if (articleMode === "intro") setIntroCompletion(v);
    else setMenuCompletion(v);
  };

  // Strip usage marker from completion for display and copy
  const displayCompletion = completion.replace(USAGE_REGEX, "");

  // Parse title candidates section and body from the AI output
  // Supports both 【タイトル候補】(Japanese) and 【타이틀 후보】(Korean)
  const parsedArticle = (() => {
    const text = displayCompletion;

    // Detect title section header (both Japanese and Korean variants)
    const jaIdx = text.indexOf("【タイトル候補】");
    const koIdx = text.indexOf("【타이틀 후보】");
    let titleStart = -1;
    if (jaIdx !== -1 && koIdx !== -1) titleStart = Math.min(jaIdx, koIdx);
    else if (jaIdx !== -1) titleStart = jaIdx;
    else if (koIdx !== -1) titleStart = koIdx;

    if (titleStart === -1) return { titles: [] as { label: string; text: string }[], body: text };

    const afterTitle = text.slice(titleStart);

    // Detect separator: strict "---" line first, then "---" at start of line with optional trailing text
    let sepMatch = afterTitle.match(/^-{3}\s*$/m);
    if (!sepMatch) sepMatch = afterTitle.match(/^-{3,}[^\n]*/m);

    let titleSection: string;
    let body: string;

    if (sepMatch && sepMatch.index != null) {
      titleSection = afterTitle.slice(0, sepMatch.index);
      body = afterTitle.slice(sepMatch.index + sepMatch[0].length).replace(/^\r?\n/, "");
    } else {
      // Fallback: use end of last A/B/C title line as split point
      const allTitleMatches = [...afterTitle.matchAll(/^([A-C])\.\s*.+$/gm)];
      if (allTitleMatches.length === 0) return { titles: [] as { label: string; text: string }[], body: text };
      const lastMatch = allTitleMatches[allTitleMatches.length - 1];
      const lastEnd = (lastMatch.index ?? 0) + lastMatch[0].length;
      titleSection = afterTitle.slice(0, lastEnd);
      body = afterTitle.slice(lastEnd).replace(/^\r?\n+/, "");
    }

    const titles: { label: string; text: string }[] = [];
    for (const m of titleSection.matchAll(/^([A-C])\.\s*(.+)$/gm)) {
      titles.push({ label: m[1], text: m[2].trim() });
    }

    return { titles, body };
  })();

  // For menu mode: parse fixed title (first line) and body (after first ---)
  const menuFixedTitle = (() => {
    if (articleMode !== "menu" || !displayCompletion) return null;
    const text = displayCompletion;
    const firstLine = text.split("\n").find((l) => l.trim());
    if (!firstLine) return null;
    const sepMatch = text.match(/^-{3}\s*$/m);
    if (!sepMatch || sepMatch.index == null) return { title: firstLine.trim(), body: text };
    const body = text.slice(sepMatch.index + sepMatch[0].length).replace(/^\r?\n/, "");
    return { title: firstLine.trim(), body };
  })();

  // For the text tab: convert markdown links to "text: URL" readable format
  const textDisplay = displayCompletion.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    "$1: $2"
  );

  // Body-only version for text tab after streaming (excludes title section)
  const textBodyDisplay = (() => {
    const body = (articleMode === "menu" && menuFixedTitle)
      ? menuFixedTitle.body
      : parsedArticle.body;
    return body.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2");
  })();

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

  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && completion) {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, completion]);

  function addReview() {
    setReviews((prev) => [
      ...prev,
      { id: nextReviewId, text: "" },
    ]);
    setNextReviewId((n) => n + 1);
  }

  function removeReview(id: number) {
    setReviews((prev) => prev.filter((r) => r.id !== id));
  }

  function updateReview(id: number, value: string) {
    setReviews((prev) =>
      prev.map((r) => r.id === id ? { ...r, text: value } : r)
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
      text: r.text,
    }));
    while (loaded.length < 3) {
      loaded.push({ id: loaded.length + 1, text: "" });
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
        .map((r) => ({ text: r.text })),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    setStores(lsGetStores());
  }

  function deleteCurrentStore() {
    if (!selectedStoreId) return;
    lsDeleteStore(selectedStoreId);
    setStores(lsGetStores());
    setSelectedStoreId(null);
    setStoreName("");
    setStoreInfo("");
    setReviews([
      { id: 1, text: "" },
      { id: 2, text: "" },
      { id: 3, text: "" },
    ]);
    setNextReviewId(4);
    setShowDeleteConfirm(false);
  }

  async function handleGenerate() {
    setIntroCompletion("");
    setActiveTab("text");
    setCurrentGenCost(null);
    setCopiedTitle(null);
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
      photoUrl,
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
          .map((r) => ({ text: r.text })),
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
          .map((r) => ({ text: r.text })),
        createdAt: now,
        updatedAt: now,
      });
      setSelectedStoreId(storeId);
    }
    setStores(lsGetStores());

    pendingHistoryRef.current = { storeId, storeName: storeName, tone, language };

    await introComplete("", { body });
  }

  async function handleMenuGenerate() {
    setMenuCompletion("");
    setActiveTab("text");
    setCurrentGenCost(null);
    setCopiedTitle(null);
    setStep(3);
    setTimeout(() => {
      outputRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);

    const storeId = "menu-" + crypto.randomUUID();
    pendingHistoryRef.current = { storeId, storeName: menuStoreName, tone: "menu", language: "korean" };

    await menuComplete("", { body: { menuStoreName, menuInfo, menuStoreInfo, menuArticleUrl } });
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
    const body = (articleMode === "menu" && menuFixedTitle?.body) || parsedArticle.body || displayCompletion;
    if (!body) return;
    try {
      const html = markdownToHtml(body);
      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([body], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob }),
      ]);
    } catch {
      await navigator.clipboard.writeText(body);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyTitleText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopiedTitle(label);
    setTimeout(() => setCopiedTitle(null), 1500);
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

  function restoreFromHistory(entry: ArticleHistory) {
    if (entry.tone === "menu") {
      setArticleMode("menu");
      setMenuStoreName(entry.storeName);
      setMenuCompletion(entry.article);
    } else {
      setArticleMode("intro");
      const store = stores.find((s) => s.id === entry.storeId);
      if (store) {
        setSelectedStoreId(entry.storeId);
        setStoreName(store.name);
        setStoreInfo(store.storeInfo);
        const loaded: Review[] = store.reviews.map((r, i) => ({
          id: i + 1,
          text: r.text,
        }));
        while (loaded.length < 3) {
          loaded.push({ id: loaded.length + 1, text: "" });
        }
        setReviews(loaded);
        setNextReviewId(loaded.length + 1);
      }
      setIntroCompletion(entry.article);
      setTone(entry.tone as Tone);
      setLanguage(entry.language as Language);
    }
    setCurrentGenCost(null);
    setCopied(false);
    setCopiedTitle(null);
    setActiveTab("text");
    setStep(3);
    setShowHistory(false);
    setViewingHistory(null);
    setTimeout(() => outputRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  function getToneLabel(v: string) {
    if (v === "menu") return "メニュー記事";
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#f5f4f0',
    border: '0.5px solid #d8d6d0',
    padding: '10px 12px',
    fontSize: '13px',
    color: '#1a1a1a',
    outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: '#1a1a1a',
  };
  const todayDate = (() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
  })();
  const todayCount = stats?.history.find(h => h.date === todayDate)?.count ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f4f0', fontFamily: "'Space Grotesk', sans-serif", color: '#1a1a1a' }}>

      {/* TOP BAR */}
      <header style={{ background: '#1a1a1a', padding: '0 24px' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', letterSpacing: '0.08em' }}>LOCAL STANDARD TOKYO</span>
            <span style={{ fontSize: '10px', color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase' }}>ARTICLE GENERATOR</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([
              { label: 'HISTORY', onClick: () => { setHistory(lsGetHistory()); setViewingHistory(null); setShowHistory(true); } },
              { label: 'STATS', onClick: () => { setStats(lsGetStats()); setShowStats(true); } },
            ] as { label: string; onClick: () => void }[]).map(({ label, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                style={{ fontSize: '10px', color: '#aaa', border: '0.5px solid #444', background: 'none', padding: '6px 12px', letterSpacing: '0.08em', cursor: 'pointer', textTransform: 'uppercase', fontFamily: 'inherit' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#aaa'; }}
              >{label}</button>
            ))}
          </div>
        </div>
      </header>

      {/* MODE TOGGLE */}
      <div style={{ background: '#1a1a1a', borderTop: '0.5px solid #2a2a2a' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex' }}>
          {([
            { mode: 'intro' as ArticleMode, label: 'REVIEW ARTICLE' },
            { mode: 'menu' as ArticleMode, label: 'MENU ARTICLE' },
          ]).map(({ mode, label }) => {
            const isActive = articleMode === mode;
            const color = mode === 'menu' ? '#e8a020' : '#fff';
            return (
              <button
                key={mode}
                onClick={() => setArticleMode(mode)}
                style={{
                  flex: 1, padding: '11px 0', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                  background: 'none', border: 'none', borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
                  cursor: 'pointer', fontFamily: 'inherit', color: isActive ? color : '#555',
                }}
              >{label}</button>
            );
          })}
        </div>
      </div>

      {/* MAIN */}
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 24px 88px' }}>

        {/* ── MENU MODE ── */}
        {articleMode === 'menu' && (
          <div>
            <div style={{ fontSize: '9px', color: '#888', letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase', marginBottom: '16px' }}>01 — MENU INFORMATION</div>

            {([
              {
                label: 'STORE NAME', required: true,
                node: <input type="text" value={menuStoreName} onChange={(e) => setMenuStoreName(e.target.value)} placeholder="例：KAMERA / リバーサイドヤオヤ" style={inputStyle} />,
              },
              {
                label: 'MENU INFO', required: true,
                node: <textarea value={menuInfo} onChange={(e) => setMenuInfo(e.target.value)} placeholder="食べログのメニューページからコピーしてください" rows={8} style={{ ...inputStyle, resize: 'none' }} />,
              },
              {
                label: 'REVIEW ARTICLE URL', required: false, hint: '記事公開後に追加するとリンクが自動挿入されます',
                node: <input type="text" value={menuArticleUrl} onChange={(e) => setMenuArticleUrl(e.target.value)} placeholder="https://blog.naver.com/xxx/123456789" style={inputStyle} />,
              },
              {
                label: 'STORE DETAILS', required: true,
                node: <textarea value={menuStoreInfo} onChange={(e) => setMenuStoreInfo(e.target.value)} placeholder="食べログ・Googleマップなどから住所・営業時間・アクセスをコピーしてください" rows={4} style={{ ...inputStyle, resize: 'none' }} />,
              },
            ] as { label: string; required: boolean; hint?: string; node: React.ReactNode }[]).map(({ label, required, hint, node }) => (
              <div key={label} style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '16px', marginBottom: '10px' }}>
                <div style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>
                  {label}{required && <span style={{ color: '#e8a020', marginLeft: '4px' }}>*</span>}
                </div>
                {node}
                {hint && <p style={{ fontSize: '10px', color: '#888', marginTop: '6px' }}>{hint}</p>}
              </div>
            ))}

            <button
              onClick={handleMenuGenerate}
              disabled={!menuStoreName.trim() || !menuInfo.trim() || !menuStoreInfo.trim() || menuIsLoading}
              style={{ width: '100%', padding: '14px', background: '#e8a020', color: '#1a1a1a', border: 'none', fontSize: '12px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', opacity: (!menuStoreName.trim() || !menuInfo.trim() || !menuStoreInfo.trim() || menuIsLoading) ? 0.4 : 1 }}
            >{menuIsLoading ? 'GENERATING...' : 'GENERATE MENU →'}</button>
          </div>
        )}

        {/* ── REVIEW MODE ── */}
        {articleMode === 'intro' && (
          <div>
            <div style={{ fontSize: '9px', color: '#888', letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase', marginBottom: '16px' }}>01 — STORE INFORMATION</div>

            {/* Saved stores */}
            {stores.length > 0 && (
              <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '16px', marginBottom: '10px' }}>
                <div style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>SAVED STORES</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={selectedStoreId ?? ''}
                    onChange={(e) => { if (e.target.value === '') setSelectedStoreId(null); else selectStore(e.target.value); }}
                    style={{ flex: 1, ...inputStyle, padding: '8px 12px' }}
                  >
                    <option value="">（新規作成）</option>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {selectedStoreId && (
                    <button onClick={() => setShowDeleteConfirm(true)} style={{ padding: '8px 14px', border: '0.5px solid #d8d6d0', background: '#fff', color: '#888', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>DEL</button>
                  )}
                </div>
                {selectedStoreId && (
                  <button onClick={saveCurrentStore} style={{ width: '100%', marginTop: '8px', padding: '8px', border: '0.5px solid #d8d6d0', background: '#fff', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', color: '#1a1a1a', fontFamily: 'inherit' }}>UPDATE & SAVE</button>
                )}
              </div>
            )}

            {/* Store name */}
            <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '16px', marginBottom: '10px' }}>
              <div style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>STORE NAME <span style={{ color: '#e8a020' }}>*</span></div>
              <input type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="例：KAMERA / リバーサイドヤオヤ" style={inputStyle} />
            </div>

            {/* Store info */}
            <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '16px', marginBottom: '10px' }}>
              <div style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>STORE INFO <span style={{ color: '#e8a020' }}>*</span></div>
              <textarea value={storeInfo} onChange={(e) => setStoreInfo(e.target.value)} placeholder={"店名・住所・営業時間・メニュー・価格帯など\nGoogle マップや食べログのテキストをそのまま貼り付けてOK"} rows={6} style={{ ...inputStyle, resize: 'none' }} />
            </div>

            {/* Reviews */}
            <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '16px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={labelStyle}>REVIEWS <span style={{ color: '#e8a020' }}>*</span></div>
                <button onClick={addReview} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#e8a020', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>+ ADD REVIEW</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {reviews.map((review, index) => (
                  <div key={review.id} style={{ border: '0.5px solid #d8d6d0', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#888', textTransform: 'uppercase' }}>REVIEW {String(index + 1).padStart(2, '0')}</span>
                      {index >= 3 && <button onClick={() => removeReview(review.id)} style={{ fontSize: '9px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' }}>REMOVE</button>}
                    </div>
                    <textarea value={review.text} onChange={(e) => updateReview(review.id, e.target.value)} placeholder="口コミの内容を貼り付けてください" rows={3} style={{ ...inputStyle, resize: 'none' }} />
                  </div>
                ))}
              </div>
              {!reviews.slice(0, 3).every((r) => r.text.trim()) && (
                <p style={{ fontSize: '10px', color: '#888', marginTop: '8px', letterSpacing: '0.04em' }}>3件以上の口コミを入力してください</p>
              )}
            </div>

            {/* Photo URL */}
            <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '16px', marginBottom: '10px' }}>
              <div style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>PHOTO URL <span style={{ color: '#e8a020' }}>*</span></div>
              <input type="text" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="Google MapsのシェアURLを貼り付け" style={inputStyle} />
              <p style={{ fontSize: '10px', color: '#888', marginTop: '6px' }}>記事末尾に 사진 인용：[Google Maps](URL) として挿入されます</p>
            </div>

            {/* Notes */}
            <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '16px', marginBottom: '28px' }}>
              <div style={{ ...labelStyle, display: 'block', marginBottom: '8px' }}>
                NOTES <span style={{ fontSize: '9px', fontWeight: 400, color: '#888', letterSpacing: '0.04em', textTransform: 'none' }}>(OPTIONAL)</span>
              </div>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="実際に訪問して感じたこと、こだわり情報など" rows={3} style={{ ...inputStyle, resize: 'none' }} />
            </div>

            {/* Section 02 */}
            <div style={{ fontSize: '9px', color: '#888', letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase', marginBottom: '16px' }}>02 — ARTICLE STYLE</div>

            {/* Tone */}
            <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '16px', marginBottom: '10px' }}>
              <div style={{ ...labelStyle, display: 'block', marginBottom: '12px' }}>TONE</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {TONES.map((t) => (
                  <button key={t.value} onClick={() => setTone(t.value)} style={{ flex: 1, padding: '10px 0', border: '0.5px solid #d8d6d0', background: tone === t.value ? '#1a1a1a' : '#fff', color: tone === t.value ? '#fff' : '#1a1a1a', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>{t.label}</button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '16px', marginBottom: '20px' }}>
              <div style={{ ...labelStyle, display: 'block', marginBottom: '12px' }}>LANGUAGE</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {LANGUAGES.map((l) => (
                  <button key={l.value} onClick={() => setLanguage(l.value)} style={{ flex: 1, padding: '10px 0', border: '0.5px solid #d8d6d0', background: language === l.value ? '#1a1a1a' : '#fff', color: language === l.value ? '#fff' : '#1a1a1a', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{l.label}</button>
                ))}
              </div>
            </div>

            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={!storeName.trim() || !storeInfo.trim() || !reviews.slice(0, 3).every((r) => r.text.trim()) || !photoUrl.trim() || isLoading}
              style={{ width: '100%', padding: '14px', background: '#e8a020', color: '#1a1a1a', border: 'none', fontSize: '12px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', opacity: (!storeName.trim() || !storeInfo.trim() || !reviews.slice(0, 3).every((r) => r.text.trim()) || !photoUrl.trim() || isLoading) ? 0.4 : 1 }}
            >{isLoading ? 'GENERATING...' : 'GENERATE ARTICLE →'}</button>
          </div>
        )}

        {/* ── OUTPUT ── */}
        {(displayCompletion || isLoading) && (
          <div ref={outputRef} style={{ marginTop: '32px' }}>

            {/* Menu fixed title */}
            {articleMode === 'menu' && menuFixedTitle && !isLoading && (
              <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '14px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <p style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: '#1a1a1a', lineHeight: 1.5 }}>{menuFixedTitle.title}</p>
                <button onClick={() => copyTitleText(menuFixedTitle.title, 'menu')} style={{ flexShrink: 0, fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 12px', border: '0.5px solid #1a1a1a', color: '#1a1a1a', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  {copiedTitle === 'menu' ? 'COPIED ✓' : 'COPY'}
                </button>
              </div>
            )}

            {/* Title candidates */}
            {articleMode === 'intro' && parsedArticle.titles.length > 0 && !isLoading && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1a1a1a', flexShrink: 0 }}>TITLE CANDIDATES</span>
                  <div style={{ flex: 1, height: '0.5px', background: '#d8d6d0' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {parsedArticle.titles.map(({ label, text }) => (
                    <div key={label} style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ flexShrink: 0, width: '22px', height: '22px', background: '#1a1a1a', color: '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{label}</span>
                      <p style={{ flex: 1, fontSize: '13px', color: '#1a1a1a', lineHeight: 1.5 }}>{text}</p>
                      <button onClick={() => copyTitleText(text, label)} style={{ flexShrink: 0, fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 12px', border: '0.5px solid #d8d6d0', color: '#888', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        {copiedTitle === label ? 'COPIED ✓' : 'COPY'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Article body */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1a1a1a', flexShrink: 0 }}>GENERATED ARTICLE</span>
                <div style={{ flex: 1, height: '0.5px', background: '#d8d6d0' }} />
              </div>

              {/* Tabs */}
              {displayCompletion && !isLoading && (
                <div style={{ display: 'flex', borderBottom: '0.5px solid #d8d6d0' }}>
                  {(['text', 'preview'] as const).map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '10px 0', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #1a1a1a' : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', color: activeTab === tab ? '#1a1a1a' : '#888' }}>
                      {tab === 'text' ? 'TEXT' : 'NAVER PREVIEW'}
                    </button>
                  ))}
                </div>
              )}

              {/* Content */}
              <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', borderTop: (displayCompletion && !isLoading) ? 'none' : '0.5px solid #d8d6d0', padding: '16px' }}>
                {isLoading && !completion && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
                    <div className="lst-spinner" />
                    <span style={{ fontSize: '11px', color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>GENERATING...</span>
                  </div>
                )}
                {completion && (isLoading || activeTab === 'text') && (
                  <div style={{ fontSize: '13px', color: '#1a1a1a', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {isLoading ? textDisplay : textBodyDisplay}
                    {isLoading && <span style={{ display: 'inline-block', width: '2px', height: '14px', marginLeft: '2px', background: '#e8a020', verticalAlign: 'text-bottom', animation: 'lstBlink 1s step-end infinite' }} />}
                  </div>
                )}
                {displayCompletion && !isLoading && activeTab === 'preview' && (
                  <>
                    <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');`}</style>
                    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", maxWidth: '680px', margin: '0 auto', lineHeight: 1.9 }}>
                      {renderNaverPreview((articleMode === 'menu' && menuFixedTitle?.body) || parsedArticle.body || displayCompletion)}
                    </div>
                  </>
                )}
              </div>

              {/* Token cost */}
              {currentGenCost && !isLoading && (
                <p style={{ fontSize: '10px', color: '#888', marginTop: '8px', letterSpacing: '0.02em' }}>
                  入力 {currentGenCost.inputTokens.toLocaleString()} tokens / 出力 {currentGenCost.outputTokens.toLocaleString()} tokens / 約¥{Math.ceil(currentGenCost.costUSD * USD_TO_JPY)}
                </p>
              )}

              {/* Actions */}
              {displayCompletion && !isLoading && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={copyToClipboard} style={{ flex: 1, padding: '12px', background: '#1a1a1a', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {copied ? 'COPIED ✓' : 'COPY FOR NAVER →'}
                    </button>
                    <button
                      onClick={() => { if (articleMode === 'intro') setIntroCompletion(''); else setMenuCompletion(''); }}
                      style={{ padding: '12px 16px', background: '#fff', border: '0.5px solid #d8d6d0', color: '#1a1a1a', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                    >RETRY</button>
                  </div>
                  <p style={{ fontSize: '9px', color: '#888', textAlign: 'center', letterSpacing: '0.04em' }}>Naverブログのエディタに貼り付けるとリンクが有効になります</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM BAR */}
      <footer style={{ background: '#1a1a1a', borderTop: '0.5px solid #2a2a2a', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '8px 24px', display: 'flex', gap: '32px', alignItems: 'center', justifyContent: 'center' }}>
          {([
            { label: 'TODAY', value: `${todayCount} articles` },
            { label: 'THIS MONTH', value: `¥${Math.ceil(thisMonth.costUSD * USD_TO_JPY).toLocaleString()}` },
            { label: 'TOTAL', value: `${stats?.totalGenerations ?? 0} articles` },
          ] as { label: string; value: string }[]).map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#555', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#e8a020', letterSpacing: '0.04em' }}>{value}</div>
            </div>
          ))}
        </div>
      </footer>

      {/* HISTORY MODAL */}
      {showHistory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px' }} onClick={(e) => { if (e.target === e.currentTarget) { setShowHistory(false); setViewingHistory(null); } }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '640px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '0.5px solid #d8d6d0' }}>
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #d8d6d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>HISTORY</span>
              <button onClick={() => { setShowHistory(false); setViewingHistory(null); }} style={{ fontSize: '16px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
            </div>
            {viewingHistory ? (
              <>
                <div style={{ padding: '12px 20px', borderBottom: '0.5px solid #d8d6d0', flexShrink: 0 }}>
                  <button onClick={() => setViewingHistory(null)} style={{ fontSize: '10px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' }}>← BACK</button>
                  <p style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>{viewingHistory.storeName} · {getToneLabel(viewingHistory.tone)} · {getLangLabel(viewingHistory.language)} · {formatDateTime(viewingHistory.createdAt)}</p>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                  <p style={{ fontSize: '13px', color: '#1a1a1a', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{viewingHistory.article}</p>
                </div>
                <div style={{ padding: '16px 20px', borderTop: '0.5px solid #d8d6d0', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button onClick={() => restoreFromHistory(viewingHistory)} style={{ width: '100%', padding: '11px', background: '#1a1a1a', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>RESTORE →</button>
                  <button onClick={async () => { await navigator.clipboard.writeText(viewingHistory.article); setHistoryCopied(true); setTimeout(() => setHistoryCopied(false), 2000); }} style={{ width: '100%', padding: '11px', background: '#fff', color: '#1a1a1a', border: '0.5px solid #d8d6d0', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {historyCopied ? 'COPIED ✓' : 'COPY ARTICLE'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {history.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '11px', color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>NO HISTORY YET</div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {history.map((entry) => (
                      <li key={entry.id} style={{ borderBottom: '0.5px solid #d8d6d0' }}>
                        <button style={{ width: '100%', padding: '14px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setViewingHistory(entry)}>
                          <p style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a1a', marginBottom: '3px' }}>{entry.storeName}</p>
                          <p style={{ fontSize: '10px', color: '#888' }}>{getToneLabel(entry.tone)} · {getLangLabel(entry.language)} · {formatDateTime(entry.createdAt)}</p>
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

      {/* DELETE CONFIRM */}
      {showDeleteConfirm && selectedStoreId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '360px', border: '0.5px solid #d8d6d0', padding: '24px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, textAlign: 'center', marginBottom: '8px' }}>DELETE STORE?</p>
            <p style={{ fontSize: '12px', color: '#888', textAlign: 'center', marginBottom: '20px' }}>「{stores.find((s) => s.id === selectedStoreId)?.name ?? 'この店舗'}」を削除します。この操作は取り消せません。</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: '11px', background: '#fff', border: '0.5px solid #d8d6d0', color: '#1a1a1a', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>CANCEL</button>
              <button onClick={deleteCurrentStore} style={{ flex: 1, padding: '11px', background: '#1a1a1a', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>DELETE</button>
            </div>
          </div>
        </div>
      )}

      {/* STATS MODAL */}
      {showStats && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px' }} onClick={(e) => { if (e.target === e.currentTarget) setShowStats(false); }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '640px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '0.5px solid #d8d6d0' }}>
            <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #d8d6d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>STATS</span>
              <button onClick={() => setShowStats(false)} style={{ fontSize: '16px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {([{ heading: 'TOTAL', count: stats?.totalGenerations ?? 0, cost: stats?.totalCostUSD ?? 0 }, { heading: 'THIS MONTH', count: thisMonth.count, cost: thisMonth.costUSD }] as { heading: string; count: number; cost: number }[]).map(({ heading, count, cost }) => (
                <div key={heading}>
                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', marginBottom: '10px' }}>{heading}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ background: '#f5f4f0', border: '0.5px solid #d8d6d0', padding: '16px' }}>
                      <p style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>{count}<span style={{ fontSize: '12px', fontWeight: 400, color: '#888', marginLeft: '4px' }}>回</span></p>
                      <p style={{ fontSize: '9px', color: '#888', marginTop: '4px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>GENERATIONS</p>
                    </div>
                    <div style={{ background: '#f5f4f0', border: '0.5px solid #d8d6d0', padding: '16px' }}>
                      <p style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a' }}>¥{Math.ceil(cost * USD_TO_JPY).toLocaleString()}</p>
                      <p style={{ fontSize: '9px', color: '#888', marginTop: '4px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>COST</p>
                    </div>
                  </div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', marginBottom: '10px' }}>LAST 7 DAYS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {last7Days.map(({ label, count }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '10px', color: '#888', width: '36px', textAlign: 'right', flexShrink: 0 }}>{label}</span>
                      <div style={{ flex: 1, height: '4px', background: '#ece9e3', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(count / maxDayCount) * 100}%`, background: '#e8a020' }} />
                      </div>
                      <span style={{ fontSize: '10px', color: '#888', width: '16px', textAlign: 'right', flexShrink: 0 }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY */}
      {isLoading && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 50, background: 'rgba(245,244,240,0.92)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', border: '0.5px solid #d8d6d0', padding: '28px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div className="lst-spinner" />
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#1a1a1a', letterSpacing: '0.14em', textTransform: 'uppercase' }}>GENERATING ARTICLE</p>
            <p style={{ fontSize: '10px', color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase' }}>PLEASE WAIT...</p>
          </div>
        </div>
      )}

      {/* TOAST */}
      {showToast && (
        <div style={{ position: 'fixed', bottom: '56px', left: '50%', zIndex: 100, background: '#1a1a1a', color: '#e8a020', border: '0.5px solid #e8a020', padding: '10px 20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', animation: 'toastSlide 2.5s ease-out forwards' }}>
          ARTICLE READY ✓
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        input, textarea, select, button { font-family: 'Space Grotesk', sans-serif; }
        input::placeholder, textarea::placeholder { color: #aaa; }
        .lst-spinner {
          width: 32px; height: 32px;
          border: 2px solid #d8d6d0;
          border-top-color: #e8a020;
          border-radius: 50%;
          animation: lstSpin 0.8s linear infinite;
        }
        @keyframes lstSpin { to { transform: rotate(360deg); } }
        @keyframes lstBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes toastSlide {
          0%   { opacity: 0; transform: translateX(-50%) translateY(20px); }
          15%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          75%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
