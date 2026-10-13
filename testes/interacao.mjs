// Os incômodos de uso que não aparecem em teste de unidade.
//
//     node testes/interacao.mjs
//
// O que se prova aqui é o comportamento do mouse, que é onde moram os
// pequenos defeitos que fazem a pessoa desistir de usar: selecionar o número
// de uma OS fechando a caixa, ou abrindo uma ficha que ninguém pediu.
//
// Precisa do servidor de mentira (`testes/supabase_falso.mjs`) e do site
// servido (`python3 -m http.server 8123`).
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { readFile } from "node:fs/promises";
import { servirCopia, entrarComo, entrarLocalComo, emailDoTeste } from "./sitefalso.mjs";
const { chromium } = pw;

const NUVEM = process.env.NUVEM_FALSA || "http://127.0.0.1:8124";
const site = servirCopia({ nuvem: NUVEM, porta: 8126, pasta: "/tmp/mkt-copia-interacao" });

let falhou = 0;
const ok = (nome, cond, detalhe = "") => {
  console.log(`  ${cond ? "ok  " : "FALHA"} ${nome}${detalhe && !cond ? " — " + detalhe : ""}`);
  if (!cond) falhou++;
};

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await nav.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
// Erro dentro da página aparece aqui: um teste que falha sem dizer por quê
// custa uma tarde.
p.on("pageerror", e => console.log("  [erro na página]", e.message));
p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) console.log("  [console]", m.text()); });

await p.goto(site.endereco, { waitUntil: "networkidle" });
await p.waitForTimeout(400);
await entrarComo(p, "Mateus");

// uma atividade para ter o que clicar e selecionar
// Cria a sua própria atividade, sempre. O servidor de mentira guarda os
// eventos entre uma execução e outra, e o último teste daqui conclui a
// atividade que usou — sem criar uma nova, a carteira estaria vazia na
// execução seguinte e o teste quebraria sem nada estar errado no site.
const ALVO = "F-TESTE-" + Date.now().toString(36);
await p.evaluate(async frota => {
  await mkt.ev.aplicar(mkt.ev.criar({
    frota, atividade: "Trocar lona de freio dianteira LD", os: "021188",
    tipo: "Corretiva",
  }));
  location.hash = "#/carteira";
}, ALVO);
await p.waitForTimeout(900);

// ── selecionar texto num cartão não abre a ficha ───────────────────────────
// Arrasta de dentro do texto até fora dele, que é como se copia um número.
await p.fill(".filtros .busca", ALVO);
await p.waitForTimeout(500);
// O endereço antigo da Carteira continua valendo: cai na Programação, no
// recorte "Carteira".
ok("o endereço antigo da Carteira abre a Programação no recorte da carteira",
  await p.evaluate(() => !!document.querySelector(".segmentos .seg-op.on[data-p=carteira]")));
const alvo = await p.$(".so-tabela .grade tr.lin td.c-ativ .t");

// Mede onde o TEXTO está, não onde a célula está: arrastar sobre o espaço
// vazio de uma célula larga não seleciona nada, e aí o teste mediria um
// clique comum em vez do arrasto que se quer provar.
const letras = await alvo.evaluate(n => {
  const t = [...n.childNodes].find(x => x.nodeType === 3 && x.textContent.trim());
  const r = document.createRange();
  r.selectNodeContents(t || n);
  const b = r.getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
});
await p.mouse.move(letras.x + 2, letras.y + letras.h / 2);
await p.mouse.down();
await p.mouse.move(letras.x + Math.max(40, letras.w - 4), letras.y + letras.h / 2, { steps: 14 });
await p.mouse.up();
await p.waitForTimeout(500);
const selecionou = await p.evaluate(() => String(window.getSelection() || "").trim().length > 0);
ok("o arrasto realmente selecionou texto", selecionou);
ok("selecionar texto na lista NÃO abre a ficha",
  (await p.$$(".caixa")).length === 0);

// ── um clique de verdade continua abrindo ──────────────────────────────────
await p.evaluate(() => window.getSelection().removeAllRanges());
await alvo.click();
await p.waitForTimeout(600);
ok("mas um clique limpo abre", (await p.$$(".caixa")).length === 1);

// ── selecionar dentro da caixa e soltar fora NÃO fecha ─────────────────────
const d = await p.evaluate(() => {
  const n = document.querySelector(".caixa .corpo p, .caixa .corpo td, .caixa .corpo");
  const t = [...n.childNodes].find(x => x.nodeType === 3 && x.textContent.trim()) || n;
  const r = document.createRange();
  r.selectNodeContents(t);
  const b = r.getBoundingClientRect();
  return { x: b.x, y: b.y, h: b.height };
});
await p.mouse.move(d.x + 2, d.y + d.h / 2);
await p.mouse.down();
await p.mouse.move(60, d.y + d.h / 2, { steps: 18 });   // sai da caixa, cai no fundo
await p.mouse.up();
await p.waitForTimeout(500);
ok("selecionar texto dentro da caixa e soltar fora NÃO fecha",
  (await p.$$(".caixa")).length === 1);

// ── mas clicar no fundo de propósito fecha ─────────────────────────────────
await p.evaluate(() => window.getSelection().removeAllRanges());
await p.mouse.click(40, 400);
await p.waitForTimeout(500);
ok("clicar no fundo, sem arrastar, fecha", (await p.$$(".caixa")).length === 0);

// ── Enter num campo faz o que o botão azul faz ─────────────────────────────
// Com atividade própria: reaproveitar a de cima amarra uma verificação na
// outra, e aí um teste que falha não diz qual dos dois comportamentos quebrou.
const ALVO2 = "F-ENTER-" + Date.now().toString(36);
await p.evaluate(async frota => {
  await mkt.ev.aplicar(mkt.ev.criar({ frota, atividade: "Teste do Enter", tipo: "Corretiva" }));
  window.__alvo = mkt.ev.lista().find(x => x.frota === frota).id;
}, ALVO2);
await p.evaluate(async () => {
  const { concluir } = await import("/js/tela/comum.js");
  concluir(mkt.ev.porId(window.__alvo), mkt.ctx);
});
await p.waitForSelector(".caixa input[type=date]", { timeout: 5000 });
await p.fill(".caixa input[type=date]", "2026-10-09");
await p.press(".caixa input[type=date]", "Enter");
// Espera o resultado, não um tempo fixo: logo depois de entrar, com a fita
// inteira descendo do banco, gravar pode levar mais que um segundo.
await p.waitForFunction(() => mkt.ev.porId(window.__alvo).concluida_em, null, { timeout: 5000 })
  .catch(() => {});
const fechou = await p.evaluate(() => ({
  caixas: document.querySelectorAll(".caixa").length,
  em: mkt.ev.porId(window.__alvo).concluida_em,
}));
if (fechou.em !== "2026-10-09") {
  console.log("  [depuração]", JSON.stringify(await p.evaluate(async () => {
    const id = window.__alvo;
    return {
      memoria: mkt.ev.log.filter(e => e.alvo === id).map(e => `${e.tipo}@${e.ts}`),
      disco: (await mkt.dados.lerEventos()).filter(e => e.alvo === id).map(e => `${e.tipo}@${e.ts}:${e.enviado}`),
      refeito: (mkt.ev.reconstruir(mkt.ev.log).atividade.get(id) || {}).concluida_em,
      total: mkt.ev.log.length, pessoa: mkt.pessoas.nome(), papel: mkt.pessoas.papel(),
    };
  })));
}
ok("Enter num campo confirma, sem precisar mirar o botão",
  fechou.caixas === 0 && fechou.em === "2026-10-09", JSON.stringify(fechou));

// ── mudar a situação NÃO recarrega a tela ──────────────────────────────────
// O defeito que ele relatou: "toda vez que eu altero um status o site
// basicamente carrega novamente". Cada ação chamava uma remontagem da tela
// inteira — filtro, busca e rolagem voltavam ao zero. O que se prova: depois
// de dar baixa na própria linha, a tela é a MESMA (o mesmo elemento, não um
// novo), a busca continua digitada, a rolagem não pulou, e só a linha mudou.
const ALVO3 = "F-BAIXA-" + Date.now().toString(36);
await p.evaluate(async frota => {
  for (let i = 0; i < 25; i++) {
    await mkt.ev.aplicar(mkt.ev.criar({ frota, atividade: `Serviço ${String(i).padStart(2, "0")} da baixa`,
      tipo: "Corretiva" }), { silencioso: true });
  }
  mkt.ev.forcarAviso();
  // "Tudo": no recorte da carteira a linha feita SAI da lista (feita não é
  // carteira), e aqui se quer ver a mesma linha mudar de cor.
  location.hash = "#/programacao?m=tudo";
}, ALVO3);
await p.waitForTimeout(900);
await p.fill(".filtros .busca", ALVO3);
await p.waitForTimeout(600);
await p.evaluate(() => {
  document.querySelector("#tela .cabec").__marca = "a mesma tela";
  window.scrollTo(0, 260);
});
await p.waitForTimeout(200);
const antesDaBaixa = await p.evaluate(() => ({ y: Math.round(window.scrollY) }));
const linha = await p.$(".so-tabela .grade tr.lin:nth-of-type(8)");
const idLinha = await linha.getAttribute("data-id");
await linha.$eval("button.baixa", b => b.click());
await p.waitForSelector(".caixa input[type=date]", { timeout: 5000 });
await p.fill(".caixa input[type=date]", "2026-10-09");
await p.press(".caixa input[type=date]", "Enter");
await p.waitForTimeout(1500);
const aposBaixa = await p.evaluate(id => ({
  mesma: (document.querySelector("#tela .cabec") || {}).__marca === "a mesma tela",
  busca: document.querySelector(".filtros .busca").value,
  y: Math.round(window.scrollY),
  feita: !!document.querySelector(`.so-tabela tr.lin.feita[data-id="${id}"]`),
  texto: (document.querySelector(`.so-tabela tr.lin[data-id="${id}"] .c-feito`) || {}).textContent || "",
}), idLinha);
ok("dar baixa não remonta a tela — é o mesmo elemento de antes", aposBaixa.mesma,
  JSON.stringify(aposBaixa));
