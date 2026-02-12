ALTER TABLE tenants ALTER COLUMN llm_mode SET DEFAULT 'scheduled';
ALTER TABLE tenants ALTER COLUMN llm_min_change_count SET DEFAULT 0;

UPDATE tenants
SET llm_mode = 'scheduled', llm_min_change_count = 0
WHERE llm_mode IS NULL;

ALTER TABLE clients ALTER COLUMN schedule SET DEFAULT '{"frequency":"monthly","dayOfMonth":1,"hour":9}'::jsonb;

UPDATE clients
SET schedule = '{"frequency":"monthly","dayOfMonth":1,"hour":9}'::jsonb
WHERE schedule IS NULL OR schedule->>'frequency' = 'none';
