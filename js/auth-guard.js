(() => {
  'use strict';
  const cfg = window.GCAD_CONFIG || {};

  async function ready() {
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase?.createClient) {
      location.replace('index.html');
      return;
    }
    const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
    window.gcadSupabase = client;
    window.jcadSupabase = client;

    const { data, error } = await client.auth.getSession();
    if (error || !data?.session) { location.replace('index.html'); return; }

    const user = data.session.user;
    const { data: access, error: accessError } = await client
      .from('gcad_access')
      .select('enabled,role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (accessError || !access?.enabled) {
      const loading = document.getElementById('authLoading');
      if (loading) {
        loading.innerHTML = `
          <div style="width:min(460px,calc(100% - 32px));background:#181b21;border:1px solid #303640;border-radius:12px;padding:24px;text-align:center">
            <div style="font-size:20px;font-weight:700;margin-bottom:10px">g-CAD 利用承認待ち</div>
            <div style="font-size:13px;color:#aab4c2;line-height:1.7;margin-bottom:18px">ログインは成功しましたが、このアカウントにはまだg-CADの利用許可がありません。管理者の承認後に使用できます。</div>
            <button id="pendingLogout" style="background:#20242c;color:#eef2f7;border:1px solid #303640;border-radius:7px;padding:9px 14px;cursor:pointer">ログアウト</button>
          </div>`;
        document.getElementById('pendingLogout')?.addEventListener('click', async () => {
          await client.auth.signOut();
          location.replace('index.html');
        });
      }
      return;
    }

    const badge = document.getElementById('userBadge');
    if (badge) badge.textContent = access.role === 'admin' ? '管理者' : 'ログイン中';
    document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      await client.auth.signOut();
      location.replace('index.html');
    });
    document.body.classList.remove('auth-pending');
    window.dispatchEvent(new CustomEvent('gcad-auth-ready', { detail: { user, access } }));
    window.dispatchEvent(new CustomEvent('jcad-auth-ready', { detail: { user, access } }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
