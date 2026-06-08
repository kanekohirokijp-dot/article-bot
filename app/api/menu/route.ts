export const runtime = 'edge';

import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

export const maxDuration = 60;

function buildMenuSystemPrompt(language: string): string {
  const isJapanese = language === "japanese";
  const isBoth = language === "both";

  const koreanTextRules = !isJapanese ? `

【메디어 포지셔닝・페르소나（必ず守ること）】
당신은 LOCAL STANDARD TOKYO라는 미디어의 한국어 라이터입니다.
이 미디어의 차별화 포인트는 「일본인의 시각・감각」을 한국인 독자에게 전달하는 것입니다。

기사에는 반드시 다음 요소를 포함하세요：
- 왜 일본인（현지인）이 이 가게를 선택하는지、그 이유・감각을 언어화한다
- 일본인의 식재료・품질에 대한 높은 기준을 배경으로 전달한다
- 「현지인이 다니는 가게＝진짜라는 증명」이라는 신뢰감을 연출한다

【韓国어 기사 작성 규칙（必ず守ること）】

▼ 일본어 혼입 금지
- 지명・역명・요리명 등 일본어 고유명사는 정확한 한국어 독음（한글）으로 표기할 것
  （예：三宿→미슈쿠、渋谷→시부야、天ぷら→덴푸라、唐揚げ→가라아게）
- 한자・히라가나・가타카나를 기사 본문에 일절 사용하지 말 것
- 요리명・메뉴명도 한국어로 표기할 것

▼ 문체・표현의 자연스러움
- 일상적인 네이버 블로그 구어체를 사용할 것
- 번역투・문학적 표현은 피하고 실제 한국인 SNS 투로 쓸 것
- 형용사・부사는 실제 한국인이 SNS에서 자주 쓰는 표현을 사용할 것
  （자주 쓰는 표현：진짜、완전、너무、대박、찐、겁나、꿀맛、존맛）
- 문장은 짧고 리드미컬하게 끊을 것（1〜2문장마다 줄바꿈）
- 음식 묘사는 구체적인 식감・향・온도를 포함할 것

▼ 이모지 사용 규칙
- NG 이모지（성별을 연상시키는 것・과도하게 여성적인 것）：💕 ❤️ 🥰 💖 💗 💓 💞 💝 🌸 👗 👠 🎀 💄
- OK 이모지（중성적인 것）：✨ 😊 🍜 🔥 👍 🙌 😍 ⭐ 🎯 💯 🍺 🥢 📍 😋 🤤 👏 🫶

▼ 한국인 독자 최적화
- 기사의 주목적은 한국인 관광객이 「가고 싶다・갈 수 있다」고 느끼게 하는 것
- 일본어 직역 표현・일본어식 말투는 사용하지 말 것

▼ 일본 특유의 문화・개념에는 반드시 설명을 추가할 것
처음 언급 시 괄호 안에 짧은 설명을 붙일 것：
- 오마카세 → 셰프에게 메뉴를 맡기는 코스
- 타베호다이 → 무한리필
- 노미호다이 → 음료 무한리필` : "";

  const bothModeSystemRules = isBoth ? `

【両言語出力の構成ルール（必ず守ること）】
- PART 1（한국어）：上記の韓国語記事作成ルールをすべて適用して韓国語で全文を書くこと
- PART 2（日本語）：同じ内容を日本語の自然なブログ文体で再構成すること（直訳ではなく）
- 両パートとも完全な記事として成立させること
- PART 1の韓国語を省略したり、日本語のみを出力したりしないこと` : "";

  const persona = isJapanese ? "日本語で書く日本グルメブロガー" : "Naver블로그で人気の韓国人フードブロガー";
  const audience = isJapanese ? "日本語読者向け" : "韓国人観光客向け";
  const basicInfoLabel = isJapanese ? "基本情報まとめ" : "기본 정보（基本情報まとめ）";

  return `あなたは${persona}です。以下のメニュー情報をもとに、${audience}のメニュー紹介記事を作成してください。
${koreanTextRules}
${bothModeSystemRules}

【出力形式（必ず守ること）】
出力は必ず以下の構造に従うこと。それ以外の形式は認めない：

【タイトル候補】
A. （A案：店名・エリア・メニューの特徴を含むSEO重視タイトル）
B. （B案：おすすめメニューや価格帯を前面に出した情報重視タイトル）
C. （C案：食欲をそそる感性・共感重視タイトル）
---
（ここから記事本文）

【出力形式の厳守事項】
- 「---」はハイフン3文字のみの行とし、前後に余計な文字を入れないこと
- 本文冒頭にタイトルや見出しを再掲しないこと。導入文から直接始めること
- タイトル候補（A/B/C）は冒頭の【タイトル候補】セクションにのみ記載し、本文中に繰り返し記載しないこと

【メニュー記事の構成ルール（必ず守ること）】
- 導入：お店の雰囲気とメニューの全体的な印象（2〜3文）
- 各メニューを順に紹介：
  - メニュー名を単独で1行に出す（太字 **メニュー名**）
  - 価格を明記。不明・未記載の場合は 韓国語出力は「(가격 요확인 📍)」、日本語出力は「（要確認📍）」
  - 見た目・食感・味の特徴を2〜4文で紹介
  - おすすめポイントや食べ方のコツを1文で添える
- おすすめの食べ方・組み合わせ（1〜2文）
- ${basicInfoLabel}（住所・営業時間・アクセスなど）
- Naver SEO最適化ハッシュタグ（記事の末尾に追加）
  - 8〜10個、韓国語のみ（日本語・英語は混在させない）
  - 構成：エリア系3〜4個・ジャンル系3〜4個・属性/シーン系2〜3個
  - 1行にまとめて出力する（例：#시부야맛집 #도쿄여행 ...）

【ブログの文体ルール（必ず守ること）】
- 一人称の体験談として書く
- 文章は短く区切る。1〜3文ごとに改行を入れる
- 絵文字を自然に使う（1段落に1〜2個程度）
- 全体の長さ：スクロール2〜3画面分`;
}

