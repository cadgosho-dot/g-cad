# g-CAD Online v0.3

ジュエリー制作専用CAD「g-CAD」のオンライン版です。

## 現在の構成
- GitHub Pages: CAD公開
- Supabase Auth: メールアドレス + パスワード認証
- `gcad_access`: 利用承認管理（ログインだけではCADを開けない）
- `gcad_projects`: 将来のユーザー別クラウド保存用
- STLエクスポート

## 認証
1. ログイン画面で初回アカウント登録
2. Supabaseの確認メールでメールアドレスを確認
3. 管理者が `gcad_access` に利用許可を登録
4. 許可済みユーザーだけ `app.html` を開ける

## セキュリティ
ブラウザにはSupabaseの publishable key のみ置きます。service_role / secret key は絶対に配置しません。
公開テーブルはRLSを有効にして使用します。

## 公開
`main` へのpushで `.github/workflows/pages.yml` がGitHub Pagesへ自動デプロイします。
