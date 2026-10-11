CREATE TABLE IF NOT EXISTS draft_keys (
 owner_id uuid NOT NULL REFERENCES principals(id), environment text NOT NULL,
 key_version integer NOT NULL DEFAULT 1, master_version text NOT NULL,
 iv text NOT NULL, ciphertext text NOT NULL, tag text NOT NULL,
 PRIMARY KEY(owner_id, environment)
);
