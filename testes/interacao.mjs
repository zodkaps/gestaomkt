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
import { servirCopia, entrarComo, entrarLocalComo } from "./sitefalso.mjs";
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
const alvo = await p.$(".so-tabela .tab tbody tr td:nth-child(4)") || await p.$(".at .tit");

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
await p.waitForTimeout(1200);
const fechou = await p.evaluate(() => ({
  caixas: document.querySelectorAll(".caixa").length,
  em: mkt.ev.porId(window.__alvo).concluida_em,
}));
ok("Enter num campo confirma, sem precisar mirar o botão",
  fechou.caixas === 0 && fechou.em === "2026-10-09", JSON.stringify(fechou));

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
await p.waitForSelector('input[placeholder="Seu nome"]', { timeout: 8000 });
const porta = await p.evaluate(() => ({
  nome: document.querySelector('input[placeholder="Seu nome"]').value,
  aviso: (document.querySelector("#entrar-tela .morno") || {}).textContent || "",
}));
ok("a porta já vem com o nome de quem tem lançamento parado",
  porta.nome === "Pedro" && /Pedro/.test(porta.aviso), JSON.stringify(porta));

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
await p.waitForSelector('input[placeholder="Seu nome"]', { timeout: 8000 });
await entrarComo(p, "Pedro", "makro2026", "operacao");
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

await nav.close();
site.fechar();
console.log(falhou ? `\n${falhou} falharam` : "\ntudo como projetado");
process.exit(falhou ? 1 : 0);
