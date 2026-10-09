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
import { servirCopia, entrarComo } from "./sitefalso.mjs";
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

await nav.close();
site.fechar();
console.log(falhou ? `\n${falhou} falharam` : "\ntudo como projetado");
process.exit(falhou ? 1 : 0);
