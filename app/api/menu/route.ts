export const runtime = 'edge';

import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは日本のグルメ情報を韓国人観光客向けに整理するライターです。
以下のメニュー情報・店舗基本情報をもとに、メニューと価格を整理した「情報カード型記事」を韓国語のみで作成してください。

【出力形式（必ず守ること）】
出力は必ず以下の構造に従うこと：

1行目：固定タイトル
形式：【(店名)】메뉴 & 가격 정리｜(エリア名・韓国語読み)
例：【KAMERA】메뉴 & 가격 정리｜시부야
例：【리버사이드 야오야】메뉴 & 가격 정리｜이케지리오하시

---
（ここから記事本文）

【厳守事項】
- 「【タイトル候補】」という見出しは一切使わないこと
- 「A.」「B.」「C.」のようなタイトル候補の列挙は絶対にしないこと
- タイトルは必ず1行目に直接書き、改行して「---」区切り線を入れること
- 出力は韓国語のみ。日本語・英語は使わないこと（メニュー名の括弧内の日本語表記を除く）

【導入文】
ユーザーから提供された【紹介記事URL】の値に応じて以下のように出力すること：

▼ URLがある場合（3文構成）：
1文目：お店の名前・ジャンル・エリアのみを紹介。体験談・感情表現は書かない
2文目：「자세한 방문 후기가 궁금하신 분은 👉 [리뷰 기사 보러 가기](【紹介記事URL】の値) 도 확인해보세요!」
3文目：「메뉴와 가격을 아래에 정리했어요 😊」（固定・変更禁止）
例：
시부야 도겐자카에 위치한 슈마이 전문 이자카야 KAMERA의 메뉴와 가격을 정리했어요.
자세한 방문 후기가 궁금하신 분은 👉 [리뷰 기사 보러 가기](https://blog.naver.com/xxx) 도 확인해보세요!
메뉴와 가격을 아래에 정리했어요 😊

▼ URLがない場合（2文構成）：
1文目：お店の名前・ジャンル・エリアのみを紹介。体験談・感情表現は書かない
2文目：「메뉴와 가격을 아래에 정리했어요 😊」（固定・変更禁止）
例：
시부야 도겐자카에 위치한 슈마이 전문 이자카야 KAMERA의 메뉴와 가격을 정리했어요.
메뉴와 가격을 아래에 정리했어요 😊

【カテゴリ別メニュー一覧の形式（必ず守ること）】

▼ (カテゴリ名・韓国語)
메뉴명（日本語名）　¥価格　⭐추천（おすすめの場合のみ）

ルール：
- 各メニューの説明文・紹介文は一切書かない
- 「甘いもので締めくくり」「サクサク食感を楽しんで」などの余計な表現は禁止
- カテゴリ名は必ず韓国語に変換する
  例：焼売→슈마이류, 一品料理→일품요리, ドリンク→음료, デザート→디저트, 揚げ物→튀김류, コース→코스, セット→세트, 前菜→전채요리, 麺類→면류, ご飯物→밥류, 鍋→냄비요리
- ⭐추천 マークは各カテゴリ内で最大1〜2品のみに絞ること。全メニューに付けないこと
- 価格が不明の場合は「가격 요확인 📍」と記載
- 日本語・ひらがな・カタカナはメニュー名の括弧内（日本語名）にのみ使用すること

【紹介記事リンク欄（必ず追加）】
ユーザーから提供された【紹介記事リンク欄の内容】をそのままコピーして出力すること。

【基本情報セクション（必ず追加）】
提供された店舗基本情報から各項目を抽出すること。情報がない場合は「요확인 📍」と記載。
인스타그램・공식 사이트は情報がない場合は項目ごと省略すること。

リンク形式のルール：
- Instagramアカウントは [アカウント名](https://www.instagram.com/アカウント名/) 形式で出力する
  例：[kamera_shibuya](https://www.instagram.com/kamera_shibuya/)
- 公式サイト・HPがある場合は [공식 사이트](URL) 形式で出力する
  例：[공식 사이트](https://example.com)
- これらのリンクはNaverブログにコピー＆ペーストするとハイパーリンクとして機能する

📍 기본 정보
- 위치:
- 가는 법:
- 영업시간:
- 정기휴일:
- 예산:
- 예약:
- 결제:
- 전화:
- 인스타그램: （情報がある場合のみ）
- 공식 사이트: （情報がある場合のみ）

【Instagram紹介セクション（必ず追加・固定文言・一字一句変えないこと）】
基本情報の直後、ハッシュタグの前に以下の内容をそのまま出力すること：
━━━━━━━━━━━━━━━
📸 LOCAL STANDARD TOKYO
도쿄 현지인이 추천하는 진짜 맛집 정보
매일 업데이트 중!
👉 [@localstandard_tokyo](https://www.instagram.com/localstandard_tokyo/)
━━━━━━━━━━━━━━━

【ハッシュタグ（必ず追加）】
8〜10個・韓国語のみ（日本語・英語は一切混在させない）
エリア系3〜4個・ジャンル系3〜4個・属性/シーン系2〜3個
1行にまとめて出力する（例：#시부야맛집 #도쿄여행 #이자카야 ...）`;

export async function POST(req: Request) {
  const { menuStoreName, menuInfo, menuStoreInfo, menuArticleUrl } = await req.json();

  const reviewLinkSection = menuArticleUrl?.trim()
    ? `📖 방문 후기 & 상세 리뷰\n👉 [리뷰 기사 보러 가기](${menuArticleUrl.trim()})`
    : `📖 방문 후기 & 상세 리뷰\n🔗 리뷰 기사 링크를 여기에 추가해주세요`;

  const userPrompt = `以下の情報をもとにメニュー情報カード記事を作成してください。

【店舗名】
${menuStoreName}

【紹介記事URL】
${menuArticleUrl?.trim() || "なし"}

【メニュー情報】
${menuInfo}

【店舗基本情報（住所・営業時間・アクセスなど）】
${menuStoreInfo}

【紹介記事リンク欄の内容（記事の紹介記事リンク欄にそのままコピーして出力すること）】
---
${reviewLinkSection}`;

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens: 4000,
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
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
