CREATE TABLE IF NOT EXISTS principals (
 id uuid PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL, UNIQUE(issuer,subject)
);
CREATE TABLE IF NOT EXISTS projects (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, version bigint NOT NULL CHECK(version>0), data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id);
CREATE TABLE IF NOT EXISTS tasks (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id);
CREATE TABLE IF NOT EXISTS requests (
 owner_id uuid NOT NULL, request_id uuid NOT NULL, project_id uuid NOT NULL,
 expected_version bigint NOT NULL, body_hash text NOT NULL, result jsonb,
 PRIMARY KEY(owner_id,request_id)
);
