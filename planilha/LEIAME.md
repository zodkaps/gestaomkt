# Programação de Serviços — planilha

> **São duas planilhas.**
>
> **`Programacao_Diaria_Makro.xlsx`** é a que se usa no dia a dia, no tablet.
> Uma aba de trabalho, oito colunas, **nenhuma fórmula nas linhas** — só quatro
> contas no topo. O controle de verdade é o **Protheus**; ela só anota a
> atividade, o número da OS aberta lá, e se saiu. Gerada por
> `montar_diaria.py`.
>
> **`Programacao_Servicos_Makro.xlsx`** é a analítica, descrita no resto deste
> arquivo: aderência da semana, peso por executante, gráficos, distribuição de
> prazo. Continua aqui porque é dela que vêm os dados, mas ficou complexa
> demais para o uso diário. Gerada por `montar_planilha.py`.

## As cores da planilha diária

Uma cor, um significado. O esquema anterior usava o mesmo laranja para "o
prazo chegou" e para "falta OS" — duas coisas diferentes com a mesma cor não
se leem: batia o olho e não se sabia do que a linha reclamava.

| cor | onde | quer dizer |
|---|---|---|
| **âmbar forte** | coluna OS | vazia: falta abrir no Protheus |
| verde claro | coluna OS | o número já está lá |
| **azul** | coluna Data | é hoje e não saiu |
| **vermelho** | coluna Data | a data passou e não saiu |
| verde | coluna Feito | marcada Sim — a linha inteira desbota |
| vermelho | coluna Feito | marcada Não |

A **coluna OS vira uma régua de duas cores**: o âmbar grita, o verde descansa.
É o que permite achar num relance o que falta lançar no Protheus, sem filtrar
nada. A legenda com as tarjas está na aba Listas.

A data usa **duas células diferentes**: `B3` é a que ele escolhe olhar e move
os indicadores; `L1` é o hoje real e decide se a atividade atrasou. Se a cor
seguisse a data escolhida, espiar a quinta pintaria a planilha inteira de
vermelho.

## A aba Movimentações

**Fica na planilha ANALÍTICA**, que é a principal para ele — é onde ele
trabalha de fato e para onde ele manda os arquivos de volta. Ficou só num
lugar de propósito: dois lugares para lançar a mesma movimentação é pior que
nenhum.


A operação leva a frota ao fornecedor, ou traz de volta. Quando ela demora, a
oficina fica com a atividade vencida e o motivo vira *frota não chegou* — que
foram **19 dos 49 motivos** registrados até aqui, o maior de todos. Esta aba
mede a demora com nome e data, para a cobrança sair de número e não de memória.

| | coluna | |
|---|---|---|
| A | Frota | caixa de seleção |
| B | Destino / fornecedor | para onde vai |
| C | Pedida em | quando o PCM pediu |
| D | **Prometida para** | a data que a operação **se comprometeu** |
| E | Chegou em | quando chegou de verdade |
| F | Atraso | sai sozinho: chegou − prometida, em dias |
| G | Situação | sai sozinha |
| H | Para quê | qual serviço depende dessa frota |
| I | **Quem prometeu** | sem nome, a cobrança vira conversa |

Sem a data **prometida** não há atraso a medir — é ela, e não a data pedida,
que sustenta a cobrança. Chegar antes conta **zero**, não crédito.

No topo: movimentações · entregues · no prazo · **pontualidade da operação** ·
atraso médio · **dias perdidos**. Os dois em negrito são os de levar à reunião.

**As movimentações são digitadas aqui, não vêm da analítica.** Por isso o
gerador relê a aba do próprio arquivo antes de reconstruir — sem isso, toda
reconstrução apagaria o que foi lançado. São duas fórmulas por linha, ambas
olhando só a própria linha: apagar linha continua seguro.

## A planilha diária

Oito colunas, nessa ordem, pensada para o tablet — as cinco primeiras cabem
numa tela e são as que se lê e se toca:

| | coluna | |
|---|---|---|
| A | Data | o dia da atividade; vazia = esperando |
| B | Frota | caixa de seleção |
| C | Atividade | o que tem de ser feito |
| D | Feito | **Sim / Não**, uma tocada |
| E | OS Protheus | o número aberto lá. **Vazia fica laranja** — é o que falta lançar |
| F | Quem faz | caixa de seleção |
| G | Serviço | de onde a atividade veio |
| H | Obs. | motivo, observação |

No topo: a caixa amarela do **DIA** (vem em hoje, troque para ver outro), e
quatro números — **programadas · feitas · aderência do dia · sem OS**. Embaixo,
numa linha só, as atrasadas e as que ainda não têm data.

**O pendente vem primeiro.** A ordem é: o que falta fazer, por data; depois o
que já saiu, em cinza, no fim. O topo da planilha é sempre o que está aberto.

**Nenhuma fórmula nas linhas.** São 7 fórmulas na planilha inteira, todas no
cabeçalho. Isso a deixa leve no tablet, torna apagar e inserir linha seguro, e
elimina qualquer chance de `#REF!` — que foi o que quebrou a analítica quando
uma linha foi apagada no Excel.

Para regerar a partir da analítica:

```bash
python3 ler_planilha.py Programacao_Servicos_Makro.xlsx > dados.json
python3 montar_diaria.py dados.json
```

**Sempre a partir da analítica RECONSTRUÍDA, nunca do arquivo que veio de
volta.** O Prazo é fórmula: um arquivo editado no Excel traz o valor em cache,
e linha que ele inseriu sem copiar as fórmulas traz o cache velho junto. Gerar
a diária direto da entrada já pôs uma atividade num domingo que a fórmula
nunca teria calculado.


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
programada, cinza na carteira e cancelada. Fora dela, só quatro células:

* **OS** — régua de duas cores, a mesma da planilha diária: **âmbar forte**
  quando a atividade está escrita e a célula está vazia (falta abrir no
  Protheus), **verde claro** quando o número já está lá. O âmbar grita, o
  verde descansa;
* **Origem = Extra** — laranja cheio, negrito e moldura grossa;
* **Concluída em** — fica verde no instante em que a data é escrita;
* **Motivo** — amarelo claro quando preenchido, para ver quem já foi
  justificado.

O Nº da linha **deixou de repetir o laranja do extra**. Ele ficava a duas
colunas da OS, e dois alaranjados lado a lado com significados diferentes é
exatamente o defeito que a régua de OS veio corrigir. O que separa o laranja
do extra do âmbar da OS é a **moldura grossa**, que só o extra tem. Extra se
lê na coluna *Origem*, que é onde ele quer dizer alguma coisa.

Linha **cancelada** tem prioridade sobre a régua: o cinza vence, porque uma
atividade cancelada não está esperando OS nenhuma.

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
