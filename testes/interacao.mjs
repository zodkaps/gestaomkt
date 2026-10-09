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
