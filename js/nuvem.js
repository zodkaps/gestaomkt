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
import { NUVEM, emailDe, dominioDeTeste } from "./config.js";

const TABELA = "eventos";

let url = NUVEM.url || "";
let chave = NUVEM.chave || "";
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
  // O config.js manda quando está COMPLETO — é o endereço que vale para os
  // quatro. Faltando qualquer metade (hoje: a URL está lá e a chave não,
  // esperando a conferência de RLS), vale o que foi colado à mão; senão o site
  // ficaria preso num meio-termo que não conecta e não deixa colar.
  const completo = !!(NUVEM.url && NUVEM.chave);
  if (!completo && c && c.url && c.chave) { url = c.url; chave = c.chave; }
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
  // Serve tanto a publishable nova (sb_publishable_…) quanto a anon legada
  // (um JWT, bem mais longo). As duas vão no mesmo cabeçalho.
  if (k.length < 20) {
    throw new Error("Essa chave parece curta demais — espero a publishable " +
      "(sb_publishable_…) ou a anon legada, de Settings → API.");
  }
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
  url = NUVEM.url || ""; chave = NUVEM.chave || "";
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
  if (s.includes("invalid login")) return "E-mail ou senha não conferem.";
  // Foi este que barrou a primeira tentativa: o site inventava
  // pedro@makro.local, e o Supabase recusa domínio de teste. Em inglês, cru,
  // ninguém entende que o problema é o ENDEREÇO, não a senha.
  if ((s.includes("email address") && s.includes("invalid")) ||
      s.includes("example and test domains")) {
    return "O Supabase não aceita esse e-mail — domínio de teste ou endereço " +
      "inválido. Use o seu e-mail de verdade.";
  }
  if (s.includes("email not confirmed")) {
    // Duas coisas, e a segunda é a que trava: desligar a opção vale para os
    // PRÓXIMOS cadastros; quem já foi criado continua preso. Dizer só a
    // primeira metade manda a pessoa desligar, tentar de novo e continuar
    // fora, sem ter o que fazer com a informação.
    return "O acesso existe mas está esperando confirmação por e-mail. " +
      "São duas coisas: (1) desligue 'Confirm email' em Authentication → " +
      "Sign In / Providers → Email; e (2) rode sql/03_liberar_acessos.sql, " +
      "porque desligar a opção não solta os acessos que já foram criados.";
  }
  if (s.includes("already registered") || s.includes("already been registered")) {
    return "Já existe acesso com esse e-mail — é só entrar com a senha dele.";
  }
  if (s.includes("password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  // Dois interruptores diferentes, e confundi-los foi o que travou a equipe:
  // o PROVEDOR Email precisa estar ligado, e o Confirm email dentro dele,
  // desligado. A mensagem tem de deixar isso explícito.
  if (s.includes("email logins are disabled")) {
    return "O login por e-mail está desligado no projeto. Em Authentication → " +
      "Sign In / Providers, LIGUE o provedor Email — e, dentro dele, deixe " +
      "'Confirm email' DESLIGADO. São dois interruptores diferentes.";
  }
  if (s.includes("email signups are disabled")) {
    return "A criação de acesso por e-mail está desligada. Em Authentication → " +
      "Sign In / Providers → Email, ligue o provedor e deixe 'Confirm email' desligado.";
  }
  if (s.includes("signups not allowed") || s.includes("signup is disabled")) {
    return "O projeto está com criação de acesso desligada (Authentication → Providers → Email → Allow new users).";
  }

  // ── o lado dos dados ──
  // Estes são erros de INSTALAÇÃO, não de uso: aparecem quando falta rodar um
  // dos arquivos SQL. Sem tradução, a pessoa lê "42P01 relation does not
  // exist" e liga para perguntar — com tradução, lê o que fazer.
  if (s.includes("42p01") || s.includes("does not exist")) {
    return "O banco ainda não tem as tabelas deste site. No SQL Editor do " +
      "Supabase, rode sql/01_esquema.sql e depois sql/02_acesso.sql.";
  }
  if (s.includes("42501") || s.includes("permission denied")) {
    return "O banco recusou o acesso à tabela. Falta rodar sql/02_acesso.sql, " +
      "que é quem concede a permissão e cria as políticas.";
  }
  if (s.includes("row-level security")) {
    return "O banco recusou este lançamento: ou não é do seu papel, ou está " +
      "assinado com um nome diferente do seu.";
  }
  if (s.includes("jwt expired") || s.includes("token is expired")) {
    return "Sua sessão venceu. Entre de novo.";
  }
  return m;
}

async function guardar(j, email) {
  const meta = (j.user && j.user.user_metadata) || {};
  sessao = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expira_em: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    email: (j.user && j.user.email) || email,
    nome: meta.nome || "",
  };
  await dados.gravarMeta("sessao", sessao);
  return sessao;
}

