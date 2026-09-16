# Programação Makro — programação e realização de OS

Controle de PCM da manutenção, Makro Transportes (Mossoró/RN). Um site estático
que roda no navegador, guarda os dados no próprio navegador e funciona sem
internet. **Qualquer mudança fica registrada** — reprogramação em primeiro
lugar, com motivo obrigatório.

A equipe continua fechando OS direto no Protheus. Este site é o controle do
PCM: é aqui que se programa a semana, se acompanha a execução e se responde
por que uma semana não fechou.

---

## Como abrir

O site precisa ser **servido**, não aberto com duplo clique. É isso que dá ao
navegador uma origem própria para guardar os dados e para o modo offline
funcionar.

```bash
python3 -m http.server 8000      # na pasta do projeto
```

e abrir <http://localhost:8000>. Para usar do celular ou do tablet da oficina,
o caminho é publicar no **GitHub Pages** deste mesmo repositório (Settings →
Pages → branch, pasta `/`) — é HTTPS, que o modo offline exige.

Depois da primeira abertura o site fica disponível mesmo sem rede, e dá para
adicioná-lo à tela de início do celular como aplicativo.

Não há passo de build, não há `npm install`. Os arquivos em `js/` são módulos
ES servidos como estão. A única biblioteca é o SheetJS, embarcado em `vendor/`
(ler XLSX na mão não vale o risco de não conseguir ler o export do Protheus).

## Como começar a usar

1. Abra a aba **Importar** e solte o `.xlsx` da programação. Ele reconhece a
   aba `Programação` sozinho, pergunta o ano e mostra a prévia.
2. Confira a prévia e importe. O acervo inteiro entra, com as reprogramações
   que a planilha já registrava.
3. A partir daí: **Carteira** para montar a semana, **Semana** para acompanhar,
   **Hoje** para dar baixa.
4. **Salve uma cópia de segurança** (botão no topo). Leia a seção sobre isso.

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

### As três regras que o sistema impõe

1. **Reprogramar exige motivo.** Mudar semana, ano, dia ou duração de uma
   atividade que já estava programada, sem motivo, é recusado — em qualquer
   caminho, inclusive arrastando o cartão entre dias e na programação em lote.
   É o número pelo qual PCM responde.
2. **`editar()` não mexe em programação.** Se mexesse, haveria um jeito de
   contornar a regra acima sem querer. Programação se muda por `reprogramar()`.
3. **A semana original nunca muda.** É a da primeira programação, e é contra
   ela que se mede o quanto uma atividade foi empurrada.

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
| `js/tela/*.js` | hoje, semana, carteira, frota, indicadores, historico, importar |
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

## Três coisas que a planilha escondia

Achadas ao carregar os dados reais, e que mudam números que já foram usados:

1. **25 células da coluna OS não são OS** — dizem "ABRIR OS" ou "PENDENTE ABRIR
   OS". São recado, não ordem. A cobertura de OS da planilha as contava como
   ordem aberta: são **434 atividades com OS**, não 459. O recado não se perde,
   vira aviso na importação.
2. **Uma atividade cobre três ordens** (`007381,007382,007383`). Juntar os
   dígitos criaria a OS inventada `007381007382007383`; aqui as três ficam
   guardadas e o cruzamento com o Protheus responde por todas.
3. **6 das 140 "reprogramadas" não eram** — tinham semana original igual à
   semana. São **134**.
