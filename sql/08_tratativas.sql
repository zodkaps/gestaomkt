-- As tratativas de OS do painel (26/11/2026)
-- ==========================================
-- Rode DEPOIS do 07_consulta.sql, no SQL Editor do seu projeto Supabase. Pode
-- rodar de novo: nada aqui duplica nem apaga. Rodou o 02_acesso.sql de novo?
-- Rode este depois dele: o 02 refaz a política de lançamento sem as tratativas.
--
-- O supervisor marca no painel de OS as OS que precisam de uma tratativa no
-- Protheus (reprogramar, finalizar, trocar ou excluir alguma coisa); quem
-- atualiza o painel faz e confirma, ou recusa com a justificativa. Os pedidos e
-- as respostas são lançamentos na fita (`eventos`), como tudo no site — o alvo é
-- o pedido (`alvo_tipo = 'tratativa'`, `alvo` = o id dele), e a fita continua só
-- aceitando INSERT. Não há tabela nova: muda só a política de lançamento.
--
--   trat_pedida, trat_cancelada            quem é do PCM e vê o painel (ve_os());
--   trat_feita, trat_recusada, trat_reaberta quem é do PCM e atualiza o painel
--                                          (atualiza_os()); a recusa leva o motivo.
--
-- A operação e a consulta não lançam tratativa; o resto da política é o mesmo
-- do 02_acesso.sql, palavra por palavra.
--
-- Conferir depois (tem de mostrar 'tratativa' na lista de alvos):
--   select with_check from pg_policies where tablename = 'eventos' and policyname = 'eventos_insere';

drop policy if exists eventos_insere on public.eventos;
create policy eventos_insere on public.eventos
  for insert to authenticated with check (
    -- 1. não dá para assinar como outra pessoa: o autor tem de ser o seu nome
    autor = public.nome_atual()

    -- 2. e o lançamento tem de ser do seu papel
    and (
      -- as tratativas de OS (26/11/2026): pede quem vê o painel; trata quem o atualiza
      (alvo_tipo = 'tratativa'
        and public.papel_atual() = 'pcm'
        and (
          (tipo in ('trat_pedida', 'trat_cancelada') and public.ve_os())
          or (tipo in ('trat_feita', 'trat_reaberta') and public.atualiza_os())
          or (tipo = 'trat_recusada' and public.atualiza_os() and length(btrim(coalesce(motivo, ''))) > 0)
        ))
      or (alvo_tipo <> 'tratativa' and (
        public.papel_atual() = 'pcm'
        or (
          public.papel_atual() = 'operacao'
          -- sem 'importada': importar é do PCM. Com ela, um lançamento feito
          -- à mão poderia chegar já "aprovado" e pular a conferência do PCM.
          and (
            (alvo_tipo = 'movimentacao'
              and tipo in ('criada', 'editada',
                           'mov_prometida', 'mov_chegou', 'mov_cancelada', 'justificada'))
            -- na preventiva, a operação só informa a liberação da frota:
            -- incluir uma frota no plano e editar a preventiva são do PCM
            or (alvo_tipo = 'preventiva' and tipo = 'prev_disponivel')
          )
        )
      ))
    )

    -- 3. e continua valendo o formato. 'semana' é o fechamento da semana —
    -- só o PCM fecha, porque o ramo da operação acima não o inclui.
    and length(coalesce(tipo, '')) between 1 and 40
    and alvo_tipo in ('atividade', 'movimentacao', 'preventiva', 'semana', 'tratativa')
    and length(coalesce(alvo, '')) between 1 and 80
    and length(coalesce(id, '')) between 1 and 80
    and pg_column_size(dados) < 20000
  );
