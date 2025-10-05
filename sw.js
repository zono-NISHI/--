// シンプルなオフラインキャッシュ + Web Share Target の受け取り（POSTを処理）
const CACHE = "yt-lock-cache-v1";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./sw.js"];

// インストール時にキャッシュ
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

// activate
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
    )
  );
  self.clients.claim();
});

// fetch: キャッシュフォールバック & Web Share Target の POST 受け取り
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Web Share Target からの POST（manifest の action に合わせる）
  // action を "/?share-target" にしているので、ここでは pathname === '/' && searchParams.has('share-target') または search に 'share-target' が存在するケースを想定
  if (req.method === "POST" && (url.search.includes("share-target") || url.searchParams.has("share-target"))) {
    // 共有されたフォームデータから url または text を取り出してリダイレクトでクライアントを開く
    e.respondWith((async () => {
      try {
        const formData = await req.formData();
        // 最も優先するのは url パラメータ（ブラウザが url を送る場合）
        let shared = formData.get("url") || formData.get("text") || formData.get("title") || "";
        if (typeof shared === "object" && shared !== null && shared.toString) shared = shared.toString();
        shared = String(shared || "");
        // エンコードしてクエリに乗せる
        const encoded = encodeURIComponent(shared);
        // 303 See Other でクライアントを開くよう指示（多くのブラウザがこれで PWA をフォアグラウンドで開く）
        // GitHub Pages用: 現在のスコープから正しいベースURLを取得
        const base = self.registration.scope; 
        return Response.redirect(base + "?shared=" + encoded, 303);

      } catch (err) {
        // 失敗したらトップに戻す
        return Response.redirect("/", 303);
      }
    })());
    return;
  }

  // 通常の静的キャッシュ戦略（キャッシュ優先）
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(res => res || fetch(req).catch(()=>res))
    );
  }
});

// service worker からクライアントにメッセージを送るときのヘルパー（必要なら）
async function broadcastMessage(msg) {
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const c of clientsList) {
    c.postMessage(msg);
  }
}