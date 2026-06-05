"use client";

import { useCompletion } from "@ai-sdk/react";
import { useState, useRef } from "react";

type ReviewSource = "食べログ" | "Google" | "Instagram" | "Retty" | "その他";
type Tone = "casual" | "editorial" | "passionate";
type Language = "korean" | "japanese" | "both";

interface Review {
  id: number;
  source: ReviewSource;
  text: string;
}

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

export default function Home() {
  const [step, setStep] = useState(1);
  const [storeInfo, setStoreInfo] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [memo, setMemo] = useState("");
  const [tone, setTone] = useState<Tone>("casual");
  const [language, setLanguage] = useState<Language>("japanese");
  const [nextReviewId, setNextReviewId] = useState(1);
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const { completion, isLoading, complete, setCompletion } = useCompletion({
    api: "/api/generate",
    streamProtocol: "text",
  });

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

  async function handleGenerate() {
    setCompletion("");
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

    await complete("", { body });
  }

  async function copyToClipboard() {
    if (!completion) return;
    await navigator.clipboard.writeText(completion);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">
            Naver블로그 記事ジェネレーター
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            韓国人観光客向けグルメ記事を自動生成
          </p>
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
                    口コミ（任意）
                  </label>
                  <button
                    onClick={addReview}
                    className="text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1"
                  >
                    <span className="text-lg leading-none">+</span> 口コミを追加
                  </button>
                </div>

                {reviews.length === 0 && (
                  <p className="text-sm text-gray-400 py-2">
                    「口コミを追加」ボタンで複数の口コミを追加できます
                  </p>
                )}

                <div className="space-y-3">
                  {reviews.map((review) => (
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
                        <button
                          onClick={() => removeReview(review.id)}
                          className="ml-auto text-sm text-red-400 hover:text-red-600"
                        >
                          削除
                        </button>
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
                disabled={!storeInfo.trim()}
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
              {completion && !isLoading && (
                <button
                  onClick={copyToClipboard}
                  className="text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-lg"
                >
                  {copied ? "✓ コピー済み" : "📋 コピー"}
                </button>
              )}
            </div>

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

              {completion && (
                <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
                  {completion}
                  {isLoading && (
                    <span className="inline-block w-1.5 h-4 bg-indigo-500 ml-0.5 animate-pulse" />
                  )}
                </div>
              )}
            </div>

            {completion && !isLoading && (
              <div className="px-6 pb-5 flex gap-2">
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
            )}
          </section>
        )}
      </main>
    </div>
  );
}
