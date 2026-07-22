import { serve } from "@hono/node-server";
import { Hono } from "hono";
const app = new Hono();
// 認証情報のミドルウェア
app.use(async (c, next) => {
    // App Serviceの組み込み認証から認証済みかどうかを確認
    const principal = c.req.header("X-MS-CLIENT-PRINCIPAL-NAME");
    if (!principal) {
        // 未認証の場合はログインページにリダイレクト
        return c.redirect("/.auth/login/aad");
    }
    // 認証情報をコンテキストに追加
    c.set("user", {
        name: principal,
        id: c.req.header("X-MS-CLIENT-PRINCIPAL-ID") || "",
        identityProvider: c.req.header("X-MS-CLIENT-PRINCIPAL-IDP") || "",
    });
    await next();
});
app.get("/", (c) => {
    return c.text("Hello Hono!");
});
app.get("/profile", async (c) => {
    const user = c.get("user");
    return c.html(`
    <html>
      <head>
        <title>ユーザープロフィール</title>
        <style>
          body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-top: 20px; }
          .button { display: inline-block; padding: 10px 20px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>ユーザープロフィール</h1>
        <div class="card">
          <h2>基本情報</h2>
          <p><strong>名前:</strong> ${user.name}</p>
          <p><strong>ID:</strong> ${user.id}</p>
          <p><strong>認証プロバイダー:</strong> ${user.identityProvider}</p>
        </div>
        <div style="margin-top: 20px;">
          <a href="/.auth/logout" class="button">ログアウト</a>
        </div>
      </body>
    </html>
  `);
});
app.get("/auth/me", async (c) => {
    try {
        // サーバーサイドから/.auth/meにリクエスト
        // URLを正しく構築 - ホスト部分を動的に取得
        const host = c.req.header("host") || "localhost:3000";
        const protocol = host.includes("localhost") ? "http" : "https";
        const url = new URL("/.auth/me", `${protocol}://${host}`);
        // ヘッダー初期化
        const headers = {};
        // クッキーも転送
        const cookieHeader = c.req.header("cookie");
        if (cookieHeader) {
            const cookies = cookieHeader.split(";");
            const authCookie = cookies.find((cookie) => cookie.trim().startsWith("AppServiceAuthSession="));
            if (authCookie) {
                headers["Cookie"] = authCookie.trim();
            }
            else {
                // 認証Cookieが見つからない場合のハンドリング
                console.warn("AppServiceAuthSession Cookieが見つかりません");
                return c.redirect("/.auth/login/aad"); // 再認証へリダイレクト
            }
        }
        // リクエスト実行
        const response = await fetch(url.toString(), {
            headers,
        });
        // レスポンスのステータスコードをチェック
        if (!response.ok) {
            throw new Error(`APIエラー: ${response.status} ${response.statusText}`);
        }
        // レスポンスのテキストを取得してデバッグ用に保存
        const responseText = await response.text();
        let authData = [];
        try {
            // JSON解析を試みる
            authData = JSON.parse(responseText);
        }
        catch (parseError) {
            console.error("JSON解析エラー:", parseError);
            return c.html(`
        <html>
          <head>
            <title>JSONエラー</title>
            <style>
              body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
              .error { color: red; }
              pre { background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
            </style>
          </head>
          <body>
            <h1>JSONデータの解析に失敗しました</h1>
            <p class="error">サーバーから受け取ったデータの形式が正しくありません。</p>
            <h2>受信したデータ</h2>
            <pre>${responseText.substring(0, 1000)}${responseText.length > 1000 ? "...(省略)" : ""}</pre>
            <a href="/profile">プロフィールに戻る</a>
          </body>
        </html>
      `);
        }
        // 認証情報から必要なデータを抽出
        const userInfo = authData && authData.length > 0 ? authData[0] : {};
        const claims = userInfo.user_claims || [];
        // クレームから特定の情報を検索する関数
        const findClaim = (type) => {
            const claim = claims.find((c) => c.typ === type);
            return claim ? claim.val : "不明";
        };
        // 表示するユーザー情報
        const userData = {
            name: findClaim("name"),
            email: findClaim("preferred_username") || findClaim("email"),
            objectId: findClaim("http://schemas.microsoft.com/identity/claims/objectidentifier"),
            tenantId: findClaim("http://schemas.microsoft.com/identity/claims/tenantid"),
            roles: claims
                .filter((c) => c.typ === "roles")
                .map((c) => c.val),
        };
        // ユーザー情報を表示するHTMLを返す
        return c.html(`
      <html>
        <head>
          <title>認証情報詳細</title>
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-top: 20px; }
            .button { display: inline-block; padding: 10px 20px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px; }
            .roles-list { list-style-type: none; padding: 0; }
            .roles-list li { background-color: #f0f0f0; margin: 5px 0; padding: 8px; border-radius: 4px; }
            .json-data { background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>認証情報詳細</h1>
          <div class="card">
            <h2>ユーザー情報</h2>
            <p><strong>名前:</strong> ${userData.name}</p>
            <p><strong>メールアドレス:</strong> ${userData.email}</p>
            <p><strong>オブジェクトID:</strong> ${userData.objectId}</p>
            <p><strong>テナントID:</strong> ${userData.tenantId}</p>

            <h3>ロール</h3>
            ${userData.roles && userData.roles.length > 0
            ? `<ul class="roles-list">
                  ${userData.roles.map((role) => `<li>${role}</li>`).join("")}
                </ul>`
            : "<p>割り当てられたロールはありません</p>"}
          </div>

          <div class="card">
            <h2>全ての認証クレーム</h2>
            <div class="json-data">
              <pre>${JSON.stringify(claims, null, 2)}</pre>
            </div>
          </div>

          <div style="margin-top: 20px;">
            <a href="/profile" class="button">プロフィールに戻る</a>
            <a href="/.auth/logout" class="button">ログアウト</a>
          </div>
        </body>
      </html>
    `);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "不明なエラー";
        console.error("認証情報取得エラー:", errorMessage);
        return c.html(`
      <html>
        <head>
          <title>エラー</title>
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .error { color: red; }
          </style>
        </head>
        <body>
          <h1>エラーが発生しました</h1>
          <p class="error">${errorMessage}</p>
          <a href="/profile">プロフィールに戻る</a>
        </body>
      </html>
    `);
    }
});
serve({
    fetch: app.fetch,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
}, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
});
