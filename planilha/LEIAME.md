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

## Serviço, atividade e prazo

**O serviço é a unidade de planejamento; a atividade é a de execução.**

Você marca duas coisas no serviço: o **Dia** em que ele começa e quantos
**Dias prev.** ele leva. A planilha faz o resto — divide as atividades do
serviço pelos dias dele e dá a cada uma o seu **Prazo**.

> 34 atividades da F-815 em 3 dias → 12 na segunda, 11 na terça, 11 na quarta.

Antes, cada atividade herdava a janela inteira e vencia no fim dela. O
resultado era uma semana sem dia a dia:

| | seg | ter | qua | qui | sex |
|---|---|---|---|---|---|
| antes | 0 | 1 | **40** | 1 | 2 |
| depois | 15 | 14 | 12 | 4 | 0 |

Quarenta das quarenta e cinco fechavam na quarta. Não dava para medir dia
nenhum.

A duração é **do serviço**, então vale igual para todas as atividades dele: se
o mesmo serviço vier com números diferentes, a importação fica com **o maior**
— a frota só sai da oficina quando a última atividade sai. Sete serviços
vinham se contradizendo (a F-624 com 2, 3 e 4 dias dentro de si).

Sai de três colunas auxiliares: `AJ` é a chave frota+serviço+semana, `AK` é a
posição da atividade dentro do serviço, `AL` é quantas o serviço tem. O prazo
é `Início + INT((AK−1) × dias ÷ AL)`. A chave inclui a semana de propósito:
serviço partido entre duas semanas são dois blocos, e juntá-los distorceria a
divisão.

**Mexer no Dia move o serviço inteiro. Mexer nos Dias prev. redistribui os
prazos.** Você não precisa marcar dia atividade por atividade.

## O atraso

O **atraso da atividade** é medido pelo **Prazo** dela, não pelo fim do
serviço. Depois da hora de fechar a oficina (célula *Expediente até* na aba
Semana), o que vencia hoje já entra como VENCIDA.

A *soma das estimativas*, na aba Aderência, é a soma da coluna Dias prev.
Como a duração é do serviço e cada atividade dele repete o número, esse total
infla em serviço com muitas atividades — sirva-se dele para comparar semanas,
não como homem-dia. Quem mede carga por pessoa é a coluna **Peso**.

## Situação

Quem manda são duas datas: o **Início** (o dia em que o serviço começa) e o
**Prazo** da própria atividade, que sai da divisão descrita acima.

| Situação | Quando |
|---|---|
| Concluída / Concluída com atraso | tem data em *Concluída em* |
| Cancelada | marcada como tal |
| Em programação | marcada à mão: ainda está sendo encaixada |
| Na carteira | sem semana e sem dia |
| Programada | tem dia, e a janela ainda não abriu |
| **Em execução** | o serviço começou e o prazo desta atividade não chegou |
| **Fecha hoje** | hoje é o prazo dela |
| VENCIDA | a janela fechou (ou passou das 18h no último dia) |
| Falta a atividade | linha com frota e sem atividade |
| Falta a semana | tem DIA e não tem SEMANA |

Antes, *VENCIDA* comparava o **Início** com hoje: uma atividade de três dias
começada na segunda já nascia vencida na segunda. A planilha enchia de
vermelho sem motivo. Agora só vence quem passou do **Fim**.

Só três valores se marcam à mão em *Marcar*: **Concluída**, **Cancelada** e
**Em programação**. "Programada", "Em execução" e "Em andamento" a Situação
calcula sozinha, então saem na importação — escritos ali eram ruído inerte.

*Falta a atividade* é a linha reservada: frota lançada, serviço ainda por
escrever. Ela não entra em conta nenhuma — toda contagem exige atividade — e
o status existe para ela não passar despercebida.

## Cores

A cor fica na **célula**, não na linha. Linha inteira pintada de ponta a ponta
não deixava ler a atividade nem a observação.

Muda de cor a coluna **Situação** — vermelho vencida, laranja vence hoje,
verde concluída, âmbar concluída com atraso, azul em programação, azul claro
programada, cinza na carteira e cancelada. Fora dela, só três células:

