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

// ── dar baixa em várias de uma vez ─────────────────────────────────────────
{
  const F = "F-LT" + Date.now().toString(36).slice(-4).toUpperCase();
  const { sem, ref } = await p.evaluate(() => ({ sem: mkt.M.semanaAtual(), ref: mkt.M.hoje() }));
  let s = sem.semana - 2, a = sem.ano; if (s < 1) { s += 52; a--; }
  // três vencidas de duas semanas atrás: seg (1 dia), seg (2 dias), qua (1 dia)
  const ids = await p.evaluate(async ([f, a, s]) => {
    const r = [];
    for (const [k, dia, dias] of [[1, "Seg", 1], [2, "Seg", 2], [3, "Qua", 1]]) {
      const [e] = await mkt.ev.aplicar(mkt.ev.criar({ frota: f, atividade: `Lote ${k}`, tipo: "Corretiva",
        origem: "Programada", oficina: "Interna", ano: a, semana: s, dia, dias }), { silencioso: true });
      r.push(e.alvo);
    }
    return r;
  }, [F, a, s]);
  const prazos = await p.evaluate(ids => ids.map(id => mkt.M.prazoDe(mkt.ev.porId(id))), ids);
  await p.evaluate(f => { location.hash = `#/programacao?m=abertas&sit=VENCIDA&f=${encodeURIComponent(f)}`; }, F);
  await p.waitForTimeout(900);
  await p.locator(".so-tabela tr.lin input.sel-item").first().check();
  await p.waitForTimeout(250);
  const barra = await p.textContent(".barra-sel");
  ok("marcar uma vencida mostra Dar baixa e Marcar todas (3) na barra",
    barra.includes("Dar baixa") && barra.includes("Marcar todas (3)"), barra);
  await p.click('.barra-sel button:has-text("Marcar todas")');
  await p.waitForTimeout(300);
  ok("Marcar todas marca as três da lista filtrada", (await p.textContent(".barra-sel")).includes("3 marcadas"));
  await p.click('.barra-sel button:has-text("Dar baixa")');
  await p.waitForSelector(".caixa .lote-resumo", { timeout: 5000 });
  const tit = await p.textContent(".caixa header h2");
  const resumo = await p.textContent(".caixa .lote-resumo");
  const br = iso => iso.split("-").reverse().join("/");
  ok("a caixa abre no último dia programado de cada uma, com as datas à vista",
    tit === "Dar baixa em 3 atividades" && prazos.every(d => resumo.includes(br(d))), `${tit} · ${resumo}`);

  // uma data só, apagada: não fecha e não grava
  await p.click('.caixa button:has-text("Uma data para todas")');
  await p.fill(".caixa input[type=date]", "");
  await p.click('.caixa footer button:has-text("Dar baixa em 3")');
  await p.waitForTimeout(300);
  const nada = await p.evaluate(ids => ids.every(id => !mkt.ev.porId(id).concluida_em), ids);
  ok("uma data só, sem a data: a caixa fica aberta e nada grava", await p.isVisible(".caixa .lote-resumo") && nada);
  // hoje para todas: depois do prazo, então aparece o motivo do atraso
  await p.fill(".caixa input[type=date]", ref);
  await p.waitForTimeout(150);
  ok("com a data de hoje, as três ficam com atraso e o motivo aparece",
    (await p.textContent(".caixa .lote-resumo")).includes("3 ficam como concluídas com atraso") &&
    await p.isVisible(".caixa .bloco-atraso"));

  // volta para o último dia programado e confirma
  await p.click('.caixa button:has-text("Último dia programado")');
  await p.click('.caixa footer button:has-text("Dar baixa em 3")');
  await p.waitForTimeout(900);
  const datas = await p.evaluate(ids => ids.map(id => mkt.ev.porId(id).concluida_em), ids);
  ok("Dar baixa em 3: cada uma concluída no seu último dia programado",
    JSON.stringify(datas) === JSON.stringify(prazos), JSON.stringify({ datas, prazos }));
  ok("e a barra some, sem nada marcado", await p.evaluate(() => document.querySelector(".barra-sel").hidden));
  // A Programação guarda os filtros entre uma tela e outra: deixa limpo para
  // os testes de baixo, como quem apaga a frota e clica em Todas.
  await p.fill(".filtros input.busca-frota", "");
  await p.click(".fsit.todas");
  await p.waitForTimeout(300);
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

// ── a rosca: a situação da semana em Resultados ───────────────────────────
{
  await p.evaluate(() => { location.hash = "#/resultados"; });
  await p.waitForTimeout(1200);
  const card = p.locator('.g-card:has(.g-tit:text-is("Situação das atividades da semana"))');
  const fatias = await card.locator(".g-rosca .g-fatia").count();
  const soma = await card.evaluate(c => [...c.querySelectorAll(".g-rl b")].reduce((t, b) => t + Number(b.textContent), 0));
  const centro = await card.evaluate(c => Number((c.querySelector(".g-centro-val") || {}).textContent));
  ok("a situação da semana é uma rosca, e as fatias somam o número do meio", fatias > 0 && soma === centro, `${fatias} fatias · ${soma} × ${centro}`);
  await card.locator(".g-fatia").first().focus();
  await p.waitForTimeout(200);
  ok("a fatia com o foco (teclado) mostra a dica com o valor e o %", /do total/.test(await card.locator(".g-dica").textContent()));
  await card.locator(".g-rl.clicavel").first().click();
  await p.waitForTimeout(800);
  ok("clicar na legenda abre a Programação naquela situação", (await p.evaluate(() => location.hash)).includes("sit="));
  await p.click(".fsit.todas");
  await p.waitForTimeout(300);
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
  const doPainel = await p.evaluate(id => {
    const e = [...mkt.ev.log].reverse().find(x => x.alvo === id && x.tipo === "prev_parada");
    const os = mkt.ev.atividadeDaPreventiva(mkt.ev.porId(id, "preventiva"));
    return { via: e && e.dados.via && e.dados.via.decisao, os: os && { semana: os.semana, dia: os.dia, tipo: os.tipo } };
  }, id2);
  ok("a parada lançada pela decisão leva o título dela, para o Registro", doPainel.via === `Programar a parada da ${F2}`,
    JSON.stringify(doPainel));
  ok("e a parada virou a OS preventiva no dia, na Programação",
    !!doPainel.os && doPainel.os.semana != null && !!doPainel.os.dia && doPainel.os.tipo === "Preventiva", JSON.stringify(doPainel));

  // o número de reprogramações leva ao registro filtrado
  await p.locator('.kpis .clicavel:has-text("Reprogra")').click();
  await p.waitForTimeout(500);
  ok("Reprogramações no painel da aba abre as mudanças desse tipo",
    await p.evaluate(() => !!document.querySelector(".evento.mudanca") &&
      [...document.querySelectorAll(".evento.mudanca .tipo-mud")].every(c => c.textContent === "Reprogramação")));
}

// ── a preventiva ligada à Programação, os filtros, a frota e o Registro ─────
{
  const F = "F-LG" + Date.now().toString(36).slice(-4).toUpperCase();
  const { mes, dia } = await p.evaluate(async () => {
    const { mesDaData } = await import("/js/decisoes.js");
    const ref = mkt.M.hoje();
    let d = mkt.M.somaDias(ref, 3);
    while ([0, 6].includes(mkt.M.data(d).getUTCDay())) d = mkt.M.somaDias(d, 1);
    return { mes: mesDaData(ref), dia: d };
  });
  // parada marcada antes de a ligação existir: sem a OS no dia
  const idL = await p.evaluate(async ([f, mes, dia]) => {
    const ev = mkt.ev;
    const [e] = await ev.aplicar(ev.novaPreventiva({ ...mkt.M.moldePreventiva(), frota: f, mes, plano: "30 mil km",
      vence: mkt.M.somaDias(dia, 10), id: undefined }), { silencioso: true });
    await ev.aplicar(ev.informarDisponibilidade(ev.porId(e.alvo, "preventiva"), "agora"), { silencioso: true });
    await ev.aplicar({ ...ev.marcarParada(ev.porId(e.alvo, "preventiva"), dia, "Interna"), origem: "vinculo" }, { silencioso: true });
    return e.alvo;
  }, [F, mes, dia]);
  await p.evaluate(() => { location.hash = "#/preventivas?v=plano"; });
  await p.waitForSelector(".faixa-ligar", { timeout: 5000 }).catch(() => {});
  ok("a aba Preventivas avisa o que ainda não conversa com a Programação", await p.isVisible(".faixa-ligar"));
  // seção vazia não pode virar a palavra "null" na tela (append(null) escreve "null")
  const semNull = async () => p.evaluate(() => !/(^|\W)null(\W|$)/.test(document.querySelector("main").innerText));
  ok("nenhum \"null\" solto na aba Preventivas", await semNull());
  await p.click('.faixa-ligar button:has-text("Ver e ligar")');
  await p.waitForSelector(".caixa table");
  const linhaL = await p.evaluate(f => [...document.querySelectorAll(".caixa tbody tr")].map(t => t.textContent)
    .find(t => t.includes(f)) || "", F);
  ok("Ver e ligar mostra, frota por frota, o que vai acontecer", /cria a OS preventiva no dia da parada/.test(linhaL), linhaL);
  await p.click('.caixa footer button:has-text("Ligar")');
  await p.waitForTimeout(900);
  const osL = await p.evaluate(id => { const a = mkt.ev.atividadeDaPreventiva(mkt.ev.porId(id, "preventiva"));
    return a && { semana: a.semana, dia: a.dia }; }, idL);
  ok("e Ligar cria a OS preventiva no dia da parada", !!osL && osL.semana != null && !!osL.dia, JSON.stringify(osL));

  // a ficha da preventiva diz onde ela está na Programação, e leva até lá
  await p.evaluate(async id => { const pv = await import("/js/tela/preventivas.js"); pv.abrirFichaPrev(id, mkt.ctx); }, idL);
  await p.waitForSelector(".caixa");
  ok("a ficha da preventiva mostra a linha Na Programação", (await p.textContent(".caixa")).includes("Na Programação"));
  await p.click('.caixa button:has-text("Abrir na Programação")');
  await p.waitForTimeout(1000);
  const naProg = await p.evaluate(() => ({ hash: location.hash, caixa: !!document.querySelector(".caixa"),
    prev: document.querySelectorAll("tr.lin.prev, .at.prev").length,
    etiquetas: [...document.querySelectorAll(".etiquetas .etiqueta")].map(b => b.textContent) }));
  ok("Abrir na Programação fecha a ficha e abre a semana, com a OS preventiva em destaque",
    !naProg.caixa && /programacao/.test(naProg.hash) && naProg.prev > 0, JSON.stringify(naProg));
  ok("e o filtro da frota aparece como etiqueta", naProg.etiquetas.some(t => t.includes(`Frota: ${F}`)), JSON.stringify(naProg.etiquetas));
  await p.click(".etiquetas .limpar-filtros");
  await p.waitForTimeout(400);
  ok("Limpar filtros tira todos de uma vez", await p.evaluate(() =>
    document.querySelector(".etiquetas").hidden && !document.querySelector(".etiquetas .etiqueta")));

  // a carteira mostra há quanto tempo cada pendência espera
  const idC = await p.evaluate(async f => {
    const [e] = await mkt.ev.aplicar(mkt.ev.criar({ frota: f, atividade: "Fixar saia lateral da cabine LE",
      tipo: "Corretiva", prioridade: "P1", obs: "[01/09] TOP: saia solta" }), { silencioso: true });
    return e.alvo;
  }, F);
  await p.evaluate(f => { location.hash = "#/programacao?m=carteira&f=" + encodeURIComponent(f); }, F);
  await p.waitForTimeout(900);
  const idade = await p.evaluate(id => {
    const tr = document.querySelector(`tr.lin[data-id="${id}"]`);
    const t = tr && tr.querySelector(".tag.idade");
    return t && { txt: t.textContent, title: t.title, velha: t.classList.contains("velha"), p1: !!tr.querySelector(".tag.p1") };
  }, idC);
  ok("na carteira, a pendência mostra a prioridade e há quantos dias espera, com a fonte da data",
    !!idade && /^há \d+ d$/.test(idade.txt) && idade.velha && idade.p1 && /desde 01\/09\/\d{4} — dia do TOP/.test(idade.title),
    JSON.stringify(idade));
  await p.evaluate(() => { const b = document.querySelector(".etiquetas .limpar-filtros"); if (b) b.click(); });

  // a grade de frotas: o selo da parada
  await p.evaluate(() => { location.hash = "#/frota"; });
  await p.waitForTimeout(800);
  await p.fill(".cabec input.busca-frota", F.slice(2, -1));
  await p.waitForTimeout(400);
  const selos = await p.evaluate(f => {
    const c = [...document.querySelectorAll(".frota-chip")].find(x => x.querySelector("b").textContent === f);
    return c ? [...c.querySelectorAll(".selo")].map(x => x.textContent) : null;
  }, F);
  ok("na grade de frotas, o selo da parada marcada", !!selos && selos.some(t => /^parada \d\d\/\d\d$/.test(t)), JSON.stringify(selos));
  await p.locator(`.grade-frotas .frota-chip:has(b:text-is("${F}"))`).click();
  await p.waitForTimeout(700);
  const ficha = await p.evaluate(() => ({
    resumo: [...document.querySelectorAll(".resumo-frota .r-rot")].map(x => x.textContent),
    secoes: [...document.querySelectorAll("section.secao > h2")].map(h => h.firstChild.textContent),
    idade: !!document.querySelector("#frota-carteira .chip.idade") }));
  ok("a ficha da frota abre com o resumo: a preventiva do mês e a próxima na programação",
    ficha.resumo.some(t => t.startsWith("Preventiva de")) && ficha.resumo.includes("Próxima na programação"), JSON.stringify(ficha));
  ok("nenhum \"null\" solto na ficha da frota", await semNull());
  ok("as preventivas vêm primeiro, e a carteira mostra a idade",
    ficha.secoes[0] === "Preventivas do plano" && ficha.idade, JSON.stringify(ficha));
  await p.click(".resumo-frota button.prev");
  await p.waitForSelector(".caixa", { timeout: 3000 }).catch(() => {});
  ok("o quadro da preventiva abre a ficha dela", await p.isVisible(".caixa") && (await p.textContent(".caixa")).includes(F));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);

  // o Registro: o resumo do dia, o que saiu do Painel, pessoa e período
  await p.evaluate(() => { location.hash = "#/historico"; });
  await p.waitForSelector(".resumo-dia .numeros", { timeout: 5000 });
  const nPainel = await p.evaluate(() => { const c = [...document.querySelectorAll(".resumo-dia .cartao-num")]
    .find(x => x.textContent.includes("pelo Painel")); return c ? Number(c.querySelector(".v").textContent) : -1; });
  ok("o resumo do dia conta o que saiu do Painel hoje", nPainel >= 1, String(nPainel));
  ok("nenhum \"null\" solto no Registro", await semNull());
  await p.locator('.resumo-dia .cartao-num.clicavel:has-text("pelo Painel")').click();
  await p.waitForTimeout(500);
  const doPainelReg = await p.evaluate(() => ({ et: [...document.querySelectorAll(".etiquetas .etiqueta")].map(b => b.textContent),
    linhas: [...document.querySelectorAll(".dia-reg .evento")].map(e => ({ tag: !!e.querySelector(".tag.painel"),
      via: (e.querySelector(".via") || {}).textContent || "" })) }));
  ok("tocar nele filtra: só o que saiu do Painel, com a decisão escrita, e os filtros como etiquetas",
    doPainelReg.linhas.length >= 1 && doPainelReg.linhas.every(l => l.tag && l.via.startsWith("pela decisão:")) &&
    doPainelReg.et.some(t => t.includes("decisão do Painel")) && doPainelReg.et.some(t => t.includes("Dia:")), JSON.stringify(doPainelReg).slice(0, 400));
  await p.click(".etiquetas .limpar-filtros");
  await p.selectOption('select[aria-label="Pessoa"]', "Mateus");
  await p.click('.segmentos [data-periodo="hoje"]');
  await p.waitForTimeout(400);
  const porPessoa = await p.evaluate(() => ({
    autores: [...new Set([...document.querySelectorAll(".dia-reg .evento .autor")].map(a => a.textContent.replace(" — ", "")))],
    dias: document.querySelectorAll(".dia-reg").length,
    on: (document.querySelector('.segmentos [data-periodo="hoje"]') || {}).className || "" }));
  ok("pessoa e período: só o Mateus, só hoje, num grupo de dia", porPessoa.autores.join() === "Mateus" &&
    porPessoa.dias === 1 && porPessoa.on.includes("on"), JSON.stringify(porPessoa));
  await p.click(".etiquetas .limpar-filtros");
  await p.waitForTimeout(300);
  ok("e Limpar filtros volta para tudo", await p.evaluate(() => !document.querySelector(".etiquetas .etiqueta") &&
    document.querySelector('select[aria-label="Pessoa"]').value === ""));
}