ok("a busca digitada continua lá", aposBaixa.busca === ALVO3, aposBaixa.busca);
ok("a rolagem não volta para o topo", Math.abs(aposBaixa.y - antesDaBaixa.y) <= 4,
  `antes ${antesDaBaixa.y}, depois ${aposBaixa.y}`);
ok("e a linha muda na hora, verde, com a data", aposBaixa.feita && /09\/10/.test(aposBaixa.texto),
  JSON.stringify(aposBaixa));

// ── digitar a OS direto na linha ───────────────────────────────────────────
// O pedido: "selecionar as atividades que estão sem OS e simplesmente digitar
// o número". Com o filtro "sem OS", a coluna OS vira campos: digita, Enter, e
// o foco desce para a próxima — preenche-se a coluna sem tirar a mão do
// teclado.
const ALVO_OS = "F-OS-" + Date.now().toString(36);
// OS que não existe em nenhuma outra frota: com uma repetida, o site pergunta
// antes de gravar (e é para perguntar) — aqui se quer provar o caminho direto.
const OS1 = String(100000 + Date.now() % 800000);
const OS2 = String(Number(OS1) + 1), OS3 = String(Number(OS1) + 2);
const idsOS = await p.evaluate(async frota => {
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const [e] = await mkt.ev.aplicar(mkt.ev.criar({ frota, atividade: `Serviço ${i} sem OS`,
      tipo: "Corretiva" }), { silencioso: true });
    ids.push(e.alvo);
  }
  mkt.ev.forcarAviso();
  location.hash = "#/programacao?m=tudo&os=sem";
  return ids;
}, ALVO_OS);
await p.waitForTimeout(900);
await p.fill(".filtros .busca", ALVO_OS);
await p.waitForTimeout(600);
ok("o filtro 'sem OS' está ligado e mostra as três",
  await p.evaluate(() => document.querySelectorAll(".so-tabela input.os-in").length) === 3);
const primeiro = await p.$(`.so-tabela input.os-in[data-id="${idsOS[0]}"]`);
await primeiro.click();
await p.keyboard.type(OS1);
await p.keyboard.press("Enter");
await p.waitForFunction(id => mkt.ev.porId(id).os, idsOS[0], { timeout: 5000 }).catch(() => {});
await p.waitForTimeout(600);
const aposOS = await p.evaluate(ids => ({
  os: mkt.ev.porId(ids[0]).os,
  foco: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.id : "",
  campos: document.querySelectorAll(".so-tabela input.os-in").length,
}), idsOS);
ok("Enter grava a OS digitada", aposOS.os === OS1, JSON.stringify(aposOS));
ok("e o foco desce para a próxima sem OS", aposOS.foco === idsOS[1], JSON.stringify(aposOS));
ok("e a que ganhou OS sai da fila do filtro", aposOS.campos === 2, JSON.stringify(aposOS));
await p.keyboard.type(`${OS2}, ${OS3}`);
await p.keyboard.press("Tab");
await p.waitForFunction(id => mkt.ev.porId(id).os, idsOS[1], { timeout: 5000 }).catch(() => {});
const segunda = await p.evaluate(id => ({ os: mkt.ev.porId(id).os, outras: mkt.ev.porId(id).os_outras }), idsOS[1]);
ok("Tab também grava — e duas OS na mesma célula viram OS + outra",
  segunda.os === OS2 && segunda.outras.join() === OS3, JSON.stringify(segunda));

// E a OS de seis dígitos curta ganha os zeros: "7381" é a 007381.
const curta = await p.evaluate(async () => {
  const { normalizarOSLista } = await import("/js/importar.js");
  return normalizarOSLista("7381, 7382").join();
});
ok("OS digitada curta ganha os zeros", curta === "007381,007382", curta);
await p.evaluate(() => { location.hash = "#/programacao?m=tudo"; });
await p.waitForTimeout(300);
await p.evaluate(() => { const b = document.querySelector(".filtro-os.on"); if (b) b.click(); });

// Uma movimentação para o Pedro concluir no fim do teste.
const MOV_APROVAR = "F-MOV-" + Date.now().toString(36);
const idMovAprovar = await p.evaluate(async frota => {
  const [e] = await mkt.ev.aplicar(mkt.ev.pedirMovimentacao({ frota, destino: "Borracharia",
    prometida_para: "2026-10-05" }));
  await mkt.ev.sincronizar();
  return e.alvo;
}, MOV_APROVAR);

// ── a nuvem cai e o site continua ─────────────────────────────────────────
// O defeito que isto cobre era de desenho: com o endereço do projeto no
// código, a única entrada era a senha do Supabase. Provedor de e-mail
// desligado — que foi o que aconteceu de verdade — e ninguém entrava num site
// que funciona inteiro com os dados locais.
const falhar = async modo => {
  await fetch(`${NUVEM}/__falha`, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ modo }) });
};

await p.evaluate(async () => { await mkt.pessoas.sair(); location.hash = "#/entrar"; });
await falhar("provedor_off");
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector('button:has-text("Trabalhar neste aparelho")', { timeout: 8000 });
// O olhinho: mostra a senha digitada, e esconde de novo.
await p.fill('input[autocomplete="current-password"]', "segredo1");
await p.click(".senha-olho .olho");
const olho1 = await p.evaluate(() => document.querySelector('input[autocomplete="current-password"]').type);
await p.click(".senha-olho .olho");
const olho2 = await p.evaluate(() => document.querySelector('input[autocomplete="current-password"]').type);
ok("o olhinho mostra a senha e esconde de novo", olho1 === "text" && olho2 === "password",
  `${olho1} → ${olho2}`);
await p.fill('input[autocomplete="current-password"]', "");
const motivo = await p.evaluate(() =>
  (document.querySelector(".alternativa .obs") || {}).textContent || "");
ok("a porta descobre sozinha que a senha não vai funcionar",
  /desligado/i.test(motivo), motivo);

// A porta tinha de aparecer UMA vez. Carregar o módulo da tela tem um `await`
// no meio, e a pintura de começar cruzava com a do `hashchange` que ela mesma
// provocava: as duas desenhavam, e o cartão de entrar saía duplicado.
ok("a porta aparece uma vez só",
  (await p.$$("#entrar-tela")).length === 1,
  String((await p.$$("#entrar-tela")).length));

await entrarLocalComo(p, "Pedro");
const local = await p.evaluate(() => ({
  nome: mkt.pessoas.nome(), local: mkt.pessoas.local(),
  papel: mkt.pessoas.papel(),
  faixa: (document.querySelector("#faixa") || {}).textContent || "",
}));
ok("com a nuvem caída, dá para entrar e trabalhar",
  local.nome === "Pedro" && local.local && local.papel === "operacao",
  JSON.stringify(local));
ok("e a faixa diz, sem rodeio, que nada sobe sem senha",
  /só neste aparelho/i.test(local.faixa), local.faixa.slice(0, 120));

const FROTA = "F-SEMNUVEM-" + Date.now().toString(36);
const movLocal = await p.evaluate(async frota => {
  const [e] = await mkt.ev.aplicar(mkt.ev.pedirMovimentacao({
    frota, motivo_mov: "nuvem caída" }));
  return { alvo: e.alvo, autor: e.autor };
}, FROTA);
const fila1 = await p.evaluate(() => mkt.ev.autoresNaFila());
ok("o que a operação lança fica na fila, assinado por ela",
  movLocal.autor === "Pedro" && fila1.some(a => a.autor === "Pedro"),
  JSON.stringify({ movLocal, fila1 }));

// ── a fila de um não tranca a do outro ────────────────────────────────────
// O envio é um lote só, e a política do banco recusa lançamento assinado por
// outra pessoa: sem separar por autor, o evento do Pedro no meio faria o lote
// inteiro do Mateus voltar — e a fila travava para os dois.
await falhar("");
await p.click('#faixa button:has-text("Entrar com senha")');
await p.waitForSelector('input[placeholder="Seu e-mail"]', { timeout: 8000 });
const porta = await p.evaluate(() => ({
  email: document.querySelector('input[placeholder="Seu e-mail"]').value,
  aviso: (document.querySelector("#entrar-tela .morno") || {}).textContent || "",
}));
// Este aparelho já viu a equipe (o Mateus entrou nele no começo do teste), então
// sabe o e-mail do Pedro — e é a senha DELE que faz a fila andar.
ok("a porta já vem com o e-mail de quem tem lançamento parado",
  porta.email === emailDoTeste("Pedro") && /Pedro/.test(porta.aviso), JSON.stringify(porta));

