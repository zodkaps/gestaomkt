# Programação Makro — carteira, OS, movimentação e preventiva

Controle de PCM da manutenção, Makro Transportes (Mossoró/RN). Site estático
que roda no navegador, guarda a fita de eventos no Supabase e funciona sem
internet. **Qualquer mudança fica registrada**, com quem fez e por quê.

São quatro pessoas, com dois papéis:

| quem | papel | o que faz |
|---|---|---|
| Mateus, Lucas | **PCM** | programa a oficina, dá baixa, marca parada, importa o Protheus |
| Pedro, João Victor | **Operação** | aponta movimentação de frota e diz quando o caminhão fica livre |

A equipe da oficina continua fechando OS direto no Protheus. Este site é o
controle do PCM e o canal de resposta da operação.

---

## Entrar, e o que isso protege (e o que não protege)

Entrar é escolher o nome numa lista de quatro. Sem senha, sem e-mail: no pátio,
no celular, com a mão suja, qualquer atrito a mais é um apontamento que não
acontece.

**O limite entre PCM e operação é combinado, não trancado.** O site esconde do
Pedro o que não é dele, mas quem abrir o endereço e trocar o nome consegue
lançar como PCM. Para quatro pessoas da mesma equipe, é troca aceitável.

**O que é trancado de verdade**, no banco: a tabela de eventos é **só-insere**.
Nem o site, nem um erro meu, nem alguém com a chave apaga ou reescreve um
lançamento. É política do Postgres (`sql/01_esquema.sql`), não disciplina.

Se um dia precisar de parede de verdade (auditoria, gente de fora), trocar para
e-mail com link mexe só na tela de entrar e nas políticas do banco.

## Ligar o lugar comum (Supabase)

Sem isso o site funciona, mas só no seu navegador — e aí o Pedro não vê o que
você lança, nem você o que ele aponta.

1. No seu projeto Supabase: **SQL Editor → New query**, cole
   `sql/01_esquema.sql` e rode.
2. Em **Settings → API**, copie a *Project URL* e a chave **anon public**.
3. No site: aba **Importar → O lugar comum dos quatro**, cole as duas e clique
   em Ligar.

A chave anon é pública por desenho — pode ficar no site. Quem protege é a
política do banco, não o segredo dela.

**Como as telas se atualizam:** por consulta a cada dez segundos, não por
WebSocket. O realtime do Supabase fala um protocolo de canais com batimento e
reconexão — duzentas linhas que quebram justamente onde este site vive: celular
que dorme, sinal que cai, aba em segundo plano. Perguntar "o que há de novo
depois do número X" resolve o mesmo em cinco linhas e volta sozinho de qualquer
queda. Para quatro pessoas, dez segundos ninguém percebe.

**Sem sinal:** o que é lançado fica numa fila local e sobe quando a rede volta.
Reenviar o mesmo evento não duplica — cada um nasce com um `id` gerado no
aparelho, e o banco ignora o repetido.

---

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
| `mov_prometida` | a operação prometeu data | a data |
| `mov_chegou` | a frota voltou | a data |
| `prev_disponivel` | a operação disse quando a frota fica livre | "agora" ou data |
| `prev_parada` | o PCM marcou o dia da parada | o dia |
| `prev_realizada` | a preventiva saiu | a data |

### As três regras que o sistema impõe

1. **Reprogramar exige motivo.** Mudar semana, ano, dia ou duração de uma
   atividade que já estava programada, sem motivo, é recusado — em qualquer
   caminho, inclusive arrastando o cartão entre dias e na programação em lote.
   É o número pelo qual PCM responde.
2. **`editar()` não mexe em programação.** Se mexesse, haveria um jeito de
   contornar a regra acima sem querer. Programação se muda por `reprogramar()`.
3. **A semana original nunca muda.** É a da primeira programação, e é contra
   ela que se mede o quanto uma atividade foi empurrada.

### HH mede carga, não prazo

`HH` é hora-homem: horas × pessoas. Ele diz **quanto custa de mão de obra**, e
a duração em dias continua dizendo **quando fecha**. Os dois convivem porque os
dados mostram que não há relação entre eles: nos 754 registros, atividades com o
mesmo HH ocupam de um a cinco dias, e **548 estão com HH zerado**. Zero aqui
quer dizer "ninguém estimou ainda", e os painéis dizem quantas são — somar isso
como zero hora faria a semana parecer mais leve do que é.

