(() => {
  'use strict';
  const cfg = window.GCAD_CONFIG || {};
  const form = document.getElementById('loginForm');
  const btn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const resetBtn = document.getElementById('resetBtn');
  const message = document.getElementById('message');
  const setup = document.getElementById('setupNotice');

  const configured = cfg.supabaseUrl && cfg.supabasePublishableKey && window.supabase?.createClient;
  const say = (text, type='') => { message.className = 'msg ' + type; message.textContent = text; };

  if (!configured) {
    setup.style.display = 'block';
    btn.disabled = signupBtn.disabled = resetBtn.disabled = true;
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  window.gcadSupabase = client;

  client.auth.getSession().then(({ data }) => {
    if (data?.session) location.replace('app.html');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    say('ログインしています…');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      say('ログインできませんでした。メールアドレスまたはパスワードをご確認ください。', 'error');
      btn.disabled = false;
      return;
    }
    location.replace('app.html');
  });

  signupBtn.addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || password.length < 8) {
      say('メールアドレスと8文字以上のパスワードを入力してください。', 'error');
      return;
    }
    signupBtn.disabled = true;
    say('アカウントを登録しています…');
    const emailRedirectTo = new URL('index.html', location.href).href;
    const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo } });
    if (error) {
      say('登録できませんでした。入力内容をご確認ください。', 'error');
    } else if (data?.session) {
      say('登録しました。利用許可を確認しています…', 'ok');
      setTimeout(() => location.replace('app.html'), 500);
    } else {
      say('確認メールを送信しました。メール内のリンクで確認後、ログインしてください。登録後はg-CAD側の利用許可が必要です。', 'ok');
    }
    signupBtn.disabled = false;
  });

  resetBtn.addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    if (!email) { say('先にメールアドレスを入力してください。', 'error'); return; }
    resetBtn.disabled = true;
    const redirectTo = new URL('reset.html', location.href).href;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    say(error ? '再設定メールを送信できませんでした。' : 'パスワード再設定メールを送信しました。', error ? 'error' : 'ok');
    resetBtn.disabled = false;
  });
})();
