// O lugar comum: a fita de eventos no Supabase, e quem tem direito de escrever
// nela.
//
// Fala com o PostgREST e com o Auth por `fetch` direto, sem a biblioteca
// oficial — são meia dúzia de chamadas, e a biblioteca pesa mais que o site.
//
// **Como as telas dos quatro se atualizam.** Por consulta repetida, de poucos
// em poucos segundos, e não por WebSocket. O realtime do Supabase fala um
// protocolo de canais com batimento, numeração e reconexão — umas duzentas
// linhas que quebram justamente onde este site vive: celular que dorme, sinal
// que cai, aba em segundo plano. Perguntar "o que entrou depois do número X"
// resolve o mesmo em cinco linhas e volta sozinho de qualquer queda.

import * as dados from "./dados.js";
import { NUVEM, emailDe } from "./config.js";

const TABELA = "eventos";

let url = NUVEM.url || "";
let chave = NUVEM.anon || "";
let sessao = null;          // { access_token, refresh_token, expira_em, email, nome }
let ligadoEm = 0;

const aoMudar = new Set();
export function aoLigar(fn) { aoMudar.add(fn); return () => aoMudar.delete(fn); }
function anunciar() { for (const fn of aoMudar) { try { fn(ligada()); } catch (e) { /* segue */ } } }

export function ligada() { return !!(url && chave); }
export function endereco() { return url; }
export function autenticado() { return !!(sessao && sessao.access_token); }
export function emailAtual() { return sessao ? sessao.email : ""; }

export async function carregarConfig() {
  const c = await dados.lerMeta("nuvem", null);
  // O que está no config.js manda: é o endereço que vale para os quatro. O que
  // foi colado à mão só serve enquanto o config.js estiver vazio.
  if (!NUVEM.url && c && c.url && c.chave) { url = c.url; chave = c.chave; }
  sessao = await dados.lerMeta("sessao", null);
  return ligada();
}

export async function configurar(novaUrl, novaChave) {
  const u = String(novaUrl || "").trim().replace(/\/+$/, "");
  const k = String(novaChave || "").trim();
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(u);
  if (!local && !/^https:\/\/[a-z0-9-]+\.[a-z0-9.-]+$/i.test(u)) {
    throw new Error("O endereço tem de ser o do projeto, assim: https://xxxx.supabase.co");
  }
  if (k.length < 20) throw new Error("Essa chave parece curta demais.");
  const antes = [url, chave];
  url = u; chave = k;
  // Confere contra o Auth, não contra a tabela: a tabela agora exige estar
  // logado, e ninguém está logado na hora de ligar o endereço pela primeira
  // vez. Pedir a configuração de autenticação prova as duas coisas que
  // importam aqui — o endereço responde e a chave é aceita.
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: chave } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  } catch (e) {
    [url, chave] = antes;
    throw new Error("Não consegui falar com esse projeto: " + e.message);
  }
  await dados.gravarMeta("nuvem", { url, chave });
  anunciar();
  return true;
}

export async function desligar() {
  url = NUVEM.url || ""; chave = NUVEM.anon || "";
  await dados.gravarMeta("nuvem", null);
  anunciar();
}

// ── entrar ──────────────────────────────────────────────────────────────────

function cabecalhosAuth() {
  return { apikey: chave, "Content-Type": "application/json" };
}