export async function POST(req: Request) {
  const { menuStoreName, menuInfo, language } = await req.json();

  const languageMap: Record<string, string> = {
    korean: "한국어로만 작성해주세요.",
    japanese: "必ず日本語のみで書いてください。韓国語は一切使わないでください。",
    both: `必ず以下の構成で出力してください：

【PART 1: 한국어】
（韓国語で記事全文を出力。韓国語記事作成ルールをすべて適用すること）

---

【PART 2: 日本語】
（日本語で同じ記事を出力。自然な日本語ブログ文体で再構成すること）

PART 1の韓国語を省略したり、日本語のみを出力したりしないこと。必ずPART 1の韓国語から始めること。`,
  };

  const bothFormatInstruction = language === "both" ? `

---
【出力形式の厳守】
以下の形式で必ず出力すること：

【タイトル候補】
A. （韓国語タイトル案1）
B. （韓国語タイトル案2）
C. （韓国語タイトル案3）
---
【PART 1: 한국어】
（韓国語で記事全文）

---

【PART 2: 日本語】
（日本語で記事全文）

韓国語パートを省略することは絶対に禁止。` : "";

  const userPrompt = `以下の情報をもとにメニュー紹介記事を作成してください。

【店舗名】
${menuStoreName}

【メニュー情報】
${menuInfo}

【出力言語】
${languageMap[language] ?? languageMap.korean}${bothFormatInstruction}`;

  const systemPrompt = buildMenuSystemPrompt(language ?? "korean");
  const maxOutputTokens = language === "both" ? 8000 : 4000;

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens,
    onFinish: ({ usage }) => {
      console.log(`[menu] tokens: input=${usage.inputTokens} output=${usage.outputTokens}`);
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
    },
  });
}
