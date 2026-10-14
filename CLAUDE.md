# Programação Makro — o que o Claude precisa saber antes de mexer

Site do PCM da Makro (Mossoró/RN): programação da oficina, carteira, preventivas
e movimentações, em cima de uma fita de eventos no Supabase. Publicado pelo
GitHub Pages a partir da `main`. O `LEIAME.md` explica o porquê de cada tela.

## Regras que valem sempre

- **Não inventar dado.** OS, frota, executante, prioridade, data de conclusão:
  o que a pessoa não disse fica vazio (PENDENTE). Na dúvida, perguntar.
- **Não passar por cima do que foi lançado à mão** sem conferir antes.
- **Gravar no banco pede confirmação**, exceto o pedido explícito de lançar
  pendências/baixas ("pedidos ao Claude"). Nunca contornar a confirmação da
  ferramenta do Supabase; se for recusada, não tentar de novo sem a pessoa dizer.
- Nunca pedir token, chave ou senha no chat. E-mail de verdade não entra no repositório.
- Cuidado redobrado com o banco e com a planilha: conferir antes, conferir depois.

## Rotina: lançar a carteira de uma inspeção ou de um TOP pedida no chat

A mensagem chega como no WhatsApp ("433", "- Soldar trinca…;", "@fulano…").
O site faz o mesmo pela caixa **Colar inspeção/TOP** (`js/tela/colar.js`); no
chat, seguir os mesmos passos e as mesmas regras:

1. **Ler a mensagem com `js/pendencias.js`** (`lerPendencias`): frota, origem
   (Inspeção/TOP), pendências e a conversa que fica de fora. ⚠️ na linha sugere P1
   — só aplicar se a pessoa confirmar.
2. **Ler a fita da frota no banco** (eventos cujo `alvo` tem `dados->>'frota'`
   igual à frota) e montar o estado com `eventos.reconstruir`.
3. **Duplicadas**: `marcarDuplicadas` contra as atividades em aberto da frota
   (mesmo serviço no mesmo lugar, `texto.chave`). Não lançar a repetida; dizer qual era.
4. **Preventiva do mês**: `planoVigente` + a preventiva da frota — dizer se existe,
   a situação e se tem dia de parada (as pendências podem ir junto na parada).
5. **Gerar os eventos com o código do site** (`ev.criar`): Corretiva, origem
   Programada, na carteira (sem semana), sem OS/executante/prioridade se a
   mensagem não disser, `obs` = `obsDaOrigem(fonte, dia)` ("[14/10] Inspeção").
   `autor` = quem pediu, `origem` = `claude`. Inserir com guarda contra
   duplicada (`where not exists` mesma frota + mesma atividade).
6. **Conferir depois** (contar e remontar) e responder: quantas entraram, quais
   eram duplicadas, a preventiva do mês, e o que ficou em aberto (fornecedor,
   prioridade) para a pessoa decidir.

Editar depois (oficina, prioridade) é um `editada` com `de` e `para`, como o
botão Editar do site — conferindo antes que ninguém mexeu nelas.

## Testes

```bash
node testes/rodar.js                 # núcleo, contra a planilha de verdade
node testes/resultados.mjs           # números iguais aos da planilha
node testes/supabase_falso.mjs &     # servidor de mentira, limpo a cada passada
node testes/config.mjs
node testes/interacao.mjs            # navegador; precisa do servidor limpo
bash testes/politicas.sh             # o banco recusa o que deve recusar
```

Mudou arquivo em `js/`? Acrescentar em `sw.js` (lista e versão).
