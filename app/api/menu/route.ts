export const runtime = 'edge';

import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは日本のグルメ情報を韓国人観光客向けに整理するライターです。
以下のメニュー情報・店舗基本情報をもとに、メニューと価格を整理した「情報カード型記事」を作成してください。

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

【導入文（2文以内）】
- お店の名前・ジャンル・エリアの紹介のみ
- 体験談・感情表現・紹介記事と重複する内容は書かない
例：
시부야 도겐자카에 위치한 슈마이 전문 이자카야 KAMERA의 메뉴와 가격을 정리했어요.
자세한 방문 후기는 별도 리뷰 기사를 참고해주세요 🔗

【カテゴリ別メニュー一覧の形式（必ず守ること）】

▼ (カテゴリ名・韓国語)
메뉴명（日本語名）　¥価格　⭐추천（おすすめの場合のみ）

ルール：
- 各メニューの説明文・紹介文は一切書かない
- 「甘いもので締めくくり」「サクサク食感を楽しんで」などの余計な表現は禁止
- カテゴリ名は必ず韓国語に変換する
  例：焼売→슈마이류, 一品料理→일품요리, ドリンク→음료, デザート→디저트, 揚げ物→튀김류, コース→코스, セット→세트, 前菜→전채요리, 麺類→면류, ご飯物→밥류, 鍋→냄비요리
- ⭐추천 マークは代表的なおすすめメニュー（各カテゴリ1〜2品まで）に付ける
- 価格が不明の場合は「가격 요확인 📍」と記載
- 日本語・ひらがな・カタカナはメニュー名の括弧内（日本語名）にのみ使用すること

【紹介記事リンク欄（必ず追加）】
メニュー一覧の後に以下をそのまま出力すること：

---
📖 방문 후기 & 상세 리뷰
🔗 리뷰 기사 링크를 여기에 추가해주세요

【基本情報セクション（必ず追加）】
提供された店舗基本情報から各項目を抽出すること。情報がない場合は「요확인 📍」と記載。

📍 기본 정보
- 위치:
- 가는 법:
- 영업시간:
- 정기휴일:
- 예산:
- 예약:
- 결제:
- 전화:

【ハッシュタグ（必ず追加）】
8〜10個・韓国語のみ（日本語・英語は一切混在させない）
エリア系3〜4個・ジャンル系3〜4個・属性/シーン系2〜3個
1行にまとめて出力する（例：#시부야맛집 #도쿄여행 #이자카야 ...）`;

export async function POST(req: Request) {
  const { menuStoreName, menuInfo, menuStoreInfo } = await req.json();

  const userPrompt = `以下の情報をもとにメニュー情報カード記事を作成してください。

【店舗名】
${menuStoreName}

【メニュー情報】
${menuInfo}
${menuStoreInfo?.trim() ? `\n【店舗基本情報（住所・営業時間・アクセスなど）】\n${menuStoreInfo}` : ""}`;

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