// ── colar inspeção ou TOP: a mensagem vira pendências na carteira ─────────
{
  const num = String(5000 + Date.now() % 4000);
  const F = "F-" + num;
  await p.evaluate(async f => { await mkt.ev.aplicar(mkt.ev.criar({ frota: f, atividade: "Substituir lona de freio do segundo eixo LE",
    tipo: "Corretiva", origem: "Programada" }), { silencioso: true }); }, F);
  await p.evaluate(() => { location.hash = "#/programacao?m=carteira"; });
  await p.waitForTimeout(800);
  await p.click('.cabec button:has-text("Colar inspeção/TOP")');
  await p.waitForSelector(".caixa .colar-texto");
  const msg = [num, "*PENDENCIAS IDENTIFICADAS NA INSPEÇÃO*",
    "- Soldar trincas no lastro dianteiro LD;", "- Substituir lonas de freio do segundo eixo LE;",
    "- Reapertar tirantes folgados;", "- Freio puxando para a direita; ⚠️", "@Fulano enviar para o fornecedor", "psc"].join("\n");
  await p.fill(".caixa .colar-texto", msg);
  await p.waitForTimeout(500);
  const previa = await p.evaluate(() => ({
    frota: document.querySelector(".colar-bloco .colar-frota").value,
    fonte: document.querySelector(".colar-bloco select").value,
    linhas: [...document.querySelectorAll(".colar-tabela tr")].map(tr => ({ txt: tr.querySelector(".colar-item").value,
      on: tr.querySelector("input[type=checkbox]").checked, tags: tr.querySelector(".colar-tags").textContent,
      prio: tr.querySelector("select").value })),
    fora: (document.querySelector(".colar-fora summary") || {}).textContent || "",
    botao: document.querySelector(".caixa footer button.primario").textContent }));
  ok("colar a mensagem: a frota, de inspeção, quatro pendências e a conversa de fora",
    previa.frota === F && previa.fonte === "Inspeção" && previa.linhas.length === 4 && /^3 linhas ficaram de fora/.test(previa.fora), JSON.stringify(previa));
  ok("a que a frota já tem em aberto vem desmarcada, com o aviso; a urgente vem P1",
    !previa.linhas[1].on && /já está na carteira/.test(previa.linhas[1].tags) && previa.linhas[3].prio === "P1" &&
    previa.linhas[0].on && previa.botao === "Lançar 3 na carteira", JSON.stringify(previa.linhas));
  await p.selectOption('.caixa select[aria-label="Prioridade de todas"]', "P2");
  await p.selectOption('.caixa select[aria-label="Oficina de todas"]', "Terceirizada");
  // Enter num campo da prévia não lança
  await p.click(".colar-tabela tr:first-child .colar-item");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(200);
  ok("Enter num campo da prévia não lança tudo", await p.isVisible(".caixa .colar-texto"));
  await p.click('.caixa footer button:has-text("Lançar")');
  await p.waitForTimeout(900);
  const lancadas = await p.evaluate(f => mkt.ev.lista().filter(a => a.frota === f && a.obs && /Inspeção/.test(a.obs))
    .map(a => ({ t: a.atividade, p: a.prioridade, o: a.oficina, obs: a.obs, semana: a.semana })), F);
  ok("Lançar cria as três na carteira: P2 para todas, terceirizada, com o dia da inspeção na observação",
    lancadas.length === 3 && lancadas.every(a => a.p === "P2" && a.o === "Terceirizada" && /^\[\d\d\/\d\d\] Inspeção$/.test(a.obs) && a.semana == null),
    JSON.stringify(lancadas));
  const reg = await p.evaluate(f => { const e = [...mkt.ev.log].reverse().find(x => x.tipo === "criada" && x.dados.frota === f && /colada/.test(x.dados.fonte || ""));
    return e ? e.dados.fonte : ""; }, F);
  ok("e o Registro diz de onde veio", /^Inspeção de \d\d\/\d\d\/\d{4}, colada no site$/.test(reg), reg);

  // o PDF: um PDF de verdade, gerado aqui, com a mesma lista
  const gerador = await p.context().newPage();
  await gerador.setContent(`<pre style="font:14px sans-serif">${num}\nTOP da frota\n- Corrigir iluminação da placa;\n- Fixar para-lama traseiro LE;</pre>`);
  const pdf = await gerador.pdf();
  await gerador.close();
  await p.click('.cabec button:has-text("Colar inspeção/TOP")');
  await p.waitForSelector(".caixa .colar-texto");
  await p.setInputFiles('.caixa input[type=file]', { name: "top.pdf", mimeType: "application/pdf", buffer: pdf });
  await p.waitForSelector(".colar-tabela tr", { timeout: 8000 }).catch(() => {});
  const doPdf = await p.evaluate(() => ({ frota: (document.querySelector(".colar-bloco .colar-frota") || {}).value,
    fonte: (document.querySelector(".colar-bloco select") || {}).value,
    itens: [...document.querySelectorAll(".colar-item")].map(i => i.value) }));
  ok("soltar o PDF: o texto é lido e vira a mesma prévia, como TOP",
    doPdf.frota === F && doPdf.fonte === "TOP" && doPdf.itens.join("|") === "Corrigir iluminação da placa|Fixar para-lama traseiro LE",
    JSON.stringify(doPdf));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  // o Diagnóstico diz quanto do banco o registro ocupa
  await p.evaluate(() => { location.hash = "#/diagnostico"; });
  await p.waitForSelector(".diag-item", { timeout: 8000 }).catch(() => {});
  const espaco = await p.evaluate(() => [...document.querySelectorAll(".diag-item .tit")].map(t => t.textContent)
    .find(t => t.startsWith("Espaço no banco")) || "");
  ok("o Diagnóstico mostra o espaço no banco, contra os 500 MB do plano grátis", /≈ [\d,]+ MB de 500 MB \([\d,]+%\)$/.test(espaco), espaco);
}

