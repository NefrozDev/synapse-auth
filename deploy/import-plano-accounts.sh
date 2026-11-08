#!/bin/sh
# Copies Plano's accounts into the identity database, once, before Plano's
# version that signs in with the Synapse account starts (its migration drops
# the password hashes). Run as root (Docker access) on the VPS:
#   sh deploy/import-plano-accounts.sh
# Each account keeps its id (so Plano keeps everything that belongs to it),
# its username, e-mail, name, language, terms date and scrypt password hash,
# which the identity service checks as it is. Running it again adds only the
# accounts not imported yet. An account whose username or e-mail is already
# taken here is skipped and listed: settle those by hand.
set -eu

container="${PLANO_DB_CONTAINER:-plano-prod-db-1}"
csv=$(mktemp)
trap 'rm -f "$csv"' EXIT
chmod 600 "$csv"

# Plano's superuser reads Plano's database...
docker exec "$container" psql -U plano -d plano -v ON_ERROR_STOP=1 --quiet -c "\copy (
  SELECT id, username, \"normalizedUsername\", email, \"normalizedEmail\", \"passwordHash\",
         \"firstName\", \"lastName\", locale, \"termsAcceptedAt\", \"createdAt\"
  FROM users ORDER BY \"createdAt\"
) TO STDOUT WITH (FORMAT csv)" > "$csv"
echo "$(wc -l < "$csv") Plano accounts read."

# ...and writes the identity database through a staging table, in one transaction.
docker exec -i "$container" psql -U plano -d identity -v ON_ERROR_STOP=1 --quiet -c "
  SET client_min_messages TO warning;
  DROP TABLE IF EXISTS plano_import;
  CREATE TABLE plano_import (
    id varchar(36), username varchar(30), normalized_username varchar(30),
    email varchar(254), normalized_email varchar(254), password_hash text,
    given_name varchar(80), family_name varchar(80), locale varchar(8),
    terms_accepted_at timestamptz, created_at timestamptz
  )"
docker exec -i "$container" psql -U plano -d identity -v ON_ERROR_STOP=1 --quiet \
  -c "\copy plano_import FROM STDIN WITH (FORMAT csv)" < "$csv"
docker exec -i "$container" psql -U plano -d identity -v ON_ERROR_STOP=1 --quiet <<'SQL'
BEGIN;
WITH imported AS (
  INSERT INTO accounts (id, username, normalized_username, email, normalized_email,
                        password_hash, given_name, family_name, locale,
                        terms_accepted_at, created_at, updated_at)
  SELECT id, username, normalized_username, email, normalized_email, password_hash,
         given_name, family_name, locale, terms_accepted_at, created_at, now()
  FROM plano_import
  ON CONFLICT DO NOTHING
  RETURNING id
)
SELECT count(*) AS "accounts imported" FROM imported;
-- Skipped: someone else here already has that username or e-mail address.
SELECT i.username AS "skipped: username", i.email
FROM plano_import i
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = i.id);
COMMIT;
DROP TABLE plano_import;
SQL
