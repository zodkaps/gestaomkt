-- Que tabela deste projeto está aberta?
-- =====================================
-- Rode no SQL Editor ANTES de pôr a chave do navegador em `js/config.js`.
--
-- A chave publishable é feita para ficar à vista — mas o que ela alcança é
-- decidido pelo RLS. Sem RLS numa tabela, essa chave lê a tabela inteira. Este
-- projeto é o mesmo do site antigo e ainda carrega as tabelas daquele app, que
-- eu não criei e não sei como estão.
--
-- Toda linha tem de voltar como 'ok'. Qualquer '⚠ ABERTA' é tabela que
-- qualquer pessoa com o endereço do site conseguiria ler.

select tablename,
       case when rowsecurity then 'ok' else '⚠ ABERTA' end as rls
  from pg_tables
 where schemaname = 'public'
 order by rowsecurity, tablename;

-- Para fechar uma que voltou aberta e que ainda é usada:
--
--   alter table public.<nome> enable row level security;
--   -- e então criar a política que diz quem pode o quê; sem política, com RLS
--   -- ligada, ninguém lê — que é o padrão seguro.
--
-- Para uma que não serve mais:
--
--   drop table public.<nome>;