// ── programar em lote: à vista, pela data, e no dia da parada ──────────────
{
  const num = String(6000 + Date.now() % 3000);
  const F = "F-" + num;
  const { ids, parada } = await p.evaluate(async f => {
    const ev = mkt.ev, M = mkt.M;
    const ids = [];
    for (const t of ["Trocar lâmpada do farol LD", "Fixar para-choque", "Corrigir vazamento de ar"]) {
      const [e] = await ev.aplicar(ev.criar({ frota: f, atividade: t, tipo: "Corretiva", origem: "Programada" }), { silencioso: true });
      ids.push(e.alvo);
    }
    const { mesDaData } = await import("/js/decisoes.js");
    let d = M.somaDias(M.hoje(), 4);
    while ([0, 6].includes(M.data(d).getUTCDay())) d = M.somaDias(d, 1);
    const [pe] = await ev.aplicar(ev.novaPreventiva({ ...M.moldePreventiva(), frota: f, mes: mesDaData(M.hoje()), plano: "1 ano",
      vence: M.somaDias(d, 10), id: undefined }), { silencioso: true });
    await ev.aplicar(ev.informarDisponibilidade(ev.porId(pe.alvo, "preventiva"), "agora"), { silencioso: true });
    await ev.aplicar(ev.marcarParada(ev.porId(pe.alvo, "preventiva"), d, "Interna"), { silencioso: true });
    return { ids, parada: d };
  }, F);
  const progDe = d => p.evaluate(x => mkt.ev.programacaoDoDia(x), d);

  // Programação: a barra aparece antes de marcar
  await p.evaluate(f => { location.hash = "#/programacao?m=carteira&f=" + encodeURIComponent(f); }, F);
  await p.waitForTimeout(900);
  await p.click(".filtros .programar-varias");
  await p.waitForTimeout(200);
  const barra = await p.evaluate(() => { const b = document.querySelector(".barra-sel");
    return { hidden: b.hidden, txt: b.textContent, prog: b.querySelector("button.primario").disabled }; });
  ok("Programar várias abre a barra antes de marcar, com Marcar todas e o Programar esperando",
    !barra.hidden && /Marque nas caixinhas/.test(barra.txt) && /Marcar todas \(3\)/.test(barra.txt) && barra.prog && !/null/.test(barra.txt),
    JSON.stringify(barra));
  await p.click('.barra-sel button:has-text("Marcar todas")');
  await p.click('.barra-sel button.primario:has-text("Programar")');
  await p.waitForSelector(".caixa .lote-lista");
  await p.click(`.caixa .lote-lista input[data-id="${ids[2]}"]`);
  const alvoDia = await p.evaluate(() => { let d = mkt.M.somaDias(mkt.M.hoje(), 7);
    while ([0, 6].includes(mkt.M.data(d).getUTCDay())) d = mkt.M.somaDias(d, 1); return d; });
  await p.fill('.caixa input[aria-label="Para o dia"]', alvoDia);
  await p.waitForTimeout(150);
  const esperado = await progDe(alvoDia);
  const sync = await p.evaluate(() => ({ sem: document.querySelector('.caixa input[aria-label="Semana"]').value,
    dia: document.querySelector('.caixa select[aria-label="Dia"]').value,
    botao: document.querySelector(".caixa footer button.primario").textContent }));
  ok("na caixa, a data preenche semana e dia, e desmarcar uma da lista tira ela do lote",
    sync.sem === String(esperado.semana) && sync.dia === esperado.dia && sync.botao === "Programar 2", JSON.stringify(sync));
  await p.click(".caixa footer button.primario");
  await p.waitForTimeout(900);
  const st = await p.evaluate(ids => ids.map(id => { const a = mkt.ev.porId(id); return [a.semana, a.dia]; }), ids);
  ok("Programar põe as duas no dia escolhido; a desmarcada continua na carteira",
    st[0][0] === esperado.semana && st[0][1] === esperado.dia && st[1][1] === esperado.dia && st[2][0] == null, JSON.stringify(st));
  ok("e a barra fecha", await p.evaluate(() => document.querySelector(".barra-sel").hidden));

  // Frota: a carteira inteira, no dia da parada da preventiva
  await p.evaluate(f => { location.hash = "#/frota?f=" + encodeURIComponent(f); }, F);
  await p.waitForTimeout(900);
  await p.click(".programar-carteira");
  await p.waitForSelector(".caixa .lote-lista", { timeout: 4000 }).catch(() => {});
  const rotParada = await p.evaluate(() => (document.querySelector(".caixa .campo-check") || {}).textContent || "");
  const curta = parada.split("-").reverse().slice(0, 2).join("/");
  ok("na ficha da Frota, Programar a carteira oferece o dia da parada da preventiva", rotParada.includes(curta), rotParada);
  await p.check(".caixa .usar-parada");
  await p.click(".caixa footer button.primario");
  await p.waitForTimeout(900);
  const naParada = await progDe(parada);
  const a2 = await p.evaluate(id => { const a = mkt.ev.porId(id); return [a.semana, a.dia]; }, ids[2]);
  ok("marcada a opção, a pendência vai para o dia da parada", a2[0] === naParada.semana && a2[1] === naParada.dia, JSON.stringify([a2, naParada]));

  // Colar inspeção/TOP já programando
  await p.evaluate(() => { location.hash = "#/programacao?m=carteira"; });
  await p.waitForTimeout(700);
  await p.click('.cabec button:has-text("Colar inspeção/TOP")');
  await p.waitForSelector(".caixa .colar-texto");
  await p.fill(".caixa .colar-texto", `${num}\n- Soldar suporte do para-lama LE;\n- Trocar palheta do limpador;`);
  await p.waitForTimeout(400);
  await p.click('.caixa .segmentos [data-destino="programar"]');
  await p.fill('.caixa .colar-quando input[aria-label="Para o dia"]', alvoDia);
  await p.waitForTimeout(150);
  const botaoColar = await p.textContent(".caixa footer button.primario");
  ok("no Colar, a opção Programar pede o dia e muda o botão", botaoColar === "Lançar 2 e programar", botaoColar);
  await p.click(".caixa footer button.primario");
  await p.waitForTimeout(900);
  const coladas = await p.evaluate(f => mkt.ev.lista().filter(a => a.frota === f && /Soldar suporte|palheta/.test(a.atividade))
    .map(a => [a.semana, a.dia, a.reprogramacoes]), F);
  ok("Lançar cria as duas já programadas no dia escolhido, sem contar como reprogramação",
    coladas.length === 2 && coladas.every(c => c[0] === esperado.semana && c[1] === esperado.dia && !c[2]), JSON.stringify(coladas));
}

