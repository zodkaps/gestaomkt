# Programação Makro — programação, OS, movimentação e preventiva

Controle de PCM da manutenção, Makro Transportes (Mossoró/RN). Site estático
que roda no navegador, guarda a fita de eventos no Supabase e funciona sem
internet. **Qualquer mudança fica registrada**, com quem fez e por quê.

São quatro pessoas, com dois papéis:

| quem | papel | o que faz |
|---|---|---|
| Mateus, Lucas | **PCM** | programa a oficina, registra conclusões, programa paradas, **aprova as movimentações**, importa a planilha e o Protheus |
| Pedro, João Victor | **Operação** | **conclui as movimentações** de frota e informa a liberação dos veículos para a manutenção (remarcar exige o motivo) |

A equipe da oficina continua fechando OS direto no Protheus. Este site é o
controle do PCM e o canal de resposta da operação.

---

## Desde 21/10/2026: a avaliação da operação

O site virou a ferramenta para **avaliar a operação**: só movimentações de
frota e preventivas, e os atrasos de entrega. O PCM entra na tela
**Avaliação**; o menu tem Avaliação, Preventivas, Movimentação e o de gestão
(Registro, Importar, Diagnóstico).

Três coisas contam como atraso — as que o PCM definiu:

| atraso | o combinado | o feito |
|---|---|---|
| **Movimentação** | a data que a operação prometeu | o dia em que foi concluída |
| **Entrega para a preventiva** | o dia da parada que o PCM marcou | o dia em que a frota chegou na oficina |
| **Liberação remarcada** | a liberação que a operação tinha informado | a nova data, mais tarde (antecipar não conta) |

A oficina devolver a frota atrasada **não** conta: o que se avalia é a operação.

- **A frota chegou** é um lançamento novo (`prev_entregue`), do PCM: no dia da
  parada ou depois, o botão está na fila *Dar baixa* das Preventivas, na ficha,
  nas decisões e na própria Avaliação. Chegou depois da parada, a caixa pede o
  porquê e o responsável — e sem eles não grava (desde 23/10). Sem parada marcada não há
  dia combinado: a frota liberada está esperando o PCM, não atrasando.
- **Remarcar a liberação exige o motivo.** A primeira liberação, e confirmar a
  mesma data, não pedem.
- Na **Avaliação**: o período (este mês, mês passado, 4 ou 12 semanas, o ano) e
  a frota no alto — **qualquer frota se digita**, lançada ou não: "617" acha a
  F-617, um pedaço do número mostra as que têm ele, e a frota que ninguém lançou
  aparece vazia, dizendo que não há nada dela (o mesmo no filtro do Registro).
  Embaixo, as **cinco abas**, na ordem em que se lê (em 12/11/2026 elas viraram
  três áreas por umas horas; o PCM pediu as cinco de volta, com a leitura nova
  dentro de cada uma, em 13/11/2026):
  - **Resumo** — uma frase que compara com o período anterior ("Atrasos
    diminuíram: 4 no período, contra 7 de 01/10 a 12/10"), os quatro números de
    sempre (movimentações no prazo, frotas no dia da preventiva, liberações
    remarcadas, atrasando agora), cada um com o valor de antes; **Precisa de
    ação** (quantas pendências e as três mais atrasadas, com os botões); os
    **principais motivos** (tocar abre os atrasos de cada um); e um gráfico só,
    a semana a semana, com a semana de mais atrasos dita em palavras;
  - **Para resolver** — o que pede ação, cada coisa uma vez só: o que está
    atrasando agora e o atraso sem o porquê, de qualquer período, o mais
    atrasado primeiro, com Frota, Ocorrência, Situação, Dias, Motivo e
    responsável e o botão que resolve (Concluir, A frota chegou, Justificar —
    os de sempre, com as mesmas permissões). Recortes: Todas, Atrasando agora,
    Sem justificativa. Quinze de cada vez; o resto em *Mostrar as outras*;
  - **Motivos** — os motivos recorrentes: cada motivo com quantos atrasos, de
    que tipo, os dias e quem atrasou; tocar abre os atrasos dele;
  - **Análise** — os gráficos: pontualidade por semana, frotas com mais atrasos,
    quem atrasou, categoria e tamanho do atraso;
  - **Todos os atrasos** — a tabela do período, com tipo, busca e motivo.
  **O período anterior** (`A.periodoAnterior`) é o mesmo trecho do bloco de
  antes, para comparar igual com igual: os mesmos dias do mês anterior (Este
  mês), o mês antes do passado, as 4 ou 12 semanas antes (mesmos dias da
  semana) e o mesmo trecho do ano anterior. As contas são as mesmas; só as
  datas mudam — e sem registro no período anterior, a tela diz que não há com
  que comparar, em vez de tirar conclusão.
  **As pendências não contam em dobro** (`A.pendencias`): a movimentação
  vencida e sem o porquê estava nas duas listas e a aba somava as duas (21,
  com o menu dizendo 13). Agora o menu, a aba e a lista dão o mesmo número.
  A pontualidade conta só o que tinha data combinada; o sem prazo aparece à
  parte. No prazo é cinza nos gráficos: só o atraso tem cor.
  **No celular e no tablet** (abaixo de 1000px) as tabelas viram cartões, com
  os botões do tamanho do dedo; no celular o período vira uma lista de escolha
  e as cinco abas cabem numa linha, com o nome curto (Resolver, Atrasos). Os
  endereços das três áreas (`?a=pendencias`, `?a=historico`) caem na aba certa;
  o *Justificar* da Movimentação abre o *Para resolver* já em *Sem
  justificativa*.
- As contas ficam em `js/avaliacao.js` (puras, testadas em `testes/rodar.js`);
  a tela em `js/tela/avaliacao.js`.

- **A página aberta durante uma publicação** (13/11/2026). As telas chegam na
  hora de abrir, mas o que a página carregou ao começar fica na memória até
  ela recarregar. Publicado o site com a página aberta, a Avaliação nova usou o
  `js/avaliacao.js` velho da memória e parou com "A.periodoAnterior is not a
  function". Agora o navegador confere a versão do site nas trocas de tela; se
  a nova entrou, a próxima troca recarrega a página inteira. E a tela que falhar
  com erro de versão misturada recarrega uma vez sozinha; se falhar de novo,
  mostra o porquê e os botões de sempre (o teste simula a publicação com a
  página aberta, em `testes/interacao.mjs`).
- **O modo claro do painel de OS** (13/11/2026): os controles com o jeito do
  resto do site — filtros, números da Carteira e botões dentro dos cartões com
  fundo cinza suave, sem o contorno branco sobre branco que deixava a tela com
  cara de rascunho; os botões no fundo da página brancos, com sombra leve; o
  cabeçalho da tabela em cinza claro; a barra de rolagem fina (no Windows, a do
  claro vinha larga e com setas dentro da tabela); e o texto de apoio um pouco
  mais escuro, para o contraste mínimo da letra pequena. O escuro não mudou.
- **A segunda simplificação do painel de OS** (13/11/2026, tarde): o painel
  responde primeiro quanto se programou, quanto se executou, quanto ficou
  pendente, o % de execução e se a carteira anda ou acumula. Cada aba mostra o
  que é dela e o resto fica a um clique — sem tirar aba, filtro, gráfico, conta
  ou função, e sem mudar fórmula (as contas são as de `js/os/indicadores.js`).
  - **Programação** — quatro números grandes: *Programadas* (data programada no
    período e executante), *Executadas* (encerradas no Protheus ou com o fim
    real da manutenção), *Pendentes de execução* (liberadas · aguardando
    liberação) e *Execução* (executadas ÷ programadas, com o período anterior);
    a barra executadas × pendentes, que abre a lista no clique; uma linha para a
    extra programação; e um gráfico só, *programadas × executadas*, por dia,
    semana ou mês. A lista das OS começa fechada (*Ver a lista das OS*) e abre
    pelo clique num número ou na barra. O encerramento no Protheus (a
    Conclusão, encerradas ÷ programadas) e a carteira do período, o gráfico com
    a extra programação, o dia a dia e o por executante ficam em *Mais análises*.
  - **Avanço** — os cinco números da conta (backlog inicial, novas, encerradas,
    backlog final e variação, com encerradas ÷ novas junto) e o backlog ao fim
    de cada período. A conferência, a entrada e saída e o histórico ficam em
    *Detalhes da análise*; as novas × encerradas e o por executante ou frota, em
    *Mais análises*; a lista abre pelo clique nos números.
  - **Visão geral** — o resumo da carteira de agora: abertas, há mais de 90
    dias e sem executante; o rumo da carteira numa linha (com o caminho para o
    Avanço) e a programação numa linha (com o caminho para a Programação); a
    evolução do backlog, a entrada e saída e a idade das abertas. Os números do
    período saíram dela (estão no Avanço); o backlog por frota (o mesmo da aba
    Frotas) e as programadas e encerradas (o mesmo da Programação) foram para
    *Mais análises*.
  - **Indicadores** — à vista, onze que nenhuma outra aba mostra, em três
    grupos (ritmo; programação e prazo; planejamento e mão de obra). Os que
    repetem outra aba (backlog no fim, entraram, saldo, taxa de atendimento,
    aguardando liberação, cobertura de mão de obra) e o comparativo ficam em
    *Mais análises*, com as mesmas contas.
  - **Carteira de OS** — uma lista de trabalho. No alto, o resumo que filtra:
    abertas, aguardando liberação, sem executante, há mais de 30, 60 e 90 dias
    e as encerradas no período; cada número liga o filtro dele na barra (o mesmo
    filtro, aparece nas etiquetas) e, clicado de novo, solta. Os recortes são das
    abertas e não somam: uma OS pode estar em mais de um. Esse resumo ficou no
    lugar dos botões de situação, que repetiam o filtro Situação da barra. A
    tabela tem sete colunas por padrão (OS, frota, serviço, situação, aberta em,
    dias e executante); as outras continuam no botão *Colunas* (a lista da
    Programação mostra também a data programada e o fim). A idade acima de 90
    dias é um ponto vermelho ao lado do número, não a coluna toda em vermelho.
    No celular, cada OS vira um cartão (OS, frota e situação em cima, o serviço,
    e aberta em, dias e executante embaixo), sem rolar para o lado.
- **O painel de OS mais limpo** (13/11/2026), sem tirar aba, filtro, gráfico,
  cálculo ou função. A **Visão geral** começa num cartão só, o **Resumo**: a
  frase do rumo da carteira em uma linha e os sete números, cada um uma vez —
  *agora* (abertas, há mais de 90 dias, sem executante) e *no período* (novas,
  encerradas, variação "de 1.156 para 1.227", programadas). Antes eram dois
  blocos com nove números, o backlog do fim repetido e a frase repetindo os
  números. Depois, os gráficos na ordem das perguntas da gestão: a evolução do
  backlog, a entrada e saída com a idade das abertas ao lado, o backlog por
  frota e as programadas e encerradas. O secundário — o que se repete em outra
  aba, ou o detalhe — fica em **Mais análises**, fechado, no fim da aba: na
  Visão geral (quem vai fechar, programadas e não programadas, categorias), nos
  Indicadores (a evolução, novas e encerradas, saldo, encerradas ÷ novas,
  corretiva e preventiva, situação das abertas), no Avanço (os gráficos semana a
  semana, o por executante e a lista das encerradas) e na Programação (os
  gráficos e o por executante). Fechado, o cartão continua montado (sem altura
  e invisível): o relatório em PDF e as imagens saem iguais. As notas dos
  gráficos ficaram numa linha. As abas Não liberadas, Frotas, Executantes e
  Auditoria são listas de consulta e ficaram como estavam.
- **As cores de referência** (12/11/2026, segunda revisão): o PCM passou o
  azul-marinho institucional **#13164E** e o vermelho institucional **#E4002A**,
  que agora são as cores da interface (a estrutura e o alerta, no site, no painel
  de OS e no relatório). O relatório gerencial (o PDF e a imagem para o celular)
  ganhou o cabeçalho com o logo, o título em azul-marinho e um fio; as imagens dos
  cartões e do resumo, o logo no rodapé (o colorido no fundo claro, o branco no
  escuro). O logo (o colorido, o branco do menu e o ícone do site) ficou com as
  mesmas cores de referência — o desenho é o dos vetores oficiais, só com as
  cores trocadas (#1D3C85 → #13164E e #ED1C24 → #E4002A). A "Data de
  atualização" das imagens saiu do vermelho: é a cor da marca (o vermelho é só
  para alerta).
- **A identidade da Makro** (12/11/2026, com os arquivos que o PCM mandou):
  as cores saíram dos vetores oficiais do logo, não do olho — o **Azul Makro
  #1D3C85** e o **Vermelho Makro #ED1C24** (`--azul-makro`, `--vermelho-makro`
  no `css/mkt.css`). No tema claro o azul é a cor do site: o menu lateral (como
  o logo "fundo azul"), o botão principal, a aba e o item escolhidos, os links e
  o foco. O vermelho fica no logo — na tela, vermelho continua querendo dizer
  atraso. O menu traz o logo MAKRO branco (`img/makro-branco.svg`); o ícone do
  site e do aplicativo é a estrela da Makro (`logo.svg`). A fonte da marca é a
  **Metropolis** (livre, em `vendor/fontes/`), nos títulos, nos números grandes
  e na navegação; o texto, as tabelas e os formulários continuam na fonte do
  sistema, porque ela não tem algarismos de largura igual. A **Gotham**, que
  também veio, é paga (Hoefler&Co.) e não entra num site público sem a licença
  web dela. O painel de OS (área isolada) ainda está com o visual dele.
- **Buscar frota**, no alto de todas as telas (no celular, a lupa ao lado do
  atualizar; **Ctrl+K** de qualquer lugar). Até 03/11/2026 era o
  **+ Registrar**, que perguntava "o que aconteceu?" e repetia os botões que
  cada aba já tem — o PCM pediu para reformular. Ficou o que ele tinha de
  próprio: começar pela frota. Digita a frota — só o número basta — e aparece
  tudo o que ela tem em aberto: a preventiva com o passo, o botão do próximo
  passo e o *Já realizada*; as movimentações com *Concluir*, *Justificar* e
  *Aprovar*; e embaixo *Pedir movimentação* e *Pôr no plano de preventivas*,
  com a frota já digitada. Vazia, mostra as frotas com alguma coisa em aberto,
  para tocar. Cada botão abre a mesma caixa da aba (`js/tela/buscarfrota.js`),
  então o motivo e a permissão valem igual; ao gravar, a busca volta na mesma
  frota, já com o que mudou, para lançar a próxima coisa. O botão redondo que
  flutuava no celular saiu — cobria a lista.
- **Preventivas de qualquer mês**: ‹ e › andam um mês, e o campo do mês pula
  para qualquer um. O mês sem plano diz isso e oferece **+ Incluir frota** e
  **Trazer frotas de outro mês** — a lista do mês de origem, cada frota com o
  plano para conferir e o vencimento em branco; só entra o que for marcado, e
  liberação, parada e OS começam do zero. O "+ Incluir frota" também aceita
  qualquer mês. A planilha continua servindo: a aba Preventivas do mês, em
  Importar.
- **O Registro** tem à vista só a busca, a frota e o período (Hoje, 7 dias, 30
  dias, Tudo); pessoa, tipo, origem e datas ficam em **Mais filtros**. Uma
  importação vira uma linha só ("importou a planilha: 86 itens"), que abre.
- **O claro, estilo Melvin, é o padrão** (o ◐ troca para o escuro, e cada
  aparelho lembra). As barras de filtro de todas as telas são um cartão só, com
  os controles da mesma altura; os segmentos são uma pílula com a opção
  escolhida em relevo; as abas separam assuntos.

### Desde 23/10/2026: agenda, etapas, motivos prontos e o passo a passo

O visual segue o exemplo que o PCM mandou (um app de agenda): menu lateral
azul-marinho, fundo cinza-azulado, cartões brancos bem redondos, o azul da
marca (`#2563eb`) no botão principal e no dia de hoje, a busca numa pílula com
lupa. As etiquetas do calendário são pares de cor (texto escuro sobre o mesmo
tom bem claro), todos acima de 4,5:1, e sempre levam o texto.

