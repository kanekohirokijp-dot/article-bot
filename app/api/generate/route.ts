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

  const koreanTextRules = !isJapanese ? `

【메디어 포지셔닝・페르소나（必ず守ること）】
당신은 LOCAL STANDARD TOKYO라는 미디어의 한국어 라이터입니다.
이 미디어의 차별화 포인트는 「일본인의 시각・감각」을 한국인 독자에게 전달하는 것입니다。

기사에는 반드시 다음 요소를 포함하세요：
- 왜 일본인（현지인）이 이 가게를 선택하는지、그 이유・감각을 언어화한다
  예：「현지 일본인들이 줄 서서 찾는 이유가 있어요」
  예：「일본인의 까다로운 입맛을 사로잡은 집」
- 일본인의 식재료・품질에 대한 높은 기준을 배경으로 전달한다
  예：「일본인들은 재료 하나하나에 진심이거든요」
- 「현지인이 다니는 가게＝진짜라는 증명」이라는 신뢰감을 연출한다
  예：「관광객보다 단골 현지인이 더 많은 곳」
- 일본인이기 때문에 알 수 있는 정보가 있다면 적극적으로 담는다
  （식재료 산지・셰프의 배경・식재료에 대한 고집 등）

【韓国어 기사 작성 규칙（必ず守ること）】

▼ 일본어 혼입 금지
- 지명・역명・요리명 등 일본어 고유명사는 정확한 한국어 독음（한글）으로 표기할 것
  （예：三宿→미슈쿠、道玄坂→도겐자카、池尻大橋→이케지리오하시、渋谷→시부야、天ぷら→덴푸라、唐揚げ→가라아게）
- 한자・히라가나・가타카나를 기사 본문에 일절 사용하지 말 것
- 요리명・메뉴명도 한국어로 표기할 것

▼ 문체・표현의 자연스러움
- 일상적인 네이버 블로그 구어체를 사용할 것（翻訳調・文学的表現は避ける）
  - NG：어둑한 조명 → OK：은은한 조명、아늑한 조명
  - NG：씹을수록 풍미가 깊어지는데 → OK：씹으면 씹을수록 맛이 깊어져요
  - NG：온화하다 → OK：순한 편이에요
  - NG：페어링 → OK：궁합、어울림
  - NG：어른의 감자샐러드（직역）→ OK：고급스러운 감자샐러드
  - NG：적당한 거리감으로 친절하게 → OK：너무 부담스럽지 않게 친절해서
- 번역투・문학적 표현은 피하고 실제 한국인 SNS 투로 쓸 것
- 형용사・부사는 실제 한국인이 SNS에서 자주 쓰는 표현을 사용할 것
  （자주 쓰는 표현：진짜、완전、너무、대박、찐、겁나、꿀맛、존맛）
- 문장은 짧고 리드미컬하게 끊을 것（1〜2문장마다 줄바꿈）
- 음식 묘사는 구체적인 식감・향・온도를 포함할 것
  （OK 예：바삭、촉촉、졸깃、스르르 녹는、고소한 향、따끈따끈）

▼ 이모지 사용 규칙
- NG 이모지（성별을 연상시키는 것・과도하게 여성적인 것）：💕 ❤️ 🥰 💖 💗 💓 💞 💝 🌸 👗 👠 🎀 💄
- OK 이모지（중성적인 것）：✨ 😊 🍜 🔥 👍 🙌 😍 ⭐ 🎯 💯 🍺 🥢 📍 😋 🤤 👏 🫶` : "";

  return `あなたは${persona}です。以下の情報をもとに、${audience}の日本グルメブログ記事を作成してください。
${koreanTextRules}

【出力形式（必ず守ること）】
出力は必ず以下の構造に従うこと。それ以外の形式は認めない：

【タイトル候補】
A. （A案：エリア名・ジャンル・特徴を含むSEO検索流入重視タイトル）
B. （B案：体験・感情を前面に出した感性・共感重視タイトル）
C. （C案：具体的なメニュー名・価格・特徴を盛り込んだ情報重視タイトル）
---
（ここから記事本文）

【出力形式の厳守事項】
- 「---」はハイフン3文字のみの行とし、前後に余計な文字を入れないこと
- 本文冒頭にタイトルや見出しを再掲しないこと。導入文から直接始めること
- タイトル候補（A/B/C）は冒頭の【タイトル候補】セクションにのみ記載し、本文中に繰り返し記載しないこと

【口コミの活用ルール（必ず守ること）】
口コミから抽出・使用してよい情報：
- 料理の味・食感・香り・見た目の特徴
- 店内の雰囲気・空間の特徴
- サービスの質・スタッフの対応の印象
- おすすめメニューのポイント

口コミから絶対に使ってはいけない情報：
- 口コミ投稿者の個人的な状況（同行者の人数・予約経緯・キャンセル・待ち時間など）
- 「もともと〇人で行く予定でしたが」「急に来られなくなって」などの個人エピソード
- 投稿者固有の感想（「私の誕生日に」「彼氏と」など）

語り手のポジション：
- 常に「記事を書いている人物が実際に体験・判断した」という一人称視点を維持すること
- 口コミの文章をそのまま言い換えるのではなく、情報だけを抽出して自分の言葉で書き直すこと

【ブログの文体・構成ルール（必ず守ること）】
- 一人称の体験談として書く（${firstPerson}）
- 文章は短く区切る。1〜3文ごとに改行を入れる
- メニューを紹介するときは、料理名を単独で1行に出してから、2〜4文の短いコメントを添える
- 絵文字を自然に使う（😊🍜✨ など。1段落に1〜2個程度）
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