await entrarComo(p, "Mateus");
const ATIV = "F-PCM-" + Date.now().toString(36);
const doPcm = await p.evaluate(async frota => {
  const [e] = await mkt.ev.aplicar(mkt.ev.criar({
    frota, atividade: "Revisar freio depois da nuvem voltar", tipo: "Corretiva" }));
  return e.alvo;
}, ATIV);
await p.evaluate(() => mkt.ev.sincronizar());
await p.waitForTimeout(1500);
const depois = await p.evaluate(async alvos => {
  const noServidor = (await mkt.nuvem.baixarDesde(0)).map(e => e.alvo);
  return {
    fila: await mkt.ev.autoresNaFila(),
    // O evento do Pedro tem de continuar EXISTINDO aqui, não enviado. A chave
    // velha da fita o apagava: baixar da nuvem o evento de número igual
    // substituía o dele, e o apontamento sumia sem subir.
    oDoPedro: (await mkt.dados.lerEventos())
      .filter(e => e.alvo === alvos.mov).map(e => `${e.autor}:enviado=${e.enviado}`),
    pcmSubiu: noServidor.includes(alvos.pcm),
    operacaoSubiu: noServidor.includes(alvos.mov),
    faixa: (document.querySelector("#faixa") || {}).textContent || "",
  };
}, { pcm: doPcm, mov: movLocal.alvo });
ok("o lançamento do Mateus sobe mesmo com o do Pedro parado na frente",
  depois.pcmSubiu && !depois.operacaoSubiu, JSON.stringify(depois).slice(0, 240));
ok("e o do Pedro continua guardado aqui, inteiro, esperando a senha dele",
  depois.oDoPedro.length === 1 && depois.oDoPedro[0] === "Pedro:enviado=false",
  JSON.stringify(depois.oDoPedro));
ok("e a faixa diz de quem é o que está esperando",
  /Pedro/.test(depois.faixa), depois.faixa.slice(0, 160));
ok("e diz uma vez só, sem texto duplicado",
  depois.faixa.split("de Pedro").length === 2, depois.faixa.slice(0, 200));

// ── e sobe quando a pessoa certa entra ────────────────────────────────────
await p.evaluate(async () => { await mkt.pessoas.sair(); });
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector('input[placeholder="Seu e-mail"]', { timeout: 8000 });
await entrarComo(p, "Pedro");
await p.waitForTimeout(1800);
const fim = await p.evaluate(async alvo => {
  await mkt.ev.sincronizar();
  const noServidor = (await mkt.nuvem.baixarDesde(0)).map(e => e.alvo);
  return {
    fila: await mkt.ev.autoresNaFila(),
    subiu: noServidor.includes(alvo),
    local: mkt.pessoas.local(),
  };
}, movLocal.alvo);
ok("entrando com a senha dele, o que ficou guardado sobe e a fila esvazia",
  fim.subiu && fim.fila.length === 0 && !fim.local, JSON.stringify(fim));

// ── o Pedro conclui, o Mateus aprova ──────────────────────────────────────
// Quem faz a movimentação marca como concluída; o PCM só confere e aprova.
await p.evaluate(() => { location.hash = "#/movimentacoes"; });
await p.waitForTimeout(900);
await p.fill(".filtros .busca", MOV_APROVAR);
await p.waitForTimeout(500);
await p.click(`.so-tabela tr.lin[data-id="${idMovAprovar}"] button.concluir`);
await p.waitForSelector(".caixa input[type=date]", { timeout: 5000 });
await p.fill(".caixa input[type=date]", "2026-10-07");
// Passou do prazo (05/10): o diálogo pede o porquê ali mesmo, e escolher o
// motivo já sugere quem atrasou.
const pedePorque = await p.evaluate(() => !document.querySelector(".caixa .bloco-atraso").hidden);
// Tudo digitado: o porquê e quem atrasou são texto livre, sem lista pronta.
await p.fill(".caixa .bloco-atraso textarea", "A frota estava em viagem para Natal");
await p.fill(".caixa .bloco-atraso input", "Operação");
await p.click('.caixa footer button.primario');
await p.waitForFunction(id => mkt.ev.porId(id, "movimentacao").chegou_em, idMovAprovar, { timeout: 5000 })
  .catch(() => {});
const doPedro = await p.evaluate(id => {
  const m = mkt.ev.porId(id, "movimentacao");
  return { sit: mkt.M.situacaoMovimentacao(m), por: m.motivo_atraso, quem: m.quem_atrasou,
    aprovarVisivel: !!document.querySelector("button.aprovar") };
}, idMovAprovar);
ok("concluindo depois do prazo, o diálogo pede o porquê — e grava com quem atrasou",
  pedePorque && doPedro.por === "A frota estava em viagem para Natal" && doPedro.quem === "Operação",
  JSON.stringify({ pedePorque, ...doPedro }));
ok("o Pedro conclui e ela fica aguardando aprovação",
  doPedro.sit === "Aguardando aprovação", JSON.stringify(doPedro));
ok("e o Pedro não vê botão de aprovar", !doPedro.aprovarVisivel);
await p.evaluate(() => mkt.ev.sincronizar());
await p.waitForTimeout(800);

await p.evaluate(async () => { await mkt.pessoas.sair(); });
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector('input[placeholder="Seu e-mail"]', { timeout: 8000 });
await entrarComo(p, "Mateus");
await p.waitForTimeout(1500);
await p.evaluate(() => { location.hash = "#/movimentacoes"; });
await p.waitForTimeout(1200);
const fila = await p.evaluate(id => ({
  recorte: (document.querySelector(".segmentos .seg-op.on") || {}).textContent || "",
  linha: !!document.querySelector(`.so-tabela tr.lin[data-id="${id}"] button.aprovar`),
}), idMovAprovar);
ok("o Mateus abre direto na fila de aprovação, com a do Pedro lá",
  /Aguardando aprovação/.test(fila.recorte) && fila.linha, JSON.stringify(fila));
await p.click(`.so-tabela tr.lin[data-id="${idMovAprovar}"] button.aprovar`);
await p.waitForTimeout(1200);
const aprovada = await p.evaluate(id => {
  const m = mkt.ev.porId(id, "movimentacao");
  return { sit: mkt.M.situacaoMovimentacao(m), por: m.aprovada_por, quem: m.concluida_por };
}, idMovAprovar);
ok("um clique aprova: Concluída com atraso, concluída pelo Pedro, aprovada pelo Mateus",
  aprovada.sit === "Concluída com atraso" && aprovada.quem === "Pedro" && aprovada.por === "Mateus",
  JSON.stringify(aprovada));

