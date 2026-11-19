-- O papel de consulta: só ver o painel de OS (19/11/2026)
-- ========================================================
-- Rode DEPOIS do 06_painel_os_so_ver.sql, no SQL Editor do seu projeto Supabase.
-- Pode rodar de novo: nada aqui duplica nem apaga.
--
-- Até aqui todo papel lançava alguma coisa — o PCM, tudo; a operação, as
-- movimentações e a liberação da frota — e lia a fita inteira. Quem só precisa
-- conferir o painel de OS (o aprovisionamento, que vê se a OS existe para pedir
-- material nela) ficava com o poder da operação. O papel `consulta`:
--
--   - não lança nada: a política de insert dos eventos (02_acesso.sql) só abre
--     para 'pcm' e 'operacao', e continua assim;
--   - não lê a fita da oficina (eventos) nem a lista da equipe (pessoas) — só a
--     própria linha, que é de onde o site tira o nome e o papel;
--   - vê o painel de OS com a marca `os_makro`, como os outros; atualizar, nunca
--     (`os_makro_atualiza` fica false);
--   - no site, o menu tem só a OS Makro (js/app.js, js/foco.js).
--
-- Cadastrar, pelo SQL Editor (o site não escreve em `pessoas`), depois que a
-- conta existir:
--
--   insert into public.pessoas (email, nome, papel, os_makro)
--   values ('o.email@da.pessoa', 'Nome', 'consulta', true)
--   on conflict (email) do update set nome = excluded.nome, papel = excluded.papel, os_makro = excluded.os_makro;

alter table public.pessoas drop constraint if exists pessoas_papel_check;
alter table public.pessoas add constraint pessoas_papel_check check (papel in ('pcm', 'operacao', 'consulta'));

comment on column public.pessoas.papel is
  'pcm: tudo; operacao: movimentações e liberação da frota; consulta: não lança nem lê a fita (com os_makro, vê o painel de OS). Só se altera aqui, pelo painel.';

-- Ler: o PCM e a operação, como antes; a consulta, só a própria linha de pessoas
-- (o 02_acesso.sql tem as mesmas duas, para rodar ele de novo não reabrir).
drop policy if exists pessoas_leitura on public.pessoas;
create policy pessoas_leitura on public.pessoas
  for select to authenticated using (public.papel_atual() in ('pcm', 'operacao') or email = auth.email());

drop policy if exists eventos_leitura on public.eventos;
create policy eventos_leitura on public.eventos
  for select to authenticated using (public.papel_atual() in ('pcm', 'operacao'));

-- ── conferência ────────────────────────────────────────────────────────────
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'pessoas_papel_check';
--   select policyname, qual from pg_policies where tablename in ('pessoas', 'eventos') and cmd = 'SELECT';
--   select nome, papel, os_makro, os_makro_atualiza from public.pessoas where papel = 'consulta';
