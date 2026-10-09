-- Programação Makro — o lugar comum dos quatro
-- =============================================
-- Rode este arquivo uma vez, no SQL Editor do seu projeto Supabase
-- (Dashboard → SQL Editor → New query → colar → Run).
--
-- Uma tabela só guarda dado de verdade: a fita de eventos. Atividades,
-- movimentações e preventivas são o RESULTADO de tocar essa fita, montado no
-- navegador. Não existe tabela de estado aqui porque estado guardado ao lado do
-- histórico é estado que um dia discorda dele.

create table if not exists public.eventos (
  seq        bigserial primary key,          -- a ordem, dada pelo banco
  id         text        not null unique,    -- gerado no cliente: reenvio não duplica
  ts         timestamptz not null default now(),
  autor      text        not null,           -- Mateus, Lucas, Pedro, João Victor
  tipo       text        not null,
  alvo_tipo  text        not null,           -- atividade | movimentacao | preventiva
  alvo       text        not null,
  dados      jsonb       not null default '{}'::jsonb,
  motivo     text        not null default '',
  origem     text        not null default 'manual'
);

comment on table public.eventos is
  'Fita de eventos: a única fonte da verdade. Só aceita INSERT.';
comment on column public.eventos.id is
  'Gerado no navegador antes de enviar. É o que faz o reenvio de um celular que '
  'ficou sem sinal cair fora por conflito de chave em vez de criar duplicata.';

create index if not exists eventos_alvo_idx    on public.eventos (alvo_tipo, alvo);
create index if not exists eventos_ts_idx      on public.eventos (ts);
create index if not exists eventos_autor_idx   on public.eventos (autor);

-- ── o histórico é imutável ─────────────────────────────────────────────────
-- O banco recusa, para qualquer um e para sempre, apagar ou reescrever um
-- lançamento. Por política do Postgres, não por disciplina de quem usa.
--
-- As políticas abaixo são as de partida, abertas a quem tiver a chave. Quem
-- fecha de verdade é o `02_acesso.sql`, que amarra cada lançamento a quem
-- entrou e ao papel dessa pessoa — por isso os dois são rodados em sequência,
-- e rodar só este deixa a porta aberta.

alter table public.eventos enable row level security;

drop policy if exists eventos_leitura on public.eventos;
create policy eventos_leitura on public.eventos
  for select using (true);

drop policy if exists eventos_insere on public.eventos;
create policy eventos_insere on public.eventos
  for insert with check (
    length(coalesce(autor, ''))     between 1 and 60
    and length(coalesce(tipo, ''))  between 1 and 40
    and alvo_tipo in ('atividade', 'movimentacao', 'preventiva')
    and length(coalesce(alvo, ''))  between 1 and 80
    and length(coalesce(id, ''))    between 1 and 80
    and pg_column_size(dados) < 20000
  );

-- Sem política de UPDATE e sem política de DELETE: com RLS ligada, o que não
-- tem política é negado. Não é esquecimento — é o mecanismo.

revoke update, delete, truncate on public.eventos from anon, authenticated;

-- ── avisar as outras telas na hora ─────────────────────────────────────────
-- O que faz o apontamento do Pedro aparecer na tela do PCM sem ninguém
-- recarregar nada.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.eventos;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ── conferência ────────────────────────────────────────────────────────────
-- Depois de rodar, estas três linhas devem responder: a tabela existe, aceita
-- inserir, e recusa apagar.
--
--   select count(*) from public.eventos;
--   -- insert ... (o site faz)
--   delete from public.eventos;   -- tem de dar 0 linhas afetadas ou erro
