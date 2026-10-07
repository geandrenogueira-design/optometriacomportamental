-- Esquema do banco D1 do appoptometry.
-- Aplicar uma vez:  npx wrangler d1 execute appoptometry --remote --file=schema.sql
-- (ou colar no console do D1, em Cloudflare → Storage & Databases → D1 → appoptometry → Console)

-- Versão do pacote de dados de cada usuário (usada para evitar sobrescrita por aparelho desatualizado)
CREATE TABLE IF NOT EXISTS user_meta (
  user_id        TEXT PRIMARY KEY,
  updated_at     INTEGER NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1
);

-- Um paciente por linha (o JSON completo do paciente, com todos os testes)
CREATE TABLE IF NOT EXISTS patients (
  user_id  TEXT NOT NULL,
  id       TEXT NOT NULL,
  pos      INTEGER NOT NULL,
  data     TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Histórico: uma cópia por paciente por dia em que ele foi alterado, mantida por 30 dias.
-- Serve para recuperar um registro apagado ou alterado por engano.
CREATE TABLE IF NOT EXISTS patients_history (
  user_id TEXT NOT NULL,
  id      TEXT NOT NULL,
  day     TEXT NOT NULL,
  data    TEXT NOT NULL,
  PRIMARY KEY (user_id, id, day)
);

-- Anamnese preenchida pelos pais por link (formulário público /anamnese/?c=CÓDIGO).
-- O código é gerado no app (área protegida). Cada código aceita um único envio e expira.
CREATE TABLE IF NOT EXISTS anamnese (
  code         TEXT PRIMARY KEY,
  owner        TEXT NOT NULL,          -- e-mail do clínico que gerou o link
  label        TEXT NOT NULL,          -- nome da criança, para identificar o link
  patient_id   TEXT,                   -- paciente do app ao qual o link foi vinculado (opcional)
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  submitted_at INTEGER,
  consent_at   INTEGER,                -- momento do aceite do termo (LGPD)
  imported_at  INTEGER,
  status       TEXT NOT NULL DEFAULT 'aguardando',  -- aguardando | respondida | importada
  data         TEXT                    -- respostas (JSON)
);
CREATE INDEX IF NOT EXISTS anamnese_owner ON anamnese(owner, created_at);