- **Movimentação abre na Agenda** (o botão **Lista** volta para a tabela de
  antes; `?vista=lista` no endereço, e `?v=` de um recorte também abre a lista).
  O mês em calendário: cada movimentação no dia do prazo — a concluída, no dia
  em que foi feita — na cor da situação. Do lado: o dia tocado (Hoje, de
  início), as atrasadas com Concluir e Justificar, a fila de aprovação do PCM,
  a pontualidade do mês num anel e as sem prazo (que não vão ao calendário). No
  celular, cada etiqueta vira um ponto e o dia tocado abre embaixo. O
  calendário é `js/tela/calendario.js`, o mesmo das Preventivas.
- **Sequência de etapas para a mesma frota** (lavar → levar ao fornecedor): no
  "+ Nova", **+ Adicionar etapa**. Cada etapa é uma movimentação inteira, com
  categoria, o que fazer, onde e prazo próprios — conta sozinha na Avaliação.
  As etapas têm o mesmo `roteiro` e `etapa` 1, 2, 3… Enquanto a anterior não é
  feita, a seguinte mostra "espera a 1" (no calendário, apagada). A ficha mostra
  a sequência e qual é a da vez, e tem **+ Próxima etapa** (que transforma uma
  movimentação avulsa na etapa 1).
- **O porquê do atraso é obrigatório e se toca**: concluir uma movimentação
  depois do prazo, anotar a chegada da frota depois da parada ou remarcar a
  liberação pede o motivo pronto (outra prioridade, frota em viagem, esperando
  outra frota, esperando outra etapa, sem motorista, fornecedor sem vaga, falta
  de peça, outro) e quem atrasou (Operação, Motorista, Fornecedor, Oficina,
  PCM, ou escrito). O detalhe é livre; em "Outro motivo", obrigatório. As
  justificativas antigas, em texto, caem no motivo que as palavras indicam
  (`M.categoriaDoMotivo`), sem regravar nada.
