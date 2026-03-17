CREATE TABLE IF NOT EXISTS courier_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(100) NOT NULL UNIQUE,
  api_base varchar(255) NOT NULL DEFAULT 'https://track.delhivery.com',
  client_name varchar(255) NOT NULL DEFAULT '',
  api_key varchar(255) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_credentials_provider ON courier_credentials(provider);