async function auth(caminho, corpo) {
  const r = await fetch(`${url}/auth/v1/${caminho}`, {
    method: "POST", headers: cabecalhosAuth(), body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j.error_description || j.msg || j.message || j.error || `${r.status}`;
    throw new Error(traduzir(m));
  }
  return j;
}

// As mensagens do Supabase vêm em inglês e técnicas. Quem está no pátio com a
// senha errada não precisa ler "invalid login credentials".
function traduzir(m) {
  const s = String(m).toLowerCase();
  if (s.includes("invalid login")) return "Nome ou senha não conferem.";
  if (s.includes("email not confirmed")) {
    return "O acesso existe mas está esperando confirmação por e-mail. " +
      "No painel do Supabase, em Authentication → Providers → Email, desligue 'Confirm email'.";
  }
  if (s.includes("already registered") || s.includes("already been registered")) {
    return "Já existe acesso com esse nome.";
  }
  if (s.includes("password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (s.includes("signups not allowed") || s.includes("signup is disabled")) {
    return "O projeto está com criação de acesso desligada (Authentication → Providers → Email → Allow new users).";
  }
  return m;
}

async function guardar(j, nome) {
  sessao = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expira_em: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    email: (j.user && j.user.email) || emailDe(nome),
    nome: nome || ((j.user && j.user.user_metadata && j.user.user_metadata.nome) || ""),
  };
  await dados.gravarMeta("sessao", sessao);
  return sessao;
}

export async function entrar(nome, senha) {
  if (!ligada()) throw new Error("A nuvem ainda não está ligada.");
  const j = await auth("token?grant_type=password", { email: emailDe(nome), password: senha });
  const s = await guardar(j, nome);
  // Entrar muda tanto quanto ligar o endereço: antes disto não havia sessão e
  // portanto não havia o que sincronizar. Quem escuta tem de ser avisado agora,
  // senão quem acabou de entrar fica olhando uma tela vazia até recarregar.
  anunciar();
  return s;
}

export async function criarAcesso(nome, senha, papel) {
  if (!ligada()) throw new Error("A nuvem ainda não está ligada.");
  const j = await auth("signup", {
    email: emailDe(nome), password: senha,
    data: { nome, papel },           // guarda o nome; o PAPEL que vale é o da tabela `pessoas`
  });
  return j;
}

export async function sair() {
  try {
    if (sessao) {
      await fetch(`${url}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: chave, Authorization: "Bearer " + sessao.access_token },
      });
    }
  } catch (e) { /* sair local vale mesmo sem rede */ }
  sessao = null;
  await dados.gravarMeta("sessao", null);
  anunciar();
}

/** Renova antes de vencer. Sem rede, devolve a sessão velha: o site continua
 *  aberto mostrando o que já tem, que é o que o pátio precisa. */
async function renovarSePreciso() {
  if (!sessao) return null;
  if (Date.now() < sessao.expira_em - 60000) return sessao;
  try {
    const j = await auth("token?grant_type=refresh_token", { refresh_token: sessao.refresh_token });
    return guardar(j, sessao.nome);
  } catch (e) {
    return sessao;
  }
}

// ── dados ───────────────────────────────────────────────────────────────────

function cabecalhos(extra = {}) {
  const bearer = sessao ? sessao.access_token : chave;
  return { apikey: chave, Authorization: "Bearer " + bearer,
    "Content-Type": "application/json", ...extra };
}

async function chamar(caminho, opcoes = {}) {
  await renovarSePreciso();
  const r = await fetch(`${url}/rest/v1/${caminho}`, opcoes);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (r.status === 401 || r.status === 403) {
      throw new Error("O banco recusou: " + (t ? t.slice(0, 180) : "sem permissão"));
    }
    throw new Error(`${r.status} ${r.statusText}${t ? " — " + t.slice(0, 180) : ""}`);
  }
  return r;
}

export async function contar() {
  const r = await chamar(`${TABELA}?select=seq&limit=1`,
    { headers: cabecalhos({ Prefer: "count=exact" }), method: "GET" });
  const faixa = r.headers.get("content-range") || "";
  return Number(faixa.split("/")[1]) || 0;
}

export async function baixarDesde(seq = 0, pagina = 1000) {
  const tudo = [];
  let de = Number(seq) || 0;
  for (let volta = 0; volta < 200; volta++) {
    const r = await chamar(`${TABELA}?select=*&seq=gt.${de}&order=seq.asc&limit=${pagina}`,
      { headers: cabecalhos(), method: "GET" });
    const lote = await r.json();
    tudo.push(...lote);
    if (lote.length < pagina) break;
    de = lote[lote.length - 1].seq;
  }
  return tudo;
}

/** `resolution=ignore-duplicates` sobre o `id` é o que torna o reenvio seguro:
 *  o celular que ficou sem sinal manda tudo de novo e o banco ignora o que já
 *  tinha, em vez de criar lançamento repetido. */
export async function enviar(eventos) {
  if (!eventos.length) return 0;
  const limpos = eventos.map(({ seq, enviado, ...resto }) => resto);
  for (let i = 0; i < limpos.length; i += 500) {
    await chamar(`${TABELA}?on_conflict=id`, {
      method: "POST",
      headers: cabecalhos({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
      body: JSON.stringify(limpos.slice(i, i + 500)),
    });
  }
  return limpos.length;
}

/** Quem é quem, direto do banco. O papel deixa de morar no código: é a tabela
 *  `pessoas`, que o site não consegue escrever. */
export async function lerPessoas() {
  const r = await chamar("pessoas?select=email,nome,papel&order=nome.asc",
    { headers: cabecalhos(), method: "GET" });
  return r.json();
}

export function observar(aoChegar, { intervalo = 10000 } = {}) {
  let parado = false, rodando = false;

  async function volta() {
    if (parado || rodando || !ligada() || !autenticado()) return;
    if (typeof document !== "undefined" && document.hidden) return;
    rodando = true;
    try {
      const desde = await dados.lerMeta("nuvem_seq", 0);
      const novos = await baixarDesde(desde);
      if (novos.length) {
        await dados.gravarMeta("nuvem_seq", novos[novos.length - 1].seq);
        await aoChegar(novos);
      }
      ligadoEm = Date.now();
    } catch (e) {
      // Sem rede é o estado normal no pátio, não um erro para assustar
      // ninguém: a fila local continua guardando e a próxima volta tenta.
      console.debug("nuvem: não respondeu —", e.message);
    } finally { rodando = false; }
  }

  const t = setInterval(volta, intervalo);
  const aoVoltar = () => { if (!document.hidden) volta(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", aoVoltar);
  if (typeof window !== "undefined") window.addEventListener("online", volta);
  volta();

  return () => {
    parado = true;
    clearInterval(t);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", aoVoltar);
    if (typeof window !== "undefined") window.removeEventListener("online", volta);
  };
}

export function ultimaConversa() { return ligadoEm; }