export async function entrar(email, senha) {
  if (!ligada()) throw new Error("A nuvem ainda não está ligada.");
  const e = emailDe(email);
  if (!e) throw new Error("Digite o seu e-mail — o mesmo da sua conta.");
  const j = await auth("token?grant_type=password", { email: e, password: senha });
  const s = await guardar(j, e);
  // O próximo acesso neste aparelho já começa com o e-mail preenchido: depois
  // da primeira vez, entrar é só a senha.
  await dados.gravarMeta("ultimo_email", s.email);
  // Entrar muda tanto quanto ligar o endereço: antes disto não havia sessão e
  // portanto não havia o que sincronizar. Quem escuta tem de ser avisado agora,
  // senão quem acabou de entrar fica olhando uma tela vazia até recarregar.
  anunciar();
  return s;
}

/** O que o projeto diz sobre si mesmo. Não exige estar logado. */
export async function opcoes() {
  const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: chave } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export async function criarAcesso(email, senha, nome = "") {
  if (!ligada()) throw new Error("A nuvem ainda não está ligada.");
  const e = emailDe(email);
  if (!e) throw new Error("Digite um e-mail de verdade — é com ele que a pessoa vai entrar.");
  if (dominioDeTeste(e)) {
    throw new Error("O Supabase não aceita esse domínio (é de teste). Use o e-mail de verdade da pessoa.");
  }

  // Pergunta antes de criar. Com a confirmação ligada — que é como um projeto
  // Supabase vem de fábrica — os acessos nasceriam presos, esperando um e-mail
  // que nunca chega, e descobrir isso só na hora de entrar custa uma consulta
  // SQL para desfazer. Esta checagem custa uma chamada que já é feita.
  try {
    const o = await opcoes();
    if (o && o.mailer_autoconfirm === false) {
      throw new Error("CONFIRMACAO_LIGADA");
    }
  } catch (e) {
    if (e.message === "CONFIRMACAO_LIGADA") {
      throw new Error("Este projeto está com confirmação de e-mail ligada. " +
        "O acesso nasceria preso, esperando um e-mail que o envio embutido do " +
        "Supabase não entrega para todo mundo. Desligue em Authentication → " +
        "Sign In / Providers → Email → 'Confirm email', e volte aqui.");
    }
    // Não deu para perguntar (sem rede, versão que não responde isso): segue e
    // cria. Melhor tentar do que travar por causa da checagem.
  }

  // Só o nome vai junto, para o painel mostrar de quem é a conta. Papel não:
  // quem decide papel é a tabela `pessoas`, que o site não escreve.
  const j = await auth("signup", { email: e, password: senha, data: { nome } });
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
    return guardar(j, sessao.email);
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
    const claro = traduzir(t || `${r.status} ${r.statusText}`);
    // Se a tradução não reconheceu, vai o original — melhor um erro feio do
    // que um erro bonito e errado.
    throw new Error(claro === t ? `${r.status} ${r.statusText}${t ? " — " + t.slice(0, 180) : ""}` : claro);
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


// ── diagnóstico ─────────────────────────────────────────────────────────────

/** Confere, em sequência, tudo que precisa estar de pé — e devolve o que falta
 *  com o passo exato.
 *
 *  Existe porque a instalação tem seis coisas que podem faltar, e descobrir
 *  uma por vez (cada uma com um erro em inglês na cara) custou dias. Uma
 *  passada, uma lista.
 *
 *  As tabelas se leem de dois jeitos, e qual deles vale depende de haver
 *  sessão — confundir isso faria o diagnóstico mentir nos dois sentidos:
 *
 *    sem entrar   "sem permissão" é o CERTO: prova que a tabela existe e que o
 *                 02_acesso.sql tirou o acesso do anônimo. Responder 200 aqui é
 *                 o estado meio-instalado perigoso — aberta a quem tiver a chave.
 *    já dentro    o certo é 200. "Sem permissão" com sessão é falta de GRANT ou
 *                 de política, ou seja: o 02_acesso.sql não rodou. */
export async function diagnostico() {
  const itens = [];
  // `arquivo` guarda o NOME do .sql, não o conteúdo: a tela busca o arquivo de
  // verdade na hora de mostrar, e assim a instrução nunca envelhece em relação
  // ao que está versionado.
  const juntar = (nome, titulo, estado, detalhe, resolver = "", arquivo = "") =>
    itens.push({ nome, titulo, estado, detalhe, resolver, arquivo });

  if (!ligada()) {
    juntar("config", "Endereço e chave do projeto", "falta",
      "O js/config.js está vazio.",
      "Preencha url e chave com os valores de Settings → API.");
    return itens;
  }

  // 1. o projeto responde
  let cfg = null;
  try {
    cfg = await opcoes();
    juntar("config", "Endereço e chave do projeto", "ok", url);
  } catch (e) {
    juntar("config", "Endereço e chave do projeto", "falta",
      `${url} não respondeu: ${e.message}`,
      "Confira a URL e a chave em Settings → API do seu projeto.");
    return itens;   // sem isto, o resto não dá para conferir
  }

  // 2. o provedor de e-mail
  const provedor = !cfg.external || cfg.external.email !== false;
  juntar("provedor", "Provedor Email ligado", provedor ? "ok" : "falta",
    provedor ? "ligado" : "desligado — ninguém consegue entrar",
    provedor ? "" : "Authentication → Sign In / Providers → LIGUE o provedor Email. " +
      "É um interruptor diferente do 'Confirm email'.");

  // 3. a confirmação por e-mail
  const autoconfirma = cfg.mailer_autoconfirm !== false;
  juntar("confirmacao", "Confirm email desligado", autoconfirma ? "ok" : "falta",
    autoconfirma ? "desligado, como tem de ser"
      : "ligado — os acessos nascem presos esperando um e-mail que nunca chega",
    autoconfirma ? "" : "Authentication → Sign In / Providers → Email → desligue " +
      "'Confirm email'. Depois rode o SQL abaixo para soltar quem já travou.",
    autoconfirma ? "" : "sql/03_liberar_acessos.sql");

  // 4 e 5. as tabelas
  const dentro = autenticado();
  for (const [nome, tabela, titulo, arquivo] of [
    ["eventos", "eventos", "Tabela de lançamentos", "sql/01_esquema.sql"],
    ["pessoas", "pessoas", "Tabela de pessoas e papéis", "sql/02_acesso.sql"],
  ]) {
    try {
      const r = await fetch(`${url}/rest/v1/${tabela}?select=*&limit=1`,
        { headers: cabecalhos() });
      const t = await r.text().catch(() => "");
      const naoExiste = r.status === 404 || /does not exist|42P01/i.test(t);
      const recusou = r.status === 401 || r.status === 403 || /permission denied|42501/i.test(t);
      if (naoExiste) {
        juntar(nome, titulo, "falta", "a tabela não existe no banco",
          "Rode este arquivo no SQL Editor:", arquivo);
      } else if (recusou) {
        if (dentro) {
          juntar(nome, titulo, "falta",
            "a tabela existe, mas o banco recusou o acesso mesmo com você dentro",
            "Falta o arquivo que concede a permissão e cria as políticas:",
            "sql/02_acesso.sql");
        } else {
          juntar(nome, titulo, "ok", "existe e está protegida, como deve ser");
        }
      } else if (r.ok) {
        if (dentro) juntar(nome, titulo, "ok", "existe e você lê");
        else {
          juntar(nome, titulo, "aviso",
            "existe, mas está aberta a quem tiver a chave do site",
            "Falta rodar o arquivo que fecha:", "sql/02_acesso.sql");
        }
      } else {
        juntar(nome, titulo, "naosei", `${r.status} ${r.statusText}`);
      }
    } catch (e) {
      juntar(nome, titulo, "naosei", e.message);
    }
  }

  // 6. e eu, estou cadastrado?
  if (autenticado()) {
    try {
      const eu = (await lerPessoas()).find(p => p.email === emailAtual());
      juntar("eu", "Seu acesso tem papel", eu ? "ok" : "falta",
        eu ? `${eu.nome} · ${eu.papel}` : `${emailAtual()} não está na tabela pessoas`,
        // O conserto é uma linha com o e-mail desta pessoa — mostrar a linha
        // pronta poupa ter de explicar a tabela para quem só quer entrar.
        eu ? "" : "No SQL Editor do Supabase: insert into public.pessoas (email, nome, papel) " +
          `values ('${emailAtual()}', 'Seu nome', 'pcm');  — troque o nome, e o papel ` +
          "para 'operacao' se for da operação.");
    } catch (e) {
      juntar("eu", "Seu acesso tem papel", "naosei", e.message);
    }
  } else {
    juntar("eu", "Seu acesso tem papel", "naosei",
      "só dá para conferir depois de entrar");
  }

  return itens;
}


export function ultimaConversa() { return ligadoEm; }