// ── movimentação por categoria ─────────────────────────────────────────────
{
  const F = "F-MC" + Date.now().toString(36).slice(-4).toUpperCase();
  await p.evaluate(() => { location.hash = "#/movimentacoes"; });
  await p.waitForTimeout(800);
  await p.click('.cabec button:has-text("+ Nova")');
  await p.waitForSelector(".caixa .cat-escolha");
  await p.click('.caixa .cat-op[data-cat="top"]');
  const acaoTop = await p.inputValue('.caixa input[placeholder^="ex.: Coletar"]');
  ok("na nova movimentação, escolher a categoria Realizar TOP já preenche o 'O que fazer'", acaoTop === "Realizar TOP", acaoTop);
  await p.click('.caixa .cat-op[data-cat="buscar"]');
  const acaoBuscar = await p.inputValue('.caixa input[placeholder^="ex.: Coletar"]');
  ok("trocar a categoria troca o texto que ela tinha posto", acaoBuscar === "Buscar", acaoBuscar);
  await p.click('.caixa .cat-op[data-cat="top"]');
  await p.fill('.caixa input[placeholder="ex.: F-745"]', F);
  await p.fill('.caixa input[placeholder^="ex.: Cardan"]', "Matriz");
  await p.click('.caixa footer button:has-text("Registrar")');
  await p.waitForTimeout(900);
  const criada = await p.evaluate(f => { const m = mkt.ev.lista("movimentacao").find(x => x.frota === f);
    return m && { cat: m.categoria, acao: m.acao }; }, F);
  ok("e grava a categoria junto", !!criada && criada.cat === "top" && criada.acao === "Realizar TOP", JSON.stringify(criada));

  // mais duas da mesma frota, de outras categorias
  await p.evaluate(async f => {
    await mkt.ev.aplicar(mkt.ev.pedirMovimentacao({ frota: f, acao: "Coletar", destino: "Cardan Service", categoria: "buscar" }), { silencioso: true });
    await mkt.ev.aplicar(mkt.ev.pedirMovimentacao({ frota: f, acao: "", destino: "Box de lavagem" }), { silencioso: true });
  }, F);
  await p.click('.segmentos .seg-op:has-text("Em aberto")');
  await p.fill(".filtros .busca", F);
  await p.waitForTimeout(500);
  const tela = await p.evaluate(() => ({
    chips: [...document.querySelectorAll(".cat-faixa .cat-fsit")].map(b => b.dataset.cat),
    blocos: [...document.querySelectorAll(".so-tabela tr.cat-bloco")].map(t => t.dataset.cat),
    grupos: [...document.querySelectorAll(".so-cartao .mov-grupo-tit")].map(t => t.dataset.cat) }));
  ok("a lista separa por categoria, na ordem fixa, com o filtro de cada uma (a sem categoria vai pelo texto)",
    tela.chips.join() === "top,lavagem,buscar" && tela.blocos.join() === "top,lavagem,buscar" &&
    tela.grupos.join() === "top,lavagem,buscar", JSON.stringify(tela));
  await p.click('.cat-faixa .cat-fsit[data-cat="buscar"]');
  await p.waitForTimeout(300);
  const soBuscar = await p.evaluate(() => ({ linhas: document.querySelectorAll(".so-tabela tr.lin").length,
    blocos: document.querySelectorAll(".so-tabela tr.cat-bloco").length,
    selo: (document.querySelector(".so-cartao .chip.cat") || {}).textContent || "" }));
  ok("tocar na categoria deixa só ela, e o cartão mostra o selo", soBuscar.linhas === 1 && soBuscar.blocos === 0 &&
    /Buscar no fornecedor/.test(soBuscar.selo), JSON.stringify(soBuscar));
  await p.click('.cat-faixa .fsit.todas');
  await p.fill(".filtros .busca", "");

  // o Para você da operação, separado por categoria
  const paraVoce = await p.evaluate(async f => {
    const mod = await import("/js/tela/operacao.js");
    const div = document.createElement("div");
    const r = await mod.montar(div, mkt.ctx);
    const secs = [...div.querySelectorAll("section.sec-cat")].map(x => ({ cat: x.dataset.cat,
      tem: [...x.querySelectorAll(".at .tit")].some(t => t.textContent.startsWith(f)) }));
    if (r && r.desmontar) r.desmontar();
    return secs;
  }, F);
  const minhas = paraVoce.filter(x => x.tem).map(x => x.cat);
  ok("no Para você, as em aberto vêm em seções por categoria", ["top", "lavagem", "buscar"].every(c => minhas.includes(c)) &&
    paraVoce.map(x => x.cat).indexOf("top") < paraVoce.map(x => x.cat).indexOf("buscar"), JSON.stringify(paraVoce));
}

