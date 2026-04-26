-- Enable extensions for light-meme-search
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgroonga;

-- Memes table
CREATE TABLE "memes" (
    "id" SERIAL PRIMARY KEY,
    "category" VARCHAR(100) NOT NULL,
    "category_dir" VARCHAR(255) NOT NULL,
    "filename" VARCHAR(500) NOT NULL,
    "tags" TEXT[] DEFAULT '{}',
    "url" TEXT NOT NULL,
    "embedding" vector
);

-- Indexes
CREATE INDEX idx_memes_category ON "memes" ("category");

-- PGroonga: Chinese full-text search on tags array and filename
CREATE INDEX idx_memes_tags_pgroonga ON "memes" USING pgroonga ("tags");
CREATE INDEX idx_memes_filename_pgroonga ON "memes" USING pgroonga ("filename");
