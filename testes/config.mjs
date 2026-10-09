// A promessa de pôr a chave no código: ninguém cola nada.
//
//     node testes/config.mjs
//
// Monta uma cópia do site com o `config.js` preenchido apontando para um
// PostgREST de mentira, abre no navegador e confere que o site já nasce ligado
// e que a senha é aceita de primeira. Sem este teste, "preencher o config.js
// resolve" é só uma frase no LEIAME.
//
// Precisa do servidor de mentira em pé — `testes/supabase_falso.mjs`.
import { servirCopia, EQUIPE_TESTE, emailDoTeste } from "./sitefalso.mjs";

const NUVEM = process.env.NUVEM_FALSA || "http://127.0.0.1:8124";
const PORTA = 8125;

let chromium;
try { ({ chromium } = (await import("/opt/node-tools/node_modules/playwright/index.js")).default); }
catch (e) { console.log("Playwright não disponível — pulando."); process.exit(0); }

const site = servirCopia({ nuvem: NUVEM, porta: PORTA });

let falhou = 0;
const ok = (nome, cond, detalhe = "") => {
  console.log(`  ${cond ? "ok  " : "FALHA"} ${nome}${detalhe && !cond ? " — " + detalhe : ""}`);
  if (!cond) falhou++;
};

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await nav.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const erros = [];
p.on("pageerror", e => erros.push(e.message));

await p.goto(site.endereco, { waitUntil: "networkidle" });
await p.waitForTimeout(600);

const estado = await p.evaluate(() => ({
  ligada: mkt.nuvem.ligada(),
  endereco: mkt.nuvem.endereco(),
  podeDigitar: !document.querySelector('input[placeholder="Seu e-mail"]').disabled,
}));
ok("abre já ligado, sem ninguém colar nada", estado.ligada, JSON.stringify(estado));
ok("e o endereço é o do config", estado.endereco === NUVEM, estado.endereco);
ok("a tela de entrar aceita digitar", estado.podeDigitar);

// ── o defeito que trancou a equipe: e-mail inventado ──────────────────────
// A primeira versão fazia "Pedro" virar pedro@makro.local. O Supabase recusa
// domínio de teste, e este servidor de mentira deixava passar — os testes
// ficavam verdes com um cadastro que nunca funcionaria de verdade.
const direto = await fetch(`${NUVEM}/auth/v1/signup`, { method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "pedro@makro.local", password: "makro2026" }) });
ok("o servidor de teste recusa domínio de teste, como o Supabase",
  direto.status === 400, String(direto.status));
const inventado = await p.evaluate(async () => {
  try { await mkt.nuvem.criarAcesso("pedro@makro.local", "makro2026", "Pedro"); return ""; }
  catch (e) { return e.message; }
});
ok("e o site avisa em português, antes de tentar",
  inventado.includes("não aceita") && !/invalid/i.test(inventado), inventado);

await p.evaluate(async equipe => {
  for (const q of equipe) {
    try { await mkt.nuvem.criarAcesso(q.email, "makro2026", q.nome); } catch (e) { /* já existe */ }
  }
  await mkt.nuvem.sair();
}, EQUIPE_TESTE);
await p.fill('input[placeholder="Seu e-mail"]', emailDoTeste("Mateus"));
await p.fill('input[placeholder="Senha"]', "makro2026");
await p.click('button[type=submit]');
await p.waitForTimeout(2500);
const dentro = await p.evaluate(() => ({ nome: mkt.pessoas.nome(), papel: mkt.pessoas.papel() }));
ok("entra com e-mail e senha de primeira", dentro.nome === "Mateus" && dentro.papel === "pcm",
  JSON.stringify(dentro));
ok("sem erro de página", erros.length === 0, erros.slice(0, 2).join(" | "));

// ── as mensagens de instalação ────────────────────────────────────────────
// Estes três casos acontecem quando falta um passo no painel do Supabase. Sem
// tradução, a pessoa lê "42P01 relation does not exist" e liga perguntando.
const falhar = async modo => {
  await fetch(`${NUVEM}/__falha`, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ modo }) });
};
const mensagemDe = async () => p.evaluate(async () => {
  try { await mkt.nuvem.lerPessoas(); return ""; } catch (e) { return e.message; }
});

await falhar("tabela");
const m1 = await mensagemDe();
ok("tabela faltando manda rodar os dois arquivos SQL",
  m1.includes("01_esquema") && m1.includes("02_acesso") && !m1.includes("42P01"), m1);