// ── designar o executante num toque, e em lote ─────────────────────────────
{
  const F = "F-EX" + Date.now().toString(36).slice(-4).toUpperCase();
  const ids = await p.evaluate(async f => {
    const r = [];
    for (const t of ["Trocar lâmpada da placa", "Fixar para-lama LD", "Revisar buzina"]) {
      const [e] = await mkt.ev.aplicar(mkt.ev.criar({ frota: f, atividade: t, tipo: "Corretiva", origem: "Programada" }), { silencioso: true });
      r.push(e.alvo);
    }
    return r;
  }, F);
  await p.evaluate(f => { location.hash = "#/programacao?m=carteira&f=" + encodeURIComponent(f); }, F);
  await p.waitForTimeout(900);
  const vazio = await p.textContent(`.so-tabela tr.lin[data-id="${ids[0]}"] td.c-quem .quem-btn`);
  ok("sem executante, a coluna mostra '+ executante' para tocar", vazio === "+ executante", vazio);
  await p.click(`.so-tabela tr.lin[data-id="${ids[0]}"] td.c-quem .quem-btn`);
  await p.waitForSelector(".caixa .quem-escolha");
  const NOME = "Adilton-" + Date.now().toString(36).slice(-3);
  await p.fill('.caixa input[placeholder^="outro nome"]', NOME);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(200);
  const aberta = await p.evaluate(n => ({ caixa: !!document.querySelector(".caixa"),
    chip: [...document.querySelectorAll(".caixa .quem-op.on")].map(b => b.textContent).includes(n) }), NOME);
  ok("um nome novo + Enter entra na lista, marcado, sem fechar a caixa", aberta.caixa && aberta.chip, JSON.stringify(aberta));
  await p.click('.caixa footer button:has-text("Salvar")');
  await p.waitForTimeout(700);
  const e1 = await p.evaluate(id => mkt.ev.porId(id).executantes, ids[0]);
  ok("Salvar designa o executante, e a linha não abre a ficha por engano", JSON.stringify(e1) === JSON.stringify([NOME]) &&
    !(await p.isVisible(".caixa")), JSON.stringify(e1));
  // o nome já usado aparece como botão para a próxima
  await p.click(`.so-tabela tr.lin[data-id="${ids[1]}"] td.c-quem .quem-btn`);
  await p.waitForSelector(".caixa .quem-escolha");
  await p.click(`.caixa .quem-op:text-is("${NOME}")`);
  await p.click('.caixa footer button:has-text("Salvar")');
  await p.waitForTimeout(700);
  ok("na próxima, o nome já está nos botões: um toque e salvar",
    JSON.stringify(await p.evaluate(id => mkt.ev.porId(id).executantes, ids[1])) === JSON.stringify([NOME]));
  // em lote: marcar as três e somar um segundo nome
  await p.click(".filtros .programar-varias");
  await p.click('.barra-sel button:has-text("Marcar todas")');
  await p.click('.barra-sel button:has-text("Executante")');
  await p.waitForSelector(".caixa .quem-escolha");
  await p.fill('.caixa input[placeholder^="outro nome"]', "Gabriel");
  await p.keyboard.press("Enter");
  // o que todas já tinham em comum não vem marcado (a terceira não tinha ninguém)
  await p.click('.caixa .segmentos [data-modo="somar"]');
  await p.click('.caixa footer button:has-text("Salvar")');
  await p.waitForTimeout(800);
  const lote = await p.evaluate(ids => ids.map(id => mkt.ev.porId(id).executantes), ids);
  ok("em lote, 'Somar aos que já têm' põe o Gabriel em todas sem tirar ninguém",
    JSON.stringify(lote) === JSON.stringify([[NOME, "Gabriel"], [NOME, "Gabriel"], ["Gabriel"]]), JSON.stringify(lote));
  ok("e o registro guarda o antes e o depois", await p.evaluate(id => {
    const e = [...mkt.ev.log].reverse().find(x => x.alvo === id && x.tipo === "editada");
    return !!e && JSON.stringify(e.dados.de.executantes) === "[]" && JSON.stringify(e.dados.para.executantes) === '["Gabriel"]';
  }, ids[2]));
  await p.evaluate(() => { const b = document.querySelector(".etiquetas .limpar-filtros"); if (b) b.click(); });
}