- **Preventivas em passo a passo.** Cada frota está num de quatro passos, cada
  um de alguém: **1 Liberação** (a operação diz quando a frota fica livre),
  **2 Parada** (o PCM marca o dia), **3 Chegada** (a frota chega na oficina),
  **4 Baixa** (o PCM dá a baixa). No alto, os passos em cartões com quantas
  frotas em cada — tocar filtra. A lista vem agrupada pelo passo; cada linha
  tem as quatro bolinhas, a frase do que falta ("A parada era 08/10 e a frota
  não chegou") e **um botão só**, o do próximo passo. A ficha abre com o passo a
  passo e as datas de cada um, e o botão do próximo passo em destaque; a OS se
  digita nela. A vista **Calendário** põe as paradas no mês. A Situação da
  planilha continua por baixo — é ela que os números conferem.
- **A coluna da direita da agenda termina com o calendário**: no computador ela
  tem a altura dele e rola por dentro, e cada lista longa (o dia, as atrasadas)
  rola dentro do próprio cartão — a página não desce mais só por causa dela.
- **A logo era um calendário** (até 12/11/2026, quando entrou a identidade da
  Makro: ver abaixo). Os ícones do menu e do "+ Registrar" (hoje Buscar frota) são desenhos em linha
  (`js/icones.js`), não caracteres — a mão do "Para você" virava emoji
  colorido em alguns aparelhos.

### Desde 29/10/2026: o Plano de volta, com o que a planilha trazia de bom

A vista em blocos de colunas (a "planilha") durou um dia: ficou pesada de ler e
o PCM pediu o passo a passo de volta. Ele voltou como a vista de entrada
(**Plano**, `?v=plano`; o endereço antigo `?v=planilha` também abre nele), e o
que a planilha tinha de útil passou para dentro de cada linha:

- **As datas dos passos na própria linha**, embaixo da frase do que falta:
  "liberação 27/10 · parada 29/10 · chegou 29/10 / na oficina · no terceiro".
- **As mudanças com o porquê**: "↻ 2× parada (era 02/11) · Frota em viagem" —
  quantas vezes a parada (ou a liberação) mudou, a primeira data e o último
  motivo. Passar o dedo/mouse mostra todas, uma por linha, com o motivo.
- **O fechamento da OS** (`prev_fechada`, do PCM): a realizada mostra
  "OS a fechar" e o botão **Fechar OS**; depois, "OS fechada 30/10". Só depois
  da baixa, nunca antes do dia da realização nem depois de hoje; lançar de
  novo corrige, e reabrir a preventiva desfaz. A ficha mostra o dia e deixa
  corrigir.
- **Baixar Excel**, na barra da busca: o mês em planilha de verdade
  (`Preventivas novembro 2026.xlsx`), com a aba *Plano* em blocos —
  disponibilidade, parada, realização, fechamento, observações — e a aba
  *Registro*, uma linha por lançamento com o porquê
  (`js/tela/prevexcel.js`). A planilha ficou no arquivo, não na tela.
- **Os números de cima falam a mesma língua**: *Todas* diz quantas valem no
  mês (tirando adiadas e canceladas), *Realizadas* diz a % do plano — a mesma
  do Painel — e a linha do mês avisa quantas das vencidas já foram adiadas
  para o mês seguinte (a planilha conta as adiadas como vencidas, e os
  números continuam batendo com ela).

E, na revisão do site inteiro:

- **Atualizar e tema viraram desenhos** (`js/icones.js`), com nome para o
  leitor de tela; o Atualizar gira enquanto busca e não aceita dois toques.
- **Faixas que rolam de lado** (as abas, os passos, as categorias) esmaecem na
  borda quando há mais para ver.
- **A data de hoje do leitor de mensagens** (`lerPendencias`) é a do aparelho,
  não a de Greenwich — depois das 21h a inspeção caía no dia seguinte.
- **Importar** diz o que há no sistema (movimentações e preventivas) em vez de
  "vazio" quando a carteira da oficina está fora do menu; os campos de
  arquivo têm nome; o Diagnóstico não diz mais "mais mais".

### Desde 03/11/2026: o que está liberado agora, várias de uma vez, e o "Já realizada"

O PCM pediu três coisas na aba de Preventivas: ver o que está liberado agora,
lançar mais de uma frota por vez, e um atalho para dizer que a preventiva já
foi feita.

- **Liberadas agora** é o segundo cartão do quadro (`M.liberadaAgora`): a
  operação liberou ("agora", ou a data já chegou) e a frota ainda não entrou na
  oficina — é o que dá para mandar parar hoje. Tocar filtra a lista; o
  subtítulo diz quantas liberam nos próximos 7 dias (`M.liberaEmBreve`), e
  *Copiar a lista* põe as liberadas em texto para o grupo. Na lista, cada uma
  tem a etiqueta verde **liberada** (`?passo=livre` abre direto).
- **Várias de uma vez** (`js/tela/prevlote.js`): cada linha aberta tem a
  caixinha, e cada passo tem **Marcar as N** no cabeçalho (filtrado num passo
  só, no alto da lista). Com alguma marcada, a barra mostra só o que serve para
  as marcadas e que a pessoa pode lançar: *Informar liberação* (agora ou a
  partir de um dia), *Marcar parada* (o dia e onde), *Chegou* (o dia de cada
  uma) e *Já realizada* (a mesma data para todas, ou uma por frota, e a OS de
  cada uma). As caixas montam os mesmos lançamentos da caixa de uma frota só:
  mudar uma liberação ou uma parada já informada continua exigindo o motivo, e
  quem chegou depois do combinado continua exigindo o porquê e quem atrasou. A
  operação, que só libera, só vê a caixinha onde liberar serve.
- **Já realizada** é o atalho de adiantar, ao lado do botão do passo (no
  celular, só o ✓): a preventiva vai direto para Realizadas, e a caixa diz quais
  passos ficam em branco. No passo 4 não aparece — lá o botão do passo já é a
  baixa. O ⋯ e o botão direito ganharam *A frota já chegou na oficina* (mesmo
  sem a parada marcada), *Já realizada* e *Fechar a OS*.
- **Realizada depois de hoje é recusada** (`ev.preventivaFeita`), como já era a
  chegada e o fechamento.
- **Acabamento**: sem vencimento no plano, a coluna mostra "—" em vez de
  repetir "sem vencimento" em cada linha; no celular, o alto da aba cabe em
  menos linhas (as vistas e o *+ Incluir* na mesma linha, o total ao lado do
  Excel); e o foco do teclado tem o mesmo contorno no site inteiro.
- **O + Registrar virou Buscar frota** (ver a seção da Avaliação, acima): a
  frota e tudo o que ela tem em aberto, com o botão de cada coisa.

### Desde 05/11/2026: o painel de OS do Protheus, dentro do site — só para quem tem acesso

O painel de OS (a STJ e a STL do Protheus: carteira, programação, não
liberadas, frotas, mão de obra, a carteira para imprimir) era um artefato à
parte, que o Claude atualizava todo dia com os arquivos mandados no chat. Veio
para cá, a pedido do Mateus, com duas condições: ficar junto das movimentações
e preventivas, e **só ele ter acesso**.

- **Onde fica** (desde 09/11/2026): uma tela do site, **OS Makro** no menu
  (endereço `#/os`; no celular, em *Mais*) — com o mesmo topo, o mesmo menu e o
  mesmo tema das movimentações e preventivas, e não mais uma página à parte. O
  item só aparece para quem o banco libera, e a tela, aberta direto, também
  pergunta ao banco antes de mostrar qualquer coisa. O endereço antigo
  (`os.html`) só leva para a tela. Por dentro, o painel desenha numa área
  isolada (shadow DOM, `js/tela/os.js`) com o `css/os.css`: ele tem nomes de
  estilo iguais aos do site (kpi, aba, botão…), e assim um não bagunça o outro;
  as cores de base e a fonte vêm do site.
- **Quem vê**: não é o papel (ser PCM não basta). É a marca **`os_makro`** na
  tabela `pessoas` (`sql/04_painel_os.sql`), que só se liga pelo SQL Editor:
  `update public.pessoas set os_makro = true where nome = 'Mateus';`. O
  `testes/politicas.sh` prova que o Lucas (PCM) não lê nem grava, que ninguém se
  dá a marca, e que o bucket não é público.
- **Onde moram os dados**: **nunca no repositório** (ele é público, e o site
  também). Ficam no bucket privado `painel-os` do Supabase: `atual.json.gz` (o
  painel do dia, ~550 KB), `dias/AAAA-MM-DD.json.gz` (uma cópia por dia) e
  `historico.json.gz` (a base histórica). O aparelho de quem tem acesso guarda
  uma cópia, presa ao e-mail, para abrir sem rede.
- **Como atualiza**: *Atualizar com o Protheus*, no alto da página. Solta-se a
  STJ e a STL do dia (as partes _1, _2… juntas, .xlsx ou .csv); o site lê os
  arquivos **no próprio computador** (`js/os/montar.js` — o `montar.py` e o
  `pagina.py` do painel, com as mesmas regras, conferidos OS por OS contra os
  de 05/11/2026), mostra o que mudou desde o painel anterior (o que fechou, o
  que abriu, o que não veio no export, se alguma OS perdeu o executante — sinal
  de STL faltando parte) e só grava quando a pessoa clica em *Gravar*.
- **A base histórica**: os exports de hoje trazem só 2026. O que veio antes
  (OS de 2024 e 2025 das frotas do PCM, a mão de obra delas, o último dia de
  cada pessoa na STL antiga, a lista de frotas e os "principais do PCM") é um
  arquivo, `historico-os.json.gz`, que vem **uma vez**, junto com a primeira
  STJ e STL. Se a STJ do dia começar depois do fim da base histórica, o site
  explica e não grava (as OS do meio ficariam de fora). **Na virada de 2027**:
  continue exportando a STJ e a STL desde 01/01/2026, ou peça ao Claude uma base
  histórica nova.
- **Nomes de gente não entram no código**: a lista dos "principais do PCM"
  vem com a base histórica; sem ela, o botão some.
- **Avanço** (06/11/2026): por dia, semana ou mês (‹ ›), o que estava para
  fechar no começo do período, quanto disso fechou, o que entrou e com quanto
  ficou — da equipe, de cada pessoa ou de cada frota, com a carteira no fim de
  cada período e a lista das OS. Pelas datas do Protheus (abertura e fim da
  manutenção) e pela mão de obra de hoje na STL; os filtros da barra valem
  (um Executante mostra só ele).
- **Modo escuro**: é o ◐ do site, que vale para o painel na hora.
- **Calendário** (09/11/2026): o período das finalizadas, na barra, abre os
  prontos (30 dias, 12 semanas, este mês, o mês passado, o ano…) e um
  calendário — um clique no começo, outro no fim. Os filtros de data (*Aberta
  em*, *Finalizada em*, *Programada para*…) usam o mesmo calendário. Período
  de menos de três semanas conta os gráficos de tempo por dia.
- **Colunas e roscas** (09/11/2026): os gráficos são colunas em pé (o
  Mateus testou as barras deitadas e preferiu as colunas). Aparecem as que
  cabem na largura, sem rolar para o lado, e o botão *Mostrar todas* abre o
  resto. Na frota, a coluna das abertas vem empilhada: liberadas embaixo,
  aguardando liberação em cima; ao lado, as fechadas. O que é parte do todo,
  com poucas fatias, é rosca: quem vai fechar as abertas, programadas × não
  programadas (abertas e fechadas), corretiva × preventiva e a situação das
  abertas — cada fatia se clica para filtrar. As cores vizinhas foram medidas
  para daltonismo, no claro e no escuro.
- **Indicadores** (09/11/2026): a aba dos números de PCM, em quatro grupos —
  *Carteira* (abertas, backlog em semanas, idade, aguardando liberação),
  *Ritmo* (fechadas por semana, taxa de atendimento, saldo, entraram), *Prazo*
  (tempo para fechar, fechadas em até 7 dias, aderência à programação,
  prevista vencida) e *Planejamento e mão de obra* (índice de preventiva,
  trabalho programado, cobertura de mão de obra, horas apontadas, abertas
  depois do serviço). Cada cartão compara com o período anterior de mesmo
  tamanho (▲/▼ com *melhor* ou *pior* escrito); a regra de cada conta aparece
  no botão *Como é calculado*. As
  contas estão em `js/os/indicadores.js` e cada fórmula tem teste com as
  contas feitas à mão (`testes/rodar.js`). Nenhuma meta é inventada: o número
  e a regra; quem decide se está bom é o PCM.
- **A OS numa caixa no meio da tela** (09/11/2026): clicar numa OS abre uma
  caixa no centro, com o essencial em quadros — há quantos dias está aberta
  (ou quanto levou), abertura, liberação, previsão (em vermelho se já passou),
  programada para, quem fecha e as horas —, a observação, a mão de obra e, em
  *Mais detalhes* (recolhido), filial, código do serviço, centro de custo,
  contador, terceiro e especialidade. Esc, o × ou o clique fora fecham; o Tab
  fica dentro da caixa. A caixa de imprimir a carteira usa a mesma.
- **Menos texto** (09/11/2026): saíram as dicas de uso ("clique aqui", "passe
  o mouse") e as notas viraram uma linha; o que explicava a conta ficou no
  *Como é calculado* dos Indicadores ou ao parar o mouse na nota.
- **Programadas × finalizadas** (10/11/2026): por dia, semana ou mês, na
  Visão geral (cartão *Programadas e finalizadas*) e na aba Programação. Em
  cada período, duas colunas e três cores, para se ler de uma olhada: as
  **programadas** para ele (em roxo; pela data programada, o P. In. Man. da
  STJ — que é o dia da abertura quando ninguém o mudou) e **todas as
  finalizadas** nele, divididas em **da programação** (verde) e **extra
  programação** (laranja: finalizadas no período sem estar programadas para
  ele — programadas para outro período, ou sem data). O número vai dentro de
  cada parte; embaixo, a aderência (% das programadas que fecharam), ou "a
  vir" no futuro. A Programação traz o número das finalizadas no período e,
  na lista, os botões *Todas as fechadas no período* e *Extra programação*;
  na tabela por executante ou frota, a coluna *Finalizadas no período*. As
  contas estão em `js/os/indicadores.js` (`progFin`), com teste.
- **Rankings em barras deitadas** (10/11/2026): o que é "por frota" ou "por
  pessoa" segue o padrão do backlog — a baixa do backlog no Avanço (baixadas
  em azul, remanescentes em laranja) e as não liberadas por frota (pela idade).
  O que é tempo (dia, semana, mês) fica em colunas.
- **Mandar no grupo** (10/11/2026): cada cartão do painel (gráfico, números
  ou tabela) tem o botão **Enviar**, com o que ele tiver: *Copiar imagem*
  (cola no WhatsApp com Ctrl+V), *Baixar imagem*, *Compartilhar…* (no
  celular, abre o WhatsApp e os outros) e *Baixar os números* (a planilha
  com o que está por trás do gráfico ou da tabela, para o Excel). A imagem
  leva o título, o período, os filtros ligados, os números em quadros e o
  gráfico. No alto, **Resumo do dia**: o texto pronto para o grupo (com o
  *negrito* do WhatsApp) — a carteira, o dia do export e a semana — e a
  mesma coisa em imagem. Nada sai do aparelho sem a pessoa clicar.
- **Backlog no padrão do PCM** (10/11/2026, o painel de backlog de um colega
  da empresa): por frota (Visão geral e Frotas) e por executante, uma barra
  deitada e grossa por linha — **Baixadas** (fechadas no período, em azul) e
  **Pendentes** (abertas hoje, em laranja), o número dentro de cada parte e o
  total no fim. As primeiras da ordem (10 na Visão geral) e o resto em
  *Mostrar todas*. A imagem do Enviar traz a data de atualização no alto, à
  direita, como no painel dele. O que é tempo (semanas, dias) segue em
  colunas. A situação P do Protheus aparece como **Não liberada** (como a aba),
  para "pendente" não querer dizer duas coisas.
- **A semana na Programação** (10/11/2026): quatro números — *Programadas*,
  *Fechadas* (das programadas), *Abertas* (liberadas × aguardando liberação) e
  *Todas as fechadas no período* —, o avanço numa barra só e, logo abaixo, a
  lista das OS com os botões dela: programadas, fechadas, abertas, liberadas,
  aguardando liberação, sem executante e todas as fechadas no período. Clicar
  num número ou num pedaço da barra abre a lista certa e não liga filtro
  nenhum na barra. Quando nenhuma fechou, a nota lembra que só conta como
  fechada a OS finalizada no Protheus — e diz quantas das abertas aguardam
  liberação e quantas estão sem executante. *Programadas nesta semana* (Visão
  geral) e as colunas do cartão *Programadas e finalizadas* abrem direto essa
  lista. *Todas / Com executante / Sem executante* (Programação e Avanço) vale
  só na aba: antes ligava o filtro Executante da barra, e os números das
  outras abas mudavam sem a pessoa perceber.
- **Quem abriu cada OS** (10/11/2026, pedido do Mateus): a coluna *Usr
  Inclusao* da STJ — o usuário do Protheus que abriu a OS, que é o CPF da
  pessoa — aparece na caixa da OS ("Aberta em 01/10/2026 · por
  000.000.000-00"), na coluna *Aberta por* da lista e na busca. Das colunas de
  usuário da STJ, é a única lida: as de alteração, início e fim continuam de
  fora. O CPF fica só no painel (o bucket privado, para quem tem acesso a
  ele): não entra no repositório, nem no Resumo do dia, nem nas imagens do
  Enviar, nem na planilha da lista. As OS da base histórica (2024 e 2025)
  vêm sem, porque ela não tem a coluna.
- **Ver não é atualizar** (10/11/2026, `sql/06_painel_os_so_ver.sql`): a marca
  `os_makro` deixa ver o painel; para atualizar (o *Atualizar com o
  Protheus*, que grava no bucket), também `os_makro_atualiza`. Quem só vê não
  tem o botão, e o banco recusa a gravação de qualquer jeito.
- **A regra da carteira** (11/11/2026, revisão pedida pelo Mateus): a OS
  entra na carteira no dia da abertura e sai no dia do fim da manutenção
  (encerrada no Protheus) — nunca antes da abertura: a OS aberta no Protheus
  depois do serviço entra e sai no mesmo dia. *Backlog inicial* é o que estava
  em aberto na véspera do período; *backlog final*, o que está em aberto no
  último dia dele (ou no dia do export). Backlog final = inicial + novas −
  encerradas, conferido OS por OS na **Conferência do backlog**: se um dia não
  fechar, aparece a divergência e as OS, sem ajuste. O caso que motivou a
  revisão (1.237 + 73 − 73 ≠ 1.209): o Avanço chamava de *Baixadas* só as
  encerradas do backlog inicial e deixava as abertas e encerradas na própria
  semana (28) dentro de *Abertas no período* — saíram 101, não 73. As contas
  estão em `js/os/indicadores.js` (`movimento`, `saidaDe`, `emAberto`), com os
  cenários em `testes/rodar.js`.
- **Um período só** (11/11/2026): o período da barra vale para todas as abas.
  Prontos: hoje, últimos 7 e 30 dias, semana atual (o de partida), mês atual,
  mês anterior, 12 semanas, o ano, o ano passado e todo o histórico — ou o
  calendário; as setas ‹ › andam um período inteiro (o dia, a semana, o mês).
  Cada número usa o evento dele: entrada pela abertura, saída pelo fim,
  programada pela data programada. A comparação é com o período anterior nos
  mesmos dias (a semana até quarta compara com a semana passada até quarta).
  A *Situação* da barra vale para as listas; os números contam todas.
- **Avanço** (11/11/2026): backlog inicial, novas OS, encerradas (do backlog
  inicial e abertas no próprio período), backlog final, variação (OS e %) e
  encerradas ÷ novas, cada um com o período anterior; a conferência; entradas
  e saídas na mesma escala, com o saldo; o backlog no fim de cada período;
  novas e encerradas por período; a baixa por executante ou frota e a lista
  (backlog inicial, novas, encerradas, backlog final).
- **Programação** (11/11/2026): três contas que não se misturam — *programada*
  (a data programada cai no período), *executada* (encerrada no Protheus, ou
  aberta com o fim real da manutenção lançado — este a partir da atualização
  seguinte a 11/11) e *encerrada* (Término = Sim). *Conclusão* = encerradas ÷
  programadas. À parte, a carteira no período: abertas, encerradas (da
  programação e extra programação) e antigas encerradas. A OS encerrada no
  período sem a data programada nele é extra programação: nunca conta como
  programada.
- **Auditoria** (11/11/2026): a conferência do período; *Do Protheus ao
  painel* (as linhas da STJ, as que ficaram de fora e por quê — outra frota,
  repetida, cancelada, encerrada sem fim, encerrada antes de 2024 — e se a
  conta bate com as OS do painel); os *pontos de atenção* nos dados (lançadas
  depois do serviço, datas depois do export, abertas que vêm só da base
  histórica, sem data de abertura, sem executante, canceladas); a comparação de
  duas atualizações guardadas (o que entrou, encerrou, reabriu, foi cancelado
  ou sumiu, OS por OS) com o backlog de um dia *registrado* naquela
  atualização × *refeito* hoje; e o histórico das atualizações. Cada
  atualização já guardava a cópia do dia (`dias/`); agora grava também uma
  linha no índice (`importacoes.json.gz`, no mesmo bucket privado) e a lista
  das canceladas. O que as cópias não provam não é inventado: aparece como
  "sumiu do export" ou "a partir da próxima atualização".
- **Resumo do período e a evolução** (11/11/2026): a Visão geral abre com o
  *Resumo do período* — backlog inicial, novas, encerradas (com as antigas),
  backlog atual e a variação, cada um com o período anterior — e a frase que
  responde se a carteira andou: *Evoluindo* (caiu), *Só movimentando*
  (encerrou, mas entrou mais) ou *ficou igual*. Embaixo, a carteira de hoje e a
  *Evolução do backlog* (o fim de cada semana, dia ou mês, a variação de cada um
  e o tracejado da tendência — a reta pelos pontos, não uma previsão). Os
  Indicadores ganharam o *Comparativo com o período anterior* (cada indicador,
  a diferença — percentuais em pontos percentuais — e *melhor*/*pior*
  escrito), a evolução do backlog, novas × encerradas, o saldo (para cima a
  carteira cresceu, em vermelho; para baixo diminuiu, em verde) e encerradas ÷
  novas com a linha dos 100%. O Avanço tem o *Histórico* de cada período em
  tabela. Tudo sai no Enviar: a imagem leva a frase do resumo e as tabelas.
- **Relatório gerencial** (11/11/2026): o botão **Relatório**, no alto, monta
  no período e com os filtros da barra: o **PDF** (A4, capa com o período, o
  dia do export, quando foi atualizado e os filtros; a Visão geral, o Avanço
  com a conferência do backlog e o histórico, a Programação e os Indicadores
  com o comparativo e os gráficos; página numerada), a **imagem para o
  celular** (o resumo, a evolução e a conferência, uma embaixo da outra, na
  largura do celular) e os **dados para o Excel** (o resumo e o período
  anterior, a conferência, a programação, o histórico, o comparativo e a lista
  das OS que entraram ou saíram no período). O relatório é o próprio painel:
  as abas são desenhadas numa largura de página e no tema claro, e os cartões
  viram as mesmas imagens do Enviar — toda imagem diz o período, os filtros e
  o dia do export. Não leva quem abriu a OS.
- **Programada é com executante** (11/11/2026, pedido do Mateus): a OS só conta
  como programada se tiver a data programada no período **e** alguém para
  executar — da equipe ou terceiro na STL. A que tem a data e ninguém na STL
  não entra em conta nenhuma de programadas (Programação, Visão geral, Resumo
  do dia, aderência dos Indicadores, Relatório): aparece à parte, em *Com
  data, sem executante (não contam)*; se for encerrada no período, é extra
  programação. A regra está em `js/os/indicadores.js` (`contaComoProgramada`).
- **O CPF de quem abriu à vista** (11/11/2026): a caixa da OS tem o quadro
  *Aberta por*, e quando não há o CPF diz o porquê (a base histórica não tem a
  coluna, ou o export da STJ não a trouxe). A coluna é achada também com outros
  nomes do export (*Usuário Inclusão*, *Usr. Incl.*…); a atualização avisa
  quando a STJ vem sem ela, e a Auditoria conta as OS sem quem abriu.
- **Ver × atualizar no banco** (11/11/2026): `sql/06_painel_os_so_ver.sql`
  aplicado — Lucas e Mayra veem; só o Mateus atualiza.
- **A lista da Programação enxuta** (11/11/2026, "por que tantas opções?"):
  seis botões em dois blocos — *Programadas para o período* (programadas,
  pendentes, encerradas, sem executante) e *Abertas e encerradas no período*.
  O detalhe (executadas, liberadas, aguardando liberação, antigas encerradas,
  extra programação) aparece só quando um número ou um pedaço da barra o abre.
  As regras de contagem ficam recolhidas em *Como é contado*.
- **Conferir com a STJ** (11/11/2026, frota 972: 108 encerradas na STJ de 2026
  × 176 no painel): a STJ exportada por data de abertura só traz as OS abertas
  no período; o painel conta como encerrada no período a OS que saiu nele pela
  data de fim, inclusive a aberta antes (as de antes de 2026 vêm da base
  histórica). As duas contas ficam lado a lado na Auditoria (*Conferir com a
  STJ*), e as encerradas de cada frota vêm divididas entre *abertas no
  período* e *abertas antes* (aba Frotas, ficha da frota e a dica do gráfico).
  A mesma OS com e sem os zeros da frente (o Excel come os zeros: 090001 ×
  90001) passa a ser uma só (`chaveOS`). A atualização avisa quantas OS em
  aberto só a base histórica tem — a situação delas é a do dia em que ela foi
  feita; exportar a STJ e a STL desde 01/01/2024 as mantém em dia.
- **As preventivas fora da carteira** (11/11/2026, pedido do Mateus): a OS com
  *Plano Manut.* no Protheus (diferente de 000000) não entra em conta nenhuma
  da carteira — Visão geral, Indicadores, Programação, Avanço, Não liberadas,
  Carteira, Frotas, Executantes, Auditoria, Resumo do dia e Relatório contam só
  as corretivas. As preventivas têm a aba **OS preventivas**: em aberto,
  abertas e encerradas no período, programadas, há mais de 90 dias, por frota
  e a lista. O *Índice de preventiva* dos Indicadores segue comparando as duas
  (das encerradas no período, quantas eram preventivas). O filtro *Tipo* saiu
  da barra. A atualização com o Protheus e a Auditoria mostram as preventivas à
  parte, e a *Conferir com a STJ* lembra que a STJ traz as duas.
- **Publicar é por versão** (12/11/2026). Antes, gravar a atualização eram cinco
  envios soltos (a base histórica, a lista de frotas, a cópia do dia, o painel e
  o índice): se um falhasse no meio, o bucket ficava com pedaços de versões
  diferentes — a lista de frotas nova com o painel velho, a cópia de um dia nunca
  publicado na comparação, o índice sem a linha (e essa falha nem aparecia). O
  painel em si nunca misturava (ele lê um arquivo só), mas o que vinha em volta,
  sim. Agora a atualização é um pacote que leva tudo o que vale junto — as OS, a
  lista de frotas usada, a base histórica usada e o índice — e publicar é, em
  ordem: conferir o pacote (OS sem número, sem frota, repetidas, o resumo que não
  bate: não passa); reservar a gravação (`trava.json.gz`, que o Storage só cria
  se não existir — duas pessoas ao mesmo tempo, uma espera; a reserva de uma
  tentativa interrompida vence em 15 minutos, e a da mesma pessoa é dela);
  conferir que o painel no ar ainda é o que estava aberto; guardar a base
  histórica nova (pelo conteúdo, `historicos/<sha>`); gravar a versão
  (`versoes/<id>`, nunca sobrescrita); baixar e conferir byte a byte; e só então
  trocar o `atual.json.gz` (e conferir de novo). Cada passo aparece na caixa,
  com onde parou se falhar, e a frase final diz que o painel continua na versão
  anterior. O botão é **Publicar no painel**; os mesmos dados da versão no ar
  não se publicam de novo. O painel diz a versão que está mostrando ("versão
  12/11 14:03 (Mateus)"), e a Auditoria lista as publicações, marca a que está
  no ar e tem **Voltar para esta** (a volta vira uma versão nova, registrada). Os
  arquivos de antes (`historico.json.gz`, `frotas.json.gz`, `importacoes.json.gz`,
  `dias/`) continuam sendo lidos. Os testes simulam cada falha (`testes/rodar.js`,
  sem rede, e `testes/interacao.mjs`, com o Storage de mentira). Na primeira
  publicação de verdade (13/11/2026) a reserva não saiu do bucket: o pedido de
  apagar ia com "Content-Type: application/json" e o corpo vazio, que o Storage
  recusa (400) — a publicação entrou, e a reserva venceu sozinha em 15 minutos.
  O pedido de apagar vai sem esse cabeçalho, e o Storage de mentira recusa igual
  ao de verdade, para o teste pegar.
- **A linha sem número de OS** (12/11/2026) conta à parte no caminho das linhas
  ("sem número de OS, não dá para identificar"); antes caía como repetida.
- **A Visão geral separa o que é do período do que é de agora** (12/11/2026): o
  Resumo é a *movimentação no período*; embaixo, a **Posição atual** é a carteira
  do último export, que não depende do período. O número das abertas há mais de
  90 dias traz também as de mais de 60 e de 30.
- **As abas do painel em quatro grupos** (12/11/2026), sem tirar nenhuma:
  Gestão (Visão geral, Indicadores), Planejamento (Programação, Avanço),
  Execução (Não liberadas, Carteira de OS) e Análise (OS preventivas, Frotas,
  Executantes, Auditoria). Pelo teclado: só a aba aberta fica no Tab; as setas,
  Home e End andam entre elas, e Enter abre.
- **A ficha da OS** (12/11/2026) na ordem: abertura, liberação ou fim, idade,
  quem fecha, horas; depois a previsão, a programação e quem abriu — com o CPF
  mascarado (`***.456.789-**`) e o "mostrar" para ver inteiro, só ali.
- **O caminho das linhas da STJ** (11/11/2026, as 3.894 OS da filial 040101 na
  STJ × o painel): o painel não conta por filial — traz as OS das frotas da
  lista do PCM, de qualquer filial (o Mateus confirmou: só a lista). Ao soltar
  a STJ e a STL em *Atualizar com o Protheus*, antes de gravar aparece "Da STJ
  de hoje: N linhas → M OS no painel", com o que ficou de fora e por quê (bens
  fora da lista, canceladas, repetidas, encerradas sem fim ou antes de 2024),
  as corretivas e as preventivas, a tabela por filial e os bens fora da lista
  do PCM (com quantas OS cada um). Depois de gravar, o mesmo fica na Auditoria
  (*Por filial*). O *Bem* que o Excel guarda como número (972) é o mesmo da
  lista (0972).
- **A lista de frotas do PCM na atualização** (11/11/2026, o Mateus mandou as
  frotas que são do PCM): a lista vinha só da base histórica. Agora, em
  *Atualizar com o Protheus*, a caixa **Frotas do PCM** mostra a lista em uso
  e de onde ela vem; colar a lista (um número por linha, ou separados por
  espaço ou vírgula — o cabeçalho e as repetidas não atrapalham) e clicar em
  *Usar esta lista* refaz o resumo na hora, dizendo quais entram e quais saem.
  Ao gravar, ela fica no bucket privado (`frotas.json.gz`) e vale para as
  próximas atualizações. O número das frotas não entra no repositório.

**As telas da oficina saíram do menu, mas nada foi apagado.** Painel, Hoje,
Programação, Semana, Resultados e Frota continuam no código, e os lançamentos
continuam na fita. Para consultar, abra o site com **`?oficina=1`** no
endereço (`https://zodkaps.github.io/gestaomkt/?oficina=1`) — o menu volta
como era. O interruptor fica em `js/foco.js`. O que segue abaixo sobre essas
telas vale para esse modo.

---

## Entrar: e-mail e senha

Cada um entra com o **próprio e-mail** e a senha. A senha é guardada e
conferida pelo Supabase — nunca por este código, nunca neste repositório.

A primeira versão inventava o e-mail ("Pedro" virava `pedro@makro.local`). O
Supabase recusa domínio de teste — *"Example and test domains are currently not
supported"* — e foi isso que barrou o primeiro acesso da equipe inteira. Para o
e-mail não virar atrito diário:

- **o aparelho lembra** o e-mail de quem entrou por último: depois da primeira
  vez, é só a senha;
- **o nome ainda serve** num aparelho onde alguém da equipe já entrou — é de lá
  que vem a cópia de quem é quem. Num aparelho novo, o site pede o e-mail.

**Quem é quem mora na tabela `pessoas`**, e nenhum e-mail mora neste
repositório (ele é público). Para cadastrar alguém, depois que a conta existir:

```sql
insert into public.pessoas (email, nome, papel)
values ('o.email@da.pessoa', 'Pedro', 'operacao')
on conflict (email) do update set nome = excluded.nome, papel = excluded.papel;
```

O `nome` assina os lançamentos e tem de ser sempre o mesmo para a pessoa.
Cadastre **depois** da conta existir: com o cadastro aberto e sem confirmação
por e-mail, quem criasse a conta primeiro com aquele endereço herdaria o papel.

- **Quem ainda não tem conta**: na tela de entrar, "Primeiro acesso da equipe"
  cria com o e-mail de verdade da pessoa. Ou, no painel, Authentication → Users
  → Add user, com *Auto Confirm User* marcado.
- **Depois que todos tiverem conta**: desligue *Allow new users to sign up* em
  Authentication → Sign In / Providers. Ninguém de fora cria conta, e quem
  entrar novo é cadastrado pelo painel.
- **Trocar de usuário** (também no celular): toque no seu nome, no alto da
  tela → *Trocar de usuário*. Sai só deste aparelho e abre a porta em branco,
  com os nomes da equipe que o aparelho já conhece — um toque preenche o
  e-mail. O que você lançou e ainda não subiu fica guardado e sobe quando você
  entrar de novo.
- **Sair sai só deste aparelho.** Antes, sair no computador encerrava a sessão
  da pessoa em todos os aparelhos, e uma hora depois o celular parava de
  receber sem dizer nada. Se o banco encerrar a sessão de verdade (senha
  trocada, painel), o site volta para a porta dizendo por quê, com o e-mail
  preenchido.
- **Ver a senha ao digitar**: o botão *Mostrar* dentro do campo de senha.
- **Trocar a própria senha**: clique no seu nome, no alto da tela → *Trocar
  minha senha*. Só dá para trocar a sua.
- **Esqueceu a senha**: ninguém consegue vê-la — nem o PCM, nem o banco, nem o
  Claude: o Supabase guarda só uma versão embaralhada. Uma nova é criada pelo
  painel do Supabase (Authentication → Users), e depois a pessoa troca pela
  dela.
- **Sem rede**: o site continua aberto com a sessão guardada e a fila local;
  as renovações acontecem quando a rede volta.

## Ações de cada item: o ⋯

Toda atividade, movimentação e preventiva, em qualquer tela, tem um **⋯** ao
lado. Ele abre as ações daquele item, e só as que valem agora e para quem está
olhando:

| ação | quem | observação |
|---|---|---|
| Dar baixa, Informar a data, Reabrir | PCM | a data de conclusão é a do dia que a pessoa escolhe |
| Programar, Reprogramar, Retirar da programação | PCM | reprogramar e retirar exigem motivo |
| Justificar | PCM (OS) e os dois (movimentação) | motivo do atraso e responsável |
| Cancelar, Desfazer o cancelamento | PCM (OS); os dois (movimentação) | cancelada não conta como concluída |
| Concluir, Definir o prazo, Aprovar, Devolver à operação | operação conclui; PCM aprova ou devolve | |
| Editar (movimentação) | PCM e operação | o que fazer, onde, prioridade, prazo e detalhes, enquanto não for cancelada; aprovação não se edita |
| Programar a parada, Reprogramar a parada, A frota já chegou, Já realizada / Dar a baixa, Fechar a OS, Marcar em andamento, Adiar para o próximo mês | PCM | reprogramar a parada exige motivo e conta; realizada não pode ser depois de hoje |
| Editar (preventiva) | PCM | frota, plano, vencimento, prazo do Service, local, onde fazer, HH, OS, observação |
| Informar liberação | operação | data em que a frota fica disponível para a manutenção |
| **Excluir** | **só o PCM** | deixa de aparecer nas telas; o histórico é mantido |

### O botão direito e o voltar

**Botão direito** em cima de uma atividade, movimentação ou preventiva, em
qualquer tela, na linha ou no cartão, abre as ações mais usadas daquele item ali
onde o mouse está: abrir a ficha, dar baixa, reprogramar, retirar da
programação, justificar, imprimir a folha da frota, abrir a frota, copiar a OS
ou o texto, e **Mais ações…** (o menu completo do ⋯). Nas linhas de *O que
decidir agora* de uma preventiva, abre o menu da preventiva. Fora de um item, abre o
básico: voltar, atualizar, imprimir a página e ir para as outras telas. Em
campo de texto, com texto selecionado, ou com **Shift + botão direito**, fica o
menu do navegador (para copiar e colar). Esc fecha; as setas andam no menu.

**Voltar.** No alto, antes do título, aparece **‹ Resultados** (o nome da tela
de onde se veio) — por exemplo, depois de clicar num gráfico de Resultados que
abriu a Programação filtrada. É o voltar do próprio navegador, então ele, o
Alt+← e o gesto de voltar do celular dão no mesmo lugar. Na tela Frota, a frota
escolhida vai para o endereço, e **‹ Todas as frotas** volta para a grade. Na
Programação, **Semana atual** aparece quando se andou para outra semana.

**Excluir não apaga.** O item deixa de aparecer nas telas, mas o histórico guarda tudo. No
**Registro**, cada exclusão e cada cancelamento tem o botão *Desfazer*, e o item
volta do jeito que estava. A operação não exclui nada: o banco não deixa.

### O Registro

O Registro é a fita inteira, do mais novo para o mais velho, **separada por
dia** — cada dia com quantos lançamentos e de quem. O dia é o do relógio de
quem olha: o lançamento das 22h em Mossoró não cai no dia seguinte.

- **Resumo do dia**, no alto (hoje, com ‹ › para os outros dias): lançamentos,
  baixas (atividade, preventiva e movimentação), reprogramações, novas e
  **pelo Painel**; e, em linha, quem lançou e o quê. Tocar em qualquer um filtra
  a lista para aquele dia.
- **Filtros**: busca (frota, OS, atividade, motivo, título da decisão),
  **pessoa**, tipo de lançamento (ou *baixas*, as três juntas), onde
  (atividades, movimentações, preventivas, semanas fechadas), frota, origem
  (site, planilha, pedido ao Claude, **decisão do Painel**, preventiva ↔ OS) e
  período — **Hoje · Ontem · 7 dias · 30 dias · Tudo**, ou de/até. Os filtros
  ligados aparecem como etiquetas com ×, e **Limpar filtros** tira todos.

## O que as cores querem dizer

Cinza é a base e cor é exceção. Número, data e texto ficam na cor do texto; a
situação vai num **ponto colorido ao lado do rótulo** — ● Vencida, ● Urgente,
● Atenção —, e o rótulo diz em palavras o que o ponto diz em cor.

- **vermelho**: vencida, atrasada, urgente
- **âmbar**: para hoje, atenção
- **verde**: feito, na meta
- **magenta**: preventiva (a faixa fina na borda da linha e o ponto do selo)
- **azul** (no escuro) ou **verde-petróleo** (no claro): só o botão principal
  da tela, o item do menu em que se está e o que está marcado

O que antes era colorido e deixou de ser, de propósito: os números grandes do
Painel e dos indicadores (o ponto no título já diz se está mal), a data do
prazo de quem venceu (fica em negrito; o ponto está na Situação, na mesma
linha), o "sem OS" (tracejado cinza — na carteira quase tudo é sem OS, e em
âmbar a tela inteira virava alerta), o "Extra", o "+ justificar", o motivo, os
botões das decisões e os botões "Concluir" dos cartões. Se tudo é vermelho,
nada é: o vermelho só funciona como aviso se for raro.

Os gráficos de Resultados usam cores de série, porque é preciso distinguir as
linhas e barras. Passar o mouse mostra o valor.

**O tema claro** (botão ◐ no alto) segue o jeito dos sistemas de manutenção
como o Melvin: fundo cinza-azulado bem claro, cartão branco com sombra macia,
texto grafite, a fonte Nunito (guardada no próprio site, em
`vendor/fontes/`, com a licença livre OFL — funciona sem internet) e o
verde-petróleo de destaque. É só o jeito: nada do código nem da marca deles.

### Trabalhar neste aparelho, quando o banco não responde

Este site nasceu local-first: ele funciona inteiro com os dados do próprio
navegador, e a nuvem é o que o torna **compartilhado**, não o que o torna
utilizável. Mesmo assim, por um erro de desenho, bastava o projeto não
responder — provedor de e-mail desligado, projeto pausado — para não haver
entrada nenhuma.

Agora, quando a autenticação falha por qualquer motivo, a tela de entrar
oferece **trabalhar neste aparelho**: escolher quem é entre os quatro e seguir
usando o site. O papel vem da mesma lista de sempre, e tudo que for lançado
entra na fila de saída.

Isso não abre buraco nenhum. **Sem sessão não há como escrever no banco**: o
que é lançado fica guardado aqui até alguém entrar com senha de verdade, e aí o
Postgres confere `autor = nome_atual()` como sempre. Duas consequências que a
tela deixa explícitas:

- a faixa no alto diz, enquanto durar, *"você está trabalhando só neste
  aparelho"* — com o número de lançamentos parados;
- a fila **sobe só o que é do autor que entrou**. O envio é um lote só e o
  banco recusa lançamento assinado por outra pessoa: sem separar por autor, um
  evento do Pedro no meio faria o lote inteiro do Mateus voltar, e a fila
  travava para os dois. O que é de outro espera a senha de quem assinou, e a
  faixa diz de quem é.

### O limite entre PCM e operação é parede, não combinado

Antes, o site escondia do Pedro o que não era dele — mas quem trocasse o nome
na tela lançava como PCM. Agora quem recusa é o **Postgres**:

```sql
autor = nome_atual()          -- não dá para assinar como outra pessoa
and ( papel_atual() = 'pcm'   -- PCM faz tudo
      or (alvo_tipo = 'movimentacao' and tipo in (...))   -- operação
      or (alvo_tipo = 'preventiva' and tipo = 'prev_disponivel') )
```

O papel mora na tabela `pessoas`, **que o site não consegue escrever** — não
existe política de insert nem de update nela. E a fita continua só-insere para
todo mundo: nada se apaga, nada se reescreve, nem pelo PCM.

**Ler também exige papel, não só ter conta.** O cadastro do Supabase é aberto,
a chave do site é pública e este repositório também: com "quem entrou lê", um
desconhecido criava uma conta e lia a carteira inteira. Agora conta que não
está em `pessoas` enxerga as tabelas vazias.

**A ordem dos arquivos não abre a porta.** O `01_esquema.sql` liga a RLS e não
cria política nenhuma — quem abre, do jeito certo, é o `02_acesso.sql`. Antes o
01 criava políticas abertas "de partida", e no projeto de verdade ele rodou
depois do 02 e derrubou a separação entre PCM e operação sem ninguém ver.

Para provar isso em vez de prometer, `bash testes/politicas.sh` sobe um
Postgres de verdade, roda as duas migrações e tenta vinte coisas — seis
que têm de passar (entre elas o PCM fechar a semana e a operação informar a
liberação de uma frota), treze que têm de ser recusadas (a operação fechar a
semana, incluir uma frota no plano de preventivas ou editar uma preventiva;
outra é depois de rodar o 01 de novo, fora de ordem) e uma conta sem papel que
não pode ver nada. Na preventiva, a operação só informa a liberação: incluir,
editar e programar a parada são do PCM.

## Ligar a sincronização da equipe (Supabase)

Projeto: `https://qektypjhagoktpvvaxel.supabase.co` — o mesmo do site antigo.

São **três passos no painel**, uma vez só:

1. **SQL Editor → New query**: rode `sql/00_conferir_rls.sql` primeiro. Toda
   linha tem de voltar `ok`. Leia a seção abaixo antes de seguir.
2. Ainda no SQL Editor: cole `sql/01_esquema.sql`, rode; depois
   `sql/02_acesso.sql`, rode.
3. **Authentication → Sign In / Providers**. São **dois interruptores
   diferentes**, e confundi-los tranca a equipe inteira para fora:
   - o provedor **Email** fica **LIGADO** (desligá-lo dá *"Email logins are
     disabled"* e ninguém entra com senha);
   - dentro dele, **Confirm email** fica **DESLIGADO** (ligado, o acesso nasce
     esperando um e-mail de confirmação que o envio embutido do Supabase não
     entrega para todo mundo).

   Se acessos já foram criados com o Confirm email ligado, desligar não solta
   os que já existem: rode `sql/03_liberar_acessos.sql`.

Depois, em **Settings → API**, copie a chave do navegador e ponha em
`js/config.js`:

```js
export const NUVEM = {
  url:   "https://qektypjhagoktpvvaxel.supabase.co",
  chave: "sb_publishable_…",
};
```

Serve tanto a **publishable** nova (`sb_publishable_…`) quanto a **anon**
legada (um JWT): o Supabase trocou o sistema de chaves e as duas vão no mesmo
cabeçalho. O campo tem nome genérico de propósito — um campo chamado `anon`
guardando uma publishable seria mentira na primeira leitura.

Com as duas metades preenchidas, **ninguém cola nada**: os quatro abrem o
endereço e já estão no lugar certo. Faltando qualquer metade, vale o que for
colado à mão na aba Importar, e o site continua funcionando guardando só no
navegador. `node testes/config.mjs` prova isso: monta uma cópia do site com o
config preenchido e confere que ele nasce ligado e que a senha é aceita de
primeira.

### Quando algo falta, o site diz o quê

Os erros de instalação chegam traduzidos, com o passo que resolve:

| o que aparece | o que fazer |
|---|---|
| "O banco ainda não tem as tabelas deste site" | rodar `sql/01_esquema.sql` e `sql/02_acesso.sql` |
| "O banco recusou o acesso à tabela" | rodar `sql/02_acesso.sql`, que concede a permissão |
| "confirmação de e-mail ligada" (ao criar acesso) | desligar *Confirm email* em Authentication → Sign In / Providers → Email. O site recusa criar antes de travar os acessos |
| "esperando confirmação por e-mail" (ao entrar) | duas coisas: desligar *Confirm email*, **e** rodar `sql/03_liberar_acessos.sql` — desligar não solta quem já foi criado |
| "este acesso ainda não tem papel" | o e-mail não está na tabela `pessoas`: rodar `sql/02_acesso.sql`, ou conferir se o nome foi digitado igual ao cadastrado |
| "O banco recusou este lançamento" | é do papel errado, ou assinado com outro nome — o Postgres recusando, como projetado |

`node testes/config.mjs` prova cada uma dessas telas contra um Supabase de
mentira que finge a falha.

### A tela de Diagnóstico

Uma passada, uma lista. A instalação tem seis coisas que podem faltar, e
descobri-las uma por vez — cada uma por um erro em inglês na hora de entrar —
custou dias. A tela **Diagnóstico** confere todas de uma vez:

| confere | quando falha, mostra |
|---|---|
| o endereço e a chave respondem | o que está em `js/config.js` |
| o provedor **Email** está ligado | onde ligar, e que é diferente de *Confirm email* |
| o **Confirm email** está desligado | onde desligar, e o SQL que solta quem já travou |
| a tabela `eventos` existe | `sql/01_esquema.sql`, com botão de copiar |
| a tabela `pessoas` existe e está protegida | `sql/02_acesso.sql`, com botão de copiar |
| o seu acesso tem papel | qual e-mail o site usou |

Cada ✗ traz o passo exato e o arquivo SQL pronto para copiar — buscado de
`sql/` na hora, para a instrução nunca divergir do que está versionado.

Ela fica no menu, em Gestão, **e abre sem ninguém estar dentro**: é justamente
quando não se consegue entrar que ela precisa abrir, e trancá-la atrás do login
seria guardar a chave dentro de casa. A tela de entrar tem o atalho — *"O que
falta no banco"*.

As tabelas se leem de dois jeitos, e qual vale depende de haver sessão: **sem
entrar**, "sem permissão" é o certo (prova que a tabela existe e que o anônimo
não alcança); **já dentro**, o certo é ler — "sem permissão" com sessão quer
dizer que o `02_acesso.sql` não rodou.

### Antes de gravar a chave: confira o RLS

**Este repositório é público.** A chave do navegador é feita para ficar à vista
— mas o que ela alcança é decidido pelo RLS, tabela por tabela. Sem RLS numa
tabela, essa chave lê a tabela inteira, de qualquer lugar do mundo.

As tabelas deste site têm RLS e política (vem do `sql/02_acesso.sql`, provado
contra Postgres de verdade em `testes/politicas.sh`). Mas este é o **mesmo
projeto do site antigo**, e ele ainda carrega as tabelas daquele app —
`tarefas`, `registros_falha`, `profiles`, `motoristas`, `componentes` e outras.
Essas eu não criei e não sei como estão.

Por isso `sql/00_conferir_rls.sql` vem antes de tudo. Qualquer linha que volte
`⚠ ABERTA` é tabela que qualquer pessoa com o endereço do site conseguiria ler.
Fecha com `alter table … enable row level security`, ou apaga o que não serve
mais — ou, se o acervo antigo não interessa, um projeto novo só para este site
é o mais limpo.

## As telas seguem a planilha

> Desde 21/10/2026 estas telas da oficina só aparecem com `?oficina=1` no
> endereço — ver *A avaliação da operação*, no começo.

O menu tem as abas da planilha, na mesma ordem: **Hoje · Programação · Semana ·
Resultados · Preventivas · Movimentações**. É o mapa que o PCM já tem na cabeça,
e os números de cada tela são os da aba de mesmo nome — calculados pelas mesmas
fórmulas (ver *Os números são os da planilha*, abaixo). Antes delas vem o
**Painel**, que a planilha não tem.

- **Painel** é o resultado geral numa tela só, e o que fazer com ele. Em cima,
  um número de cada área, os que vão para a reunião: a **aderência da semana**
  (com o número registrado da semana anterior ao lado), as **vencidas na
  oficina**, as **preventivas realizadas** no plano do mês e a **pontualidade
  da operação**. Cada um abre a tela dele. No meio, **O que decidir agora**: a
  lista que junta as três áreas, do urgente para a oportunidade, cada item com
  o porquê e o botão que já abre a ação (programar a parada na data sugerida,
  copiar a cobrança para a operação, abrir as vencidas…). Os chips filtram por
  área. Quando a mesma decisão se repete em várias frotas (doze "programar a
  parada"), aqui ela vira **uma linha** que leva ao painel de preventivas, onde
  cada uma tem o seu botão — senão uma área esconderia as outras. Embaixo, um
  cartão por área com o detalhe e a aderência e o cumprimento **registrados**
  das últimas oito semanas. O número ao lado de *Painel*, no menu, é quantas
  decisões urgentes há. As regras estão em *O que decidir agora*, mais abaixo.
  Nenhum número do Painel é conta nova: são as mesmas das abas.
- **Programação** é a aba principal: uma linha por atividade, **em blocos por
  frota**, com a **Situação colorida na frente** e a **linha feita com fundo
  verde** — o mesmo código de cor da planilha. Cada bloco abre com o resumo da
  frota ("F-617 · 25 atividades · 0 feitas · 3 vencidas") e uma barrinha. No
  alto, quantas saíram da lista e a faixa de situações com a contagem de cada
  uma, que também filtra com um clique. O recorte é a semana (o padrão), tudo
  em aberto, a carteira ou tudo. **Dar baixa é na própria linha**, na coluna
  *Feito em*, como o FOI FEITO EM da planilha. Para programar várias de uma vez,
  marca e programa.
- **OS também na concluída.** A OS do Protheus às vezes só sai depois do
  serviço feito. A coluna OS aceita o número na atividade já concluída (só a
  cancelada fica sem campo), o filtro **sem OS** mostra as concluídas junto, e
  no ⋯ e na ficha há **Anotar a OS** — o caminho do celular, onde não há a
  coluna. No Painel, "N atividades da semana sem OS" conta as já concluídas e
  diz quantas são.
- **A frota se pesquisa.** O filtro de frota é um campo: digitar **969** já
  mostra só as frotas com 969 no nome; escolher na lista que abre, ou digitar o
  nome inteiro (F-969, f969), mostra só aquela. Hífen e maiúscula não importam.
- **Retirar da programação em lote.** Marque as atividades — uma a uma, ou a
  caixinha do cabeçalho da frota para marcar o bloco inteiro — e use **Retirar
  da programação**, na barra que aparece em cima: todas voltam para a carteira
  com **um motivo só**. Pelo ⋯ de uma linha é o mesmo, para uma. A caixa sugere
  os **motivos usados por último** pela equipe (um toque preenche) — não é lista
  pronta, são as palavras de quem lançou, para o caso que se repete (seis frotas
  no mesmo fornecedor, o mesmo motivo seis vezes). No tablet em pé e no celular,
  os cartões também têm a caixinha de marcar. Conta como reprogramação, como
  sempre.
- **Dar baixa em várias de uma vez.** Marque as atividades (a caixinha da
  linha, a do cabeçalho da frota, ou **Marcar todas (N)** na barra, que marca
  tudo o que está em aberto na lista com o filtro de agora — com *Vencida*
  filtrado, são todas as vencidas) e use **Dar baixa**. A data é escolha sua,
  para todas: **o último dia programado de cada uma** (a que ainda está no
  prazo fica com a data de hoje — baixa no futuro não existe; a que não tem
  dia programado usa a data do campo) ou **uma data só**. A caixa mostra
  quantas ficam em cada data antes de gravar e, se alguma sair depois do
  prazo, pede o motivo do atraso (opcional, vale para todas as atrasadas).
  Sem data, não grava. Semana já fechada não muda com a baixa dada depois.
- **A OS se digita na própria linha.** Na coluna OS, a atividade em aberto sem
  OS mostra um campo tracejado *sem OS*: clica, digita, **Enter** (ou Tab) — a
  OS é gravada com os seis dígitos e o cursor desce para a próxima sem OS. O
  botão **"N sem OS"**, ao lado da busca, mostra só essas: é a fila do que falta
  lançar, e preenche-se a coluna sem tirar a mão do teclado. Para uma OS que
  cobre várias atividades, marque-as e use **Mesma OS**. Se a OS digitada já
  está em atividade de OUTRA frota, o site pergunta antes de gravar — número
  trocado é o erro mais comum de quem digita uma coluna inteira.
- **A carteira deixou de ser tela**: na planilha ela é a situação *Na carteira*,
  e aqui é um recorte da Programação. O endereço antigo continua funcionando.
- **Hoje** tem as caixas da aba Hoje (vencem hoje, concluídas, aderência do
  dia, em execução, atrasadas) e as listas do dia e das atrasadas. O **+ Extra**
  cria a atividade já programada no dia que está na tela, como extra.
- **Semana** tem as caixas da aba Semana, o bloco em HH, a carga por dia de cada
  executante e as atividades da semana agrupadas por dia.
- **Resultados** é um painel no jeito de um Power BI. Em cima, uma fila de
  filtros — **frota, tipo, executante e quantas semanas de tendência** — que vale
  para tudo o que está embaixo. Os dois números da reunião (aderência à
  programação e cumprimento geral) em destaque, com a variação contra a semana
  anterior e a minilinha das últimas semanas; os cartões de apoio (concluídas,
  extra, vencidas, pontualidade, cobertura de OS, preventiva, carga da equipe);
  e os gráficos: aderência e cumprimento semana a semana, o que a oficina teve
  por semana (plano concluído, plano não concluído, extra), a situação da semana,
  a distribuição por frota, a carga de cada executante contra a
  capacidade, o mix de manutenção e os motivos de não conclusão. **Clicar filtra**: a
  semana no gráfico escolhe a semana, a frota e o executante viram filtro, a
  situação abre a Programação já filtrada. Passar o mouse (ou o dedo) mostra o
  valor. Embaixo, a tabela da aba Resultados — a versão em tabela de tudo isso
  — e o fechamento das semanas. Sem filtro, cada número é o da planilha.
- **Fechamento da semana — o número não sobe sozinho.** Ver a seção *A semana
  fechada não muda*, abaixo.
- **Preventivas** é a aba Preventivas, com três vistas no alto:
  - **Plano** — feita para **uma olhada dizer o que tem pra fazer**. No alto,
    o mês numa linha: *0 de 33 realizadas · 19 vencidas · 16 dias para acabar
    o mês*, com a barra do que saiu e o traço de quanto do mês já passou (as
    oito caixas de número continuam na vista Painel). Depois, **Para fazer**,
    em três filas curtas, cada linha com o botão que resolve:
    *Programar a parada* (liberadas sem dia — o botão já traz a data sugerida,
    **Programar 16/10**, a mesma do Painel), *Dar baixa* (a parada passou, é
    hoje ou está em andamento — **Realizada** / **Reprogramar**) e *Cobrar a
    liberação* (sem a data da operação — **Copiar a cobrança** põe a lista
    pronta para o grupo). Para quem é da operação, a fila dele vem primeiro e
    se chama *Informar a liberação*. O ponto de cada linha é vermelho quando a
    preventiva já venceu. Depois, **Próximas paradas**: os dias dos próximos 14
    que têm parada marcada, e hoje com o que está em andamento. Por último,
    **o plano inteiro numa tabela só**, com a faixa de situações que filtra e,
    recolhido, o quadro *fora do plano*. A busca vale para as filas e para a
    tabela. A **OS se digita na própria linha** (Enter), também na preventiva
    já realizada; se a OS preventiva na Programação ainda não tem número,
    recebe o mesmo. O Status da planilha (Em andamento, Realizada,
    Reprogramada, Cancelada) entra como está e também se marca aqui. Debaixo
    da data da parada, **↻ 2×** diz quantas vezes ela já foi reprogramada.
  - **Painel** — o painel de controle do mês: os números (plano, realizadas, no
    prazo, vencidas, aguardando a operação, aguardando o PCM, reprogramações,
    HH; clicar leva à lista certa), o **ritmo do mês** (quanto já saiu contra
    quanto do mês já passou), as decisões das preventivas uma a uma, e os
    gráficos: onde está cada preventiva, vencimentos por semana (e se já têm
    parada), paradas nos próximos dez dias úteis, **por que mudou** (os motivos
    das reprogramações, adiamentos e cancelamentos), onde se faz, e as
    realizadas mês a mês.
  - **Mudanças** — o registro de tudo o que aconteceu com as preventivas do mês,
    do mais novo para o mais antigo: inclusão, liberação, parada,
    **reprogramação** (de → para, com o motivo), realização, edição,
    cancelamento. Quem lançou, quando, e o que mudou. Filtra por tipo e busca
    por frota, pessoa ou motivo; clicar abre a ficha. Reimportação da planilha
    que não mudou nada não aparece.
- **A preventiva do plano e a OS preventiva são uma coisa só.** A atividade
  guarda qual preventiva ela executa (`preventiva_id`), e o que acontece num
  lado vai para o outro no mesmo lote, sem ninguém lançar duas vezes:

  | na aba Preventivas | na Programação |
  |---|---|
  | parada marcada (ou mudada) | a OS preventiva entra (ou muda) no dia da parada — se não existe, é criada; se a mesma OS já estava na carteira, é ligada |
  | realizada | baixa na OS, com a mesma data |
  | reaberta | a OS volta a ficar em aberto |
  | adiada para o mês seguinte | a OS volta para a carteira, com o motivo |
  | cancelada | a OS é cancelada, com o motivo |

  E ao contrário: **baixa na OS registra a preventiva como realizada**, e
  reabrir a OS reabre a preventiva. O lançamento que nasce sozinho vai com
  origem `vinculo` (no Registro, a etiqueta *preventiva ↔ OS*) e não gera
  outro. A ficha da preventiva tem a linha **Na Programação** (situação, semana
  e dia, OS) e o botão **Abrir na Programação**; na tabela do plano, debaixo da
  OS, aparece onde ela está.
- **Ver e ligar**: o que já existia antes da ligação (a OS anotada nos dois
  lados, como a 022446 da F-328, ou parada marcada sem a OS no dia) aparece numa
  faixa no alto do Plano. O botão mostra, frota por frota, o que vai acontecer
  (ligar, dar a baixa que faltou, criar a OS no dia) e só grava ao confirmar.
  Uma OS programada em outra semana **não** é movida sozinha para o dia da
  parada: a lista só avisa — é decisão do PCM.
- **Preventiva vem primeiro.** Em Hoje, Programação, Semana, na carteira e na
  folha impressa, a OS preventiva tem o selo **Preventiva**, a faixa magenta à
  esquerda e fica no topo do bloco da frota.
- **Reprogramar a parada exige motivo.** Mudar o dia de uma parada já marcada
  é reprogramar, como na atividade: a caixa pede o motivo (com os usados por
  último à mão) e **não fecha sem ele** — o dia escolhido continua lá. Cada
  reprogramação conta na preventiva (e a primeira data fica guardada) e no
  número *Reprogramações* do mês. Mudar a **liberação** já informada também
  fica no registro, com motivo opcional. A ficha da preventiva mostra as
  reprogramações e o histórico inteiro.
- **+ Incluir frota** (PCM): uma preventiva nova no plano — frota, mês do plano,
  preventivas (15 mil km, 1 ano…), quantidade, vencimento, prazo do Service,
  equipamento, local, onde fazer, HH, OS e observação. Entra aguardando a
  liberação da operação, fica no registro como incluída no site, e a
  reimportação da planilha não a tira. Se a frota já está no plano daquele mês,
  o site pergunta antes. **Editar** (no ⋯, no botão direito ou na ficha) muda
  os mesmos campos; parada, liberação e realização não se editam aí — têm
  botão próprio, que é por onde a reprogramação se conta.
- **Os nomes de situação na tela** são os da planilha com redação revisada:
  *Vencida*, *Vence hoje*, *Em carteira*, *Dia a definir*; nas preventivas,
  *Baixa pendente*, *Disponível: programar parada*, *Liberação prevista:
  programar parada*, *Aguardando liberação*, *Programada após o prazo*,
  *Liberação após o prazo* e *Adiada para o próximo mês*. Por dentro o site
  continua usando o texto exato da fórmula da planilha (`modelo.js`,
  `rotulo()`), e é ele que os testes comparam com a planilha.
- **Justificativa — motivo do atraso e responsável.** Em atividade (OS) e em
  movimentação. É **texto livre**, digitado: cada atraso tem a sua história.
  A linha atrasada sem motivo mostra *+ justificar*; a justificada mostra o
  motivo e o responsável, e um clique muda. Concluir depois do prazo pede o
  motivo no próprio diálogo (opcional). Na movimentação, quem justifica é quem
  executa — o Pedro informa por que a frota não chegou; na OS, o PCM. A faixa
  *Atrasos por responsável*, em Movimentações, conta e filtra (inclusive *sem
  justificativa*). Destino/fornecedor, finalidade e os motivos de reprogramar e
  de adiar também são digitados — nenhuma lista pronta.
- **Movimentações**: as situações têm nomes genéricos — **Em aberto, Vence
  hoje, Atrasada, Sem prazo, Aguardando aprovação, Concluída, Concluída com
  atraso, Cancelada**. Quem faz a movimentação é quem a conclui: o Pedro marca
  **Concluir** e ela fica **Aguardando aprovação**. O PCM abre a tela direto na
  fila de aprovação, confere e **aprova** (uma a uma ou todas de uma vez) ou
  **devolve** com o porquê — a devolvida volta para a operação em aberto, com o
  motivo à vista. Quando o próprio PCM conclui, ela já entra aprovada. O banco
  confere: a operação não consegue gravar uma aprovação. Os números do alto são
  os da aba Movimentações, com as mesmas contas.
- **Solicitação de movimentação**: o formulário pede o que importa, em ordem —
  **Frota**, **Prioridade** (Alta, Média ou Baixa, em um toque), **O que fazer**
  (a ação: coletar, levar, buscar, realizar TOP…), **Onde** (para onde a frota
  vai, ou onde ela está), **Prazo**, e **Detalhes** opcionais. Os campos são
  texto livre; as sugestões são só o que a equipe já escreveu antes. Embaixo,
  uma prévia mostra como a solicitação vai aparecer na lista. Na lista, o título
  é "o que fazer · onde", a prioridade tem coluna própria e, dentro da mesma
  situação, a alta vem primeiro. **Depois de criada, edita-se pelo ⋯ ou pela
  ficha** (PCM e operação); só o que mudou vai para o Registro, e a mudança de
  prazo entra como lançamento de prazo. As que vieram da planilha não têm "o que
  fazer" nem prioridade — aparecem com o destino, como antes, até alguém editar.
- **Baixar imagem** (Movimentações): a lista que está na tela — com o recorte,
  o filtro e a busca — vira uma imagem PNG de fundo claro, para cobrar no
  grupo. No celular abre o compartilhar (WhatsApp direto); no computador, baixa
  o arquivo.
- **Imprimir — a folha da frota.** O desenho é o da folha que o PCM já usava
  (a da F-617): a frota grande no alto, a linha de resumo (quantas pendências,
  a semana, quando foi impressa), um filete vermelho, e as atividades
  **agrupadas por executante** ("Executante a definir" por último) e, dentro,
  pela **janela de dias** ("terça 06/10 a sexta 09/10"). Cada linha: o quadrado
  para marcar, a OS, a atividade e a linha **Quem fez** para escrever à mão. Com
  OS primeiro; o que nasceu no TOP (a observação começa com "[06/10] TOP") leva
  a etiqueta **TOP** e vem no fim. Frota que não cabe numa página continua na
  seguinte, com "continuação" no alto e **"página 1 de 2"** no pé — a paginação
  é medida na largura do papel, não chutada. Os botões:
  - **Imprimir semana 42** (Programação): todas as frotas com pendência na
    semana, **uma folha por frota**. Nos outros recortes o botão é *Imprimir* e
    leva o que está na tela.
  - **Imprimir** no cabeçalho de **cada bloco de frota** (Programação e Hoje): só
    aquela frota, com o que está no bloco.
  - **Imprimir folha** (tela Frota): todas as pendências em aberto da frota,
    programadas e na carteira. **Imprimir o dia** (Hoje): o que está no dia.
  - **Por executante** (Programação): escolhe os executantes, a frota e se a
    carteira entra; com *uma folha para cada executante*, cada um recebe a sua
    (agrupada por frota). Imprimir não grava nada.
- **Movimentação por categoria.** Cada movimentação tem uma categoria: *Realizar
  TOP*, *Teste e aferição*, *Lavagem*, *Desocupar box e pátio*, *Liberar para
  manutenção*, *Buscar no fornecedor*, *Levar ao box ou à matriz*, *Levar ao
  fornecedor* e *Outras* (em `M.CATEGORIAS_MOV`, tiradas do que a equipe já
  escrevia). No formulário ela é o primeiro campo, em botões, e já preenche o
  "O que fazer"; as sugestões de "Onde" passam a ser as daquela categoria. As
  antigas, sem categoria, são reconhecidas pelo "o que fazer" e pelo "onde" (os
  detalhes só contam quando os dois não dizem nada), sem regravar nada — a
  ficha diz *(pelo texto)*. A tela Movimentação tem o filtro por categoria, com
  a contagem, e a lista vem em blocos por categoria; no **Para você** da
  operação, as em aberto vêm numa seção para cada categoria, sempre na mesma
  ordem.
- **Os filtros da Programação ficam à vista.** Cada filtro ligado (frota,
  busca, situação, só sem OS) vira uma etiqueta com ×, debaixo da barra, e
  **Limpar filtros** tira todos. O recorte continua quando se troca de tela —
  e antes um filtro esquecido escondia metade da lista sem ninguém perceber.
- **Designar o executante num toque.** Na coluna Executante (Hoje,
  Programação, Semana), o nome é um botão; sem ninguém, aparece
  **+ executante**. Tocar abre os nomes da equipe em botões — os mais usados
  primeiro —, um toque marca (pode ser mais de um), e um nome novo se digita
  embaixo (Enter põe na lista). No celular, o mesmo pelo cartão. Para várias
  de uma vez: marque e use **Executante** na barra — *trocar pelos escolhidos*
  ou *somar aos que já têm*. O registro guarda o antes e o depois.
- **Programar em lote.** Na Programação, **Programar várias** abre a barra de
  seleção (marque nas caixinhas, ou filtre e **Marcar todas**); na ficha da
  Frota, **Programar a carteira**; no **Colar inspeção/TOP**, a opção
  **Programar** lança já com o dia. A caixa é a mesma nos três: mostra a lista
  do que vai (dá para desmarcar), a **data** preenche semana e dia (ou só a
  semana, sem dia), duração e equipe — e, se a frota tem a parada da preventiva
  marcada, oferece pôr cada uma **no dia da parada**. Para a que já tinha semana
  é reprogramação, e o motivo continua obrigatório.
- **Arrastar e soltar: o Quadro da Semana.** Na Semana, no computador,
  **Lista | Quadro**. O Quadro põe os dias em colunas (Seg a Sáb, o Dom se
  tiver algo, e "Sem dia" se houver), cada uma com quantas tem e o HH, e à
  esquerda a **Carteira** ou as **Vencidas** de outras semanas, com busca.
  Arrastar da carteira para um dia **programa na hora**. Mudar de dia, ou
  trazer uma vencida, é reprogramação: abre a caixa do **motivo** (com os
  últimos usados à mão) e, sem motivo, não muda. Soltar de volta na coluna da
  esquerda **tira da programação**, com motivo também. Clicar no cartão abre
  a ficha; o **+ executante** do cartão designa sem sair do quadro. A
  concluída fica no dia, apagada, e não arrasta. No celular não há quadro —
  arrastar com o dedo numa lista que rola erra mais do que acerta —, e lá
  continua o **Programar várias**. Ideia tirada do quadro de programação do
  Melvin; o resto do controle de ativos continua no Protheus.
- **A carteira por prioridade e idade.** Na carteira, a ordem é preventiva
  primeiro, depois P1, P2, P3, sem prioridade — e, dentro de cada uma, a que
  espera há mais tempo. Cada linha mostra a prioridade e **há N d**; passando o
  mouse, *esperando desde dd/mm/aaaa* e de onde veio a data: a abertura no
  Protheus ("Aberta no Protheus em…"), o dia do TOP ("[06/10] TOP…") ou, sem
  nenhuma das duas, o primeiro registro no site. A planilha não tem data de
  abertura, e o site não inventa uma. Com 30 dias ou mais, a etiqueta fica
  marcada.
- **Frota** se pesquisa: sem frota escolhida, a tela mostra todas para tocar,
  as com mais pendência primeiro; digitar "969" filtra. Cada frota leva os
  **selos** do que pede atenção antes de abrir: *preventiva vencida*, *parada
  dd/mm* (marcada), *parada passou* (sem baixa) e *em movimentação*. A
  preventiva dos selos é a do plano do mês, a mesma que a aba Preventivas
  acompanha.
- **A ficha da frota** junta tudo o que se pergunta de um caminhão. No alto,
  um resumo para tocar: a preventiva do mês (situação, parada, vencimento —
  abre a ficha dela), a próxima na programação, a movimentação em aberto e a
  última baixa. Depois, nesta ordem: **Preventivas do plano** (todos os meses,
  as abertas primeiro), em movimentação agora, programadas, **na carteira** (na
  ordem da carteira, com a idade), histórico de serviços, movimentações
  recentes, canceladas e o registro da frota.

Hoje, Programação e Semana usam a **mesma grade** (`js/tela/grade.js`): um lugar
só desenha uma atividade em lista, e as três telas nunca mostram a mesma coisa
de jeitos diferentes. No celular a grade vira cartões, com os mesmos blocos.

**Mudar uma situação não recarrega a tela.** Antes, cada ação remontava a tela
inteira — filtro, busca e rolagem voltavam ao zero, e parecia que o site tinha
recarregado. Agora a tela se repinta no lugar, uma vez por quadro, e só a linha
muda. `testes/interacao.mjs` prova: depois de dar baixa, é o mesmo elemento de
antes, a busca continua digitada e a rolagem não pulou.

O visual é **escuro por padrão** (o claro continua no botão do alto), com menu
lateral no computador e barra embaixo no celular. A barra de baixo cabe cinco
botões: no celular ficam Hoje, Programação, Preventivas e Movimentação, e o
**Mais** abre as outras (Semana, Resultados, Frota, Registro, Importar,
Diagnóstico). Quem não é PCM vê só as cinco telas dele, e a barra cabe inteira.

**Rosca quando é "como o total se divide", barra quando é comparar.** A
situação das atividades da semana, o mix de manutenção (semana e acervo lado a
lado, com os dois % na mesma linha da legenda), de quem é o atraso, onde está
cada preventiva e onde se faz são roscas: o total no meio, até seis fatias (o
resto vira "Outras"), valor e % na legenda, a dica ao passar o mouse e o clique
que filtra. Duas fatias do mesmo estado vêm em tons diferentes da mesma cor.
Ranking (frotas, carga da equipe, motivos das reprogramações) e tempo (semanas,
dias) continuam em barras e colunas — numa rosca, valores próximos não se
comparam.

As cores de dado não foram escolhidas no olho: saem de uma paleta validada para
fundo escuro (faixa de luminosidade, piso de croma, separação para daltonismo e
contraste contra a superfície). As quatro cores de estado são fixas e nunca
viram cor de série, e toda barra leva rótulo direto — cor nenhuma carrega
sozinha o que a coisa quer dizer.

## O modelo de dados: o registro É o estado

Não existe uma tabela de atividades que alguém edita e um log ao lado que
alguém lembra de escrever. As atividades **são** o resultado de tocar a fita de
eventos desde o começo:

```js
aplicar({ tipo, alvo, dados, motivo })    // js/eventos.js — a única escrita
```

Toda tela chama essa função e mais nenhuma. Quem quiser mudar uma atividade por
fora do registro teria de escrever código novo — não há caminho pronto.

A prova disso é o botão **Conferir o registro**, na aba Registro: ele
reconstrói tudo do zero a partir dos eventos e compara com o que está na
memória. Divergência ali é bug, não opinião.

### Quatro coisas vivem na mesma fita

`alvo_tipo` diz de qual delas o evento fala:

| | o que é | quem mexe |
|---|---|---|
| **atividade** | a pendência do caminhão, com OS, semana e HH | PCM |
| **movimentação** | a frota saiu do pátio e tem de voltar | os dois |
| **preventiva** | o plano do mês, com o aperto de mão entre as áreas | os dois |
| **semana** | o fechamento: os números da semana que não mudam mais | PCM |

### Os eventos

| tipo | quando | exige |
|---|---|---|
| `criada` | atividade feita à mão, ou preventiva incluída no site (+ Incluir frota) | — (preventiva: frota e mês) |
| `importada` | veio da planilha ou do Protheus | — |
| `programada` | ganhou semana pela **primeira** vez | — |
| `reprogramada` | já tinha semana e mudou | **motivo** |
| `concluida` | deu baixa | **a data** |
| `reaberta` | a baixa estava errada | — |
| `cancelada` | não vai ser feita | **motivo** |
| `restaurada` | desfaz o cancelamento | — |
| `editada` | mudou texto, OS, executante, tipo… (na preventiva: frota, plano, vencimento, local…) | — |
| `excluida` | sai das telas; o registro fica | — |
| `mov_prometida` | a operação deu o prazo | a data |
| `mov_chegou` | a movimentação foi concluída — fica aguardando aprovação | a data |
| `mov_aprovada` | o PCM conferiu e aprovou (só o PCM) | — |
| `mov_devolvida` | o PCM devolveu para a operação (só o PCM) | **motivo** |
| `justificada` | motivo do atraso ou da não execução, e o responsável (OS: PCM; movimentação: os dois) | **o motivo** |
| `prev_disponivel` | a operação informou a liberação da frota; mudar a já informada é *liberação alterada*, e para mais tarde entra na Avaliação como **liberação remarcada** | "agora" ou data; **motivo** se mudar |
| `prev_entregue` | a frota chegou na oficina para a preventiva (só o PCM); guarda o dia combinado (a parada) daquele momento, e o porquê se chegou depois | a data (hoje ou antes) |
| `prev_parada` | o PCM programou a data da parada; mudar a data já marcada é **reprogramar** e conta | a data; **motivo** se mudar |
| `prev_andamento` | a preventiva está em execução (Status Em andamento) | — |
| `prev_realizada` | a preventiva foi realizada | a data |
| `prev_fechada` | a OS da preventiva foi fechada no Protheus (só o PCM; só depois de realizada) | a data (do dia da realização até hoje) |
| `prev_adiada` | adiada para o próximo mês (Status Reprogramada) | **motivo** |
| `prev_cancelada` | não será executada | **motivo** |
| `prev_reaberta` | desfaz realizada, adiada ou cancelada | — |
| `semana_fechada` | o PCM registrou o número da semana (alvo `semana`, ex.: `2026-S42`) | **motivo**, se já estava fechada |

### As regras que o sistema impõe

1. **Reprogramar exige motivo.** Mudar semana, ano, dia ou duração de uma
   atividade que já estava programada, sem motivo, é recusado — em qualquer
   caminho, inclusive na programação em lote. É o número pelo qual PCM
   responde. Vale igual para a **parada da preventiva**: mudar o dia já
   marcado sem motivo é recusado.
2. **`editar()` não mexe em programação.** Se mexesse, haveria um jeito de
   contornar a regra acima sem querer. Programação se muda por `reprogramar()`.
   Na preventiva, `editar()` recusa parada, liberação, realização, adiamento e
   cancelamento: cada um tem o seu lançamento.
3. **A semana original nunca muda.** É a da primeira programação, e é contra
   ela que se mede o quanto uma atividade foi empurrada.
4. **Reimportar a planilha não apaga o que foi lançado no site.** Planilha e
   site convivem durante a transição, e reimportar atualiza por ID. Mas a
   importação mais recente passava por cima de tudo: a chegada de frota, a
   baixa e a reprogramação feitas no site sumiam, porque a planilha não sabia
   delas. Agora cada lançamento do site anota os campos que mexeu, e a
   reimportação atualiza só o resto. Conferido com os lançamentos reais do
   banco: as 8 chegadas e a promessa apontadas em 09/10 continuam depois de
   reimportar a planilha 83.

### O que um lança, os outros veem

Cada aparelho consulta o banco a cada 10 segundos (e na hora em que a tela
volta a aparecer) e mostra o que os outros lançaram, sem recarregar. Três
coisas faziam um lançamento não aparecer para os outros, e as três foram
consertadas:

- **consulta pendurada**: sinal ruim deixava uma consulta sem resposta para
  sempre, e a escuta esperava por ela — o aparelho parava de receber até
  alguém recarregar. Agora toda chamada ao banco tem tempo limite;
- **fora de ordem**: dois lançamentos gravados quase juntos podem ficar
  visíveis no banco fora de ordem, e quem lia no meio pulava um deles para
  sempre. Uma vez por minuto o aparelho confere os últimos 100 e busca o que
  faltar;
- **releitura antiga por cima da nova**: uma consulta que começou antes podia
  apagar da tela o que tinha acabado de chegar.

E agora isso aparece: sem contato com o banco por mais de 45 s, a faixa diz
desde quando, e o botão **⟳** no alto (ou *Atualizar agora*, na faixa) busca
as novidades na hora.

### Cópias antigas no aparelho (de antes da sincronização)

Até 08/10 o site era só do navegador, e a planilha era importada ali, com
códigos inventados na hora (`mu3gj3s7…`). Quando a sincronização chegou, a
planilha foi importada de novo no banco, com o código da própria planilha
(`A-0205`). Num navegador que já tinha a importação antiga, **cada atividade
aparecia duas vezes**, e uma baixa dada na cópia antiga ia para o banco
apontando para uma atividade que o banco não tem — a de verdade continuava em
aberto.

Agora, com o banco ligado, o que está no aparelho sem a marca de enviado (nem
na fila, nem vindo do banco — só existe antes de 08/10) **fica fora das telas**.
E o que foi lançado nas cópias aparece numa faixa no alto: *"N lançamentos
caíram em cópias antigas"* → **Ver e corrigir** mostra cada um com a atividade
certa (mesma frota e mesma atividade, pela chave do importador; faltando, a
mesma OS na mesma frota) e **Levar para as certas** refaz o lançamento nela,
com a mesma data e o mesmo motivo. O que não tem correspondência fica listado
para lançar à mão, e pode ser dispensado. `js/legado.js` e `js/tela/copias.js`.

Duas coisas **não** são levadas, depois do que aconteceu em 13/10: a
**exclusão** feita numa cópia (com tudo em dobro, excluir a cópia era tirar a
duplicata da tela — levá-la excluiu a A-0467, em aberto) e a **justificativa**
de uma cópia cuja atividade certa já estava concluída (falava de um atraso que
a certa não teve, e apagava o motivo da planilha — A-0502, A-0503, A-0514). As
quatro foram desfeitas no banco no mesmo dia.

### Dois caminhos para alimentar o site: a planilha e os pedidos ao Claude

O site é alimentado pela **planilha** (aba Importar, que atualiza por ID e não
passa por cima do que foi lançado no site) e pelo que a equipe lança nele. E
também pelo que você **pede ao Claude** na conversa — "a F-745 parou hoje",
"coloca a OS 022475 nas atividades da F-401", "a preventiva da F-703 passa
para novembro".

Um pedido ao Claude **não é um atalho por fora do registro**. O Claude grava
pelo mesmo caminho de todo mundo: um lançamento na fita de eventos, no banco,
com o tipo de sempre (`editada`, `prev_parada`, `mov_aprovada`…),
**assinado por quem pediu** e com a origem `claude`. Na aba Registro ele
aparece com a marca **pedido ao Claude**, e o filtro *Origem* separa só esses.
Como todo lançamento, pode ser desfeito por outro lançamento — nada é apagado.

Duas regras valem para o Claude como valem para qualquer um:

- **não inventa associação**: OS, frota, data de conclusão e responsável são
  os que você disse; o que ele não sabe, ele pergunta;
- **mudança de código** (uma tela nova, uma conta diferente) vai pelo
  repositório, com teste, e publica sozinha — não pelo banco.

### HH mede carga, não prazo

`HH` é hora-homem: horas × pessoas. Ele diz **quanto custa de mão de obra**, e
a duração em dias continua dizendo **quando fecha**. Os dois convivem porque os
dados mostram que não há relação entre eles: nos 754 registros, atividades com o
mesmo HH ocupam de um a cinco dias, e **548 estão com HH zerado**. Zero aqui
quer dizer "ninguém estimou ainda", e os painéis dizem quantas são — somar isso
como zero hora faria a semana parecer mais leve do que é.

A oficina **terceirizada** fica fora da carga da equipe: 66 das 754 atividades
estão lá, e elas não disputam o mecânico.

### Os números são os da planilha

Resultados, Semana e Hoje usam as **mesmas fórmulas** das abas de mesmo nome
(`M.resultados` e `M.semanaEmHH`, em `js/modelo.js`): só a **oficina interna**
(executante "(externo)" ou "Terceirizad…" sai da conta), semana pelo **dia de
início**, extra e cancelada fora da aderência. `node testes/resultados.mjs`
importa a planilha e confere, **linha a linha**, cada número das abas Resultados
e Semana — e os números do alto das abas Preventivas e Movimentações — contra o valor que a própria planilha calculou: 62 de 62 na planilha
83 (aderência 37%, cumprimento 39%, 29 vencidas, a carga de cada mecânico).

Duas regras para chegar ao mesmo número:

- **Marcada "Concluída" sem data conta como feita**, como na coluna *Concl.* da
  planilha. A marca é do PCM, não suposição — mas a data falta, e o site não
  inventa uma: a linha mostra **"✓ sem data"** na coluna *Feito em*, e um clique
  ali dá o dia. Na planilha 83 são 19, e 13 delas são do plano da semana 41: sem
  contá-las, a aderência do site dava 0% onde a da planilha dá 37%.
- **"ABRIR OS" não é OS.** É a única diferença de propósito: a célula de OS
  escrita "ABRIR OS" é recado, e o site não a conta como ordem aberta. A
  cobertura de OS no acervo sai 2 menor que a da planilha — o teste diz isso por
  extenso em vez de esconder.

Aderência e vazão continuam sendo perguntas diferentes: a aderência é *do que
planejei, quanto saiu?*; o painel *O que saiu nestes sete dias*, em Outros
indicadores, é *quanto trabalho saiu?*, contando terceirizada e o que era de
outra semana.

### A semana fechada não muda

Calculada ao vivo, a aderência de uma semana velha sobe sozinha: a baixa dada
na segunda e a atividade empurrada para a semana seguinte fazem a semana que já
passou virar 100% (era o que acontecia nas semanas 35 a 40). Na planilha, o
remédio era a **coluna amarela** do quadro *Fechamento das semanas*: na sexta, o
PCM digitava o número, e ele não mudava mais. No site é o mesmo, com o
fechamento como lançamento (`semana_fechada`, só do PCM — o banco recusa o da
operação). Cada semana tem o seu número de um destes jeitos, nesta ordem:

1. **Registrado.** O PCM fecha a semana em Resultados (**Fechar a semana**),
   escolhendo *como estava na sexta às 23h59*, *na sexta, com as baixas
   lançadas depois* (serviço que saiu na semana e só teve a baixa atrasada — a
   data da baixa até a sexta; reprogramação feita depois continua fora), *como
   está agora* ou **digitando o número apresentado na reunião** — e uma
   observação. Os números da coluna
   amarela da planilha também entram assim, pela tela Importar. Fechar de novo
   exige motivo; os dois fechamentos ficam no Registro.
2. **Automático.** Se ninguém fechou, a semana fecha **sozinha na sexta às
   23h59** (horário de Mossoró): o site toca a fita até aquele instante e tira o
   número de como as atividades estavam. Ninguém precisa lembrar. Lançamento
   feito no celular sem sinal conta pelo instante em que foi feito.
3. **Sem número.** Semana em andamento, ou que acabou antes de o site existir e
   não tem o número da planilha: vale o calculado de hoje, e a tela avisa.

**O fechamento manual depende da regra do banco.** O banco precisa da regra do
`sql/02_acesso.sql` que aceita o alvo `semana` (só do PCM) — no projeto de
verdade ela foi rodada em 13/10/2026 e conferida, e `BANCO_ACEITA_FECHAMENTO`
está `true` em `js/config.js`. Num projeto novo, sem essa regra, deixe `false`:
com o banco ligado, o botão *Fechar a semana* some e a importação não traz a
coluna amarela — um lançamento recusado prenderia a fila de quem fechou. O
automático da sexta e os números já registrados valem do mesmo jeito.

**Semana encerrada sem número fica em branco na linha de tendência.** A conta
de hoje de uma semana velha só sobe: conta a baixa lançada depois e tira do
plano o que foi empurrado para a frente — com o tempo, toda semana passada
chega a 100% nela (em 13/10, da 35 à 41, todas davam 100%). A semana 40, que não
tinha número na planilha, apareceu assim. Agora a linha mostra só o registrado
e o automático (e a semana em andamento); a semana que acabou antes do site e
sem coluna amarela fica em branco, e o tooltip diz por quê. A semana 40 foi
registrada em 13/10 com a conta da planilha como estava na importação de 09/10
(88,2%, 30 de 34).

O **calculado de hoje fica sempre ao lado** — "hoje o cálculo daria 100% (+35
p.p.)" — e o quadro de fechamento mostra registrado, hoje e a diferença, como a
coluna *Diferença* da planilha. A tendência usa o número registrado. Com filtro
de frota, tipo ou executante, os números são os calculados (o fechamento é da
oficina inteira). Os cartões de detalhe embaixo são sempre os de hoje.

### O atraso tem endereço

Cada motivo da planilha tem uma área dona — peça não chegou é Suprimentos,
frota não chegou é Operação, box bloqueado é Manutenção. O painel *De quem é o
atraso* lê o motivo escrito em cada atividade em aberto e soma por área. É o que
tira a conversa do "a manutenção não entrega".

### Concluir é datar

Uma atividade concluída **tem data**. "Marcar sem datar" era o problema antigo:
a situação mostrava concluída e a aderência, que conta por data, não via nada —
foi por isso que uma semana lia 69% enquanto a oficina achava ter entregue
mais. Aqui `concluir()` recusa sem data.

Por isso, na importação, as atividades marcadas **Concluída** sem data entram
como **feitas, sem data** (é como a planilha conta) e a linha mostra *✓ sem
data* — um clique dá o dia. O sistema não inventa o dia em que o serviço saiu.

---

### O que decidir agora

As regras do Painel ficam em `js/decisoes.js`, um módulo puro (sem tela), e
estão nos testes. Nenhuma grava nada: cada uma só aponta e abre a ação de
sempre. **O que se lança a partir de uma decisão fica marcado com ela**: o
título vai junto do lançamento (em `dados.via`, sem mudar o banco), e o
Registro mostra *decisão do Painel* e *pela decisão: …*. Vale para o que se
grava na caixa que a decisão abriu e para o que se lança na tela que ela abriu
(por exemplo, as baixas depois de *Ver as vencidas*), até sair dessa tela ou
por meia hora. O que nasce sozinho (preventiva ↔ OS) não leva a marca. O plano de preventivas que vale é o do mês corrente; sem ele, o mais
recente.

| área | quando | nível | o botão |
|---|---|---|---|
| Preventivas | a parada passou e não há baixa | urgente | Realizada · Reprogramar |
| Preventivas | a operação libera depois do prazo | urgente | Programar · Adiar |
| Preventivas | a parada está marcada depois do prazo | urgente | Reprogramar |
| Preventivas | liberada e sem parada | urgente se vence em até 7 dias (ou venceu); senão atenção | **Programar para dd/mm** |
| Preventivas | frotas sem liberação (todas numa linha) | urgente se alguma vence em até 5 dias | Copiar a cobrança |
| Preventivas | três ou mais paradas no mesmo dia | atenção | — |
| Preventivas | o mês está 20 pontos ou mais atrás do calendário | atenção | — |
| Preventivas | a frota vai parar e tem pendências na carteira | oportunidade | Ver as pendências |
| Programação | atividades vencidas (e quantas sem justificativa) | urgente | Ver as vencidas |
| Programação | vencem hoje · da semana sem OS · executante acima da capacidade | atenção | abre a tela |
| Movimentação | atrasadas | urgente | Abrir |
| Movimentação | aguardando a sua aprovação (só para quem aprova) · vencem hoje | atenção | Abrir |

**A data sugerida** para a parada é o primeiro dia útil, a partir da
liberação, com menos de duas paradas marcadas, nos próximos dez dias úteis. As
sugestões se distribuem na ordem do vencimento — quem vence antes escolhe
antes —, e cada sugestão ocupa o dia: doze liberadas não caem todas na mesma
terça. É sugestão: a caixa abre com a data, e o PCM troca se quiser. Dentro do
mesmo nível, o prazo mais curto vem primeiro.

## Colar inspeção ou TOP

O resultado da inspeção e do TOP chega como mensagem no WhatsApp ou em PDF. O
botão **Colar inspeção/TOP** (Painel, Programação, ficha da Frota e Importar —
onde também dá para soltar o PDF) transforma isso em pendências na carteira,
depois de o PCM conferir:

- **Cole a mensagem como veio.** A linha que é só o número ("433", "F-433",
  "Inspeção prioridades 616:") é a frota; a linha com marcador (`-`, `•`, `1.`)
  é a pendência, sem o traço e sem o `;`. Menção (`@fulano`), "psc", títulos em
  negrito e recados ficam **de fora**, mas à vista: um toque em *+ é pendência*
  põe de volta. Várias frotas na mesma mensagem viram um bloco para cada uma.
- **O TOP como chega** ("TOP REPROVADOS 14/10 – PENDÊNCIAS DO TOP", depois
  "F616", "974", uma pendência por linha, sem traço) também é lido: a data do
  título vira o dia das pendências; "F434 LIBERADO COM RESTRIÇÃO" vira a
  situação da frota; "PREVENTIVA" sozinho na linha avisa da preventiva; o
  bloco "Veículo não liberado devido a…" é o **porquê da reprovação** (fica à
  parte, não vira pendência); "Observação:" também fica à parte. Duas
  pendências grudadas na mesma linha se separam — no "-" antes de verbo
  ("fixar corote-lubrificar tirantes"), depois de ")" ("cabine (LE)-veículo
  esquentando") e no verbo que começa outra ("…do motorista desobstruir
  esguicho…") — com a marca *separada da linha*, para conferir.
- **Parecidas**: além da idêntica, a caixa acha a mesma pendência escrita de
  outro jeito ("Providenciar estepe" × "Sem estepe", "Diagnosticar falhas no
  motor" × "Motor falhando", "para-brisa" × "parabrisa"), sem confundir o lado
  (LE × LD). Vêm desmarcadas, dizendo com qual se parecem.
- **PDF**: o texto é lido no próprio navegador (pdf.js, em `vendor/pdfjs`, só
  baixa quando alguém solta um PDF). A linha quebrada é emendada, a OS na frente
  vira a OS da pendência e "TOP" no fim marca a origem. PDF escaneado é imagem e
  não tem texto: aí o site avisa, e o caminho é copiar o texto ou mandar para o Claude.
- **Conferir**: cada pendência tem a caixinha, o texto para corrigir e a
  prioridade; ⚠️ na mensagem sugere P1. As que a frota **já tem em aberto** (o
  mesmo serviço no mesmo lugar, pela identidade de atividade de `js/texto.js`)
  vêm desmarcadas, com *já está na carteira* ou *já programada*. Se a frota tem
  preventiva no plano do mês, a caixa diz — a parada é a hora de fazer as pendências.
- **Prioridade de todas** e **Oficina** (Interna ou Terceirizada) valem para o
  lote. **Lançar** cria cada uma na carteira, com a observação *[14/10] Inspeção*
  (ou *TOP*) — é dela que a carteira conta há quantos dias a pendência espera — e
  o Registro diz *criada — Inspeção de 14/10/2026, colada no site*.

O leitor fica em `js/pendencias.js`, puro, e os testes usam as mensagens de
verdade (a 433, a 616 com ⚠️, a folha da F-617 em PDF, várias frotas juntas).

## O banco tem espaço para quantos anos

Medido em 14/10/2026: o banco inteiro tem 16 MB (a maior parte é o próprio
Supabase) e a fita de eventos **1,1 MB** para 1.285 lançamentos — uns 860 bytes
cada, com os índices. O plano grátis passa a **só leitura aos 500 MB** de dados.
Uma pendência lançada (pelo site ou pelo Claude) é um lançamento; uma baixa,
outro. No ritmo de 100 a 250 lançamentos por dia, são 30 a 80 MB por ano:
**de 6 a mais de 10 anos** até o limite. Reimportar a planilha inteira é o que
mais pesa (~850 lançamentos de uma vez); depois da transição, isso acaba.

O **Diagnóstico** mostra o espaço usado e quanto ainda cabe no ritmo atual, e
avisa aos 60%. Se um dia chegar lá, há dois caminhos, nesta ordem:

1. **Arquivar o histórico antigo**: tirar a cópia de segurança completa (Importar
   → Cópia de segurança — fica com a fita inteira), e trocar os lançamentos das
   atividades encerradas há mais de um ano por um retrato de cada uma. As telas
   continuam iguais; o detalhe antigo fica no arquivo. Apagar da fita só o dono
   do banco faz, pelo SQL Editor — o site não consegue, de propósito.
2. **Passar o projeto do Supabase para um plano pago**, se arquivar não bastar.

## Carregar a base do Protheus

Solte o arquivo (XLSX ou CSV) na aba Importar. Como não tem a aba
`Programação`, ele é tratado como export do Protheus:

1. **Qual aba e onde está o cabeçalho** — com as primeiras linhas à vista.
2. **De que coluna vem cada coisa** — OS, frota, descrição, tipo, situação,
   datas. O mapeamento fica salvo e volta pronto da próxima vez (só é
   reaproveitado se o cabeçalho for exatamente o mesmo).
3. **A prévia**, com uma caixa de marcar por grupo. Nada entra sem passar aqui.

As regras do cruzamento:

- casa **pelo número da OS**, completando zeros à esquerda (o campo tem 6
  dígitos e a planilha acumulou OS de 4 e 5);
- uma OS pode cobrir **várias atividades** — todas as abertas dela aparecem;
- **frota divergente entre as duas pontas → avisa e não altera nada**. Escolher
  uma seria inventar;
- OS encerrada lá e aberta aqui → **proposta** de baixa, que você confirma;
- OS que não existe aqui mas cuja **mesma atividade** já está anotada na mesma
  frota sem OS → propõe **ligar a OS à atividade existente** em vez de criar
  linha repetida. Quem decide se é "a mesma atividade" é o `js/texto.js`.

### `js/texto.js` — por que a posição da peça é o centro

Porte do `texto.py` do processo antigo da planilha. Manutenção escreve serviços que só diferem pelo
lugar: "lona de freio dianteira LD" e "lona de freio dianteira LE" são duas
rodas, duas peças, dois serviços. Um comparador por parecença achou 182 pares
suspeitos nas atividades e errou em quase todos; o mesmo comparador, ensinado a
separar **posição** de **serviço**, achou 4 e acertou os 4.

```
esqueleto  = o serviço, sem o onde     ("substitu lona freio")
posicao    = o onde                    ({dianteiro, ld})
```

Mesmo esqueleto + mesma posição = a mesma atividade. Posição diferente = irmãs,
e não se alerta nada. `trocar` ≡ `substituir`; `recuperar`, `corrigir` e `repor`
ficam de fora de propósito — tratá-los como sinônimo esconderia serviço real.

---

## Cópia de segurança — leia isto

**Dado no navegador é dado em um navegador.** Limpar os dados do site apaga
tudo, e nenhum aviso de tela devolve depois.

- O botão **Backup**, no topo, baixa um `.json` com a **fita inteira** — volta
  com o histórico, não só com o resumo.
- A faixa vermelha no topo aparece quando faz tempo demais, dizendo **quantos
  lançamentos** se perderiam. É esse número que importa, não os dias.
- **Restaurar** troca tudo pelo conteúdo do arquivo, e recusa arquivo que não
  seja backup daqui.
- O **CSV** é uma fotografia para abrir no Excel: não traz o histórico e não
  volta para cá.

Guarde o `.json` fora do computador — Drive, e-mail para você mesmo, pen drive.

Se um dia isso tiver de ir para a nuvem, muda **um** arquivo (`js/dados.js`),
porque toda escrita já passa por `aplicar()`.

---

## Segurança do site (revisão de 06/11/2026)

O repositório e o site são públicos; quem protege os dados é o banco (RLS,
`sql/02_acesso.sql` e `sql/04_painel_os.sql`). Do lado do navegador, estas
travas existem de propósito — não tirar sem saber o porquê:

- **Política de conteúdo (CSP)** no `index.html` (e no `os.html`, que só redireciona): a página só
  roda script do próprio site, sem `eval`, e só conversa com `*.supabase.co`.
  Se algum dia alguém conseguir pôr HTML no site (uma observação maliciosa, um
  evento adulterado), o script dele não roda e não manda nada para fora — nem
  a senha de quem entra. Por isso **não existe script escrito dentro do HTML**
  (nem no molde do painel de OS, `<template id="molde-os">`). Biblioteca nova de outro
  endereço, ou outro servidor para chamar: tem de entrar na CSP, senão o
  navegador barra. O teste do navegador falha se a CSP barrar qualquer coisa.
- **Texto da pessoa vira texto, nunca HTML**: as telas montam tudo com `el()`
  (`js/ui.js`), que escreve `textContent`. O único `innerHTML` do site é o dos
  ícones e desenhos fixos do próprio código.
- **CSV sem fórmula** (`celulaCSV`, em `js/texto.js`): célula que começa com
  `= + - @` ganha um apóstrofo, senão o Excel a executaria como fórmula.
- **Restaurar um backup** só traz os eventos e as preferências do Protheus — o
  endereço do banco, a sessão e quem entrou nunca vêm de arquivo.
- **Evento com campo `__proto__`** é ignorado na fita (`juntar`, em
  `js/eventos.js`).
- **Sair apaga a cópia do painel de OS** deste aparelho (é dado do Protheus).
- **PDF de fora** (inspeção, TOP) é lido pelo pdf.js sem montar código a partir
  dele (`isEvalSupported: false`).
- **Bibliotecas** em `vendor/`, sem CDN: jsPDF 4.2.1 e AutoTable 5.0.9 (as
  falhas conhecidas da 2.5.1 ficaram para trás), pdf.js 4.10.38, d3 7.8.5. A
  SheetJS 0.18.5 tem duas falhas conhecidas na leitura de arquivo feito para
  atacar (CVE-2023-30533 e CVE-2024-22363); a corrigida (0.20.3) só sai pelo
  `cdn.sheetjs.com`, fora do npm. Enquanto não troca, o risco fica restrito a
  arquivos que o próprio PCM solta em Importar.
- **Dado da Makro fora do repositório** (06/11/2026): saíram a pasta
  `planilha/` (as planilhas, os lotes de pendências e os scripts com elas
  coladas), o `index.html` do site antigo (trazia a lista de frotas embutida) e
  o e-mail de verdade dos testes — do código e do histórico. O `.gitignore`
  barra planilha, export, base histórica e backup. Os testes leem a planilha de
  fora do repositório (`node testes/rodar.js caminho/da/planilha.xlsx`).
- **O banco do site antigo**, que ainda mora no mesmo projeto, foi fechado em
  `sql/05_endurecer.sql`: o que não conferia quem chama não se chama mais pela
  API.

---

## Os arquivos

| arquivo | o que faz |
|---|---|
| `index.html` | a casca: topo, navegação, `<main>`. Nenhuma lógica. |
| `css/mkt.css` | estilo único, celular primeiro, claro e escuro |
| `vendor/fontes/` | a Metropolis, fonte da marca (livre, `Metropolis-LICENCA.txt`), e a Nunito antiga (OFL, `Nunito-OFL.txt`) |
| `img/makro.svg`, `img/makro-branco.svg`, `logo.svg` | o logo da Makro (azul, branco para o menu) e o ícone do site, tirados dos vetores oficiais |
| `js/app.js` | carrega a fita, escolhe a tela, cuida do aviso de backup |
| `js/eventos.js` | **a única porta de escrita**: `aplicar`, `reconstruir`, `conferir` |
| `js/modelo.js` | contas puras: semana ISO, prazo, situação, aderência, mix, backlog |
| `js/dados.js` | IndexedDB → localStorage → memória, nessa ordem de queda; a fita é chaveada pelo `id` |
| `js/texto.js` | identidade de atividade (esqueleto + posição) |
| `js/planilha.js` | XLSX e CSV viram linhas; datas em qualquer formato viram ISO |
| `js/importar.js` | leitura da planilha, mapeamento do Protheus, reconciliação |
| `js/backup.js` | exportar, restaurar, CSV, aviso de última cópia |
| `js/ui.js` | criar elemento, caixa de diálogo, aviso, barra, medidor |
| `js/tela/comum.js` | o cartão e a ficha — um lugar só onde atividade é desenhada e alterada |
| `js/nuvem.js` | o Supabase por `fetch`: ler desde um ponto, enviar, consultar de tempos em tempos |
| `js/pessoas.js` | quem está usando, o papel, o que esse papel pode |
| `js/tela/*.js` | entrar, operacao, painel, hoje, programacao, semana, resultados, movimentacoes, preventivas, frota, historico, importar, diagnostico |
| `js/foco.js` | o que o site mostra: sem `?oficina=1`, as telas da oficina ficam fora do menu; a primeira tela de quem entra |
| `js/avaliacao.js` | as contas da Avaliação da operação: os três atrasos, o que atrasa agora, o que falta justificar, os agrupamentos dos gráficos |
| `js/tela/avaliacao.js` | a tela Avaliação, em cinco abas: Resumo, Para resolver, Motivos, Análise e Todos os atrasos |
| `js/tela/buscarfrota.js` | o Buscar frota (Ctrl+K): a frota digitada e tudo o que ela tem em aberto, abrindo as caixas de sempre |
| `js/tela/prevlote.js` | as preventivas em lote: a barra das marcadas no Plano e as caixas de liberação, parada, chegada e realizada |
| `js/decisoes.js` | **o que decidir agora**: as regras do Painel, puras, e a data sugerida para a parada |
| `js/vinculo.js` | o *Ver e ligar*: o que fazer, preventiva por preventiva, para ligar o que já existia à Programação |
| `js/registro.js` | as contas do Registro: o dia de cada lançamento, o filtro, o resumo do dia e o tamanho da fita |
| `js/pendencias.js` | lê a mensagem ou o PDF da inspeção/TOP: frota, pendências, conversa de fora, duplicadas |
| `js/tela/colar.js` | a caixa *Colar inspeção/TOP*: conferir e lançar na carteira; lê o texto do PDF |
| `js/tela/quadro.js` | o Quadro da Semana: dias em colunas, carteira ao lado, arrastar e soltar (mudar de dia pede motivo) |
| `vendor/pdfjs/` | pdf.js 4.10.38 (Apache 2.0), carregado só quando alguém solta um PDF |
| `CLAUDE.md` | as regras e a rotina que o Claude segue quando a pessoa pede pelo chat |
| `js/tela/decidir.js` | a lista de decisões na tela, com o botão de cada uma |
| `js/tela/painel.js` | o Painel: os quatro números, as decisões, um cartão por área, a aderência das semanas |
| `js/tela/acoes.js` | as ações do ⋯ de cada item — um menu por tipo, com as opções que valem para quem está olhando |
| `js/tela/imprimir.js` | a folha de pendências por frota e executante, para imprimir |
| `js/tela/contexto.js` | o menu do botão direito: as ações do item, ou o básico da tela |
| `js/fechamento.js` | o número que fica de cada semana: registrado, automático (sexta 23h59) ou o de hoje |
| `js/tela/grade.js` | a lista no formato da aba Programação — Hoje, Programação e Semana usam a mesma; a OS digitada na linha |
| `js/graficos.js` | os gráficos do painel de Resultados, em SVG puro: linha, colunas, barras, minilinha, dica |
| `js/tela/indicadores.js` | os painéis que a planilha não tem, recolhidos em Resultados |
| `js/tela/diagnostico.js` | o que falta para o site funcionar em equipe, com o SQL para copiar |
| `js/config.js` | o endereço e a chave do projeto — o único lugar a preencher |
| `sql/00_conferir_rls.sql` | que tabela do projeto está aberta — rode antes de publicar a chave |
| `sql/03_liberar_acessos.sql` | solta acessos presos na confirmação de e-mail |
| `testes/config.mjs` | prova que o config preenchido conecta sem ninguém colar nada |
| `testes/interacao.mjs` | o mouse, e entrar e trabalhar com a nuvem caída |
| `testes/sitefalso.mjs` | serve uma cópia do site apontada para o Supabase de mentira |
| `testes/supabase_falso.mjs` | um PostgREST + Auth de mentira, com as mesmas regras do banco |
| `js/ui.js` | `tabela()` ordenável e `listaDupla()`, as duas formas da mesma lista |
| `sql/02_acesso.sql` | tabela `pessoas`, papel, e as políticas por papel |
| `testes/politicas.sh` | sobe um Postgres e prova que o banco recusa |
| `sql/01_esquema.sql` | a tabela de eventos e a política de só-insere |
| `sw.js` | offline: rede primeiro, cache como reserva |
| `testes/rodar.js` | os testes do núcleo |
| `testes/resultados.mjs` | o site dá o mesmo número que as abas Resultados, Semana, Preventivas e Movimentações da planilha, linha a linha |
| `js/tela/os.js` | a tela OS Makro: a área isolada do painel, a pergunta `ve_os()` ao banco, o bucket privado e a cópia do aparelho |
| `css/os.css`, `<template id="molde-os">` (no `index.html`) | o estilo e a estrutura do painel de OS — sem dado nenhum |
| `js/os/indicadores.js` | as contas dos indicadores de PCM (só contas; a tela está no `painel.js`) |
| `os.html` | o endereço antigo do painel: leva para `#/os` |
| `js/os/painel.js` | o painel de OS (o do artefato v9): abas, filtros, gráficos, a carteira, a folha para imprimir |
| `js/os/montar.js` | a STJ e a STL viram o painel — o `montar.py` + `pagina.py`, no navegador; e o comparar de um dia para o outro |
| `js/os/importar.js` | a caixa *Atualizar com o Protheus*: ler, conferir, gravar no bucket |
| `sql/05_endurecer.sql` | fecha o que sobrou do site antigo no mesmo projeto (funções que a API não deve chamar, `search_path` fixo) |
| `sql/04_painel_os.sql` | a marca `os_makro`, a função `ve_os()` e o bucket privado `painel-os` com as políticas |
| `vendor/d3.min.js`, `vendor/jspdf*.js` | d3 7.8.5 (ISC), jsPDF 4.2.1 e AutoTable 5.0.9 (MIT), só para o painel de OS |

## Os testes

```bash
node testes/rodar.js                       # usa a planilha padrão
node testes/rodar.js caminho/da/sua.xlsx
node testes/resultados.mjs caminho/da/sua.xlsx   # o site × as abas Resultados e Semana
```

Rodam em node contra a **planilha de verdade**: teste que só passa com dado
inventado não prova que a carga funciona. Conferem a identidade de atividade,
semana ISO e prazo, as regras do log, a carga inteira, o backup ida e volta, o
cruzamento com um export do Protheus, o modo de trabalhar sem banco, que
reimportar não apaga o que foi lançado no site — e que cada número das abas
Resultados e Semana sai igual no site.

As outras três precisam do Supabase de mentira em pé:

```bash
node testes/supabase_falso.mjs &     # PostgREST + Auth, com as regras do banco
node testes/config.mjs               # nasce ligado, diagnóstico, nome ou e-mail
node testes/interacao.mjs            # o mouse, a baixa que não recarrega, a nuvem caindo e voltando
bash testes/politicas.sh             # sobe um Postgres e prova que ele recusa
```

---

## O que a planilha escondia

Achado ao carregar os dados reais, e que muda números já usados:

1. **A situação das movimentações é digitada à mão** e pode discordar das datas
   na mesma linha — são **16 divergências** hoje. No site ela é calculada: a
   data é o fato, a palavra era opinião. A importação lista as diferenças em vez
   de escolher calado.
2. **Duas frotas voltaram sem ninguém ter prometido data.** A planilha as conta
   como *no prazo* (sem prazo não há atraso), e o site agora conta igual: 19
   no prazo de 33 concluídas, 57,6% — o mesmo número da aba.
3. **"Agora" e uma data moram na mesma coluna** de disponibilidade, o que impede
   ordenar. Viraram duas coisas: uma marca e uma data.
4. **A aba Preventivas tem duas tabelas**: o plano do mês e, no pé, o quadro
   *FORA DO PLANO* (frotas já realizadas, sem preventiva, que vencem no mês
   seguinte). A importação lia as duas como uma só e trazia o título do quadro
   e as 7 frotas de fora como preventivas a fazer — eram as **37** no lugar de
   29 linhas. Agora cada tabela é lida com o seu cabeçalho: **33 preventivas a
   fazer em 25 frotas**, como no alto da aba, mais 8 que passam para o mês
   seguinte (Status *Reprogramada*) e o quadro de fora à parte. A preventiva
   casa pela **frota e pelo mês**, não pela linha: inserir uma linha no meio da
   aba não faz a disponibilidade da F-745 cair na F-695. Reimportar mostra, antes
   de gravar, o que sai do mapa.
5. **19 atividades marcadas como concluídas sem data.** Contam como feitas,
   como na planilha, com *✓ sem data* na linha — o sistema não inventa o dia.
