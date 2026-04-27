-- MemeAppSettings 单行配置（id=1），站内管理访问控制，优先于环境变量
CREATE TABLE "meme_app_settings" (
    "id" INTEGER NOT NULL,
    "site_password" TEXT,
    "api_key" TEXT,
    "session_secret" TEXT,

    CONSTRAINT "meme_app_settings_pkey" PRIMARY KEY ("id")
);