// ── o quadro da Semana: arrastar e soltar ─────────────────────────────────
{
  const F = "F-QD" + Date.now().toString(36).slice(-4).toUpperCase();
  const [id1, id2] = await p.evaluate(async f => {
    const r = [];
    for (const t of ["Trocar retrovisor LE", "Regular freio de estacionamento"]) {
      const [e] = await mkt.ev.aplicar(mkt.ev.criar({ frota: f, atividade: t, tipo: "Corretiva", origem: "Programada" }), { silencioso: true });
      r.push(e.alvo);
    }
    return r;
  }, F);
  await p.evaluate(() => { location.hash = "#/semana?v=quadro"; });
  await p.waitForSelector(".quadro");
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.fill(".q-busca", F);
  await p.waitForTimeout(300);
  ok("o quadro abre com a carteira à esquerda, e a busca acha a frota",
    await p.locator(`.q-origem .q-cartao[data-id="${id1}"]`).count() === 1 &&
    await p.locator(".q-origem .q-cartao").count() === 2);
  await p.locator(`.q-origem .q-cartao[data-id="${id1}"]`).dragTo(p.locator('.q-dia[data-dia="Qua"]'));
  await p.waitForTimeout(600);
  const a1 = await p.evaluate(id => { const a = mkt.ev.porId(id); const e = [...mkt.ev.log].reverse().find(x => x.alvo === id);
    return { dia: a.dia, semana: a.semana, tipo: e.tipo, caixa: !!document.querySelector(".caixa") }; }, id1);
  ok("da carteira para Qua: programa na hora, sem pedir motivo",
    a1.dia === "Qua" && a1.semana != null && a1.tipo === "programada" && !a1.caixa, JSON.stringify(a1));
  ok("a busca continua digitada depois de repintar", (await p.inputValue(".q-busca")) === F);
  await p.locator(`.q-dia[data-dia="Qua"] .q-cartao[data-id="${id1}"]`).dragTo(p.locator('.q-dia[data-dia="Sex"]'));
  await p.waitForSelector(".caixa input");
  await p.click(".caixa footer button.primario");
  await p.waitForTimeout(250);
  ok("mudar de dia sem motivo não passa", await p.isVisible(".caixa") &&
    (await p.evaluate(id => mkt.ev.porId(id).dia, id1)) === "Qua");
  await p.fill(".caixa input", "peça chegou na sexta");
  await p.click(".caixa footer button.primario");
  await p.waitForTimeout(600);
  const a2 = await p.evaluate(id => { const a = mkt.ev.porId(id); const e = [...mkt.ev.log].reverse().find(x => x.alvo === id);
    return { dia: a.dia, tipo: e.tipo, motivo: e.motivo, de: e.dados.de.dia }; }, id1);
  ok("de Qua para Sex: reprogramação com o motivo e o antes no registro",
    a2.dia === "Sex" && a2.tipo === "reprogramada" && a2.motivo === "peça chegou na sexta" && a2.de === "Qua", JSON.stringify(a2));
  await p.locator(`.q-dia[data-dia="Sex"] .q-cartao[data-id="${id1}"]`).dragTo(p.locator('.q-dia[data-dia="Seg"]'));
  await p.waitForSelector(".caixa input");
  await p.click('.caixa footer button:has-text("Cancelar")');
  await p.waitForTimeout(300);
  ok("desistir do motivo deixa onde estava", (await p.evaluate(id => mkt.ev.porId(id).dia, id1)) === "Sex");
  await p.locator(`.q-dia[data-dia="Sex"] .q-cartao[data-id="${id1}"]`).dragTo(p.locator(".q-origem"));
  await p.waitForSelector(".caixa input");
  await p.fill(".caixa input", "volta para a carteira");
  await p.click(".caixa footer button.primario");
  await p.waitForTimeout(600);
  ok("soltar na coluna da esquerda tira da programação",
    (await p.evaluate(id => mkt.ev.porId(id).semana, id1)) == null &&
    await p.locator(`.q-origem .q-cartao[data-id="${id1}"]`).count() === 1);
  await p.evaluate(async id => {
    const { ano, semana } = mkt.M.semanaAtual();
    await mkt.ev.aplicar(mkt.ev.reprogramar(mkt.ev.porId(id), { ano, semana, dia: "Ter", dias: 1, hh: 0 }), { silencioso: true });
    await mkt.ev.aplicar(mkt.ev.concluir(mkt.ev.porId(id), mkt.M.hoje()), { silencioso: true });
  }, id2);
  await p.waitForTimeout(500);
  const feito = await p.evaluate(id => {
    const c = document.querySelector(`.q-dia[data-dia="Ter"] .q-cartao[data-id="${id}"]`);
    return c && { arrasta: c.getAttribute("draggable"), feito: c.classList.contains("feito") };
  }, id2);
  ok("a concluída aparece no dia, apagada, e não arrasta", !!feito && feito.feito && feito.arrasta !== "true", JSON.stringify(feito));
  await p.setViewportSize({ width: 390, height: 800 });
  await p.evaluate(() => { location.hash = "#/hoje"; });
  await p.waitForTimeout(300);
  await p.evaluate(() => { location.hash = "#/semana?v=quadro"; });
  await p.waitForTimeout(700);
  ok("no celular a Semana fica em lista, sem quadro", !(await p.locator(".quadro").count()) &&
    !(await p.isVisible('.segmentos.so-largo')));
  await p.setViewportSize({ width: 1280, height: 860 });
  await p.evaluate(() => { location.hash = "#/semana?v=lista"; });
  await p.waitForTimeout(400);
}

