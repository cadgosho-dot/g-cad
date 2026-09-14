// g-CAD Online authentication configuration.
// この publishable key はブラウザ公開用です。service_role / secret key は絶対に入れないでください。
window.GCAD_CONFIG = {
  supabaseUrl: "https://ubkxsgpxcwgjyowndlzr.supabase.co",
  supabasePublishableKey: "sb_publishable_cIqMrk8FbQdaAsOn5bCHHw_RQaYEHlF"
};
// v0.2との互換用（将来削除予定）
window.JEWELRY_CAD_CONFIG = {
  supabaseUrl: window.GCAD_CONFIG.supabaseUrl,
  supabaseAnonKey: window.GCAD_CONFIG.supabasePublishableKey
};
