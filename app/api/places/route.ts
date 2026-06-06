import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

function extractQuery(input: string): string {
  try {
    const url = new URL(input);
    // /maps/place/STORE_NAME/@lat,lng,...
    const match = url.pathname.match(/\/maps\/place\/([^/@]+)/);
    if (match) return decodeURIComponent(match[1].replace(/\+/g, " "));
    const q = url.searchParams.get("q");
    if (q) return q;
  } catch {
    // not a URL
  }
  return input;
}

export async function POST(req: Request) {
  if (!GOOGLE_API_KEY) {
    return Response.json({ error: "GOOGLE_MAPS_API_KEY が設定されていません" }, { status: 500 });
  }

  const { query } = await req.json();
  if (!query?.trim()) {
    return Response.json({ error: "クエリが空です" }, { status: 400 });
  }

  const searchQuery = extractQuery(query.trim());

  // 1. Text Search
  const searchRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&language=ja&key=${GOOGLE_API_KEY}`
  );
  const searchData = await searchRes.json();

  if (!searchData.results?.length) {
    return Response.json({ error: "店舗が見つかりませんでした" }, { status: 404 });
  }

  const placeId: string = searchData.results[0].place_id;

  // 2. Place Details
  const detailsRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,opening_hours,rating,reviews,website&language=ja&key=${GOOGLE_API_KEY}`
  );
  const detailsData = await detailsRes.json();
  const d = detailsData.result;

  if (!d) {
    return Response.json({ error: "店舗詳細の取得に失敗しました" }, { status: 500 });
  }

  // 3. Format storeInfo
  const storeName: string = d.name ?? searchQuery;
  const hoursLines: string = d.opening_hours?.weekday_text?.join("\n") ?? "不明";
  const storeInfo = [
    `店名: ${storeName}`,
    `住所: ${d.formatted_address ?? "不明"}`,
    `電話番号: ${d.formatted_phone_number ?? "不明"}`,
    `営業時間:\n${hoursLines}`,
    `評価: ${d.rating ?? "不明"}`,
    ...(d.website ? [`公式サイト: ${d.website}`] : []),
  ].join("\n");

  // 4. Filter reviews: rating >= 4 and text >= 50 chars
  type RawReview = { rating: number; text: string };
  const rawReviews: RawReview[] = d.reviews ?? [];
  const filtered = rawReviews.filter((r) => r.rating >= 4 && r.text.length >= 50);

  if (filtered.length === 0) {
    return Response.json({ storeName, storeInfo, reviews: [], reviewCount: 0, sufficient: false });
  }

  // 5. Anthropic positive review selection
  let reviews: string[] = filtered.map((r) => r.text);
  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      messages: [
        {
          role: "user",
          content: `以下の口コミからお店の魅力が伝わるポジティブなものだけを選びJSONの文字列配列のみで返してください。ネガティブな表現・不満・待ち時間の不満は除外してください。\n\n${JSON.stringify(reviews)}`,
        },
      ],
    });
    const cleaned = text.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) reviews = parsed;
  } catch {
    // fallback: use filtered reviews as-is
  }

  return Response.json({
    storeName,
    storeInfo,
    reviews,
    reviewCount: reviews.length,
    sufficient: reviews.length >= 3,
  });
}
