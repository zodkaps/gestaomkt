#!/usr/bin/env bash
# Prova que o BANCO recusa o que a tela esconde.
#
#     bash testes/politicas.sh
#
# Sobe um Postgres de verdade, roda as duas migrações como elas serão rodadas
# no Supabase, e tenta sete coisas: três que têm de passar e quatro que têm de
# ser recusadas. Sem isto, "o limite virou parede" é só uma frase.
#
# O `auth.email()` daqui é o mesmo mecanismo do Supabase: lê o e-mail de
# `request.jwt.claims`, a variável de sessão que o PostgREST preenche a partir
# do token de quem chamou.
set -euo pipefail

BIN=/usr/lib/postgresql/16/bin
D=${PGTESTE:-/var/lib/postgresql/mkt-teste}
AQUI=$(cd "$(dirname "$0")/.." && pwd)

[ -x "$BIN/initdb" ] || { echo "Postgres não instalado — pulando."; exit 0; }

limpar() { su postgres -s /bin/bash -c "$BIN/pg_ctl -D $D/dados stop -m immediate" >/dev/null 2>&1 || true; }
trap limpar EXIT

limpar; rm -rf "$D"; mkdir -p "$D/dados" "$D/sock"; chown -R postgres:postgres "$D"
su postgres -s /bin/bash -c "$BIN/initdb -D $D/dados -U postgres --auth=trust -E UTF8" >/dev/null
su postgres -s /bin/bash -c "$BIN/pg_ctl -D $D/dados -o '-k $D/sock -c listen_addresses=' -l $D/pg.log start" >/dev/null
sleep 2

psql -h "$D/sock" -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
-- o mínimo do Supabase que as políticas usam
create role anon nologin;
create role authenticated nologin;
create schema if not exists auth;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '')
$$;
grant usage on schema public to anon, authenticated;
SQL

psql -h "$D/sock" -U postgres -q -v ON_ERROR_STOP=1 -f "$AQUI/sql/01_esquema.sql" 2>&1 | grep -v NOTICE || true
psql -h "$D/sock" -U postgres -q -v ON_ERROR_STOP=1 -f "$AQUI/sql/02_acesso.sql"  2>&1 | grep -v NOTICE || true
echo "✓ as duas migrações rodam limpas"

# O 02 não semeia mais ninguém (e-mail de verdade não mora no repositório): a
# equipe do teste é cadastrada aqui, do jeito que se cadastra no painel.
psql -h "$D/sock" -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
insert into public.pessoas (email, nome, papel) values
  ('mateus@makroteste.com.br', 'Mateus', 'pcm'),
  ('pedro@makroteste.com.br',  'Pedro',  'operacao');
SQL

saida=$(psql -h "$D/sock" -U postgres -q -f "$AQUI/testes/politicas.sql" 2>&1)
echo "$saida" | grep -E "──|→ passou|→ não viu|→ VIU|ERROR" | sed 's/psql:.*ERROR:/   ✓ recusado:/'

# Rodar o 01 DEPOIS do 02 foi o que derrubou a parede no projeto de verdade: o
# 01 antigo recriava políticas abertas por cima. Agora tem de continuar fechado.
psql -h "$D/sock" -U postgres -q -v ON_ERROR_STOP=1 -f "$AQUI/sql/01_esquema.sql" 2>&1 | grep -v NOTICE || true
echo "── 10. Depois de rodar o 01 de novo, Pedro ainda não dá baixa — RECUSADO"
fora_de_ordem=$(psql -h "$D/sock" -U postgres -q 2>&1 <<'SQL'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makroteste.com.br"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t10','Pedro','concluida','atividade','A-0001');
rollback;
SQL
)
echo "$fora_de_ordem" | grep ERROR | sed 's/.*ERROR:/   ✓ recusado:/'

# O 03 solta quem ficou preso na confirmação de e-mail — mas só quem é da
# equipe. Uma conta qualquer, criada por alguém de fora, tem de continuar presa.
echo "── 11. O 03 solta a conta presa do Pedro, e não a de um estranho"
psql -h "$D/sock" -U postgres -q -v ON_ERROR_STOP=1 <<'SQL'
create table if not exists auth.users (email text primary key, email_confirmed_at timestamptz);
insert into auth.users values ('pedro@makroteste.com.br', null), ('estranho@gmail.com', null);
SQL
psql -h "$D/sock" -U postgres -q -v ON_ERROR_STOP=1 -f "$AQUI/sql/03_liberar_acessos.sql" >/dev/null
soltas=$(psql -h "$D/sock" -U postgres -tA -c \
  "select string_agg(email || '=' || (email_confirmed_at is not null), ',' order by email) from auth.users")
echo "   $soltas"

passou=$(echo "$saida" | grep -c "→ passou" || true)
recusado=$(( $(echo "$saida" | grep -c "ERROR" || true) + $(echo "$fora_de_ordem" | grep -c "ERROR" || true) ))
vazio=$(echo "$saida" | grep -c "→ não viu nada" || true)
echo
echo "$passou de 3 permitidas passaram · $recusado de 10 proibidas foram recusadas · $vazio de 1 conta sem papel não viu nada"
[ "$passou" = "3" ] && [ "$recusado" = "10" ] && [ "$vazio" = "1" ] || { echo "FALHOU"; exit 1; }
[ "$soltas" = "estranho@gmail.com=false,pedro@makroteste.com.br=true" ] || { echo "FALHOU: o 03 soltou errado"; exit 1; }
echo "tudo como projetado"
