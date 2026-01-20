CREATE TABLE IF NOT EXISTS tweets (
    tweet_id TEXT PRIMARY KEY,
    body JSONB NOT NULL,
    criteria JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE,
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
    job_id SERIAL PRIMARY KEY,
    type TEXT NOT NULL, -- 'profile', 'search'
    query TEXT NOT NULL, -- 'elonmusk', 'mars'
    interval_minutes INTEGER DEFAULT 15,
    last_run_at TIMESTAMP WITH TIME ZONE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default jobs
INSERT INTO jobs (type, query) VALUES 
('profile', 'elonmusk'),
('profile', 'NASA'),
('search', 'mars'),
('search', 'crypto')
ON CONFLICT DO NOTHING;