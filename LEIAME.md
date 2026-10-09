# Programação Makro — programação, OS, movimentação e preventiva

Controle de PCM da manutenção, Makro Transportes (Mossoró/RN). Site estático
que roda no navegador, guarda a fita de eventos no Supabase e funciona sem
internet. **Qualquer mudança fica registrada**, com quem fez e por quê.

São quatro pessoas, com dois papéis:

| quem | papel | o que faz |
|---|---|---|
| Mateus, Lucas | **PCM** | programa a oficina, dá baixa, marca parada, **aprova as movimentações**, importa a planilha e o Protheus |
| Pedro, João Victor | **Operação** | **conclui as movimentações** de frota e diz quando o caminhão fica livre |

A equipe da oficina continua fechando OS direto no Protheus. Este site é o
controle do PCM e o canal de resposta da operação.

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
      or (alvo_tipo in ('movimentacao','preventiva') and tipo in (...)) )
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
Postgres de verdade, roda as duas migrações e tenta onze coisas — duas que têm
de passar, oito que têm de ser recusadas (uma delas depois de rodar o 01 de
novo, fora de ordem) e uma conta sem papel que não pode ver nada.

## Ligar o lugar comum (Supabase)

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

O menu tem as abas da planilha, na mesma ordem: **Hoje · Programação · Semana ·
Resultados · Preventivas · Movimentações**. É o mapa que o PCM já tem na cabeça,
e os números de cada tela são os da aba de mesmo nome — calculados pelas mesmas
fórmulas (ver *Os números são os da planilha*, abaixo).

- **Programação** é a aba principal: uma linha por atividade, **em blocos por
  frota**, com a **Situação colorida na frente** e a **linha feita com fundo
  verde** — o mesmo código de cor da planilha. Cada bloco abre com o resumo da
  frota ("F-617 · 25 atividades · 0 feitas · 3 vencidas") e uma barrinha. No
  alto, quantas saíram da lista e a faixa de situações com a contagem de cada
  uma, que também filtra com um clique. O recorte é a semana (o padrão), tudo
  em aberto, a carteira ou tudo. **Dar baixa é na própria linha**, na coluna
  *Feito em*, como o FOI FEITO EM da planilha. Para programar várias de uma vez,
  marca e programa.
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
- **Hoje** tem as caixas da aba Hoje (para fechar hoje, fecharam, aderência do
  dia, em execução, atrasadas) e as listas do dia e das atrasadas.
- **Semana** tem as caixas da aba Semana, o bloco em HH, a carga por dia de cada
  executante e as atividades da semana agrupadas por dia.
- **Resultados** é um painel no jeito de um Power BI. Em cima, uma fila de
  filtros — **frota, tipo, executante e quantas semanas de tendência** — que vale
  para tudo o que está embaixo. Os dois números da reunião (aderência à
  programação e cumprimento geral) em destaque, com a variação contra a semana
  anterior e a minilinha das últimas semanas; os cartões de apoio (concluídas,
  extra, vencidas, pontualidade, cobertura de OS, preventiva, carga da equipe);
  e os gráficos: aderência e cumprimento semana a semana, o que a oficina teve
  por semana (plano feito, plano que não saiu, extra), a situação da semana,
  onde está o trabalho (por frota), a carga de cada executante contra a
  capacidade, o mix de manutenção e por que não saiu. **Clicar filtra**: a
  semana no gráfico escolhe a semana, a frota e o executante viram filtro, a
  situação abre a Programação já filtrada. Passar o mouse (ou o dedo) mostra o
  valor. Embaixo, a tabela da aba Resultados — a versão em tabela de tudo isso
  — e o fechamento das semanas. Sem filtro, cada número é o da planilha.
- **Preventivas** é a aba Preventivas: os mesmos números no alto (preventivas a
  fazer, frotas, com e sem data da operação, parada marcada, conflitos,
  vencidas, realizadas, HH) e a mesma Situação, pela mesma fórmula. Separada
  por **de quem é a bola**: *bola com o PCM* (marcar a parada), *bola com a
  operação* (dizer quando a frota fica livre), *andando* (parada marcada ou em
  andamento), *fechadas no mês* (realizada, mês seguinte, cancelada) e, à
  parte, o quadro *fora do plano*. O Status da planilha (Em andamento,
  Realizada, Reprogramada, Cancelada) entra como está e também se marca aqui.