await falhar("permissao");
const m2 = await mensagemDe();
ok("permissão faltando aponta o 02_acesso.sql",
  m2.includes("02_acesso") && !m2.includes("42501"), m2);

// entrou, mas o e-mail não está na tabela `pessoas`
await falhar("sem_pessoa");
await p.evaluate(async () => {
  await mkt.pessoas.sair();
  await mkt.dados.gravarMeta("elenco", []);   // navegador novo, sem cópia local
});
await p.goto(site.endereco, { waitUntil: "networkidle" });
await p.waitForTimeout(400);
await p.fill('input[placeholder="Seu e-mail"]', emailDoTeste("Mateus"));
await p.fill('input[placeholder="Senha"]', "makro2026");
await p.click('button[type=submit]');
await p.waitForTimeout(1800);
const semPapel = await p.evaluate(() => ({
  texto: (document.querySelector("#entrar-tela") || {}).textContent || "",
  menu: document.querySelectorAll("#menu nav a").length,
}));
ok("quem entra sem papel vê a explicação, não um menu vazio",
  semPapel.texto.includes("ainda não tem papel") &&
  semPapel.texto.includes(emailDoTeste("Mateus")) && semPapel.menu === 0,
  JSON.stringify(semPapel).slice(0, 140));

// ── a armadilha da confirmação de e-mail ──────────────────────────────────
// Com a confirmação ligada (que é como um projeto Supabase vem de fábrica), os
// acessos nasceriam presos. O site tem de recusar ANTES de criar, não explicar
// depois que os quatro já estão travados.
await falhar("confirmacao");
const recusa = await p.evaluate(async () => {
  try { await mkt.nuvem.criarAcesso("preso@makroteste.com.br", "makro2026", "Teste Preso"); return ""; }
  catch (e) { return e.message; }
});
ok("recusa criar acesso com a confirmação ligada",
  recusa.includes("confirmação de e-mail ligada") && recusa.includes("Confirm email"), recusa);

await falhar("");
// E-mail único por execução: o servidor de mentira guarda as contas entre uma
// execução e outra, e repetir faria o teste falhar por "já existe".
const criou = await p.evaluate(async e => {
  try { await mkt.nuvem.criarAcesso(e, "makro2026", "Teste"); return "criou"; }
  catch (x) { return x.message; }
}, `teste-${Date.now().toString(36)}@makroteste.com.br`);
ok("com a confirmação desligada, cria normalmente", criou === "criou", criou);

// ── e-mail no primeiro acesso, só a senha depois ──────────────────────────
// Entrar pelo e-mail é o que o Supabase exige; o atrito disso no dia a dia é
// o que estes três cuidam.
await p.evaluate(() => mkt.pessoas.sair());
await p.goto(site.endereco, { waitUntil: "networkidle" });
await p.waitForTimeout(500);
const lembrado = await p.inputValue('input[placeholder="Seu e-mail"]');
ok("o aparelho lembra o e-mail de quem entrou por último",
  lembrado === emailDoTeste("Mateus"), lembrado);

// Este aparelho não conhece a equipe ainda (a cópia de `pessoas` veio vazia
// no teste de quem não tem papel): pelo nome, não há como saber o e-mail.
await p.fill('input[placeholder="Seu e-mail"]', "Mateus");
await p.fill('input[placeholder="Senha"]', "makro2026");
await p.click('button[type=submit]');
await p.waitForTimeout(800);
const pedeEmail = await p.evaluate(() =>
  (document.querySelector("#entrar-tela .erro") || {}).textContent || "");
ok("num aparelho que não conhece ninguém, pelo nome ele pede o e-mail",
  pedeEmail.includes("Digite o seu e-mail"), pedeEmail);

await p.fill('input[placeholder="Seu e-mail"]', emailDoTeste("Mateus"));
await p.click('button[type=submit]');
await p.waitForTimeout(2200);
await p.evaluate(() => mkt.pessoas.sair());
await p.goto(site.endereco, { waitUntil: "networkidle" });
await p.waitForTimeout(500);
await p.fill('input[placeholder="Seu e-mail"]', "lucas");
await p.fill('input[placeholder="Senha"]', "makro2026");
await p.click('button[type=submit]');
await p.waitForTimeout(2200);
const peloNome = await p.evaluate(() => ({ nome: mkt.pessoas.nome(), papel: mkt.pessoas.papel() }));
ok("num aparelho onde alguém da equipe já entrou, o nome basta",
  peloNome.nome === "Lucas" && peloNome.papel === "pcm", JSON.stringify(peloNome));

