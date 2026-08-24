-- ═══════════════════════════════════════════════════════════════════════════
--  Gestão MKT · 20_agenda_dias_fila_terceiros.sql
--
--  Alinha o banco com a agenda baseada em dias (v5.1 → v5.3):
--    1. Diagnóstico — rode primeiro e guarde o resultado
--    2. Colunas de hora deixam de ser obrigatórias  ← corrige a falha ao salvar
--    3. Status "em_programacao" passa a ser aceito  (fila de programação)
--    4. Colunas de serviço terceirizado
--    5. Tempo real — para a alteração aparecer para os outros usuários
--
--  Onde rodar: Supabase → SQL Editor → New query → colar → Run.
--  Pode rodar mais de uma vez: tudo aqui é idempotente.
--
--  NOTA: a tabela public.apontamentos (relógio de horas) deixou de ser usada
--  pelo app na v5.1, mas NAO e apagada aqui. Se quiser remover, faca isso
--  conscientemente depois de conferir que nao ha nada la que voce queira:
--      select count(*) from public.apontamentos;
--      -- drop table public.apontamentos;
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. DIAGNÓSTICO
--    Rode este bloco sozinho primeiro. Se a gravação continuar falhando
--    depois da migration, é o resultado destas duas consultas que diz por quê.
-- ─────────────────────────────────────────────────────────────────────────

-- Quais colunas existem e quais são obrigatórias
select table_name,
       column_name,
       data_type,
       is_nullable,
       column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('tarefas', 'mao_de_obra', 'planos_manutencao')
 order by table_name, ordinal_position;

-- Regras de validação (CHECK) da tabela de tarefas
select conname as restricao,
       pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid = 'public.tarefas'::regclass
   and contype = 'c';


-- ─────────────────────────────────────────────────────────────────────────
-- 2. COLUNAS DE HORA DEIXAM DE SER OBRIGATÓRIAS
--
--    A programação passou a ser medida em dias. O app continua preenchendo
--    estas colunas por compatibilidade, mas se alguma estiver como NOT NULL
--    sem valor padrão, qualquer versão que não as envie quebra a gravação.
--    Tornar nulável resolve na raiz e não apaga nada do que já existe.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  alvo record;
begin
  for alvo in
    select table_name, column_name
      from information_schema.columns
     where table_schema = 'public'
       and is_nullable = 'NO'
       and (   (table_name = 'tarefas'     and column_name in ('horas_previstas','horas_reais'))
            or (table_name = 'mao_de_obra' and column_name in ('carga_diaria','custo_hora'))
            or (table_name = 'planos_manutencao' and column_name in ('horas_previstas')) )
  loop
    execute format('alter table public.%I alter column %I drop not null',
                   alvo.table_name, alvo.column_name);
    raise notice 'coluna %.% agora aceita nulo', alvo.table_name, alvo.column_name;
  end loop;
end $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. STATUS "em_programacao"  (fila de programação)
--
--    Trata os dois formatos possíveis da coluna: texto com CHECK, ou enum.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  tipo_coluna text;
  nome_enum   text;
  restricao   record;
begin
  select c.data_type, c.udt_name
    into tipo_coluna, nome_enum
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name  = 'tarefas'
     and c.column_name = 'status';

  if tipo_coluna is null then
    raise notice 'tabela tarefas nao encontrada — rode antes o 15_programacao.sql';
    return;
  end if;

  if tipo_coluna = 'USER-DEFINED' then
    -- A coluna é um enum. ADD VALUE não roda dentro de bloco de transação,
    -- então avisamos o comando exato em vez de tentar aqui.
    if not exists (select 1
                     from pg_enum e
                     join pg_type t on t.oid = e.enumtypid
                    where t.typname = nome_enum
                      and e.enumlabel = 'em_programacao') then
      -- "%" e o unico marcador do raise; montamos o comando com format()
      raise notice '>>> ATENCAO: a coluna status e um enum. Rode o comando abaixo '
                   'SOZINHO, numa query separada (ADD VALUE nao roda dentro de bloco):';
      raise notice '%', format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L;',
                               nome_enum, 'em_programacao');
    else
      raise notice 'enum % ja aceita em_programacao', nome_enum;
    end if;

  else
    -- Coluna de texto: derruba qualquer CHECK que fale de status e recria
    -- com a lista completa.
    for restricao in
      select conname
        from pg_constraint
       where conrelid = 'public.tarefas'::regclass
         and contype  = 'c'
         and pg_get_constraintdef(oid) ilike '%status%'
    loop
      execute format('alter table public.tarefas drop constraint %I', restricao.conname);
      raise notice 'restricao % removida', restricao.conname;
    end loop;

    alter table public.tarefas
      add constraint tarefas_status_check
      check (status in ('em_programacao','programada','em_execucao',
                        'pausada','concluida','cancelada'));
    raise notice 'status agora aceita em_programacao';
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 4. SERVIÇOS TERCEIRIZADOS
--
--    terceirizada = executado por empresa de fora (não ocupa a equipe)
--    fornecedor   = nome da empresa responsável
-- ─────────────────────────────────────────────────────────────────────────
alter table public.tarefas
  add column if not exists terceirizada boolean not null default false;

alter table public.tarefas
  add column if not exists fornecedor text;

create index if not exists tarefas_terceirizada_idx
  on public.tarefas (terceirizada)
  where terceirizada;


-- ─────────────────────────────────────────────────────────────────────────
-- 5. TEMPO REAL  ← é isto que faz a alteração aparecer para os OUTROS
--
--    O Supabase só envia aviso de mudança das tabelas que estão na publicação
--    supabase_realtime. Sem isso, quem mexe numa tarefa não avisa ninguém e a
--    alteração só aparece para os colegas quando eles recarregam a página.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['tarefas','tarefa_equipe','mao_de_obra',
                           'planos_manutencao','componentes','config_listas',
                           'registros_falha','solicitacoes','veiculos','motoristas']
  loop
    if not exists (select 1 from information_schema.tables
                    where table_schema='public' and table_name=t) then
      raise notice 'tabela % nao existe — ignorada', t;
    elsif exists (select 1 from pg_publication_tables
                   where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      raise notice 'tabela % ja publicada', t;
    else
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'tabela % publicada no tempo real', t;
    end if;
  end loop;
exception when undefined_object then
  raise notice 'publicacao supabase_realtime nao encontrada — ative Realtime no painel do Supabase';
end $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 6. RECARREGA O CACHE DA API
--
--    O PostgREST (a API REST do Supabase) mantém o schema em cache. Sem
--    este aviso, as colunas recém-criadas podem demorar a aparecer para o
--    app, que continuaria reclamando de coluna inexistente.
-- ─────────────────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────
-- 7. CONFERÊNCIA
--    Depois de rodar, estas duas linhas devem devolver resultado sem erro.
-- ─────────────────────────────────────────────────────────────────────────
select 'colunas de terceiro' as teste, count(*) as ok
  from information_schema.columns
 where table_schema='public' and table_name='tarefas'
   and column_name in ('terceirizada','fornecedor');   -- esperado: 2

-- Comparamos como texto: se o status for enum e o valor ainda nao existir,
-- a consulta responde 0 em vez de estourar.
select 'status da fila' as teste,
       count(*) filter (where status::text = 'em_programacao') as na_fila,
       count(*) as total
  from public.tarefas;
