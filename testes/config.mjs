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
import { cpSync, writeFileSync, rmSync, mkdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COPIA = "/tmp/mkt-copia-teste";
const NUVEM = process.env.NUVEM_FALSA || "http://127.0.0.1:8124";
const PORTA = 8125;

let chromium;
try { ({ chromium } = (await import("/opt/node-tools/node_modules/playwright/index.js")).default); }
catch (e) { console.log("Playwright não disponível — pulando."); process.exit(0); }

rmSync(COPIA, { recursive: true, force: true });
mkdirSync(COPIA, { recursive: true });
for (const d of ["index.html", "manifest.json", "css", "js", "vendor"]) {
  cpSync(join(RAIZ, d), join(COPIA, d), { recursive: true });
}
// O config preenchido vai só na cópia: o repositório não é tocado.
writeFileSync(join(COPIA, "js/config.js"), `
export const NUVEM = { url: ${JSON.stringify(NUVEM)}, chave: "chave-de-teste-com-mais-de-trinta-caracteres" };
export const DOMINIO = "makro.local";
export function emailDe(nome) {
  return String(nome || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".").replace(/^\\.|\\.$/g, "") + "@" + DOMINIO;
}
`);

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const srv = createServer((req, res) => {
  let p = join(COPIA, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(COPIA, "index.html");
  res.writeHead(200, { "content-type": TIPOS[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(PORTA);

let falhou = 0;
const ok = (nome, cond, detalhe = "") => {
  console.log(`  ${cond ? "ok  " : "FALHA"} ${nome}${detalhe && !cond ? " — " + detalhe : ""}`);
  if (!cond) falhou++;
};

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await nav.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const erros = [];
p.on("pageerror", e => erros.push(e.message));

await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: "networkidle" });
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

await nav.close();
srv.close();
rmSync(COPIA, { recursive: true, force: true });
console.log(falhou ? `\n${falhou} falharam` : "\ntudo como projetado");
process.exit(falhou ? 1 : 0);
