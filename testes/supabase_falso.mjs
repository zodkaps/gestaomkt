// PostgREST + Auth de mentira, com as MESMAS regras da política do banco.
// Serve para dirigir o site de verdade: entrar com senha, e ver o servidor
// recusar o que o papel não permite.
import { createServer } from "node:http";

const PESSOAS = [
  { email: "mateus@makro.local", nome: "Mateus", papel: "pcm" },
  { email: "lucas@makro.local", nome: "Lucas", papel: "pcm" },
  { email: "pedro@makro.local", nome: "Pedro", papel: "operacao" },
  { email: "joao.victor@makro.local", nome: "João Victor", papel: "operacao" },
];
const TIPOS_OPERACAO = new Set(["criada", "importada", "editada",
  "mov_prometida", "mov_chegou", "mov_cancelada", "prev_disponivel"]);

// Modos de falha, para provar que as mensagens de instalação aparecem.
// Ligados em tempo de execução por POST /__falha {modo}.
//   tabela     → o banco responde como se as migrações não tivessem rodado
//   permissao  → tabela existe, mas sem GRANT (falta o 02_acesso.sql)
//   sem_pessoa → autentica, mas o e-mail não está na tabela `pessoas`
let falha = "";

const contas = new Map();      // email → senha
const tokens = new Map();      // token → email
const eventos = [];
const porId = new Map();
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

  // ── auth ──
  if (u.pathname === "/auth/v1/settings") {
    return json(res, 200, { external: {}, disable_signup: false, mailer_autoconfirm: true });
  }
  if (u.pathname === "/auth/v1/signup") {
    const b = await corpo(req);
    if (contas.has(b.email)) return json(res, 400, { msg: "User already registered" });
    contas.set(b.email, b.password);
    const t = "tok" + (++n);
    tokens.set(t, b.email);
    return json(res, 200, { access_token: t, refresh_token: "r" + n, expires_in: 3600,
      user: { email: b.email, user_metadata: b.data || {} } });
  }
  if (u.pathname === "/auth/v1/token") {
    const b = await corpo(req);
    if (u.searchParams.get("grant_type") === "refresh_token") {
      const t = "tok" + (++n);
      const email = [...tokens.values()][0];
      tokens.set(t, email);
      return json(res, 200, { access_token: t, refresh_token: "r" + n, expires_in: 3600, user: { email } });
    }
    if (contas.get(b.email) !== b.password) {
      return json(res, 400, { error_description: "Invalid login credentials" });
    }
    const t = "tok" + (++n);
    tokens.set(t, b.email);
    return json(res, 200, { access_token: t, refresh_token: "r" + n, expires_in: 3600, user: { email: b.email } });
  }
  if (u.pathname === "/auth/v1/logout") return res.writeHead(204).end();

  // ── dados: sem entrar, nada ──
  const email = quem(req);
  if (!email) return json(res, 401, { message: "permission denied" });
  const eu = PESSOAS.find(p => p.email === email);

  if (u.pathname.startsWith("/rest/v1/pessoas")) {
    if (falha === "tabela") {
      return json(res, 404, { code: "42P01", message: 'relation "public.pessoas" does not exist' });
    }
    if (falha === "permissao") {
      return json(res, 403, { code: "42501", message: "permission denied for table pessoas" });
    }
    if (falha === "sem_pessoa") return json(res, 200, []);
    return json(res, 200, PESSOAS);
  }

  if (u.pathname.startsWith("/rest/v1/eventos")) {
    if (falha === "tabela") {
      return json(res, 404, { code: "42P01", message: 'relation "public.eventos" does not exist' });
    }
    if (falha === "permissao") {
      return json(res, 403, { code: "42501", message: "permission denied for table eventos" });
    }
    if (req.method === "GET") {
      if ((req.headers.prefer || "").includes("count=exact")) {
        res.setHeader("content-range", `0-0/${eventos.length}`);
        return json(res, 200, []);
      }
      const g = Number((u.searchParams.get("seq") || "gt.0").replace("gt.", ""));
      const lim = Number(u.searchParams.get("limit") || 1000);
      return json(res, 200, eventos.filter(e => e.seq > g).slice(0, lim));
    }
    if (req.method === "POST") {
      const lote = await corpo(req);
      let add = 0;
      for (const e of (Array.isArray(lote) ? lote : [lote])) {
        if (porId.has(e.id)) continue;                       // ignore-duplicates
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
      }
      process.stderr.write(`[falso] ${eu.nome}: +${add} (total ${eventos.length})\n`);
      return res.writeHead(201).end("");
    }
  }
  res.writeHead(404).end("{}");
}).listen(8124, () => process.stderr.write("[falso] supabase de mentira (com senha) em :8124\n"));
