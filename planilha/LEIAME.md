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

## Programar é escrever a semana e o dia

A coluna **Data programada** não se digita — sai de **Semana** (a
segunda-feira) + **Dia** (Seg…Dom). É isso que deixa repetir uma semana
inteira trocando uma célula só: copie as linhas, troque a Semana, e todas as
datas andam junto.

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

# 3. JSON → planilha  (sem o JSON, sai vazia)
python3 montar_planilha.py dados.json

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
- **Carteira.** Os 39 serviços sem dia entraram como uma linha cada, porque a
  folha só traz a contagem de pendências. Quebre em uma linha por atividade
  quando for programar.
- **1ª data programada.** Vem da remarcação mais antiga de cada serviço no
  anexo de reprogramações.
