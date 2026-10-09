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
import { servirCopia } from "./sitefalso.mjs";

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
  podeDigitar: !document.querySelector('input[placeholder="Seu nome"]').disabled,
}));
ok("abre já ligado, sem ninguém colar nada", estado.ligada, JSON.stringify(estado));
ok("e o endereço é o do config", estado.endereco === NUVEM, estado.endereco);
ok("a tela de entrar aceita digitar", estado.podeDigitar);

await p.evaluate(async () => {
  for (const q of mkt.pessoas.SUGESTAO) {
    try { await mkt.nuvem.criarAcesso(q.nome, "makro2026", q.papel); } catch (e) { /* já existe */ }
  }
  await mkt.nuvem.sair();
});
await p.fill('input[placeholder="Seu nome"]', "Mateus");
await p.fill('input[placeholder="Senha"]', "makro2026");
await p.click('button[type=submit]');
await p.waitForTimeout(2500);
const dentro = await p.evaluate(() => ({ nome: mkt.pessoas.nome(), papel: mkt.pessoas.papel() }));
ok("entra com nome e senha de primeira", dentro.nome === "Mateus" && dentro.papel === "pcm",
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
await p.fill('input[placeholder="Seu nome"]', "Mateus");
await p.fill('input[placeholder="Senha"]', "makro2026");
await p.click('button[type=submit]');
await p.waitForTimeout(1800);
const semPapel = await p.evaluate(() => ({
  texto: (document.querySelector("#entrar-tela") || {}).textContent || "",
  menu: document.querySelectorAll("#menu nav a").length,
}));
ok("quem entra sem papel vê a explicação, não um menu vazio",
  semPapel.texto.includes("ainda não tem papel") &&
  semPapel.texto.includes("mateus@makro.local") && semPapel.menu === 0,
  JSON.stringify(semPapel).slice(0, 140));

// ── a armadilha da confirmação de e-mail ──────────────────────────────────
// Com a confirmação ligada (que é como um projeto Supabase vem de fábrica), os
// acessos nasceriam presos. O site tem de recusar ANTES de criar, não explicar
// depois que os quatro já estão travados.
await falhar("confirmacao");
const recusa = await p.evaluate(async () => {
  try { await mkt.nuvem.criarAcesso("Teste Preso", "makro2026", "pcm"); return ""; }
  catch (e) { return e.message; }
});
ok("recusa criar acesso com a confirmação ligada",
  recusa.includes("confirmação de e-mail ligada") && recusa.includes("Confirm email"), recusa);

await falhar("");
// Nome único por execução: o servidor de mentira guarda as contas entre uma
// execução e outra, e repetir o nome faria o teste falhar por "já existe".
const criou = await p.evaluate(async n => {
  try { await mkt.nuvem.criarAcesso(n, "makro2026", "pcm"); return "criou"; }
  catch (e) { return e.message; }
}, "Teste " + Date.now().toString(36));
ok("com a confirmação desligada, cria normalmente", criou === "criou", criou);

await nav.close();
site.fechar();
console.log(falhou ? `\n${falhou} falharam` : "\ntudo como projetado");
process.exit(falhou ? 1 : 0);