* **Origem = Extra** — laranja cheio, negrito e moldura grossa; o Nº da linha
  ganha o mesmo laranja, para se achar o extra de longe;
* **Concluída em** — fica verde no instante em que a data é escrita;
* **Motivo** — amarelo claro quando preenchido, para ver quem já foi
  justificado.

Vencida e vence hoje também tingem a letra das datas de *Início* e *Fim*.
Cancelada risca o texto do serviço. O resto da linha é branco.

As colunas de digitar seguem quatro faixas, na ordem de uso: o que é o
serviço · quem faz · programar · só quando acontecer. Cinza é calculado.

## Quem fez o quê, quando são vários

Três coisas diferentes, que costumam ser confundidas:

**A aderência global conta ATIVIDADES, não pessoas.** As fórmulas são
`COUNTIFS` sobre as linhas da Programação, então uma atividade com três
executantes conta uma vez. Na semana 35, 40 das 60 atividades do plano tinham
dois ou três executantes, e o total seguiu 60. Ter mais gente numa atividade
**não mexe** na aderência.

**A visão por pessoa dá crédito cheio a cada participante.** É o certo para a
*razão* — "do que eu peguei, quanto saiu" —, mas faz a coluna somar mais que a
semana: 176 contra 107 atividades, 120/52 contra 60/52 no recorte. Não é erro;
é a mesma atividade aparecendo na linha de cada um que a dividiu.

**O PESO é o rateio que fecha.** Coluna nova na grade da aba Semana: a
atividade dividida entre quem participou (três executantes dão 1/3 para cada).
A soma da coluna bate exatamente com o *TOTAL — atividades distintas*. É o
número para dizer quanto da carga foi de cada um sem contar ninguém duas vezes.

Sai da coluna auxiliar **Fração** (AD) na Programação, que é `1 ÷ nº de
executantes` da linha. Na aba Aderência, o recorte POR EXECUTANTE ganhou um
rodapé com as atividades distintas, para os dois números se lerem lado a lado.

## Frotas e linhas reservadas

Chegaram do Pará em 31/08 (segunda da semana 36), anotadas em conjunto —
`F425/1038/1039`, `F621/433`, `F817/150`, `F818/745` — e cadastradas unidade a
unidade, que é como o resto da lista é escrito: **F-425, F-1038, F-1039, F-621,
F-433, F-817, F-818, F-745**. O `F-150` já existia e não se repete.

Cada uma ganhou uma **linha reservada**: frota, semana e dia prontos, serviço e
atividade em branco. Enquanto a **Atividade** estiver vazia a linha não entra em
conta nenhuma — nem aderência, nem extra, nem vencidas, nem diária —, porque
todas essas fórmulas exigem atividade. Escreveu o serviço, a linha passa a
valer. É assim que se reserva espaço na semana sem sujar o indicador.

## Uso no Excel — o que não se pode quebrar

**Nunca numerar em cadeia.** As colunas de ordem que alimentam a aba Hoje já
foram um contador que lia a linha de cima (`N($AE{r-1})`). Bastou apagar uma
linha para a seguinte apontar para o vazio, e o `#REF!` desceu por todas as
outras: **uma linha apagada produziu 2.593 células quebradas**.

O desenho de agora é à prova disso:

* `AH` e `AI` são bandeiras 0/1 que **só olham a própria linha**;
* `AE` e `AI` são `SUM($AH$4:$AH{linha})` — de uma âncora fixa até aqui.

Apagar uma linha só encurta o intervalo. A âncora é a **linha 4**, vazia e
dentro do painel congelado; ancorar na 5, a primeira de dados, quebraria se
alguém apagasse justo ela. Pelo mesmo motivo a numeração é
`COUNTA($F$4:$F{linha})`.

**Regra para quem mexer no gerador:** nenhuma fórmula da Programação pode
citar outra linha de dados da própria aba. Há um teste disso na verificação —
o resultado tem de ser zero.

