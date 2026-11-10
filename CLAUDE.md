# Programação Makro — o que o Claude precisa saber antes de mexer

Site do PCM da Makro (Mossoró/RN): programação da oficina, carteira, preventivas
e movimentações, em cima de uma fita de eventos no Supabase. Publicado pelo
GitHub Pages a partir da `main`. O `LEIAME.md` explica o porquê de cada tela.

Desde 21/10/2026 o site é a **Avaliação da operação** (movimentações,
preventivas e os atrasos de entrega). As telas da oficina saíram do menu, mas
o código e os dados ficam: `?oficina=1` no endereço as traz de volta
(`js/foco.js`). A rotina abaixo continua valendo — a carteira está na fita.

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
3. **Duplicadas e parecidas**: `marcarDuplicadas` contra as atividades em aberto
   da frota — `duplicada` (mesmo serviço no mesmo lugar), `parecida` (a mesma
   escrita de outro jeito: "Providenciar estepe" × "Sem estepe") e `repetida`.
   Não lançar nenhuma das três; dizer quais eram. Conferir também à mão a lista
   em aberto da frota: o que o comparador não pega, a pessoa decide.
   O TOP vem sem marcador, uma por linha, às vezes duas grudadas por "-": o
   leitor separa (`separarJuntas`); linha solta que completa a de cima ("nível
   muito baixo") se pergunta antes de juntar. O bloco "Veículo não liberado
   devido a…" é o porquê da reprovação — sugerir P1 nas pendências dele.
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

## O painel de OS do Protheus (tela OS Makro, `#/os`, desde 05/11/2026)

A STJ e a STL do Protheus viram o painel **no site**: o Mateus solta os
arquivos em *Atualizar com o Protheus* e o site grava no bucket privado
`painel-os`: só quem tem `os_makro = true` em `pessoas` lê, e só quem tem
também `os_makro_atualiza = true` grava (`sql/04_painel_os.sql` e
`sql/06_painel_os_so_ver.sql`). Liberar alguém para **ver** é só a primeira
marca. Regras:

- **Dado do Protheus nunca entra no repositório** (é público): nem export, nem
  JSON montado, nem nome de executante no código. Teste usa dado inventado.
- As colunas de usuário da STJ guardam CPF. **Só a *Usr Inclusao*** (quem abriu
  a OS) é lida, a pedido do Mateus (10/11/2026), e vai só para o painel — não
  para o Resumo, as imagens ou a planilha. As outras (Usuário Alt., Usr Altera,
  Usuário Ini., Usuário Fim) continuam sem ser lidas. O Claude não lê nem
  mostra CPF de verdade no chat.
- As regras da montagem estão em `js/os/montar.js` (as mesmas do `montar.py`).
  Mudou regra? Muda lá e no teste de `testes/rodar.js`.
- Se ele mandar a STJ e a STL no chat, a resposta é: solte em *Atualizar com o
  Protheus* no site. A base histórica (`historico-os.json.gz`) é feita fora do
  repositório e mandada a ele em arquivo; nunca vai para o Git.

## Testes

```bash
node testes/rodar.js                 # núcleo, contra a planilha de verdade
node testes/resultados.mjs           # números iguais aos da planilha
node testes/supabase_falso.mjs &     # servidor de mentira, limpo a cada passada
node testes/config.mjs
node testes/interacao.mjs            # navegador; precisa do servidor limpo
bash testes/politicas.sh             # o banco recusa o que deve recusar
```

Mudou arquivo em `js/`? Acrescentar em `sw.js` (lista e versão) — o
`testes/rodar.js` acusa o que faltar.

## Segurança (LEIAME, "Segurança do site")

- Texto da pessoa entra na tela por `el()` (`textContent`), nunca `innerHTML`.
- Nada de script dentro do HTML, nem biblioteca ou servidor fora da CSP do
  `index.html`: o navegador barra, e o teste do navegador falha.
- O painel de OS mora numa área isolada (shadow DOM, `js/tela/os.js`): o que
  ele procura é na raiz dele, não no `document`; o que ouve na janela sai no
  `parar()`. Indicador novo: a conta em `js/os/indicadores.js`, com teste.
- CSV sai por `celulaCSV` (`js/texto.js`), que não deixa célula virar fórmula.
