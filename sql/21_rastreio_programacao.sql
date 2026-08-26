-- ═══════════════════════════════════════════════════════════════════
--  21 — Rastreio da programação
--  Roda quantas vezes quiser: tudo é condicional.
--
--  O que este script acrescenta:
--    · criada_para   — a data para a qual a tarefa foi programada da
--                      primeira vez. É dela que a aderência mede o
--                      cumprimento, então ela nunca muda ao reprogramar.
--    · remarcacoes   — a lista de "de tal dia para tal dia", com quem e
--                      quando, para o histórico responder sozinho.
--    · geradas       — as tarefas que nasceram das pendências desta.
--    · origem_tarefa — o caminho de volta: de qual tarefa esta veio.
--
--  Sem estas colunas o sistema continua funcionando: ele detecta a
--  ausência e guarda o rastreio só no navegador.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Diagnóstico ────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n
    from information_schema.columns
   where table_schema='public' and table_name='tarefas'
     and column_name in ('criada_para','remarcacoes','geradas','origem_tarefa');
  raise notice 'Colunas de rastreio já presentes: % de 4', n;
end $$;

-- ─── 2. As colunas ─────────────────────────────────────────────────
alter table public.tarefas
  add column if not exists criada_para   timestamptz,
  add column if not exists remarcacoes   jsonb  not null default '[]'::jsonb,
  add column if not exists geradas       jsonb  not null default '[]'::jsonb,
  add column if not exists origem_tarefa uuid;

-- A tarefa de origem pode ser apagada; o filho não pode sumir junto,
-- só perde a referência.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
     where table_schema='public' and table_name='tarefas'
       and constraint_name='tarefas_origem_tarefa_fkey')
  then
    begin
      alter table public.tarefas
        add constraint tarefas_origem_tarefa_fkey
        foreign key (origem_tarefa) references public.tarefas(id) on delete set null;
    exception when others then
      raise notice 'Sem chave estrangeira para origem_tarefa (%). A coluna continua válida.', sqlerrm;
    end;
  end if;
end $$;

create index if not exists tarefas_origem_tarefa_idx
  on public.tarefas(origem_tarefa) where origem_tarefa is not null;

-- ─── 3. Preenche o histórico das tarefas que já existem ────────────
-- Quem nunca foi reprogramada tem a data original igual à atual.
update public.tarefas
   set criada_para = data_inicio
 where criada_para is null and data_inicio is not null;

-- ─── 4. A API precisa reler o schema ───────────────────────────────
notify pgrst, 'reload schema';

-- ─── 5. Conferência ────────────────────────────────────────────────
do $$
declare n int; c int;
begin
  select count(*) into n
    from information_schema.columns
   where table_schema='public' and table_name='tarefas'
     and column_name in ('criada_para','remarcacoes','geradas','origem_tarefa');
  select count(*) into c from public.tarefas where criada_para is not null;
  raise notice '── Pronto: % de 4 colunas de rastreio, % tarefa(s) com data original.', n, c;
end $$;
