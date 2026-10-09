-- Soltar acessos presos na confirmação de e-mail
-- ==============================================
-- Rode no SQL Editor quando alguém não conseguir entrar e o site disser que o
-- acesso "está esperando confirmação por e-mail".
--
-- Por que isto existe: o Supabase marca cada conta como confirmada ou não **no
-- momento em que ela é criada**. Desligar "Confirm email" nas opções muda o
-- padrão dali para frente — quem já nasceu esperando continua esperando um
-- e-mail que o envio embutido do Supabase não entrega para todo mundo.
--
-- Então são sempre duas coisas, nesta ordem:
--   1. Authentication → Sign In / Providers → Email → desligar "Confirm email"
--   2. rodar isto, para soltar quem já foi criado
--
-- Solta só quem está cadastrado em `pessoas` — a equipe deste site. Conta de
-- qualquer outro, inclusive de quem se cadastrou sozinho, continua como está.

update auth.users
   set email_confirmed_at = now()
 where email in (select email from public.pessoas)
   and email_confirmed_at is null;

-- Só `email_confirmed_at`: em versões recentes do Supabase o `confirmed_at` é
-- coluna gerada a partir dela, e escrever nele dá erro.

-- ── conferência ────────────────────────────────────────────────────────────
-- Cada pessoa da equipe com conta tem de vir com data preenchida.

select p.nome, p.email, u.email_confirmed_at
  from public.pessoas p
  join auth.users u on u.email = p.email
 order by p.nome;