// ── OS na atividade já concluída ──────────────────────────────────────────
{
  const F = "F-OC" + Date.now().toString(36).slice(-4).toUpperCase();
  const OSA = String(300000 + Date.now() % 600000), OSB = String(Number(OSA) + 7);
  const [ida, idb] = await p.evaluate(async f => {
    const r = [];
    for (const t of ["Trocar lâmpada do baú", "Fixar tampa da bateria"]) {
      const [e] = await mkt.ev.aplicar(mkt.ev.criar({ frota: f, atividade: t, tipo: "Corretiva", origem: "Programada" }), { silencioso: true });
      await mkt.ev.aplicar(mkt.ev.concluir(mkt.ev.porId(e.alvo), mkt.M.hoje()), { silencioso: true });
      r.push(e.alvo);
    }
    location.hash = "#/programacao?m=tudo&os=sem";
    return r;
  }, F);
  await p.waitForTimeout(800);
  await p.fill(".filtros .busca", F);
  await p.waitForTimeout(500);
  ok("o filtro 'sem OS' mostra também as concluídas, com o campo para digitar",
    await p.locator(`.so-tabela input.os-in[data-id="${ida}"]`).count() === 1 &&
    await p.locator(`.so-tabela input.os-in[data-id="${idb}"]`).count() === 1);
  await p.click(`.so-tabela input.os-in[data-id="${ida}"]`);
  await p.keyboard.type(OSA);
  await p.keyboard.press("Enter");
  await p.waitForFunction(id => mkt.ev.porId(id).os, ida, { timeout: 5000 }).catch(() => {});
  const a = await p.evaluate(id => { const x = mkt.ev.porId(id); return { os: x.os, feita: mkt.M.feita(x) }; }, ida);
  ok("a concluída ganha a OS e continua concluída", a.os === OSA && a.feita, JSON.stringify(a));
  await p.evaluate(async id => { const c = await import("/js/tela/comum.js"); c.abrirFicha(id, mkt.ctx); }, idb);
  await p.waitForSelector('.caixa footer button:has-text("Anotar a OS")');
  await p.click('.caixa footer button:has-text("Anotar a OS")');
  await p.waitForSelector('.caixa input[placeholder="ex.: 022475"]');
  await p.fill('.caixa input[placeholder="ex.: 022475"]', OSB);
  await p.click('.caixa footer button:has-text("Gravar")');
  await p.waitForTimeout(700);
  ok("pela ficha (o caminho do celular), Anotar a OS grava na concluída",
    (await p.evaluate(id => mkt.ev.porId(id).os, idb)) === OSB);
  await p.evaluate(() => { document.querySelectorAll(".caixa .x").forEach(b => b.click()); });
  await p.evaluate(() => { const b = document.querySelector(".etiquetas .limpar-filtros"); if (b) b.click(); });
  await p.waitForTimeout(300);
}