**Voláteis.** `TODAY()` e `NOW()` moravam dentro das mil linhas, em `AC` e `B`:
cerca de 5.000 chamadas voláteis a cada tecla digitada. Agora são calculadas
uma vez no bloco motor (`Hoje!$L$1` e `$L$2`) e as colunas só leem o
resultado. Sobraram **3 células voláteis** na planilha inteira.

**Duas datas que não se confundem:** `Hoje!$C$3` é a data que se escolhe
olhar e move a aba Hoje; `Hoje!$L$1` é o hoje real e move a Situação. Se a
Situação seguisse a data escolhida, espiar a quinta reescreveria o status de
mil linhas.

**OS é texto.** A coluna tem formato `@`, senão o Excel come o zero à esquerda
e `021188` vira `21188`.

**Mexer nas linhas:** acrescentar no fim puxando a alça; inserir no meio com
Ctrl+C na linha inteira e *Inserir células copiadas* (nunca *Inserir linha*
pura, que entra sem fórmula); apagar linha inteira é seguro.

## A aba Hoje

Abre no dia de hoje e responde o que a oficina faz agora. A **data no topo** é
o único campo que se digita — troque para olhar outro dia e tudo acompanha.

* **Para fechar hoje** — atividades cujo *Prazo* cai neste dia;
* **Fecharam** — dessas, quantas já estão concluídas;
* **Aderência do dia** — fecharam ÷ para fechar. É a aderência por atividade,
  medida no dia;
* **Em execução** — abertas e dentro da janela;
* **Atrasadas** — a janela fechou e a atividade não saiu.

Embaixo, duas listas: **o dia** e **as atrasadas**. A coluna *Linha* diz a
linha exata na Programação — é lá que se escreve a conclusão, porque célula de
fórmula não aceita digitação de volta. Se um dia tiver mais atividades do que
cabe na lista, aparece um aviso em vermelho com quantas ficaram de fora.

Ela não guarda nada: puxa tudo da Programação por duas colunas de ordem
(*Ordem dia* e *Ordem atr.*), um contador corrido que só sobe nas linhas que
entram na lista. Como é monótono, `MATCH` acha a k-ésima direto — sem fórmula
matricial e sem varredura quadrática.

## Continuidade de uma semana para a outra

```bash
python3 montar_planilha.py dados.json --ano 2026 --puxar 35:36
```

Leva para a semana 36 tudo que ficou aberto na 35: grava *Semana orig.* 35,
troca a semana e põe **Origem = Programada** — programou para a semana que
vem, passou a ser cobrada.

**Cuidado com o retrovisor.** Depois de puxar, a semana de origem fica
bonita: as pendentes saíram dela, então a *Aderência à programação* da 35
sobe. A verdade fica na **Aderência ao plano original**, que mede contra a
*Semana orig.* e não perdoa o empurrão. O indicador **Saíram desta semana**
diz quantas foram embora — quando ele é grande, é a aderência ao plano
original que conta a história.

## Gráficos

Na aba Aderência, abaixo dos indicadores:

* **Quanto tinha, quanto saiu** — plano da semana e extra programação lado a
  lado, cada um com o que foi concluído;
* **Onde a semana parou** — concluídas, vencidas, a vencer, canceladas e
  terceirizadas, cada barra na cor que a situação já tem na planilha.

Os números que alimentam os dois ficam nas colunas O:Q da aba, fora da área
de impressão, e não são digitados: vêm da tabela de indicadores.

## Abas

| Aba | Para que serve |
|---|---|
| **Hoje** | O painel do dia: o que fecha hoje, o que fechou, o que atrasou |
| Como usar | Os quatro passos da semana e o dia a dia |
| Programação | Onde se trabalha — uma linha por atividade |
| Semana | Carga por executante e por dia, com a diária |
| Aderência | Os indicadores, por executante, frota e tipo |
| Listas | Nomes das caixas de seleção |

## Regenerar

```bash
# planilha em uso → JSON (preserva tudo que foi digitado: semana, dia,
# estimativa de dias, motivos, conclusões e as linhas reservadas)
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
