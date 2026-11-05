-- O painel de OS do Protheus, dentro do site — só para quem tem acesso a ele
-- ==========================================================================
-- Rode DEPOIS do 02_acesso.sql, no SQL Editor do seu projeto Supabase. Pode
-- rodar de novo: nada aqui duplica nem apaga.
--
-- As OS do Protheus (a STJ e a STL que o Mateus exporta todo dia) NÃO moram no
-- repositório: ele é público, e o site também. Elas ficam num bucket PRIVADO
-- do Storage, `painel-os`, que o próprio site grava quando o Mateus solta os
-- arquivos do dia. Quem lê e quem grava ali não é o papel (ser PCM não basta):
-- é a marca `os_makro` na tabela `pessoas`.
--
-- Liberar para alguém — pelo SQL Editor, como todo cadastro (o site não
-- escreve em `pessoas`, então ninguém se libera sozinho):
--
--   update public.pessoas set os_makro = true where nome = 'Mateus';
--
-- Tirar: o mesmo, com `false`. Os arquivos continuam lá, só param de abrir.

-- ── a marca ────────────────────────────────────────────────────────────────
alter table public.pessoas add column if not exists os_makro boolean not null default false;

comment on column public.pessoas.os_makro is
  'Vê e atualiza o painel de OS do Protheus (bucket painel-os). Só se altera aqui, pelo painel.';

-- A pergunta que as políticas fazem. `security definer` pelo mesmo motivo do
-- papel_atual(): ler `pessoas` de dentro de uma política sem cair na RLS dela.
create or replace function public.ve_os() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select os_makro from public.pessoas where email = auth.email()), false)
$$;

revoke execute on function public.ve_os() from public, anon;
grant execute on function public.ve_os() to authenticated;

-- ── o bucket ───────────────────────────────────────────────────────────────
-- Privado: não existe link público para estes arquivos — todo pedido passa
-- pelas políticas abaixo com o token de quem pediu. Até 20 MB por arquivo, e
-- só o JSON compactado que o site grava.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('painel-os', 'painel-os', false, 20971520, array['application/gzip'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ── quem lê e quem grava ───────────────────────────────────────────────────
-- As quatro operações, todas presas ao bucket E à marca. Sem a marca, o
-- Storage responde como se o arquivo não existisse.
drop policy if exists painel_os_le on storage.objects;
create policy painel_os_le on storage.objects for select to authenticated
  using (bucket_id = 'painel-os' and public.ve_os());

drop policy if exists painel_os_grava on storage.objects;
create policy painel_os_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'painel-os' and public.ve_os());

drop policy if exists painel_os_troca on storage.objects;
create policy painel_os_troca on storage.objects for update to authenticated
  using (bucket_id = 'painel-os' and public.ve_os())
  with check (bucket_id = 'painel-os' and public.ve_os());

drop policy if exists painel_os_apaga on storage.objects;
create policy painel_os_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'painel-os' and public.ve_os());

-- ── conferência ────────────────────────────────────────────────────────────
--   select id, public from storage.buckets where id = 'painel-os';      -- public = false
--   select nome, papel, os_makro from public.pessoas order by nome;     -- só quem deve, true