// ── o que um lança, os outros veem — mesmo fora de ordem ───────────────────
// O pedido de movimentação que o Mateus abriu chegou ao banco mas não apareceu
// para os outros. Uma das causas: dois lançamentos gravados quase juntos podem
// ficar visíveis fora de ordem, e quem lia no meio pulava um deles para
// sempre. Aqui o servidor segura um lançamento enquanto o seguinte já aparece.
{
  const lucas = await (await nav.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await lucas.goto(site.endereco, { waitUntil: "networkidle" });
  await entrarComo(lucas, "Lucas");
  const segura = (rota, corpo = {}) => fetch(`${NUVEM}/${rota}`, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
  await segura("__segurar", { quantos: 1 });
  const FR1 = "F-FORA-" + Date.now().toString(36), FR2 = FR1 + "-B";
  await lucas.evaluate(async ([f1, f2]) => {
    await mkt.ev.aplicar(mkt.ev.pedirMovimentacao({ frota: f1, destino: "Cardan" }));
    await mkt.ev.sincronizar();
    await mkt.ev.aplicar(mkt.ev.pedirMovimentacao({ frota: f2, destino: "Borracharia" }));
    await mkt.ev.sincronizar();
  }, [FR1, FR2]);
  await p.waitForTimeout(11000);                       // uma volta da escuta: pega só o 2º
  const meio = await p.evaluate(([f1, f2]) => ({
    primeira: !!mkt.ev.lista("movimentacao").find(m => m.frota === f1),
    segunda: !!mkt.ev.lista("movimentacao").find(m => m.frota === f2),
  }), [FR1, FR2]);
  await segura("__soltar");
  await p.evaluate(() => mkt.nuvem.consultarAgora());  // o mesmo que a conferência de 1 em 1 minuto
  await p.waitForTimeout(800);
  const fim = await p.evaluate(f1 => !!mkt.ev.lista("movimentacao").find(m => m.frota === f1), FR1);
  ok("o lançamento que ficou visível fora de ordem não se perde: a conferência o busca",
    meio.segunda && !meio.primeira && fim, JSON.stringify({ meio, fim }));
  await lucas.close();
}

// ── o "⋯" abre as ações do item, e só as que a pessoa pode ─────────────────
{
  await p.evaluate(() => { location.hash = "#/programacao?m=tudo"; });
  await p.waitForTimeout(900);
  const temBotao = await p.evaluate(() => document.querySelectorAll(".so-tabela .mais").length > 0);
  ok("a Programação tem o ⋯ em cada linha", temBotao);
  await p.click(".so-tabela .mais >> nth=0");
  await p.waitForSelector(".caixa .menu-acoes", { timeout: 5000 });
  const opcoes = await p.evaluate(() => [...document.querySelectorAll(".caixa .opcao-acao b")].map(b => b.textContent));
  ok("o menu do PCM tem excluir e cancelar",
    opcoes.includes("Excluir") && opcoes.includes("Cancelar"), JSON.stringify(opcoes));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
}

// ── solicitação de movimentação: criar, editar, virar imagem ───────────────
// O formulário diz o que fazer e onde, com prioridade; depois de criada, o ⋯
// edita; e a lista da tela vira uma imagem para cobrar no grupo.
{
  const FR = "F-SOL-" + Date.now().toString(36);
  await p.evaluate(() => { location.hash = "#/movimentacoes?v=todas"; });
  await p.waitForTimeout(900);
  await p.click('.cabec button:has-text("+ Nova")');
  await p.waitForSelector(".caixa .form-mov", { timeout: 5000 });
  await p.fill('.caixa .form-mov input[placeholder="ex.: F-745"]', FR);
  await p.fill('.caixa .form-mov input[placeholder^="ex.: Coletar"]', "Coletar");
  await p.fill('.caixa .form-mov input[placeholder^="ex.: Cardan"]', "Cardan Service");
  await p.click('.caixa .prio-escolha button[data-prio="Alta"]');
  const previa = await p.textContent(".caixa .previa-mov");
  ok("o formulário mostra como a solicitação vai aparecer",
    previa.includes(FR) && previa.includes("Coletar · Cardan Service"), previa);
  await p.click('.caixa button:has-text("Registrar")');
  await p.waitForFunction(f => mkt.ev.lista("movimentacao").some(m => m.frota === f), FR, { timeout: 5000 });
  const criada = await p.evaluate(f => { const m = mkt.ev.lista("movimentacao").find(x => x.frota === f);
    return { acao: m.acao, destino: m.destino, prioridade: m.prioridade }; }, FR);
  ok("criada com o que fazer, onde e prioridade",
    criada.acao === "Coletar" && criada.destino === "Cardan Service" && criada.prioridade === "Alta",
    JSON.stringify(criada));
  await p.waitForTimeout(500);
  const linhaSol = p.locator(`.so-tabela tr.lin:has-text("${FR}")`);
  ok("a linha mostra o título e a prioridade",
    (await linhaSol.textContent()).includes("Coletar · Cardan Service") &&
    (await linhaSol.textContent()).includes("Alta"));

  await linhaSol.locator(".mais").click();
  await p.waitForSelector(".caixa .menu-acoes", { timeout: 5000 });
  await p.click('.caixa .opcao-acao:has-text("Editar")');
  await p.waitForSelector(".caixa .form-mov", { timeout: 5000 });
  await p.fill('.caixa .form-mov input[placeholder^="ex.: Cardan"]', "Borracharia");
  await p.click('.caixa button:has-text("Salvar alterações")');
  await p.waitForFunction(f => mkt.ev.lista("movimentacao").find(m => m.frota === f).destino === "Borracharia",
    FR, { timeout: 5000 });
  await p.waitForTimeout(400);
  ok("editar pelo ⋯ muda a solicitação na lista",
    (await p.locator(`.so-tabela tr.lin:has-text("${FR}")`).textContent()).includes("Coletar · Borracharia"));

  const [baixado] = await Promise.all([
    p.waitForEvent("download", { timeout: 10000 }),
    p.click('.cabec button:has-text("Baixar imagem")'),
  ]);
  const bytes = await readFile(await baixado.path());
  ok("a lista vira uma imagem PNG para o grupo",
    baixado.suggestedFilename().endsWith(".png") && bytes.length > 5000 &&
    bytes.subarray(1, 4).toString() === "PNG", `${baixado.suggestedFilename()} · ${bytes.length} bytes`);
}

// ── imprimir as pendências, só do executante escolhido ─────────────────────
{
  const SUF = Date.now().toString(36);
  const [A, B] = ["Exec A " + SUF, "Exec B " + SUF];
  await p.evaluate(async ([a, b, suf]) => {
    for (const [ex, n] of [[a, 1], [b, 2]]) await mkt.ev.aplicar(mkt.ev.criar({ frota: "F-IMP-" + suf,
      atividade: `Serviço ${n} ${suf}`, tipo: "Corretiva", semana: 41, ano: 2026, dia: "Ter",
      dias: 1, hh: 2, executantes: [ex], oficina: "Interna" }), { silencioso: true });
    window.__impressoes = 0;
    window.print = () => { window.__impressoes++; };
  }, [A, B, SUF]);
  await p.evaluate(() => { location.hash = "#/programacao?m=tudo"; });
  await p.waitForTimeout(900);
  await p.click('.cabec button:has-text("Por executante")');
  await p.waitForSelector(".caixa .lista-check", { timeout: 5000 });
  await p.click('.caixa button:has-text("Limpar")');
  await p.check(`.caixa .lista-check label:has-text("${A}") input`);
  await p.click('.caixa button:has-text("Imprimir")');
  await p.waitForSelector("#impressao .imp-folha", { state: "attached", timeout: 5000 });
  const folha = await p.evaluate(() => ({
    texto: document.querySelector("#impressao").textContent,
    folhas: document.querySelectorAll("#impressao .imp-folha").length,
    naTela: getComputedStyle(document.querySelector("#impressao")).display,
    impressoes: window.__impressoes,
  }));
  ok("imprimir pendências: só as do executante escolhido, numa folha",
    folha.texto.includes(`Serviço 1 ${SUF}`) && !folha.texto.includes(`Serviço 2 ${SUF}`) &&
    folha.folhas === 1 && folha.impressoes === 1, JSON.stringify({ ...folha, texto: folha.texto.slice(0, 120) }));
  ok("e a folha não aparece na tela, só no papel", folha.naTela === "none", folha.naTela);
  await p.evaluate(() => { document.getElementById("impressao")?.remove(); document.body.classList.remove("imprimindo"); });
}

// ── a folha da frota: semana inteira, uma frota, paginação medida ──────────
{
  const S = Date.now().toString(36).slice(-5).toUpperCase();
  const sem = await p.evaluate(() => mkt.M.semanaAtual());
  const [FA, FB] = [`F-FA${S}`, `F-FB${S}`];
  await p.evaluate(async ([fa, fb, sem, s]) => {
    const ev = [];
    // a FA tem tanta coisa que não cabe numa página só
    for (let k = 1; k <= 70; k++) ev.push(mkt.ev.criar({ frota: fa, atividade: `Item ${String(k).padStart(2, "0")} da ${fa} com um texto comprido o bastante para quebrar em duas linhas na folha impressa`,
      tipo: "Corretiva", origem: "Programada", oficina: "Interna", ano: sem.ano, semana: sem.semana, dia: "Qua", dias: 2,
      executantes: k % 3 ? ["Exec " + s] : [], obs: k === 1 ? "[06/10] TOP: item do TOP" : (k === 2 ? "Backlog · TOP 06/10: conferir" : "") }));
    ev.push(mkt.ev.criar({ frota: fb, atividade: `Único da ${fb}`, tipo: "Corretiva", origem: "Programada",
      oficina: "Interna", ano: sem.ano, semana: sem.semana, dia: "Qui", dias: 1 }));
    await mkt.ev.aplicar(ev, { silencioso: true });
    window.__impressoes = 0;
    window.print = () => { window.__impressoes++; };
  }, [FA, FB, sem, S]);
  const paginas = async () => {
    await p.emulateMedia({ media: "print" });
    const r = await p.evaluate(() => [...document.querySelectorAll("#impressao .fl-pagina")].map(pg => ({
      titulo: pg.querySelector(".fl-cab h1").textContent, rodape: pg.querySelector(".fl-rodape").textContent,
      cortou: pg.scrollHeight > pg.clientHeight + 1,
      // o rodapé tem de estar dentro da página, não escondido embaixo
      rodapeDentro: pg.querySelector(".fl-rodape").getBoundingClientRect().bottom <= pg.getBoundingClientRect().bottom + 1,
      linhas: pg.querySelectorAll(".fl-corpo > .fl-linha").length,
      top: [...pg.querySelectorAll(".fl-top")].map(t => t.parentElement.textContent),
    })));
    await p.emulateMedia({ media: "screen" });
    await p.evaluate(() => { document.getElementById("impressao")?.remove(); document.body.classList.remove("imprimindo"); });
    return r;
  };

  await p.evaluate(() => { location.hash = "#/programacao?m=semana"; });
  await p.waitForTimeout(900);
  await p.fill(".filtros input.busca-frota", S);
  await p.waitForTimeout(400);
  await p.locator(`.so-tabela tr.bloco:has-text("${FA}") button.imprimir-bloco`).click();
  const pgA = await paginas();
  const linhasA = pgA.reduce((n, x) => n + x.linhas, 0);
  ok("imprimir a frota pelo bloco: as 70 em várias páginas, nenhuma linha cortada, rodapé 'página i de n' em cada",
    pgA.length >= 2 && linhasA === 70 && pgA.every(x => !x.cortou && x.rodapeDentro) &&
    pgA.every((x, i) => x.rodape === `${FA} · página ${i + 1} de ${pgA.length}`) &&
    pgA[0].titulo === FA && pgA.slice(1).every(x => x.titulo.includes("continuação")),
    JSON.stringify(pgA.map(x => ({ ...x, top: x.top.length }))));
  ok("a etiqueta TOP só no que nasceu no TOP, não no que só cita",
    pgA.flatMap(x => x.top).length === 1 && pgA.flatMap(x => x.top)[0].includes("Item 01"),
    JSON.stringify(pgA.flatMap(x => x.top)));

  await p.fill(".filtros input.busca-frota", "");
  await p.waitForTimeout(300);
  await p.click('.cabec button:has-text("Imprimir semana")');
  const pgS = await paginas();
  const titulos = [...new Set(pgS.map(x => x.titulo.replace(" · continuação", "")))];
  const esperadas = await p.evaluate(sem => [...new Set(mkt.ev.lista().filter(a => a.semana === sem.semana &&
    a.ano === sem.ano && mkt.M.aberta(a)).map(a => a.frota))].length, sem);
  ok("imprimir a semana: uma folha por frota em aberto na semana, cada uma começando em página nova",
    titulos.length === esperadas && titulos.includes(FA) && titulos.includes(FB) && pgS.every(x => !x.cortou),
    `${titulos.length} frotas na folha, ${esperadas} na semana`);
}

// ── a frota se pesquisa, e retirar da programação é em lote ────────────────
{
  const S = Date.now().toString(36).slice(-5).toUpperCase();
  const [F1, F2, F12] = [`F-${S}1`, `F-${S}2`, `F-${S}12`];
  const sem = await p.evaluate(() => mkt.M.semanaAtual());
  await p.evaluate(async ([frotas, sem]) => {
    let n = 0;
    for (const f of frotas) for (const k of [1, 2]) await mkt.ev.aplicar(mkt.ev.criar({ frota: f,
      atividade: `Item ${k} de ${f}`, tipo: "Corretiva", origem: "Programada", oficina: "Interna",
      ano: sem.ano, semana: sem.semana, dia: "Qua", dias: 1, id: `RT-${f}-${k}-${++n}` }), { silencioso: true });
  }, [[F1, F2, F12], sem]);
  await p.evaluate(() => { location.hash = "#/programacao?m=tudo"; });
  await p.waitForTimeout(900);
  const frotasNaTela = () => p.evaluate(() => [...new Set([...document.querySelectorAll(".so-tabela tr.lin")]
    .map(tr => mkt.ev.porId(tr.dataset.id)?.frota))].sort());

  await p.fill(".filtros input.busca-frota", S + "1");
  await p.waitForTimeout(400);
  const parcial = await frotasNaTela();
  ok("digitar parte do número da frota filtra (" + S + "1 → as duas que contêm)",
    JSON.stringify(parcial) === JSON.stringify([F1, F12].sort()), JSON.stringify(parcial));
  await p.fill(".filtros input.busca-frota", F1.toLowerCase().replace("-", ""));
  await p.waitForTimeout(400);
  const exata = await frotasNaTela();
  ok("o nome inteiro (sem hífen, minúsculo) mostra só aquela frota",
    JSON.stringify(exata) === JSON.stringify([F1]), JSON.stringify(exata));
  const opcoesLista = await p.evaluate(f => [...document.querySelectorAll("#dl-frotas-prog option")]
    .some(o => o.value === f), F12);
  ok("e a lista de sugestões tem as frotas", opcoesLista);

  // lote: marca o bloco da frota e retira tudo de uma vez, com um motivo
  await p.fill(".filtros input.busca-frota", S);
  await p.waitForTimeout(400);
  for (const f of [F1, F2]) {
    await p.locator(`.so-tabela tr.bloco:has-text("${f}") input.sel-bloco`).first().check();
    await p.waitForTimeout(250);
  }
  const barraTexto = await p.textContent(".barra-sel");
  ok("marcar dois blocos de frota: 4 marcadas e o botão de retirar na barra",
    barraTexto.includes("4 marcadas") && barraTexto.includes("Retirar da programação"), barraTexto);
  const antes = await p.evaluate(() => mkt.ev.log.length);
  await p.click('.barra-sel button:has-text("Retirar da programação")');
  await p.waitForSelector(".caixa input[placeholder^='ex.: frota em fornecedor']", { timeout: 5000 });
  const titulo = await p.textContent(".caixa");
  ok("a caixa diz quantas e de quais frotas",
    titulo.includes("Retirar 4 atividades") && titulo.includes(`${F1} (2)`) && titulo.includes(`${F2} (2)`),
    titulo.slice(0, 200));
  await p.fill(".caixa input[placeholder^='ex.: frota em fornecedor']", `Frota em fornecedor externo ${S}`);
  await p.click('.caixa footer button:has-text("Retirar")');
  await p.waitForFunction(fs => fs.every(f => mkt.ev.lista().filter(a => a.frota === f).every(a => a.semana == null)),
    [F1, F2], { timeout: 5000 });
  const depois = await p.evaluate(([fs, n0]) => ({
    novos: mkt.ev.log.length - n0,
    motivos: [...new Set(mkt.ev.lista().filter(a => fs.slice(0, 2).includes(a.frota)).map(a => a.motivo))],
    f12: mkt.ev.lista().filter(a => a.frota === fs[2]).every(a => a.semana != null),
  }), [[F1, F2, F12], antes]);
  ok("as 4 voltaram para a carteira, cada uma com o motivo, num lançamento por atividade",
    depois.novos === 4 && depois.motivos.length === 1 && depois.motivos[0].includes(S) && depois.f12,
    JSON.stringify(depois));

  // uma só, pelo ⋯: o motivo usado por último está a um toque
  await p.locator(`.so-tabela tr.lin:has-text("Item 1 de ${F12}") .mais`).click();
  await p.waitForSelector(".caixa .menu-acoes", { timeout: 5000 });
  await p.click('.caixa .opcao-acao:has-text("Retirar da programação")');
  await p.waitForSelector(".caixa .motivo-rapido", { timeout: 5000 });
  await p.click(`.caixa .motivo-rapido:has-text("${S}")`);
  const preenchido = await p.inputValue(".caixa input[placeholder^='ex.: frota em fornecedor']");
  ok("pelo ⋯, o motivo usado por último preenche com um toque", preenchido.includes(S), preenchido);
  await p.click('.caixa footer button:has-text("Retirar")');
  await p.waitForFunction(f => mkt.ev.lista().find(a => a.atividade === `Item 1 de ${f}`).semana == null, F12, { timeout: 5000 });
  ok("e retira só aquela", await p.evaluate(f => mkt.ev.lista().find(a => a.atividade === `Item 2 de ${f}`).semana != null, F12));
  await p.fill(".filtros input.busca-frota", "");
}

// ── a tela Frota: pesquisar e tocar ────────────────────────────────────────
{
  const numero = String(70000 + Date.now() % 20000);
  const alvo = "F-" + numero;
  await p.evaluate(async f => { await mkt.ev.aplicar(mkt.ev.criar({ frota: f, atividade: "Teste da tela Frota",
    tipo: "Corretiva", origem: "Programada", oficina: "Interna" }), { silencioso: true }); }, alvo);
  await p.evaluate(() => { location.hash = "#/frota"; });
  await p.waitForTimeout(800);
  await p.fill(".cabec input.busca-frota", numero);
  await p.waitForTimeout(400);
  const chips = await p.evaluate(() => [...document.querySelectorAll(".grade-frotas .frota-chip b")].map(b => b.textContent));
  ok("na tela Frota, digitar o número filtra as frotas para tocar",
    chips.includes(alvo) && chips.every(c => c.replace(/\D/g, "").includes(numero)), JSON.stringify(chips.slice(0, 8)));
  await p.locator(`.grade-frotas .frota-chip:has(b:text-is("${alvo}"))`).click();
  await p.waitForTimeout(500);
  ok("e tocar abre a frota", await p.evaluate(() => !document.querySelector(".grade-frotas") &&
    !!document.querySelector(".numeros")));
}

// ── voltar: o botão do alto diz para onde volta ────────────────────────────
{
  await p.evaluate(() => { location.hash = "#/resultados"; });
  await p.waitForTimeout(900);
  await p.evaluate(() => { location.hash = "#/programacao?m=tudo"; });
  await p.waitForTimeout(900);
  const rotulo = await p.textContent("#bvoltar");
  ok("vindo de Resultados, o alto mostra ‹ Resultados", rotulo.includes("Resultados") &&
    await p.isVisible("#bvoltar"), rotulo);
  await p.click("#bvoltar");
  await p.waitForTimeout(900);
  ok("e o botão volta para Resultados", (await p.evaluate(() => location.hash)).startsWith("#/resultados"));

  // Frota: da grade para a frota e de volta, pelo endereço
  const fr = await p.evaluate(() => mkt.ev.lista().find(a => a.frota && mkt.M.aberta(a) && /^F-\d+$/.test(a.frota)).frota);
  await p.evaluate(() => { location.hash = "#/frota"; });
  await p.waitForTimeout(800);
  await p.locator(`.grade-frotas .frota-chip:has(b:text-is("${fr}"))`).click();
  await p.waitForTimeout(800);
  ok("tocar na frota muda o endereço", (await p.evaluate(() => location.hash)).includes("f=" + encodeURIComponent(fr)));
  await p.click('.cabec button:has-text("Todas as frotas")');
  await p.waitForTimeout(800);
  ok("‹ Todas as frotas volta para a grade", await p.evaluate(() => !!document.querySelector(".grade-frotas") &&
    location.hash === "#/frota"));
}

// ── o botão direito ────────────────────────────────────────────────────────
{
  await p.evaluate(() => { location.hash = "#/programacao?m=tudo"; });
  await p.waitForTimeout(900);
  const linha = p.locator(".so-tabela tr.lin").first();
  const id = await linha.getAttribute("data-id");
  await linha.locator("td.c-ativ").click({ button: "right" });
  await p.waitForSelector(".cm", { timeout: 5000 });
  const opcoes = await p.evaluate(() => [...document.querySelectorAll(".cm .cm-item")].map(b => b.textContent));
  const a = await p.evaluate(id => { const x = mkt.ev.porId(id); return { frota: x.frota, semana: x.semana, aberta: mkt.M.aberta(x) }; }, id);
  ok("botão direito numa atividade abre as ações dela ali, sem o ⋯",
    opcoes[0] === "Abrir a ficha" && opcoes.includes("Mais ações…") &&
    opcoes.some(o => o.startsWith("Abrir a frota " + a.frota)) && opcoes.some(o => o.startsWith("Imprimir a folha")) &&
    (!a.aberta || opcoes.includes("Dar baixa")), JSON.stringify(opcoes));
  await p.keyboard.press("Escape");
  ok("Esc fecha o menu", await p.evaluate(() => !document.querySelector(".cm")));

  await linha.locator("td.c-ativ").click({ button: "right" });
  await p.waitForSelector(".cm");
  await p.click('.cm .cm-item:has-text("Abrir a ficha")');
  await p.waitForSelector(".caixa", { timeout: 5000 });
  ok("e a opção funciona: abre a ficha", await p.evaluate(() => !!document.querySelector(".caixa")));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);

  // fora de um item: o básico da tela
  await p.locator("#topo .titulo").click({ button: "right" });
  await p.waitForSelector(".cm");
  const basico = await p.evaluate(() => [...document.querySelectorAll(".cm .cm-item")].map(b => b.textContent));
  ok("fora de um item: voltar, atualizar e ir para as telas",
    basico.some(o => o.startsWith("Voltar")) && basico.includes("Atualizar") && basico.includes("Ir para Hoje"),
    JSON.stringify(basico));
  await p.click('.cm .cm-item:has-text("Ir para Hoje")');
  await p.waitForTimeout(700);
  ok("e Ir para Hoje leva para Hoje", (await p.evaluate(() => location.hash)).startsWith("#/hoje"));

  // campo de texto continua com o menu do navegador
  await p.evaluate(() => { location.hash = "#/programacao?m=tudo"; });
  await p.waitForTimeout(700);
  const nativo = await p.evaluate(() => {
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 50 });
    document.querySelector(".filtros input.busca").dispatchEvent(ev);
    return !ev.defaultPrevented && !document.querySelector(".cm");
  });
  ok("em campo de texto o menu do navegador continua (para colar)", nativo);
}

