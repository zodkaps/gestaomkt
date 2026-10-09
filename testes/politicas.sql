\set ON_ERROR_STOP off
\echo '── 1. Pedro (operação) aponta a chegada de uma frota — TEM de passar'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makroteste.com.br"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t1','Pedro','mov_chegou','movimentacao','M-0001');
  select '   → passou' as resultado;
commit;

\echo '── 1b. Pedro justifica o atraso de uma movimentação — TEM de passar'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makroteste.com.br"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo,dados) values ('t1b','Pedro','justificada','movimentacao','M-0001','{"motivo":"Frota em viagem / operando","quem":"Operação"}');
  select '   → passou' as resultado;
commit;

\echo '── 1c. Pedro tenta justificar uma ATIVIDADE (OS) — tem de ser RECUSADO'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makroteste.com.br"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t1c','Pedro','justificada','atividade','A-0001');
rollback;

\echo '── 2. Pedro tenta dar baixa numa ATIVIDADE — tem de ser RECUSADO'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makroteste.com.br"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t2','Pedro','concluida','atividade','A-0001');
rollback;

\echo '── 3. Pedro tenta assinar como Mateus — tem de ser RECUSADO'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makroteste.com.br"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t3','Mateus','mov_chegou','movimentacao','M-0001');
rollback;

\echo '── 4. Mateus (PCM) dá baixa numa atividade — TEM de passar'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"mateus@makroteste.com.br"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t4','Mateus','concluida','atividade','A-0001');
  select '   → passou' as resultado;
commit;

\echo '── 5. Ninguém apaga nem reescreve — as duas têm de ser RECUSADAS'
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"mateus@makroteste.com.br"}';
  delete from eventos where id = 't1';
rollback;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"mateus@makroteste.com.br"}';
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
  set local request.jwt.claims = '{"email":"pedro@makroteste.com.br"}';
  update pessoas set papel = 'pcm' where email = 'pedro@makroteste.com.br';
rollback;

\echo '── 8. Sem entrar (anon) não chama nem as funções de papel — RECUSADO'
begin;
  set local role anon;
  select public.nome_atual();
rollback;

\echo '── 8b. Pedro tenta APROVAR a movimentação que ele mesmo concluiu — RECUSADO'
-- Quem faz não aprova: a aprovação é do PCM, e o banco garante, não a tela.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"pedro@makroteste.com.br"}';
  insert into eventos (id,autor,tipo,alvo_tipo,alvo) values ('t8b','Pedro','mov_aprovada','movimentacao','M-0001');
rollback;

\echo '── 9. Conta criada por qualquer um, sem papel, não lê a fita — VAZIO'
-- O cadastro do Supabase é aberto e a chave do site é pública: ter conta não
-- pode bastar para ler a carteira. Quem não está em `pessoas` vê zero linhas.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"email":"alguem.de.fora@gmail.com"}';
  select case when (select count(*) from eventos) = 0
               and (select count(*) from pessoas) = 0
              then '   → não viu nada'
              else '   → VIU A FITA' end as resultado;
rollback;

\echo '── o que sobrou gravado:'
select id, autor, tipo, alvo_tipo from eventos order by seq;
