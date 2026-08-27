# Programação de Serviços — planilha

`Programacao_Servicos_Makro.xlsx` substitui o módulo de programação do site.

## A unidade é a atividade

Cada linha é uma ATIVIDADE — o que antes era uma "pendência" dentro da
tarefa: *trocar as lonas*, *regular a catraca*. Um serviço com três
atividades ocupa três linhas.

```
Aderência = atividades concluídas ÷ atividades programadas no período
```

Se duas saírem e uma ficar, a aderência mostra 67%: nem some da conta, nem
finge que fechou.

## Até três executantes por atividade

Três colunas — **Executante 1, 2 e 3** — cada uma com sua caixa de seleção.
Serviço feito a quatro mãos entra na carga de cada um na aba Semana e na
Aderência, e conta **uma vez só** no total da oficina.

Empresa externa: escreva o nome com `(externo)` no fim, em qualquer uma das
três. A coluna Oficina se marca sozinha como Terceirizada.

## Serviço extra programação

A coluna **Origem** separa o que estava no plano (`Programada`, ou em branco)
do que entrou depois (`Extra`) — quebra, urgência, pedido da operação.

Extra **não entra no denominador da aderência**: não dá para cobrar
cumprimento de uma coisa que nunca foi programada. Ela ganha contador próprio
na faixa da aba Semana e três indicadores na Aderência, entre eles *quanto da
semana foi extra* — o número que explica uma aderência baixa numa semana em
que a oficina não parou.

Na **grade** da aba Semana, plano e extra aparecem juntos: ali o que importa
é a carga de trabalho de cada um, venha de onde vier.

## Trocar de semana

Na aba **Semana**, a célula amarela é uma caixa de seleção com todas as
segundas-feiras. Escolha uma e a grade inteira acompanha. Logo abaixo, a
faixa **ONDE TEM PROGRAMAÇÃO** mostra quantas atividades existem nas quatro
semanas antes e nas quatro depois — dá para ver onde tem trabalho antes de
trocar.

## Programar é escrever a semana e o dia

A coluna **Data programada** não se digita — sai de **Semana** (a
segunda-feira) + **Dia** (Seg…Dom). É isso que deixa repetir uma semana
inteira trocando uma célula só: copie as linhas, troque a Semana, e todas as
datas andam junto.

## Como as colunas estão organizadas

A **Situação** é o que mais se lê, então fica na frente (coluna B) — o resto
do cálculo vai para o fim. As colunas de digitar estão em quatro faixas
coloridas, na ordem em que se usa:

| Faixa | Colunas | Quando se preenche |
|---|---|---|
| 1 · O que é o serviço | OS, Frota, Serviço, Atividade, Tipo, Origem | sempre |
| 2 · Quem faz | Executante 1, 2 e 3 | ao programar |
| 3 · Programar | Semana, Dia | ao programar |
| 4 · Só quando acontecer | Concluída em, Marcar, 1ª data, Motivo, Obs. | exceção |

Uma régua fina separa um serviço do outro, já que um serviço ocupa várias
linhas seguidas.

## Abas

| Aba | Para que serve |
|---|---|
| Como usar | Os quatro passos da semana e o dia a dia |
| Programação | Onde se trabalha — uma linha por atividade, 1.000 linhas |
| Semana | Carga de cada executante por dia, com alerta de sobrecarga |
| Aderência | Indicadores do período, por executante, frota e tipo |
| Listas | Nomes das caixas de seleção |

## Regenerar

A planilha é gerada por script — mudanças de estrutura se fazem nele.

```bash
# 1. texto do PDF exportado pelo site
pdftotext -layout "Programacao.PDF" prog.txt

# 2. PDF → JSON
python3 extrair_pdf.py prog.txt > dados.json

# 3. JSON → planilha. --semana limita à semana daquela segunda-feira;
#    sem ela, entra tudo o que o PDF traz.
python3 montar_planilha.py dados.json --semana 2026-08-24

# 4. calcular as fórmulas e conferir que não sobrou erro
python3 /root/.claude/skills/synced/xlsx/scripts/recalc.py \
        Programacao_Servicos_Makro.xlsx 400
```

Requer `openpyxl`, `poppler-utils` (pdftotext) e o LibreOffice **com o
módulo Calc** (`libreoffice-calc`) — sem o Calc, o `recalc.py` não abre
nenhum `.xlsx`.

## O que a importação assume

A folha impressa pelo site não carrega tudo. Onde faltou dado, a escolha
foi registrar o fato sem inventar número:

- **Conclusão sem data.** A folha mostra a pendência riscada, mas não em que
  dia saiu. Elas entram marcadas como `Concluída` na coluna Marcar, sem data.
  Contam na aderência; ficam de fora da pontualidade, que passa a ler "—"
  até existir conclusão com data de verdade.
- **Serviço de vários dias.** Um serviço de 3 dias com 34 atividades não tem
  as 34 no primeiro dia. Elas entram distribuídas pelo intervalo — mais perto
  da verdade do que empilhar tudo na abertura.
- **Fora da semana pedida.** Com `--semana`, serviço programado para antes
  dela não entra: é programação da semana anterior arrastando. A carteira sem
  dia também fica de fora.
- **1ª data programada.** Vem da remarcação mais antiga de cada serviço no
  anexo de reprogramações.
