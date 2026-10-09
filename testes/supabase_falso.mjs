// PostgREST + Auth de mentira, com as MESMAS regras da política do banco.
// Serve para dirigir o site de verdade: entrar com senha, e ver o servidor
// recusar o que o papel não permite.
import { createServer } from "node:http";
import { EQUIPE_TESTE } from "./sitefalso.mjs";

const PESSOAS = EQUIPE_TESTE;

// O Supabase de verdade recusa domínio de teste — "Example and test domains
// are currently not supported". Foi isso que barrou o primeiro acesso da
// equipe, e este servidor deixava passar: os testes ficavam verdes com um
// cadastro que nunca funcionaria. Agora recusa igual.
const dominioDeTeste = email => {
  const d = String(email || "").toLowerCase().split("@")[1] || "";
  return /\.(local|test|example|invalid|localhost)$/.test(d) || /^example\.(com|net|org)$/.test(d);
};
const TIPOS_OPERACAO = new Set(["criada", "editada",
  "mov_prometida", "mov_chegou", "mov_cancelada", "justificada", "prev_disponivel"]);

// Modos de falha, para provar que as mensagens de instalação aparecem.
// Ligados em tempo de execução por POST /__falha {modo}.
//   tabela     → o banco responde como se as migrações não tivessem rodado
//   permissao  → tabela existe, mas sem GRANT (falta o 02_acesso.sql)
//   sem_pessoa → autentica, mas o e-mail não está na tabela `pessoas`
//   confirmacao → projeto com "Confirm email" ligado, como vem de fábrica
//   provedor_off → provedor Email DESLIGADO: ninguém entra com senha, e foi
//                  isto que trancou a equipe inteira para fora do site
//   projeto_fora → o projeto não responde nada, como num banco pausado
let falha = "";

const contas = new Map();      // email → senha
const tokens = new Map();      // token de acesso → email
// Como no Supabase: cada entrada é uma sessão; a credencial de renovação gira
// a cada uso; sair com scope=local derruba só a sessão daquele aparelho, e sem
// scope (o padrão do Supabase) derruba TODAS as sessões da pessoa.
const renovacoes = new Map();  // credencial de renovação → { email, sessao }
const acessoDaSessao = new Map(); // token de acesso → sessao
let nSessao = 0;
function abrirSessao(email, sessao = "s" + (++nSessao)) {
  const t = "tok" + (++n), r = "r" + n + "-" + sessao;
  tokens.set(t, email);
  acessoDaSessao.set(t, sessao);
  renovacoes.set(r, { email, sessao });
  return { access_token: t, refresh_token: r, expires_in: 3600, user: { email } };
}
const eventos = [];
const porId = new Map();
// Como no Postgres de verdade: dois lançamentos gravados quase juntos podem
// ficar visíveis fora de ordem (o de seq menor aparece depois). /__segurar faz
// os próximos N lançamentos ficarem invisíveis até /__soltar.
let segurarProximos = 0;
const segurados = new Set();
// O PostgREST devolve o instante no formato do Postgres: "+00:00", sem os
// zeros do fim dos milissegundos.
const tsDoBanco = ts => {
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toISOString().replace(/\.?0+Z$/, "Z").replace("Z", "+00:00");
};
let n = 0;

const json = (res, cod, o) => res.writeHead(cod, { "content-type": "application/json" }).end(JSON.stringify(o));
const corpo = req => new Promise(ok => { let s = ""; req.on("data", c => s += c); req.on("end", () => ok(s ? JSON.parse(s) : {})); });
const quem = req => {
  const a = (req.headers.authorization || "").replace("Bearer ", "");
  return tokens.get(a) || null;
};

createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Expose-Headers", "content-range");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  if (u.pathname === "/__falha") {
    const b = await corpo(req);
    falha = b.modo || "";
    process.stderr.write(`[falso] modo de falha: ${falha || "nenhum"}\n`);
    return json(res, 200, { falha });
  }

  // Projeto pausado ou fora do ar: nem o Auth responde. É o caso em que o site
  // tem de oferecer trabalhar neste aparelho — antes, aqui ele simplesmente
  // não deixava entrar.
  if (falha === "projeto_fora") {
    return json(res, 503, { message: "service unavailable" });
  }

  // ── auth ──
  if (u.pathname === "/auth/v1/settings") {
    return json(res, 200, { external: { email: falha !== "provedor_off" },
      disable_signup: false, mailer_autoconfirm: falha !== "confirmacao" });
  }
  if (u.pathname === "/auth/v1/signup") {
    const b = await corpo(req);
    if (falha === "provedor_off") {
      return json(res, 422, { error_code: "email_provider_disabled",
        msg: "Email signups are disabled" });
    }
    if (dominioDeTeste(b.email)) {
      return json(res, 400, { error_code: "email_address_invalid",
        msg: `Email address "${b.email}" is invalid` });
    }
    if (contas.has(b.email)) return json(res, 400, { msg: "User already registered" });
    contas.set(b.email, b.password);
    const t = "tok" + (++n);
    tokens.set(t, b.email);
    renovacoes.set("r" + n, { email: b.email, sessao: "s" + (++nSessao) });
    return json(res, 200, { access_token: t, refresh_token: "r" + n, expires_in: 3600,
      user: { email: b.email, user_metadata: b.data || {} } });
  }
  if (u.pathname === "/auth/v1/token") {
    const b = await corpo(req);
    if (falha === "provedor_off") {
      return json(res, 422, { error_code: "email_provider_disabled",
        msg: "Email logins are disabled" });
    }
    if (u.searchParams.get("grant_type") === "refresh_token") {
      const s = renovacoes.get(b.refresh_token);
      if (!s) {
        return json(res, 400, { error_code: "refresh_token_not_found",
          msg: "Invalid Refresh Token: Refresh Token Not Found" });
      }
      renovacoes.delete(b.refresh_token);
      return json(res, 200, abrirSessao(s.email, s.sessao));
    }
    if (contas.get(b.email) !== b.password) {
      return json(res, 400, { error_description: "Invalid login credentials" });
    }
    return json(res, 200, abrirSessao(b.email));
  }
  if (u.pathname === "/auth/v1/logout") {
    const a = (req.headers.authorization || "").replace("Bearer ", "");
    const email = tokens.get(a), sessao = acessoDaSessao.get(a);
    const local = u.searchParams.get("scope") === "local";
    for (const [r, v] of [...renovacoes]) {
      if (v.email === email && (!local || v.sessao === sessao)) renovacoes.delete(r);
    }
    return res.writeHead(204).end();
  }
  if (u.pathname === "/__segurar" && req.method === "POST") {
    segurarProximos = (await corpo(req)).quantos || 1;
    return json(res, 200, { ok: true });
  }
  if (u.pathname === "/__soltar" && req.method === "POST") {
    segurados.clear();
    return json(res, 200, { ok: true });
  }
  // Para os testes: o token de acesso de alguém vence (passou a hora), como no
  // celular que ficou uma hora parado.
  if (u.pathname === "/__expirar" && req.method === "POST") {
    const b = await corpo(req);
    for (const [t, e] of [...tokens]) if (e === b.email) tokens.delete(t);
    return json(res, 200, { ok: true });
  }

  // ── dados: sem entrar, nada ──
  const email = quem(req);
  if (!email) {
    const a = (req.headers.authorization || "").replace("Bearer ", "");
    // Credencial que já existiu e venceu responde como o PostgREST: JWT expired.
    if (/^tok\d+$/.test(a)) return json(res, 401, { code: "PGRST301", message: "JWT expired" });
    return json(res, 401, { message: "permission denied" });
  }
  // Ter conta não basta, como no banco de verdade: o cadastro é aberto e a
  // chave é pública, então quem não está em `pessoas` lê as tabelas vazias.
  const eu = falha === "sem_pessoa" ? null : PESSOAS.find(p => p.email === email);

  if (u.pathname.startsWith("/rest/v1/pessoas")) {
    if (falha === "tabela") {
      return json(res, 404, { code: "42P01", message: 'relation "public.pessoas" does not exist' });
    }
    if (falha === "permissao") {
      return json(res, 403, { code: "42501", message: "permission denied for table pessoas" });
    }
    return json(res, 200, eu ? PESSOAS : []);
  }

  if (u.pathname.startsWith("/rest/v1/eventos")) {
    if (falha === "tabela") {
      return json(res, 404, { code: "42P01", message: 'relation "public.eventos" does not exist' });
    }
    if (falha === "permissao") {
      return json(res, 403, { code: "42501", message: "permission denied for table eventos" });
    }
    const visiveis = eu ? eventos.filter(e => !segurados.has(e.id)) : [];
    if (req.method === "GET") {
      if ((req.headers.prefer || "").includes("count=exact")) {
        res.setHeader("content-range", `0-0/${visiveis.length}`);
        return json(res, 200, []);
      }
      const g = Number((u.searchParams.get("seq") || "gt.0").replace("gt.", ""));
      const lim = Number(u.searchParams.get("limit") || 1000);
      const filtroId = u.searchParams.get("id");
      const ids = filtroId && filtroId.startsWith("in.(")
        ? new Set(filtroId.slice(4, -1).split(",").map(x => x.replace(/^"|"$/g, ""))) : null;
      let lista = visiveis.filter(e => e.seq > g && (!ids || ids.has(e.id))).slice(0, lim)
        .map(e => ({ ...e, ts: tsDoBanco(e.ts) }));
      const sel = u.searchParams.get("select") || "*";
      if (sel !== "*") {
        const cols = sel.split(",");
        lista = lista.map(e => Object.fromEntries(cols.map(c => [c, e[c]])));
      }
      return json(res, 200, lista);
    }
    if (req.method === "POST") {
      const lote = await corpo(req);
      let add = 0;
      for (const e of (Array.isArray(lote) ? lote : [lote])) {
        if (porId.has(e.id)) continue;                       // ignore-duplicates
        if (!eu) {
          return json(res, 403, { message: "new row violates row-level security policy (sem papel)" });
        }
        // as mesmas duas perguntas da política do Postgres
        if (e.autor !== eu.nome) {
          return json(res, 403, { message: `new row violates row-level security policy (autor ${e.autor} ≠ ${eu.nome})` });
        }
        if (eu.papel !== "pcm" &&
            !(["movimentacao", "preventiva"].includes(e.alvo_tipo) && TIPOS_OPERACAO.has(e.tipo))) {
          return json(res, 403, { message: `new row violates row-level security policy (${eu.papel} não lança ${e.tipo} em ${e.alvo_tipo})` });
        }
        const g = { ...e, seq: eventos.length + 1 };
        eventos.push(g); porId.set(e.id, g); add++;
        if (segurarProximos > 0) { segurados.add(e.id); segurarProximos--; }
      }
      process.stderr.write(`[falso] ${eu.nome}: +${add} (total ${eventos.length})\n`);
      return res.writeHead(201).end("");
    }
  }
  res.writeHead(404).end("{}");
}).listen(8124, () => process.stderr.write("[falso] supabase de mentira (com senha) em :8124\n"));