// ── no tablet em pé, os cartões também têm a caixinha ──────────────────────
{
  await p.evaluate(() => { location.hash = "#/programacao?m=tudo"; });
  await p.waitForTimeout(700);
  await p.setViewportSize({ width: 800, height: 1000 });
  await p.waitForTimeout(500);
  const temCaixa = await p.evaluate(() => {
    const c = document.querySelector(".so-cartao .at input.sel-item");
    return !!c && getComputedStyle(document.querySelector(".so-cartao")).display !== "none";
  });
  ok("no tablet em pé, os cartões têm a caixinha de marcar", temCaixa);
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.waitForTimeout(400);
}

// ── fechar a semana: o número registrado não muda depois ───────────────────
{
  const S = Date.now().toString(36).slice(-5).toUpperCase();
  const sem = await p.evaluate(() => mkt.M.semanaAtual());
  const ids = await p.evaluate(async ([s, sem]) => {
    const r = [];
    for (const k of [1, 2]) {
      const [e] = await mkt.ev.aplicar(mkt.ev.criar({ frota: "F-FECH" + s, atividade: `Fechar ${k}`,
        tipo: "Corretiva", origem: "Programada", oficina: "Interna", ano: sem.ano, semana: sem.semana,
        dia: "Seg", dias: 1 }), { silencioso: true });
      r.push(e.alvo);
    }
    return r;
  }, [S, sem]);
  await p.evaluate(sem => { location.hash = `#/resultados?s=${sem.semana}&a=${sem.ano}`; }, sem);
  await p.waitForSelector(".selo-fechamento", { timeout: 5000 });
  const selo1 = await p.textContent(".selo-fechamento");
  ok("a semana atual aparece em andamento, com o botão de fechar",
    selo1.includes("Semana em andamento") && selo1.includes("Fechar a semana"), selo1.slice(0, 120));
  await p.click('.selo-fechamento button:has-text("Fechar a semana")');
  await p.waitForSelector(".caixa textarea", { timeout: 5000 });
  await p.fill(".caixa textarea", "teste " + S);
  await p.click('.caixa footer button:has-text("Fechar a semana")');
  await p.waitForFunction(sem => !!mkt.ev.fechamentoDe(sem.ano, sem.semana), sem, { timeout: 5000 });
  await p.waitForTimeout(500);
  const reg = await p.evaluate(sem => {
    const f = mkt.ev.fechamentoDe(sem.ano, sem.semana);
    const r = mkt.M.resultados(mkt.ev.lista(), sem.ano, sem.semana);
    return { reg: f.aderencia, vivo: r.aderencia, obs: f.obs, por: f.fechada_por,
      tela: document.querySelector(".grande .g-val").textContent,
      selo: document.querySelector(".selo-fechamento").textContent };
  }, sem);
  ok("fechada: o número registrado é o calculado no momento, com a observação e quem fechou",
    reg.reg === reg.vivo && reg.obs === "teste " + S && reg.por === "Mateus" &&
    reg.selo.includes("Semana fechada") && reg.selo.includes("Fechar de novo"), JSON.stringify(reg));

  await p.evaluate(async ids => {
    for (const id of ids) await mkt.ev.aplicar(mkt.ev.concluir(mkt.ev.porId(id), mkt.M.hoje()));
  }, ids);
  await p.waitForTimeout(700);
  const depoisBaixa = await p.evaluate(sem => ({
    tela: document.querySelector(".grande .g-val").textContent,
    hoje: document.querySelector(".grande .g-hoje")?.textContent || "",
    reg: Math.round(mkt.ev.fechamentoDe(sem.ano, sem.semana).aderencia * 100) + "%",
    vivo: mkt.M.resultados(mkt.ev.lista(), sem.ano, sem.semana).aderencia,
  }), sem);
  ok("dar baixa depois não mexe no número da semana fechada; o de hoje aparece ao lado",
    depoisBaixa.tela === depoisBaixa.reg && depoisBaixa.hoje.includes("hoje o cálculo daria"),
    JSON.stringify(depoisBaixa));
  const linhaTabela = await p.evaluate(sem => [...document.querySelectorAll("table.fechamentos tbody tr")]
    .find(tr => tr.firstChild.textContent.startsWith(`${sem.semana} · `))?.textContent || "", sem);
  ok("e o quadro de fechamento mostra o registrado e quem fechou", linhaTabela.includes("Mateus"), linhaTabela);

  await p.click('.selo-fechamento button:has-text("Fechar de novo")');
  await p.waitForSelector(".caixa input[placeholder='por que fechar de novo']", { timeout: 5000 });
  await p.click('.caixa footer button:has-text("Fechar de novo")');
  await p.waitForTimeout(400);
  const recusou = await p.evaluate(() => document.querySelector(".aviso.ruim, .toast.ruim, .aviso")?.textContent || "");
  ok("fechar de novo sem motivo não grava", /motivo/i.test(recusou) ||
    await p.evaluate(sem => mkt.ev.log.filter(e => e.alvo === mkt.ev.chaveSemana(sem.ano, sem.semana)).length === 1, sem),
    recusou);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);

  // o número apresentado na reunião, digitado — a coluna amarela
  await p.click('.selo-fechamento button:has-text("Fechar de novo")');
  await p.waitForSelector(".caixa input.pct", { timeout: 5000 });
  await p.fill(".caixa input.pct >> nth=0", "84");
  await p.fill(".caixa input.pct >> nth=1", "62,9");
  await p.fill(".caixa input[placeholder='por que fechar de novo']", "número da reunião");
  await p.click('.caixa footer button:has-text("Fechar de novo")');
  await p.waitForFunction(sem => mkt.ev.fechamentoDe(sem.ano, sem.semana).fonte === "digitar", sem, { timeout: 5000 });
  const digitado = await p.evaluate(sem => { const f = mkt.ev.fechamentoDe(sem.ano, sem.semana);
    return { a: f.aderencia, c: f.cumprimento, m: f.motivo, tela: document.querySelector(".grande .g-val").textContent }; }, sem);
  ok("digitar o número apresentado registra 84% e 62,9%, com o motivo",
    digitado.a === 0.84 && digitado.c === 0.629 && digitado.m === "número da reunião" && digitado.tela === "84%",
    JSON.stringify(digitado));
}

