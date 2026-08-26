# Programação de Serviços — planilha

`Programacao_Servicos_Makro.xlsx` substitui o módulo de programação do site.

## A mudança de fundo

A unidade deixou de ser a **tarefa** e passou a ser a **atividade** — o que
antes era uma "pendência" dentro da tarefa. Cada linha da aba Programação é
uma coisa a fazer: *trocar as lonas*, *regular a catraca*, *conferir a folga
do tambor*.

É daí que sai a aderência:

```
Aderência  =  atividades concluídas  ÷  atividades programadas no período
```

Um serviço com três atividades ocupa três linhas. Se duas saírem e uma
ficar, a aderência mostra 67% — e não um serviço "aberto" que some da conta,
nem um "fechado" que esconde o que faltou.

## Abas

| Aba | Para que serve |
|---|---|
| Instruções | Como preencher e como a aderência é calculada |
| Programação | Onde se trabalha — uma linha por atividade, 1.000 linhas prontas |
| Semana | Atividades por executante e por dia, com aderência da semana |
| Aderência | Indicadores do período, com recortes por executante, frota e tipo |
| Listas | Nomes que alimentam as caixas de seleção |

## Regenerar

```bash
python3 montar_planilha.py
python3 /root/.claude/skills/synced/xlsx/scripts/recalc.py Programacao_Servicos_Makro.xlsx 300
```

O `montar_planilha.py` é a fonte: qualquer mudança de estrutura se faz nele,
não no arquivo gerado.

Requer `openpyxl` e o LibreOffice **com o módulo Calc** (`libreoffice-calc`) —
sem o Calc, o `recalc.py` não consegue abrir nenhum `.xlsx`.