- **Justificativa — por que atrasou e quem atrasou.** Em atividade (OS) e em
  movimentação. É **texto livre**, digitado: cada atraso tem a sua história.
  A linha atrasada sem porquê mostra *+ justificar*; a justificada mostra o
  porquê e quem atrasou, e um clique muda. Concluir depois do prazo pede o
  porquê no próprio diálogo (opcional). Na movimentação, quem justifica é quem
  faz — o Pedro diz por que a frota não chegou; na OS, o PCM. A faixa *Atrasos
  por quem atrasou*, em Movimentações, conta e filtra (inclusive *sem
  justificativa*). Destino/fornecedor, para quê e os motivos de reprogramar e
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

Hoje, Programação e Semana usam a **mesma grade** (`js/tela/grade.js`): um lugar
só desenha uma atividade em lista, e as três telas nunca mostram a mesma coisa
de jeitos diferentes. No celular a grade vira cartões, com os mesmos blocos.

**Mudar uma situação não recarrega a tela.** Antes, cada ação remontava a tela
inteira — filtro, busca e rolagem voltavam ao zero, e parecia que o site tinha
recarregado. Agora a tela se repinta no lugar, uma vez por quadro, e só a linha
muda. `testes/interacao.mjs` prova: depois de dar baixa, é o mesmo elemento de
antes, a busca continua digitada e a rolagem não pulou.

O visual é **escuro por padrão** (o claro continua no botão do alto), com menu
lateral no computador e barra embaixo no celular.

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

### Três coisas vivem na mesma fita

`alvo_tipo` diz de qual delas o evento fala:

| | o que é | quem mexe |
|---|---|---|
| **atividade** | a pendência do caminhão, com OS, semana e HH | PCM |
| **movimentação** | a frota saiu do pátio e tem de voltar | os dois |
| **preventiva** | o plano do mês, com o aperto de mão entre as áreas | os dois |

### Os eventos

| tipo | quando | exige |
|---|---|---|
| `criada` | atividade feita à mão | — |
| `importada` | veio da planilha ou do Protheus | — |
| `programada` | ganhou semana pela **primeira** vez | — |
| `reprogramada` | já tinha semana e mudou | **motivo** |
| `concluida` | deu baixa | **a data** |
| `reaberta` | a baixa estava errada | — |
| `cancelada` | não vai ser feita | **motivo** |
| `restaurada` | desfaz o cancelamento | — |
| `editada` | mudou texto, OS, executante, tipo… | — |
| `excluida` | sai das telas; o registro fica | — |
| `mov_prometida` | a operação deu o prazo | a data |
| `mov_chegou` | a movimentação foi concluída — fica aguardando aprovação | a data |
| `mov_aprovada` | o PCM conferiu e aprovou (só o PCM) | — |
| `mov_devolvida` | o PCM devolveu para a operação (só o PCM) | **motivo** |
| `justificada` | por que atrasou / não foi feita, e quem atrasou (OS: PCM; movimentação: os dois) | **o porquê** |
| `prev_disponivel` | a operação disse quando a frota fica livre | "agora" ou data |
| `prev_parada` | o PCM marcou o dia da parada | o dia |
| `prev_andamento` | a preventiva está sendo feita (Status Em andamento) | — |
| `prev_realizada` | a preventiva saiu | a data |
| `prev_adiada` | passa para o mês seguinte (Status Reprogramada) | **motivo** |
| `prev_cancelada` | não vai ser feita | **motivo** |
| `prev_reaberta` | desfaz realizada, mês seguinte ou cancelada | — |

### As três regras que o sistema impõe

1. **Reprogramar exige motivo.** Mudar semana, ano, dia ou duração de uma
   atividade que já estava programada, sem motivo, é recusado — em qualquer
   caminho, inclusive na programação em lote. É o número pelo qual PCM
   responde.
2. **`editar()` não mexe em programação.** Se mexesse, haveria um jeito de
   contornar a regra acima sem querer. Programação se muda por `reprogramar()`.
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

Porte do `planilha/texto.py`. Manutenção escreve serviços que só diferem pelo
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

## Os arquivos

| arquivo | o que faz |
|---|---|
| `index.html` | a casca: topo, navegação, `<main>`. Nenhuma lógica. |
| `css/mkt.css` | estilo único, celular primeiro, claro e escuro |
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
| `js/tela/*.js` | entrar, operacao, hoje, programacao, semana, resultados, movimentacoes, preventivas, frota, historico, importar, diagnostico |
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
| `planilha/` | **o processo antigo, que continua funcionando** até o site assumir |

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