// ── Preventivas: o que tem pra fazer, numa olhada ──────────────────────────
{
  const F = "F-PF" + Date.now().toString(36).slice(-4).toUpperCase();
  const OSP = String(400000 + Date.now() % 500000);
  const { ids, mes } = await p.evaluate(async f => {
    const { mesDaData } = await import("/js/decisoes.js");
    const ev = mkt.ev, ref = mkt.M.hoje(), mes = mesDaData(ref);
    const nova = async (plano, vence) => (await ev.aplicar(ev.novaPreventiva({ ...mkt.M.moldePreventiva(), frota: f, mes, plano,
      vence, id: undefined }), { silencioso: true }))[0].alvo;
    const lib = await nova("1 ano", mkt.M.somaDias(ref, 9));
    await ev.aplicar(ev.informarDisponibilidade(ev.porId(lib, "preventiva"), "agora"), { silencioso: true });
    const sem = await nova("15 mil km", mkt.M.somaDias(ref, 12));
    return { ids: { lib, sem }, mes };
  }, F);
  await p.evaluate(() => { location.hash = "#/preventivas?v=plano"; });
  await p.waitForSelector(".pf-quadro");
  await p.fill(".filtros .busca", F);
  await p.waitForTimeout(500);
  const filas = await p.evaluate(ids => ({
    programar: !!document.querySelector(`.pf-col[data-fila="programar"] .pf-lin[data-id="${ids.lib}"]`),
    liberar: !!document.querySelector(`.pf-col[data-fila="liberar"] .pf-lin[data-id="${ids.sem}"]`),
    botao: (document.querySelector(`.pf-col[data-fila="programar"] .pf-lin[data-id="${ids.lib}"] button`) || {}).textContent || "",
    semNull: !/(^|\W)null(\W|$)/.test(document.querySelector("main").innerText),
  }), ids);
  ok("a liberada cai em 'Programar a parada' e a sem liberação em 'Cobrar a liberação'",
    filas.programar && filas.liberar, JSON.stringify(filas));
  ok("o botão já diz a data sugerida para a parada", /^Programar \d\d\/\d\d$/.test(filas.botao), filas.botao);
  ok("nenhum \"null\" solto nas filas", filas.semNull);
  await p.click(`.pf-col[data-fila="programar"] .pf-lin[data-id="${ids.lib}"] button`);
  await p.waitForSelector(".caixa input[type=date]");
  const sugerida = await p.inputValue(".caixa input[type=date]");
  ok("e abre a caixa da parada com essa data preenchida", sugerida && filas.botao.endsWith(sugerida.slice(8, 10) + "/" + sugerida.slice(5, 7)),
    sugerida);
  await p.click('.caixa footer button:has-text("Cancelar")');
  await p.waitForTimeout(300);
  // a OS da preventiva, digitada na linha da tabela
  await p.click(`.grade.prev input.os-in[data-id="${ids.sem}"]`);
  await p.keyboard.type(OSP);
  await p.keyboard.press("Enter");
  await p.waitForFunction(id => mkt.ev.porId(id, "preventiva").os, ids.sem, { timeout: 5000 }).catch(() => {});
  ok("a OS da preventiva se digita na linha, com Enter",
    (await p.evaluate(id => mkt.ev.porId(id, "preventiva").os, ids.sem)) === OSP);
  await p.fill(".filtros .busca", "");
  await p.waitForTimeout(300);
}

// ── cópias antigas do aparelho: somem da tela, e o lançado nelas vai para a certa ──
{
  const F = "F-CP" + Date.now().toString(36).slice(-4).toUpperCase();
  const COPIA = "mu" + Date.now().toString(36) + "cp";
  // a de verdade, no banco
  const real = await p.evaluate(async f => {
    const [e] = await mkt.ev.aplicar(mkt.ev.criar({ frota: f, atividade: "Repor cortinas da cabine",
      tipo: "Corretiva", origem: "Programada", oficina: "Interna" }), { silencioso: true });
    await mkt.ev.sincronizar();
    return e.alvo;
  }, F);
  // a cópia antiga: gravada neste navegador antes da sincronização (sem a marca `enviado`)
  await p.evaluate(async ([f, id]) => {
    const ev = { id: "imp-" + id, seq: 1, ts: "2026-09-16T02:04:03.000Z", autor: "Mateus", tipo: "importada",
      alvo: id, alvo_tipo: "atividade", origem: "planilha",
      dados: { ...mkt.M.molde(), frota: f, atividade: "REPOR CORTINAS DA CABINE", fonte: "planilha antiga" } };
    await new Promise((ok, erro) => {
      const r = indexedDB.open("mkt");
      r.onerror = () => erro(r.error);
      r.onsuccess = () => { const db = r.result; const tx = db.transaction("eventos", "readwrite");
        tx.objectStore("eventos").put(ev); tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => erro(tx.error); };
    });
  }, [F, COPIA]);
  // a baixa dada na cópia (foi para o banco apontando para ela)
  await p.evaluate(async id => {
    await mkt.ev.aplicar({ tipo: "concluida", alvo: id, alvo_tipo: "atividade", dados: { em: mkt.M.hoje() } }, { silencioso: true });
    await mkt.ev.sincronizar();
  }, COPIA);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const vistas = await p.evaluate(f => mkt.ev.lista().filter(a => a.frota === f).map(a => a.id), F);
  ok("depois de recarregar, a cópia antiga some: a atividade aparece uma vez só",
    JSON.stringify(vistas) === JSON.stringify([real]), JSON.stringify(vistas));
  await p.waitForFunction(() => /cópias antigas/.test(document.querySelector("#faixa")?.textContent || ""), null, { timeout: 8000 })
    .catch(() => {});
  const faixa = await p.textContent("#faixa");
  ok("a faixa avisa que um lançamento caiu numa cópia antiga", /caiu em cópias antigas/.test(faixa), faixa);
  await p.click('#faixa button:has-text("Ver e corrigir")');
  await p.waitForSelector(".caixa .tabela-rolagem", { timeout: 5000 });
  const tabela = await p.textContent(".caixa .tabela-rolagem");
  ok("a caixa mostra a cópia, a baixa e a atividade certa", tabela.includes(F) && tabela.includes("baixa em") && tabela.includes(real), tabela);
  await p.click('.caixa footer button:has-text("Levar 1 para as certas")');
  await p.waitForTimeout(1000);
  const certa = await p.evaluate(id => mkt.ev.porId(id).concluida_em, real);
  ok("Levar dá a baixa na atividade de verdade, com a data da cópia", certa === await p.evaluate(() => mkt.M.hoje()), certa);
  await p.waitForTimeout(600);
  ok("e o aviso some", !/cópias antigas/.test(await p.textContent("#faixa")));
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