// ── preventivas: incluir frota, reprogramar com motivo, registro, painel ───
{
  const F = "F-PV" + Date.now().toString(36).slice(-4).toUpperCase();
  const { ref, mes, d1, d2, venc } = await p.evaluate(async () => {
    const { mesDaData } = await import("/js/decisoes.js");
    const ref = mkt.M.hoje();
    const util = (d, n) => { let k = 0; while (k < n) { d = mkt.M.somaDias(d, 1); const w = mkt.M.data(d).getUTCDay(); if (w >= 1 && w <= 5) k++; } return d; };
    return { ref, mes: mesDaData(ref), d1: util(ref, 2), d2: util(ref, 4), venc: mkt.M.somaDias(ref, 20) };
  });
  await p.evaluate(() => { location.hash = "#/preventivas"; });
  await p.waitForTimeout(900);
  await p.click('.cabec button:has-text("+ Incluir frota")');
  await p.waitForSelector(".caixa .form-prev");
  await p.click('.caixa footer button:has-text("Incluir")');
  await p.waitForTimeout(300);
  ok("incluir sem a frota não fecha a caixa", await p.isVisible(".caixa .form-prev"));
  await p.fill('.caixa .form-prev input[placeholder="ex.: F-745"]', F);
  await p.fill('.caixa .form-prev input[placeholder^="ex.: 15 mil"]', "15 mil km");
  await p.fill('.caixa .form-prev input[type=date] >> nth=0', venc);
  await p.click('.caixa footer button:has-text("Incluir")');
  await p.waitForTimeout(900);
  const nova = await p.evaluate(f => {
    const x = mkt.ev.lista("preventiva").find(y => y.frota === f);
    return x && { id: x.id, mes: x.mes, plano: x.plano, vence: x.vence, espera: mkt.M.esperandoQuem(x) };
  }, F);
  ok("+ Incluir frota entra no plano do mês, aguardando a operação",
    !!nova && nova.mes === mes && nova.plano === "15 mil km" && nova.vence === venc && nova.espera === "Operação",
    JSON.stringify(nova));

  // liberada e com parada; depois, reprogramar pela caixa
  await p.evaluate(async ([id, d1]) => {
    const ev = mkt.ev;
    await ev.aplicar(ev.informarDisponibilidade(ev.porId(id, "preventiva"), "agora"), { silencioso: true });
    await ev.aplicar(ev.marcarParada(ev.porId(id, "preventiva"), d1, "Interna"), { silencioso: true });
  }, [nova.id, d1]);
  await p.evaluate(async id => { const pv = await import("/js/tela/preventivas.js"); pv.marcarParada(mkt.ev.porId(id, "preventiva")); }, nova.id);
  await p.waitForSelector(".caixa");
  ok("com a parada marcada, a caixa é de reprogramar", (await p.textContent(".caixa header h2")) === "Reprogramar a parada");
  await p.fill(".caixa input[type=date]", d2);
  await p.click('.caixa footer button:has-text("Reprogramar")');
  await p.waitForTimeout(400);
  const semMotivo = await p.evaluate(id => mkt.ev.porId(id, "preventiva").dia_parada, nova.id);
  ok("mudar o dia sem motivo: a caixa fica aberta, com o dia, e nada grava",
    await p.isVisible(".caixa") && await p.inputValue(".caixa input[type=date]") === d2 && semMotivo === d1, semMotivo);
  await p.fill('.caixa input[placeholder^="ex.: frota em viagem"]', "Frota em viagem");
  await p.click('.caixa footer button:has-text("Reprogramar")');
  await p.waitForTimeout(700);
  const rep = await p.evaluate(id => { const x = mkt.ev.porId(id, "preventiva");
    return { dia: x.dia_parada, n: x.reprog_parada, mot: x.motivo_parada, orig: x.parada_orig }; }, nova.id);
  ok("com o motivo, reprograma, conta 1× e guarda a primeira data",
    rep.dia === d2 && rep.n === 1 && rep.mot === "Frota em viagem" && rep.orig === d1, JSON.stringify(rep));

  // o registro de mudanças
  await p.evaluate(() => { location.hash = "#/preventivas?v=mudancas"; });
  await p.waitForTimeout(900);
  const linhas = await p.evaluate(f => [...document.querySelectorAll(".evento.mudanca")]
    .map(e => e.textContent).filter(t => t.includes(f)), F);
  ok("Mudanças mostra a inclusão e a reprogramação com o motivo",
    linhas.some(t => t.includes("incluiu no plano")) &&
    linhas.some(t => t.includes("reprogramou a parada") && t.includes("Frota em viagem")), JSON.stringify(linhas.slice(0, 4)));
  await p.click('.fsit:has-text("Reprogramações")');
  await p.waitForTimeout(400);
  ok("e o filtro por tipo deixa só as reprogramações", await p.evaluate(() =>
    [...document.querySelectorAll(".evento.mudanca .tipo-mud")].every(c => c.textContent === "Reprogramação")));

  // a ficha conta as reprogramações
  await p.evaluate(async id => { const pv = await import("/js/tela/preventivas.js"); pv.abrirFichaPrev(id, mkt.ctx); }, nova.id);
  await p.waitForSelector(".caixa");
  const ficha = await p.textContent(".caixa");
  ok("a ficha mostra as reprogramações e o histórico", ficha.includes("Reprogramações da parada") && ficha.includes("Frota em viagem"));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);

  // uma liberada sem parada, vencendo logo: vira decisão no Painel, com o botão que programa
  const F2 = F + "B";
  const id2 = await p.evaluate(async ([f, mes, v]) => {
    const ev = mkt.ev;
    const [e] = await ev.aplicar(ev.novaPreventiva({ ...mkt.M.moldePreventiva(), frota: f, mes, plano: "1 ano", vence: v, id: undefined }), { silencioso: true });
    await ev.aplicar(ev.informarDisponibilidade(ev.porId(e.alvo, "preventiva"), "agora"), { silencioso: true });
    return e.alvo;
  }, [F2, mes, await p.evaluate(r => mkt.M.somaDias(r, 3), ref)]);
  await p.evaluate(() => { location.hash = "#/painel"; });
  await p.waitForSelector(".grandes.quatro .grande", { timeout: 5000 });
  ok("o Painel mostra os quatro números de cima", (await p.locator(".grandes.quatro .grande").count()) === 4);
  await p.click('.faixa-sit .fsit:has-text("Preventivas")');
  await p.waitForTimeout(400);
  if (await p.isVisible(".decisoes .ver-mais")) { await p.click(".decisoes .ver-mais"); await p.waitForTimeout(300); }
  ok("e, filtrado em Preventivas, a liberada sem parada está lá (sozinha ou junto das outras)",
    await p.evaluate(f => [...document.querySelectorAll(".decisao .d-tit")].some(t =>
      t.textContent === `Programar a parada da ${f}` || /^Programar a parada de \d+ preventivas liberadas$/.test(t.textContent)), F2));
  await p.click('.faixa-sit .fsit:has-text("Preventivas")');

  // no painel da aba, uma linha por frota, com o botão que programa
  await p.evaluate(() => { location.hash = "#/preventivas?v=painel"; });
  await p.waitForSelector(".decisoes", { timeout: 5000 });
  const linha = p.locator(`.decisao[data-id="${id2}"]`);
  const titulo = await linha.locator(".d-tit").textContent().catch(() => "");
  ok("no painel de preventivas, a liberada e sem parada aparece como urgente",
    titulo === `Programar a parada da ${F2}` && (await linha.getAttribute("class")).includes("n1"), titulo);
  await linha.locator(".d-tit").click({ button: "right" });
  await p.waitForSelector(".cm");
  const menu = await p.evaluate(() => [...document.querySelectorAll(".cm .cm-item")].map(b => b.textContent));
  ok("botão direito na decisão abre o menu da preventiva", menu.includes("Programar a parada") && menu.includes("Abrir a ficha"), JSON.stringify(menu));
  await p.keyboard.press("Escape");
  const botao = linha.locator(".d-acoes button").first();
  const sug = (await botao.textContent()).match(/(\d\d)\/(\d\d)/);
  await botao.click();
  await p.waitForSelector(".caixa");
  const diaNaCaixa = await p.inputValue(".caixa input[type=date]");
  ok("o botão da decisão abre a parada já com a data sugerida",
    !!sug && diaNaCaixa.slice(8, 10) === sug[1] && diaNaCaixa.slice(5, 7) === sug[2], diaNaCaixa);
  await p.click('.caixa footer button:has-text("Marcar")');
  await p.waitForTimeout(900);
  const marcada = await p.evaluate(id => mkt.ev.porId(id, "preventiva").dia_parada, id2);
  ok("e Marcar grava a parada, e a decisão sai da lista",
    marcada === diaNaCaixa && !(await p.locator(`.decisao[data-id="${id2}"] .d-tit:text-is("Programar a parada da ${F2}")`).count()), marcada);

  // o número de reprogramações leva ao registro filtrado
  await p.locator('.kpis .clicavel:has-text("Reprogramações")').click();
  await p.waitForTimeout(500);
  ok("Reprogramações no painel da aba abre as mudanças desse tipo",
    await p.evaluate(() => !!document.querySelector(".evento.mudanca") &&
      [...document.querySelectorAll(".evento.mudanca .tipo-mud")].every(c => c.textContent === "Reprogramação")));
}

