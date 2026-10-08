\set ON_ERROR_STOP off
\echo '── 1. Pedro (operação) aponta a chegada de uma frota — TEM de passar'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makro.local"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t1','Pedro','mov_chegou','movimentacao','M-0001');
  select '   → passou' as resultado;
commit;

\echo '── 2. Pedro tenta dar baixa numa ATIVIDADE — tem de ser RECUSADO'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makro.local"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t2','Pedro','concluida','atividade','A-0001');
rollback;

\echo '── 3. Pedro tenta assinar como Mateus — tem de ser RECUSADO'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makro.local"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t3','Mateus','mov_chegou','movimentacao','M-0001');
rollback;

\echo '── 4. Mateus (PCM) dá baixa numa atividade — TEM de passar'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"mateus@makro.local"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t4','Mateus','concluida','atividade','A-0001');
  select '   → passou' as resultado;
commit;

\echo '── 5. Ninguém apaga nem reescreve — as duas têm de ser RECUSADAS'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"mateus@makro.local"}';
  delete from eventos where id = 't1';
rollback;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"mateus@makro.local"}';
  update eventos set autor = 'outro' where id = 't1';
rollback;

\echo '── 6. Sem entrar (anon) não se lê nem se escreve — RECUSADO'
begin;
  set local role anon;
  select count(*) from eventos;
rollback;

\echo '── 7. Ninguém troca o próprio papel — RECUSADO'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makro.local"}';
  update pessoas set papel = 'pcm' where email = 'pedro@makro.local';
rollback;

\echo '── o que sobrou gravado:'
select id, autor, tipo, alvo_tipo from eventos order by seq;