// de volta ao Mateus, para o diagnóstico abaixo
await p.evaluate(() => mkt.pessoas.sair());
await p.goto(site.endereco, { waitUntil: "networkidle" });
await p.waitForTimeout(400);
await p.fill('input[placeholder="Seu e-mail"]', emailDoTeste("Mateus"));
await p.fill('input[placeholder="Senha"]', "makro2026");
await p.click('button[type=submit]');
await p.waitForTimeout(2200);

// ── o diagnóstico aponta o item certo ─────────────────────────────────────
// Uma tela, uma passada. O que isto prova é que cada falha acende o SEU item e
// não acende os outros — um diagnóstico que acusa tudo junto não serve.
const diag = () => p.evaluate(async () => {
  const itens = await mkt.nuvem.diagnostico();
  return Object.fromEntries(itens.map(i => [i.nome, i.estado]));
});

const bom = await diag();
ok("com tudo de pé, nada é acusado",
  Object.values(bom).every(v => v === "ok"), JSON.stringify(bom));

await falhar("provedor_off");
const d1 = await diag();
ok("provedor Email desligado acende só o provedor",
  d1.provedor === "falta" && d1.config === "ok" && d1.confirmacao === "ok" &&
  d1.eventos === "ok" && d1.pessoas === "ok" && d1.eu === "ok", JSON.stringify(d1));

await falhar("confirmacao");
const d2 = await diag();
ok("Confirm email ligado acende só a confirmação",
  d2.confirmacao === "falta" && d2.provedor === "ok" && d2.eventos === "ok",
  JSON.stringify(d2));

await falhar("tabela");
const d3 = await diag();
ok("tabelas faltando acendem as duas tabelas",
  d3.eventos === "falta" && d3.pessoas === "falta" && d3.provedor === "ok",
  JSON.stringify(d3));

await falhar("permissao");
const d4 = await diag();
ok("banco recusando com a sessão aberta aponta o 02_acesso.sql",
  d4.eventos === "falta" && d4.pessoas === "falta", JSON.stringify(d4));

await falhar("projeto_fora");
const d5 = await diag();
ok("projeto fora do ar acende o endereço e não finge conferir o resto",
  d5.config === "falta" && Object.keys(d5).length === 1, JSON.stringify(d5));

// ── e a tela desenha o que ele precisa ler ────────────────────────────────
await falhar("provedor_off");
const naTela = await p.evaluate(async () => {
  location.hash = "#/diagnostico";
  await new Promise(r => setTimeout(r, 1600));
  const itens = [...document.querySelectorAll(".diag-item")].map(n => ({
    classe: n.className, texto: n.textContent,
  }));
  return { itens, resumo: (document.querySelector(".diag-resumo") || {}).textContent || "" };
});
const oProvedor = naTela.itens.find(i => i.texto.includes("Provedor Email"));
ok("a tela marca o provedor em vermelho e diz onde ligar",
  !!oProvedor && oProvedor.classe.includes("ruim") &&
  oProvedor.texto.includes("Sign In / Providers") &&
  naTela.resumo.toLowerCase().includes("falta"),
  JSON.stringify(naTela.itens.map(i => i.classe)) + " · " + naTela.resumo);
ok("e os arquivos SQL são servidos para o botão de copiar",
  (await (await fetch(site.endereco + "sql/02_acesso.sql")).text()).includes("create policy"));

// ── a porta não tranca: o diagnóstico abre sem ninguém dentro ─────────────
// `reload`, não `goto`: a aba já estava nesta mesma URL com este mesmo hash, e
// navegar para onde já se está não recarrega nada — o teste leria a tela velha.
await p.evaluate(async () => { await mkt.pessoas.sair(); location.hash = "#/diagnostico"; });
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1600);
const deFora = await p.evaluate(() => ({
  hash: location.hash,
  cartao: !!document.querySelector("#entrar-tela .cartao-entrar.larga"),
  itens: document.querySelectorAll(".diag-item").length,
}));
ok("sem ninguém entrado, o diagnóstico ainda abre",
  deFora.hash === "#/diagnostico" && deFora.cartao && deFora.itens > 0,
  JSON.stringify(deFora));

await falhar("");
await nav.close();
site.fechar();
console.log(falhou ? `\n${falhou} falharam` : "\ntudo como projetado");
process.exit(falhou ? 1 : 0);
