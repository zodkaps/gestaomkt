-- O painel de OS: ver não é atualizar (10/11/2026)
-- ==================================================
-- Rode DEPOIS do 04_painel_os.sql, no SQL Editor do seu projeto Supabase. Pode
-- rodar de novo: nada aqui duplica nem apaga.
--
-- Até aqui a marca `os_makro` deixava ver E atualizar o painel (gravar no
-- bucket `painel-os`, o "Atualizar com o Protheus"). Agora são duas:
--
--   os_makro            vê o painel;
--   os_makro_atualiza   (junto com a de cima) também atualiza.
--
-- Quem só vê não tem o botão no site, e o banco recusa a gravação de qualquer
-- jeito. Liberar ou tirar, pelo SQL Editor (o site não escreve em `pessoas`):
--
--   update public.pessoas set os_makro = true where nome = 'Lucas';              -- só vê
--   update public.pessoas set os_makro_atualiza = true where nome = 'Mateus';    -- também atualiza

alter table public.pessoas add column if not exists os_makro_atualiza boolean not null default false;

comment on column public.pessoas.os_makro_atualiza is
  'Com os_makro: também atualiza o painel de OS (grava no bucket painel-os). Só se altera aqui, pelo painel.';

-- Quem atualizava antes desta separação era o Mateus: ele continua. Os outros
-- com a marca passam a só ver.
update public.pessoas set os_makro_atualiza = true where nome = 'Mateus' and os_makro and not os_makro_atualiza;

-- A pergunta das gravações. `security definer` pelo mesmo motivo do ve_os().
create or replace function public.atualiza_os() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select os_makro and os_makro_atualiza from public.pessoas where email = auth.email()), false)
$$;

revoke execute on function public.atualiza_os() from public, anon;
grant execute on function public.atualiza_os() to authenticated;

-- Ler continua com o ve_os(); gravar, trocar e apagar passam a pedir o atualiza_os().
drop policy if exists painel_os_grava on storage.objects;
create policy painel_os_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'painel-os' and public.atualiza_os());

drop policy if exists painel_os_troca on storage.objects;
create policy painel_os_troca on storage.objects for update to authenticated
  using (bucket_id = 'painel-os' and public.atualiza_os())
  with check (bucket_id = 'painel-os' and public.atualiza_os());

drop policy if exists painel_os_apaga on storage.objects;
create policy painel_os_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'painel-os' and public.atualiza_os());

-- ── conferência ────────────────────────────────────────────────────────────
--   select nome, papel, os_makro, os_makro_atualiza from public.pessoas where os_makro order by nome;
--   select policyname, cmd from pg_policies where tablename = 'objects' and policyname like 'painel_os%';
