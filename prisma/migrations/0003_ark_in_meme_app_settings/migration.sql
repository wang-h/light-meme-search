-- 火山多模态向量：在 meme_app_settings 中保存，与 API Key/登录一致（优先于 .env）
ALTER TABLE "meme_app_settings" ADD COLUMN IF NOT EXISTS "ark_api_key" TEXT;
ALTER TABLE "meme_app_settings" ADD COLUMN IF NOT EXISTS "ark_base_url" TEXT;
ALTER TABLE "meme_app_settings" ADD COLUMN IF NOT EXISTS "embedding_model" TEXT;
