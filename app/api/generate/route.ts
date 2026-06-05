export const runtime = 'edge';

import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

export const maxDuration = 60;

function buildSystemPrompt(language: string): string {
  const isJapanese = language === "japanese";

  const firstPerson = isJapanese
    ? "「私は〜」「〜でした」など"
    : "「저는〜」「제가〜」など";

  const basicInfoLabel = isJapanese ? "基本情報まとめ" : "기본 정보（基本情報まとめ）";

  const persona = isJapanese
    ? "日本語で書く日本グルメブロガー"
    : "Naver블로그で人気の韓国人フードブロガー";

  const audience = isJapanese
    ? "日本語読者向け"
    : "韓国人観光客向け";

  return `あなたは${persona}です。以下の情報をもとに、${audience}の日本グルメブログ記事を作成してください。

【ブログの文体・構成ルール（必ず守ること）】
- 一人称の体験談として書く（${firstPerson}）
- 文章は短く区切る。1〜3文ごとに改行を入れる
- メニューを紹介するときは、料理名を単独で1行に出してから、2〜4文の短いコメントを添える
- 絵文字を自然に使う（😊🍜✨💕 など。1段落に1〜2個程度）
- 基本情報（住所・営業時間・予算・アクセス）は最後にまとめて箇条書き
- 基本情報セクションでのリンク記載ルール：
  - Instagramアカウントは [アカウント名](https://www.instagram.com/アカウント名) 形式
  - 公式サイトは [公式サイト](URL) 形式
  - 電話番号はそのままテキストで記載（リンクにしない）
- 全体の長さ：スクロール2〜3画面分
- タイトルは検索にヒットしやすいよう店名・エリア・特徴を含める

【構成】
1. タイトル（店名＋エリア＋ひとことキャッチ）
2. 導入（3〜4文）
3. 店内の雰囲気（2〜3文）
4. 料理紹介（メニューごとに料理名＋短コメントのセット）
5. 総評・おすすめポイント（2〜3文）
6. ${basicInfoLabel}
7. Naver SEO最適化ハッシュタグ（記事の末尾に追加）
   - 8〜10個、韓国語のみ（日本語・英語は混在させない）
   - 構成：エリア系3〜4個・ジャンル系3〜4個・属性/シーン系2〜3個
   - 1行にまとめて出力する（例：#시부야맛집 #도쿄여행 #이자카야 ...）`;
}

export async function POST(req: Request) {
  const { prompt: _prompt, storeInfo, reviews, memo, tone, language } = await req.json();

  console.log("[route] received language:", language);
  console.log("[route] received tone:", tone);

  const toneMap: Record<string, string> = {
    casual: "カジュアルな体験談スタイル（友達に話しかけるような口調）",
    editorial: "編集者目線のスタイル（客観的かつ洗練された表現）",
    passionate: "熱量系スタイル（興奮・感動を前面に出した表現）",
  };

  const languageMap: Record<string, string> = {
    korean: "한국어로만 작성해주세요.",
    japanese: "必ず日本語のみで書いてください。韓国語は一切使わないでください。",
    both: "먼저 한국어로 전체 기사를 작성한 후, 구분선(---) 아래에 일본어 번역을 추가해주세요。",
  };

  const resolvedLanguageInstruction = languageMap[language] ?? languageMap.japanese;
  console.log("[route] languageMap resolved to:", resolvedLanguageInstruction);

  const reviewsText =
    reviews && reviews.length > 0
      ? reviews
          .map(
            (r: { source: string; text: string }) =>
              `【${r.source}より】${r.text}`
          )
          .join("\n\n")
      : null;

  const userPrompt = `以下の情報をもとに記事を作成してください。

【店舗情報】
${storeInfo}

${reviewsText ? `【参考口コミ（口コミとして引用せず、料理の描写・雰囲気・おすすめポイントなど、記事の内容を豊かにする素材として自然に昇華してください）】\n${reviewsText}\n` : ""}
${memo ? `【取材メモ・補足情報】\n${memo}\n` : ""}
【記事のトーン】
${toneMap[tone] || toneMap.casual}

【出力言語】
${resolvedLanguageInstruction}`;

  const systemPrompt = buildSystemPrompt(language ?? "japanese");
  console.log("[route] system prompt persona line:", systemPrompt.split("\n")[0]);

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens: 4000,
    onFinish: ({ usage }) => {
      console.log(`[route] tokens: input=${usage.inputTokens} output=${usage.outputTokens}`);
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of result.textStream) {
        controller.enqueue(encoder.encode(chunk));
      }
      const usage = await result.usage;
      controller.enqueue(
        encoder.encode(`\n__USAGE__:${usage.inputTokens ?? 0}:${usage.outputTokens ?? 0}`)
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Input-Tokens": "0",
      "X-Output-Tokens": "0",
    },
  });
}
