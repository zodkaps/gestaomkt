// Serve uma cópia do site apontada para um Supabase de mentira.
//
// Existe porque o `js/config.js` do repositório aponta para o projeto de
// verdade — e, estando completo, ele MANDA: o site ignora qualquer endereço
// colado à mão. É o comportamento certo em produção e inútil em teste, então
// aqui se monta uma cópia com o config trocado, sem tocar no repositório.

import { cpSync, writeFileSync, rmSync, mkdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TIPOS = { ".html": "text/html", ".js": "text/javascript",
  ".css": "text/css", ".json": "application/json" };

export function servirCopia({ nuvem, porta = 8125, pasta = "/tmp/mkt-copia-teste" }) {
  rmSync(pasta, { recursive: true, force: true });
  mkdirSync(pasta, { recursive: true });
  for (const d of ["index.html", "manifest.json", "css", "js", "vendor"]) {
    cpSync(join(RAIZ, d), join(pasta, d), { recursive: true });
  }
  writeFileSync(join(pasta, "js/config.js"), `
export const NUVEM = { url: ${JSON.stringify(nuvem)}, chave: "chave-de-teste-com-mais-de-trinta-caracteres" };
export const DOMINIO = "makro.local";
export function emailDe(nome) {
  return String(nome || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".").replace(/^\\.|\\.$/g, "") + "@" + DOMINIO;
}
`);
  // Sem service worker na cópia: ele guardaria os arquivos entre uma execução
  // e outra e o teste passaria a medir o cache, não o código de agora.
  writeFileSync(join(pasta, "sw.js"), "// vazio de propósito nos testes\n");

  const srv = createServer((req, res) => {
    let p = join(pasta, decodeURIComponent(req.url.split("?")[0]));
    if (!existsSync(p) || statSync(p).isDirectory()) p = join(pasta, "index.html");
    res.writeHead(200, { "content-type": TIPOS[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  }).listen(porta);

  return {
    endereco: `http://127.0.0.1:${porta}/`,
    fechar() { srv.close(); rmSync(pasta, { recursive: true, force: true }); },
  };
}

/** Entra no site como alguém, criando o acesso se ainda não existir. */
export async function entrarComo(p, nome, senha = "makro2026", papel = "pcm") {
  await p.evaluate(async ([n, s, pa]) => {
    try { await mkt.nuvem.criarAcesso(n, s, pa); } catch (e) { /* já existe */ }
    await mkt.nuvem.sair();
  }, [nome, senha, papel]);
  await p.fill('input[placeholder="Seu nome"]', nome);
  await p.fill('input[placeholder="Senha"]', senha);
  await p.click('button[type=submit]');
  await p.waitForTimeout(2200);
}