A oficina **terceirizada** fica fora da carga da equipe: 66 das 754 atividades
estão lá, e elas não disputam o mecânico.

### Aderência e vazão são perguntas diferentes

- **Aderência**: *do que planejei para esta semana, quanto saiu?* Pune o que
  ficou para trás, ignora o extra.
- **Fechados na semana**: *quanto trabalho saiu nestes sete dias?* Conta o
  extra e o atrasado que fechou fora da semana dele.

Uma semana pode ter 0% de aderência e muito serviço entregue. Os dois aparecem
lado a lado em Números, porque mostrar só um deixa metade da conversa de fora.

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

Por isso, na importação, as **3 atividades marcadas como concluídas sem data**
entram **abertas** e saem numa lista para serem datadas. O sistema não inventa
o dia em que o serviço saiu.

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
| `js/dados.js` | IndexedDB → localStorage → memória, nessa ordem de queda |
| `js/texto.js` | identidade de atividade (esqueleto + posição) |
| `js/planilha.js` | XLSX e CSV viram linhas; datas em qualquer formato viram ISO |
| `js/importar.js` | leitura da planilha, mapeamento do Protheus, reconciliação |
| `js/backup.js` | exportar, restaurar, CSV, aviso de última cópia |
| `js/ui.js` | criar elemento, caixa de diálogo, aviso, barra, medidor |
| `js/tela/comum.js` | o cartão e a ficha — um lugar só onde atividade é desenhada e alterada |
| `js/nuvem.js` | o Supabase por `fetch`: ler desde um ponto, enviar, consultar de tempos em tempos |
| `js/pessoas.js` | quem está usando, o papel, o que esse papel pode |
| `js/tela/*.js` | entrar, operacao, hoje, semana, carteira, movimentacoes, preventivas, frota, indicadores, historico, importar |
| `sql/01_esquema.sql` | a tabela de eventos e a política de só-insere |
| `sw.js` | offline: rede primeiro, cache como reserva |
| `testes/rodar.js` | os testes do núcleo |
| `planilha/` | **o processo antigo, que continua funcionando** até o site assumir |

## Os testes

```bash
node testes/rodar.js                       # usa a planilha padrão
node testes/rodar.js caminho/da/sua.xlsx
```

Rodam em node contra a **planilha de verdade**: teste que só passa com dado
inventado não prova que a carga funciona. Conferem a identidade de atividade,
semana ISO e prazo, as regras do log, a carga inteira, o backup ida e volta e o
cruzamento com um export do Protheus.

---

## O que a planilha escondia

Achado ao carregar os dados reais, e que muda números já usados:

1. **A situação das movimentações é digitada à mão** e pode discordar das datas
   na mesma linha — são **16 divergências** hoje. No site ela é calculada: a
   data é o fato, a palavra era opinião. A importação lista as diferenças em vez
   de escolher calado.
2. **Duas frotas voltaram sem ninguém ter prometido data.** Elas não entram no
   percentual de pontualidade (não há prazo para julgar), mas contam como
   entregues — senão o total não fecha com 51.
3. **"Agora" e uma data moram na mesma coluna** de disponibilidade, o que impede
   ordenar. Viraram duas coisas: uma marca e uma data.
4. **A coluna `Status` das preventivas virou campo livre** ("feita na DAF · OS
   022187 · 07–08/10: buscar…"). Virou observação; situação o site calcula.
5. **19 atividades marcadas como concluídas sem data.** Entram abertas e saem
   numa lista para datar — o sistema não inventa o dia em que o serviço saiu.

## Uma divergência que só você resolve

Na **semana 41**, a aba Semana da sua planilha mostra 35 programadas, 13
concluídas e **37% de aderência**. Lendo as mesmas linhas eu encontro **37
programadas, nenhuma com data de conclusão** — e 7 extras fechados nos sete
dias. Confira o que a aba Semana está medindo: pode ser valor calculado num
outro momento (o arquivo veio sem recalcular), ou uma definição diferente de
"concluída". Preferi mostrar os dois números a escolher um e te dar um
indicador errado com cara de certo.
