-- Endurecer o que sobrou do site antigo no mesmo projeto (06/11/2026)
-- ==========================================================================
-- Rode no SQL Editor do Supabase. Pode rodar de novo, e num projeto que não
-- tem o site antigo também: o que não existir é pulado.
--
-- O projeto ainda carrega as tabelas e funções do site antigo (solicitações,
-- RF, planos de manutenção), parado desde agosto. O alerta de segurança do
-- Supabase apontou três coisas nelas, e nenhuma muda o que este site faz:
--
-- 1. `gerar_os_planos` roda com poder de dono do banco e não confere quem
--    chama: qualquer conta da equipe podia gerar OS dos planos pela API.
--    Sai a permissão de chamar pela API; pelo SQL Editor continua igual.
-- 2. Funções de gatilho com poder de dono (`tg_…`) apareciam como chamáveis
--    pela API. Chamar não fazia nada, mas sai a permissão — o gatilho
--    continua disparando (o Postgres não confere essa permissão ao disparar;
--    provado antes de rodar aqui).
-- 3. Sete funções sem `search_path` fixo: ficam presas ao `public`, que é onde
--    tudo o que elas usam já mora.
--
-- O que fica como está, de propósito: `papel_atual()`, `nome_atual()` e
-- `ve_os()` são chamadas pelas políticas e pelo site, com a conta de quem
-- entrou — é para isso que existem. As outras funções do site antigo
-- (analisar, converter, definir perfil…) conferem sozinhas se quem chama é
-- PCM ou administrador.

do $$
declare
  f text;
begin
  -- 1 e 2: não se chamam pela API
  foreach f in array array[
    'public.gerar_os_planos(date)',
    'public.tg_bloqueia_auto_promocao()',
    'public.tg_novo_usuario()',
    'public.tg_rf_sincroniza_veiculo()',
    'public.tg_sol_grava_autor()',
    'public.tg_solicitacao_auditoria()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;

  -- 3: search_path fixo
  foreach f in array array[
    'public.eh_admin()',
    'public.eh_pcm()',
    'public.pode_editar_rf()',
    'public.proxima_data(public.frequencia_plano, date)',
    'public.tg_apontamento_fecha()',
    'public.tg_set_updated_at()',
    'public.tg_tarefa_checklist()'
  ] loop
    -- to_regprocedure falha se o tipo do argumento não existe; sem o site antigo, pula
    begin
      if to_regprocedure(f) is not null then
        execute format('alter function %s set search_path = public', f);
      end if;
    exception when undefined_object then null;
    end;
  end loop;
end $$;

-- ── conferência ────────────────────────────────────────────────────────────
--   select has_function_privilege('authenticated', 'public.gerar_os_planos(date)', 'execute');  -- false
--   select proname, proconfig from pg_proc where proname in ('eh_admin','eh_pcm');            -- search_path=public
