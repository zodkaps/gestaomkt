-- Quem entra, e o que cada um pode escrever
-- =========================================
-- Rode DEPOIS do 01_esquema.sql, no SQL Editor do seu projeto Supabase.
--
-- Até aqui a separação entre PCM e operação era combinada: o site escondia do
-- Pedro o que não era dele, mas quem trocasse o nome na tela lançava como PCM.
-- Este arquivo transforma isso em parede: quem recusa passa a ser o Postgres.

-- ── quem é quem ────────────────────────────────────────────────────────────
-- O papel sai do código e vem para cá. Repare no que NÃO existe mais abaixo:
-- política de insert e de update nesta tabela. Com RLS ligada, o que não tem
-- política é negado — então ninguém troca o próprio papel pelo navegador.

create table if not exists public.pessoas (
  email text primary key,
  nome  text not null,
  papel text not null check (papel in ('pcm', 'operacao'))
);

comment on table public.pessoas is
  'Papel de cada acesso. Só se altera aqui, pelo painel — o site não escreve.';

insert into public.pessoas (email, nome, papel) values
  ('mateus@makro.local',       'Mateus',      'pcm'),
  ('lucas@makro.local',        'Lucas',       'pcm'),
  ('pedro@makro.local',        'Pedro',       'operacao'),
  ('joao.victor@makro.local',  'João Victor', 'operacao')
on conflict (email) do update set nome = excluded.nome, papel = excluded.papel;

alter table public.pessoas enable row level security;

drop policy if exists pessoas_leitura on public.pessoas;
create policy pessoas_leitura on public.pessoas
  for select to authenticated using (true);

revoke insert, update, delete on public.pessoas from anon, authenticated;

-- ── as duas perguntas que a política de eventos faz ────────────────────────
-- `security definer` para a função poder ler `pessoas` mesmo dentro de uma
-- política — sem isso a checagem entraria em recursão com a própria RLS.

create or replace function public.papel_atual() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.pessoas where email = auth.email()
$$;

create or replace function public.nome_atual() returns text
language sql stable security definer set search_path = public as $$
  select nome from public.pessoas where email = auth.email()
$$;

-- ── eventos: só quem entrou, e só o que é do seu papel ─────────────────────

drop policy if exists eventos_leitura on public.eventos;
create policy eventos_leitura on public.eventos
  for select to authenticated using (true);

drop policy if exists eventos_insere on public.eventos;
create policy eventos_insere on public.eventos
  for insert to authenticated with check (
    -- 1. não dá para assinar como outra pessoa: o autor tem de ser o seu nome
    autor = public.nome_atual()

    -- 2. e o lançamento tem de ser do seu papel
    and (
      public.papel_atual() = 'pcm'
      or (
        public.papel_atual() = 'operacao'
        and alvo_tipo in ('movimentacao', 'preventiva')
        and tipo in ('criada', 'importada', 'editada',
                     'mov_prometida', 'mov_chegou', 'mov_cancelada',
                     'prev_disponivel')
      )
    )

    -- 3. e continua valendo o formato
    and length(coalesce(tipo, '')) between 1 and 40
    and alvo_tipo in ('atividade', 'movimentacao', 'preventiva')
    and length(coalesce(alvo, '')) between 1 and 80
    and length(coalesce(id, '')) between 1 and 80
    and pg_column_size(dados) < 20000
  );

-- ── permissão de tabela, antes da política ─────────────────────────────────
-- RLS filtra LINHAS; o GRANT decide se a tabela pode ser tocada. Um projeto
-- Supabase novo já concede por padrão, mas depender disso é depender de uma
-- configuração que ninguém vê: se o padrão mudar, nada funciona e o erro não
-- diz por quê. Explícito aqui.

grant select, insert on public.eventos to authenticated;
grant usage, select on sequence public.eventos_seq_seq to authenticated;
grant select on public.pessoas to authenticated;

-- O anônimo perde tudo: sem entrar, não se lê nem se escreve.
revoke all on public.eventos from anon;
revoke all on public.pessoas from anon;
revoke update, delete, truncate on public.eventos from authenticated;
revoke insert, update, delete on public.pessoas from authenticated;

-- Sem política de UPDATE e sem política de DELETE, para ninguém: a fita
-- continua só-insere. Nada se apaga, nada se reescreve, nem pelo PCM.

-- ── conferência ────────────────────────────────────────────────────────────
-- Entrando como Pedro (operação), estas duas têm de FALHAR:
--
--   insert into eventos (id,autor,tipo,alvo_tipo,alvo)
--   values ('t1','Pedro','concluida','atividade','A-0001');   -- não é do papel
--
--   insert into eventos (id,autor,tipo,alvo_tipo,alvo)
--   values ('t2','Mateus','mov_chegou','movimentacao','M-0001'); -- não é o nome dele
--
-- E esta tem de passar:
--
--   insert into eventos (id,autor,tipo,alvo_tipo,alvo)
--   values ('t3','Pedro','mov_chegou','movimentacao','M-0001');
