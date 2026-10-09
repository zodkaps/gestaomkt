-- Soltar acessos presos na confirmação de e-mail
-- ==============================================
-- Rode no SQL Editor quando alguém não conseguir entrar e o site disser que o
-- acesso "está esperando confirmação por e-mail".
--
-- Por que isto existe: o Supabase marca cada conta como confirmada ou não **no
-- momento em que ela é criada**. Desligar "Confirm email" nas opções muda o
-- padrão dali para frente — quem já nasceu esperando continua esperando um
-- e-mail que nunca chega, porque ninguém tem caixa postal em @makro.local.
--
-- Então são sempre duas coisas, nesta ordem:
--   1. Authentication → Sign In / Providers → Email → desligar "Confirm email"
--   2. rodar isto, para soltar quem já foi criado

update auth.users
   set email_confirmed_at = now()
 where email like '%@makro.local'
   and email_confirmed_at is null;

-- Só `email_confirmed_at`: em versões recentes do Supabase o `confirmed_at` é
-- coluna gerada a partir dela, e escrever nele dá erro.

-- ── conferência ────────────────────────────────────────────────────────────
-- As quatro linhas têm de vir com data preenchida.

select email, email_confirmed_at
  from auth.users
 where email like '%@makro.local'
 order by email;