// ── o + Extra da tela Hoje entra no dia que está na tela ───────────────────
{
  const F = "F-EXTRA-" + Date.now().toString(36);
  await p.evaluate(() => { location.hash = "#/hoje"; });
  await p.waitForTimeout(700);
  await p.click('.cabec button:has-text("+ Extra")');
  await p.waitForSelector(".caixa textarea", { timeout: 5000 });
  await p.fill(".caixa .com-lista input >> nth=0", F);
  await p.fill(".caixa textarea >> nth=0", "Trocar lâmpada de teste");
  await p.click('.caixa footer button:has-text("Criar")');
  await p.waitForFunction(f => mkt.ev.lista().some(a => a.frota === f && a.semana), F, { timeout: 5000 });
  const extra = await p.evaluate(f => { const a = mkt.ev.lista().find(x => x.frota === f);
    return { origem: a.origem, inicio: mkt.M.inicioDe(a), hoje: mkt.M.hoje() }; }, F);
  ok("o + Extra da tela Hoje cai no dia de hoje, como extra",
    extra.origem === "Extra" && extra.inicio === extra.hoje, JSON.stringify(extra));
}

// ── a barra de baixo do celular ────────────────────────────────────────────
// Cabe cinco botões. O PCM tem dez telas: a barra mostra as do dia e o resto
// abre em "Mais". Antes a barra rolava na horizontal e a Movimentação ficava
// escondida à direita, sem ninguém perceber.
const barra = await (await nav.newContext({ viewport: { width: 390, height: 800 } })).newPage();
await barra.goto(site.endereco, { waitUntil: "networkidle" });
await entrarComo(barra, "Mateus");
await barra.waitForTimeout(600);
const estadoBarra = await barra.evaluate(() => {
  const links = [...document.querySelectorAll("#menu nav a")];
  const caixa = document.querySelector("#menu nav");
  return {
    nomes: links.map(a => a.textContent.trim()),
    semRolagem: caixa.scrollWidth <= caixa.clientWidth + 1,
    cabe: links.every(a => { const r = a.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; }),
  };
});
ok("no celular a barra cabe sem rolar, com a Movimentação e o Mais",
  estadoBarra.semRolagem && estadoBarra.cabe &&
  estadoBarra.nomes.some(n => n.includes("Movimenta")) && estadoBarra.nomes.some(n => n.includes("Mais")),
  estadoBarra.nomes.join(" | "));
