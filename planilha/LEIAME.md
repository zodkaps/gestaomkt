# Programação de Serviços — planilha

`Programacao_Servicos_Makro.xlsx` é a programação semanal da oficina.

## A unidade é a atividade

Cada linha é uma ATIVIDADE — o que antes era uma "pendência" dentro da
tarefa. Um serviço com três atividades ocupa três linhas.

```
Aderência à programação = concluídas do plano ÷ atividades do plano
```

## O que fica fora da conta interna

| Fora | Por quê |
|---|---|
| Empresa terceirizada | serviço de fora, não mede a oficina da Makro |
| Extra programação | não se cobra cumprimento do que nunca foi programado |
| Cancelada | sai dos dois lados da divisão |

Ao lado da aderência fica o **cumprimento geral**, que inclui o extra. A
distância entre os dois é o tamanho do imprevisto da semana.

Terceirizada é detectada por `(externo)` no fim do nome do executante.

## Semana por número

A coluna **Semana** é o número ISO (35, 36…), não uma data. O ano fica na aba
Semana e é dele que saem todas as datas. Repetir a semana passada é copiar as
linhas e trocar esse número.

## Dias previstos e o atraso

**Dias prev.** é quanto o SERVIÇO leva por inteiro — dimensiona a semana.

O **atraso da atividade** é medido pelo DIA dela, não pela folga do serviço:
cada linha tem o seu dia. Depois da hora de fechar a oficina (célula
*Expediente até* na aba Semana), o que vencia hoje já entra como VENCIDA.

As atividades vieram com estimativa de 2 a 3 dias. Como a estimativa é do
serviço e cada atividade dele repete o número, a *soma das estimativas* infla
em serviço com muitas atividades — sirva-se dela para comparar semanas, não
como homem-dia.

## Cores

A linha inteira muda com a situação: VENCIDA vermelha, *Vence hoje* laranja,
*Em execução* e *Em andamento* azuis, *Concluída* verde, *Concluída com
atraso* âmbar, *Cancelada* riscada, *Na carteira* cinza.

As colunas de digitar seguem quatro faixas, na ordem de uso: o que é o
serviço · quem faz · programar · só quando acontecer. Cinza é calculado.

## Abas

| Aba | Para que serve |
|---|---|
| Como usar | Os quatro passos da semana e o dia a dia |
| Programação | Onde se trabalha — uma linha por atividade |
| Semana | Carga por executante e por dia, com a diária |
| Aderência | Os indicadores, por executante, frota e tipo |
| Listas | Nomes das caixas de seleção |

## Regenerar

```bash
# planilha em uso → JSON (preserva tudo que foi digitado)
python3 ler_planilha.py Programacao_Servicos_Makro.xlsx > dados.json

# JSON → planilha
python3 montar_planilha.py dados.json --ano 2026

# calcular e conferir que não sobrou erro
python3 /mnt/skills/public/xlsx/scripts/recalc.py \
        Programacao_Servicos_Makro.xlsx 500
```

`extrair_pdf.py` continua servindo para importar a folha impressa pelo site.

Requer `openpyxl`, `poppler-utils` e o LibreOffice **com o módulo Calc**
(`libreoffice-calc`).

### Um detalhe do recálculo

A fórmula da Situação, escrita inteira, estourava no LibreOffice e voltava
`#VALOR!` em toda a coluna. O teste de vencimento saiu para a coluna auxiliar
**Venc?**, e com isso a fórmula cabe. Se for mexer nela, mantenha-a curta.
