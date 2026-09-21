-- Estrutura adicional sugerida para Modo Carreira Jogador v39

CREATE TABLE IF NOT EXISTS player_career_events (
 id BIGSERIAL PRIMARY KEY,
 player_career_id BIGINT NOT NULL,
 event_type TEXT NOT NULL,
 description TEXT NOT NULL,
 impact JSONB DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_career_match_stats (
 id BIGSERIAL PRIMARY KEY,
 player_career_id BIGINT NOT NULL,
 rating NUMERIC(3,1) DEFAULT 0,
 goals INTEGER DEFAULT 0,
 assists INTEGER DEFAULT 0,
 key_passes INTEGER DEFAULT 0,
 tackles INTEGER DEFAULT 0,
 created_at TIMESTAMPTZ DEFAULT NOW()
);