await barra.click('#menu nav a:has-text("Mais")');
await barra.waitForSelector('.caixa .opcao-acao:has-text("Resultados")', { timeout: 8000 });
await barra.click('.caixa .opcao-acao:has-text("Resultados")');
await barra.waitForTimeout(800);
const foiParaResultados = await barra.evaluate(() => location.hash);
ok("o Mais abre a lista das telas que não cabem e leva à escolhida",
  foiParaResultados.startsWith("#/resultados"), foiParaResultados);

// ── trocar de usuário pelo celular ─────────────────────────────────────────
// No celular o menu lateral some, e com ele o nome e o "Sair": não havia como
// trocar de usuário. Agora o nome fica no alto, e tocar nele troca.
const fone = await (await nav.newContext({ viewport: { width: 390, height: 800 } })).newPage();
await fone.goto(site.endereco, { waitUntil: "networkidle" });
await entrarComo(fone, "Mateus");
const noAlto = await fone.evaluate(() => {
  const b = document.querySelector("#quem-topo .chip-topo");
  return !!b && b.offsetParent !== null && b.textContent.includes("Mateus");
});
ok("no celular, o nome de quem entrou aparece no alto", noAlto);
await fone.click("#quem-topo .chip-topo");
await fone.click('.caixa .opcao-pessoa:has-text("Trocar de usuário")');
await fone.waitForSelector('input[placeholder="Seu e-mail"]', { timeout: 8000 });
await fone.waitForTimeout(400);
const portaTroca = await fone.evaluate(() => ({
  hash: location.hash,
  email: document.querySelector('input[placeholder="Seu e-mail"]').value,
  nomes: [...document.querySelectorAll(".atalhos-equipe button")].map(b => b.textContent),
}));
ok("trocar de usuário abre a porta em branco, com os nomes da equipe para tocar",
  portaTroca.hash.includes("trocar=1") && portaTroca.email === "" && portaTroca.nomes.includes("Pedro"),
  JSON.stringify(portaTroca));
await fone.click('.atalhos-equipe button:has-text("Pedro")');
const preenchido = await fone.evaluate(() => document.querySelector('input[placeholder="Seu e-mail"]').value);
ok("tocar no nome preenche o e-mail", preenchido === emailDoTeste("Pedro"), preenchido);
await fone.fill('input[placeholder="Senha"]', "makro2026");
await fone.click("button[type=submit]");
await fone.waitForTimeout(2200);
const virou = await fone.evaluate(() => ({ nome: mkt.pessoas.nome(),
  alto: (document.querySelector("#quem-topo") || {}).textContent || "" }));
ok("e entra como Pedro, com o nome dele no alto", virou.nome === "Pedro" && virou.alto.includes("Pedro"),
  JSON.stringify(virou));

// ── sair num aparelho não derruba o outro ─────────────────────────────────
// O que aconteceu em 09/10: o Mateus saiu no computador para testar os outros
// acessos, e o "Sair" encerrava a sessão dele em TODOS os aparelhos. Uma hora
// depois o celular não renovava mais, ficava recusado a cada 10 segundos, e o
// Diagnóstico mandava rodar o 02_acesso.sql — que não tinha nada a ver.
const celular = await (await nav.newContext({ viewport: { width: 390, height: 800 } })).newPage();
await celular.goto(site.endereco, { waitUntil: "networkidle" });
await entrarComo(celular, "Mateus");
await celular.waitForTimeout(800);
await p.click(".chip-pessoa");
await p.click('.caixa button:has-text("Sair")');
await p.waitForTimeout(800);
const expirar = () => fetch(`${NUVEM}/__expirar`, { method: "POST",
  headers: { "content-type": "application/json" }, body: JSON.stringify({ email: emailDoTeste("Mateus") }) });
await expirar();                                   // a hora do celular passou
const continua = await celular.evaluate(async () => ({
  leu: await mkt.nuvem.contar().then(() => "leu", e => e.message),
  dentro: mkt.nuvem.autenticado(),
}));
ok("sair no computador não derruba o celular: ele renova e continua lendo",
  continua.leu === "leu" && continua.dentro, JSON.stringify(continua));

// E quando a sessão acaba de verdade (saiu em todos os aparelhos, senha
// trocada, painel), o celular volta para a porta dizendo por quê — em vez de
// ficar tentando para sempre.
await celular.evaluate(async () => {
  const s = await mkt.dados.lerMeta("sessao", null);
  await fetch(mkt.nuvem.endereco() + "/auth/v1/logout", { method: "POST",
    headers: { apikey: "x", Authorization: "Bearer " + s.access_token } });
});
await expirar();
await celular.evaluate(() => mkt.ev.sincronizar());
await celular.waitForTimeout(1200);
const caiu = await celular.evaluate(() => ({
  hash: location.hash,
  aviso: (document.querySelector("#entrar-tela .morno") || {}).textContent || "",
  email: (document.querySelector('input[placeholder="Seu e-mail"]') || {}).value || "",
}));
ok("sessão encerrada pelo banco: volta para a porta com o porquê e o e-mail preenchido",
  caiu.hash.startsWith("#/entrar") && /encerrada/.test(caiu.aviso) && caiu.email === emailDoTeste("Mateus"),
  JSON.stringify(caiu));
await celular.goto(site.endereco + "#/diagnostico", { waitUntil: "networkidle" });
await celular.waitForTimeout(1500);
const diag = await celular.evaluate(() => document.body.innerText);
ok("e o Diagnóstico não manda rodar SQL por causa de sessão",
  !/recusou o acesso mesmo com você dentro/.test(diag), diag.slice(0, 200));

await nav.close();
site.fechar();
console.log(falhou ? `\n${falhou} falharam` : "\ntudo como projetado");
process.exit(falhou ? 1 : 0);
