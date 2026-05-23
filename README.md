# Health Log

スマホ入力を中心にした、個人用の健康・体重ログです。

## Vercelに置く

Vercelに置くと、PCを消してもスマホからアプリを開けます。

流れ:

1. VercelでGitHubリポジトリをImportする
2. Deployする
3. VercelのURLをSupabase AuthのURL設定に追加する

Supabaseで追加する場所:

- Authentication > URL Configuration > Site URL
- Authentication > URL Configuration > Redirect URLs

VercelでAIコメントを使う場合は、Project Settings > Environment Variables に追加します。

```text
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_API_KEY` はGitHubやブラウザ側のコードには入れないでください。

## Supabase

接続先は `app.js` に設定済みです。

- URL: `https://gwetkvybdbnuhservzio.supabase.co`
- Key: `sb_publishable_...`

`service_role` や `sb_secret_...` はアプリに入れないでください。
