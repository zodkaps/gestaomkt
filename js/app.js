// A casca: carrega a fita, descobre quem entrou, escolhe o módulo.

import * as ev from "./eventos.js";
import * as dados from "./dados.js";
import * as nuvem from "./nuvem.js";
import * as pessoas from "./pessoas.js";
import * as M from "./modelo.js";
import * as bk from "./backup.js";
import { el, $, limpar, avisar, erro, caixa, senhaComOlho } from "./ui.js";

// Na ordem das abas da planilha — Hoje, Programação, Semana, Resultados,
// Preventivas, Movimentações —, que é o mapa que o PCM já tem na cabeça. A
// carteira deixou de ser tela: na planilha ela é uma situação, e aqui é um
// recorte da Programação.
const TELAS = [
  { id: "operacao", icone: "✋", nome: "Para você", grupo: "Operação", papeis: ["operacao"],
    carregar: () => import("./tela/operacao.js"),
    contar: () => contagemOperacao() },
  { id: "hoje", icone: "☀", nome: "Hoje", grupo: "Oficina", papeis: ["pcm"],
    carregar: () => import("./tela/hoje.js") },
  { id: "programacao", icone: "☰", nome: "Programação", grupo: "Oficina", papeis: ["pcm"],
    carregar: () => import("./tela/programacao.js"),
    // O número no menu é o que pede ação: quantas venceram.
    contar: () => ev.lista().filter(a => M.situacaoDe(a) === "VENCIDA").length },
  { id: "semana", icone: "▦", nome: "Semana", grupo: "Oficina", papeis: ["pcm"],
    carregar: () => import("./tela/semana.js") },
  { id: "resultados", icone: "%", nome: "Resultados", grupo: "Oficina", papeis: ["pcm"],
    carregar: () => import("./tela/resultados.js") },
  { id: "preventivas", icone: "⏱", nome: "Preventivas", grupo: "Frota", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/preventivas.js"),
    contar: () => ev.lista("preventiva").filter(M.preventivaAberta).length },
  { id: "movimentacoes", icone: "⇄", nome: "Movimentação", grupo: "Frota", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/movimentacoes.js"),
    // Para o PCM, o que pede ação é a fila de aprovação; para a operação, o que
    // está em aberto.
    contar: () => pessoas.pode("aprovar")
      ? ev.lista("movimentacao").filter(M.movimentacaoParaAprovar).length
      : ev.lista("movimentacao").filter(M.movimentacaoAberta).length },
  { id: "frota", icone: "▤", nome: "Frota", grupo: "Frota", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/frota.js") },
  { id: "historico", icone: "⟲", nome: "Registro", grupo: "Gestão", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/historico.js") },
  { id: "importar", icone: "⇪", nome: "Importar", grupo: "Gestão", papeis: ["pcm"],
    carregar: () => import("./tela/importar.js") },
  { id: "diagnostico", icone: "✚", nome: "Diagnóstico", grupo: "Gestão", papeis: ["pcm"],
    carregar: () => import("./tela/diagnostico.js") },
  { id: "entrar", icone: "", nome: "Entrar", grupo: "", papeis: [], oculta: true,
    carregar: () => import("./tela/entrar.js") },
];

// As duas telas que valem SEM ninguém dentro. O diagnóstico está aqui porque é
// exatamente quando não se consegue entrar que ele precisa abrir — trancá-lo
// atrás do login seria guardar a chave dentro de casa.
const PORTAS = new Set(["entrar", "diagnostico"]);

function contagemOperacao() {
  const hoje = M.hoje();
  return ev.lista("movimentacao").filter(M.movimentacaoAberta).length +
    ev.lista("preventiva").filter(p => M.preventivaAberta(p) &&
      M.esperandoQuem(p) === "Operação").length;
}

const ctx = {
  ir(id, params = "") { location.hash = "#/" + id + (params ? "?" + params : ""); },
  atualizar() { pintar(); },
};

let atual = null;
let pararDeOuvirNuvem = null;

const telasDoPapel = () =>
  TELAS.filter(t => !t.oculta && t.papeis.includes(pessoas.papel()));

const inicial = () => pessoas.ehOperacao() ? "operacao" : "hoje";

// Endereços antigos continuam chegando — favorito, link no WhatsApp. A carteira
// virou um recorte da Programação, e os Números viraram Resultados.
const APELIDOS = { carteira: ["programacao", "m=carteira"], indicadores: ["resultados", ""] };

function alvo() {
  const h = (location.hash || "").replace(/^#\/?/, "");
  let [id, q] = h.split("?");
  if (APELIDOS[id]) [id, q] = APELIDOS[id];
  const params = new URLSearchParams(q || "");
  // Entrou, mas o e-mail não está na tabela `pessoas`: sem papel não há tela
  // nenhuma que faça sentido, e um menu vazio não explica nada. Volta para a
  // porta, que agora sabe dizer o que houve.
  if (!pessoas.quem() || !pessoas.papel()) {
    return { id: PORTAS.has(id) ? id : "entrar", params };
  }
  const ok = TELAS.find(t => t.id === id && (t.oculta || t.papeis.includes(pessoas.papel())));
  return { id: ok ? id : inicial(), params };
}

function pintarMenu(id) {
  const nav = $("#menu nav");
  limpar(nav);
  if (!pessoas.quem()) return;
  let grupoAtual = null;
  for (const t of telasDoPapel()) {
    if (t.grupo !== grupoAtual) {
      grupoAtual = t.grupo;
      nav.append(el("div", { class: "grupo" }, t.grupo));
    }
    let n = null;
    try { n = t.contar ? t.contar() : null; } catch (e) { n = null; }
    nav.append(el("a", { href: "#/" + t.id, class: t.id === id ? "ativo" : "" },
      el("b", {}, t.icone), el("span", {}, t.nome),
      n ? el("span", { class: "cont" }, String(n)) : null));
  }
}

/** O nome abre isto: trocar de usuário, trocar a própria senha, ou sair. No
 *  celular o menu lateral some, e com ele o nome — por isso o nome também mora
 *  no alto da tela, e é o mesmo menu. */
async function menuPessoa(p) {
  const fila = (await ev.autoresNaFila()).find(f => f.autor === p.nome);
  const botao = (rotulo, valor, explica, classe = "") => el("button", {
    class: "opcao-pessoa " + classe, type: "button", dataset: { v: valor } },
    el("b", {}, rotulo), explica ? el("small", {}, explica) : null);
  const r = await caixa({
    titulo: p.nome,
    corpo: ({ fechar }) => {
      const opcoes = [
        botao("Trocar de usuário", "trocar", "sai só deste aparelho e entra com outro e-mail"),
        !p.local && nuvem.autenticado() ? botao("Trocar minha senha", "senha", "") : null,
        botao("Sair", "sair", "sai só deste aparelho", "perigo"),
      ].filter(Boolean);
      opcoes.forEach(b => b.addEventListener("click", () => fechar(b.dataset.v)));
      return el("div", {},
        el("p", { style: "font-size:13px;color:var(--fraco);margin-top:0" },
          p.local ? "Trabalhando só neste aparelho."
            : `${(pessoas.PAPEIS[p.papel] || {}).rotulo || "sem papel"}` +
              (p.email ? ` · ${p.email}` : "")),
        fila ? el("p", { class: "morno-texto" },
          `Você tem ${fila.quantos} lançamento${fila.quantos === 1 ? "" : "s"} que ainda não ` +
          "subi" + (fila.quantos === 1 ? "u" : "ram") + ". Fica" + (fila.quantos === 1 ? "" : "m") +
          " guardado" + (fila.quantos === 1 ? "" : "s") + " aqui e sobe" + (fila.quantos === 1 ? "" : "m") +
          " quando você entrar de novo.") : null,
        el("div", { class: "opcoes-pessoa" }, opcoes));
    },
    acoes: [{ rotulo: "Fechar", valor: false }],
  });
  if (r === "sair" || r === "trocar") {
    await pessoas.sair();
    location.hash = r === "trocar" ? "#/entrar?trocar=1" : "#/entrar";
    pintar();
  } else if (r === "senha") {
    trocarSenha();
  }
}

async function trocarSenha() {
  const nova = el("input", { type: "password", autocomplete: "new-password",
    placeholder: "pelo menos 6 caracteres" });
  const repete = el("input", { type: "password", autocomplete: "new-password" });
  const r = await caixa({
    titulo: "Trocar minha senha",
    corpo: el("div", {},
      el("p", { style: "font-size:13px;color:var(--fraco)" },
        "A senha é só sua: ninguém mais a vê, nem o PCM, nem o banco."),
      el("label", { class: "campo" }, el("span", {}, "Senha nova"), senhaComOlho(nova)),
      el("label", { class: "campo" }, el("span", {}, "Repita"), senhaComOlho(repete))),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Trocar", classe: "primario", valor: true }],
  });
  if (r !== true) return;
  if (nova.value !== repete.value) return erro("As duas senhas não são iguais.");
  try {
    await nuvem.trocarSenha(nova.value);
    avisar("Senha trocada. Na próxima vez, entre com a nova.");
  } catch (e) { erro(e.message); }
}

function pintarPessoa() {
  const q = $("#quem");
  limpar(q);
  const qt = $("#quem-topo");
  if (qt) limpar(qt);
  const p = pessoas.quem();
  if (!p) return;
  const iniciaisTopo = p.nome.split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase();
  // No alto, para o celular: as iniciais e o primeiro nome. Toque abre o menu.
  if (qt) {
    qt.append(el("button", { class: "discreto chip-topo", title: `${p.nome} — trocar de usuário, senha ou sair`,
      onclick: () => menuPessoa(p) },
      el("span", { class: "av" }, iniciaisTopo),
      el("span", { class: "nome" }, p.nome.split(" ")[0])));
  }
  const iniciais = p.nome.split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase();
  q.append(el("button", {
    class: "discreto chip-pessoa", title: "Trocar a senha ou sair",
    onclick: () => menuPessoa(p),
  },
    el("span", { class: "av" }, iniciais),
    el("span", { class: "quem" },
      el("b", {}, p.nome),
      // No modo local o que mais importa saber não é o papel — é que o que se
      // lança ainda não saiu daqui.
      el("small", { title: (pessoas.PAPEIS[p.papel] || {}).rotulo || "" },
        p.local ? "só neste aparelho"
          : ((pessoas.PAPEIS[p.papel] || {}).rotulo || "sem papel")))));
}

// Carregar uma tela tem um `await` no meio (o módulo chega por rede), e duas
// pinturas podiam se cruzar aí: a de começar e a do `hashchange` que ela mesma
// provoca. As duas limpavam e as duas desenhavam — e a tela aparecia DUAS
// VEZES, uma embaixo da outra. Um contador resolve: só a pintura mais nova
// chega ao fim.
let geracaoTela = 0;

async function pintar() {
  const minha = ++geracaoTela;
  const { id, params } = alvo();
  const tela = TELAS.find(t => t.id === id);
  pintarMenu(id);
  pintarPessoa();
  $("#topo .titulo").textContent = tela.oculta ? "" : tela.nome;
  limpar($("#acoes-topo"));

  const raiz = $("#tela");
  if (atual && atual.desmontar) { try { atual.desmontar(); } catch (e) { /* segue */ } }
  atual = null;
  limpar(raiz);
  try {
    const mod = await tela.carregar();
    if (minha !== geracaoTela) return;
    limpar(raiz);
    const montado = (await mod.montar(raiz, ctx, params)) || null;
    if (minha !== geracaoTela) {
      if (montado && montado.desmontar) { try { montado.desmontar(); } catch (e) { /* segue */ } }
      return;
    }
    atual = montado;
  } catch (e) {
    console.error(e);
    if (minha !== geracaoTela) return;
    limpar(raiz).append(el("p", { class: "nada" }, "Não consegui abrir esta tela: " + e.message));
  }
  await faixa();
  window.scrollTo(0, 0);
}

// ── a faixa de avisos ───────────────────────────────────────────────────────

// Duas passadas da faixa podiam se atropelar: `pintar()` chama uma, o
// `ev.ouvir` chama outra, e as duas limpavam e escreviam no mesmo lugar com um
// `await` no meio — o texto saía duplicado na tela. Agora quem monta não
// escreve: devolve o que deve aparecer, e só a passada mais nova chega à tela.
let geracaoFaixa = 0;

async function faixa() {
  const minha = ++geracaoFaixa;
  const r = await montarFaixa();
  if (minha !== geracaoFaixa) return;
  const f = $("#faixa");
  limpar(f);
  f.className = (r && r.classe) || "";
  if (r) f.append(...r.nos);
}

async function montarFaixa() {
  if (!pessoas.quem()) return null;

  if (dados.modo === "memória") {
    return { classe: "", nos: [el("span", {},
      "⚠ Este navegador não deixa guardar dados. " +
      "Enquanto esta aba estiver aberta funciona, mas nada fica salvo.")] };
  }

  const fila = await dados.pendentes();

  // Trabalhando sem sessão: isto não pode ficar discreto. Sem senha não há
  // escrita no banco, então o que está sendo lançado existe só aqui — e dizer
  // isso com o número na frente é o que faz alguém entrar e destravar a fila.
  if (pessoas.local()) {
    return { classe: "morna", nos: [
      el("span", {}, "Você está trabalhando só neste aparelho, como " +
        `${pessoas.nome()}. ` + (fila.length
          ? `${fila.length} lançamento${fila.length === 1 ? "" : "s"} espera${fila.length === 1 ? "" : "m"} ` +
            `a senha de ${pessoas.nome()} para a equipe ver.`
          : "Nada sobe para a equipe até você entrar com senha.")),
      el("button", { class: "discreto", onclick: () => { location.hash = "#/entrar"; } },
        "Entrar com senha"),
    ] };
  }

  // Faz tempo que o banco não responde: o que os outros lançam não está
  // chegando. Isto tem de aparecer — olhar dado velho sem saber é pior que
  // não ter o dado.
  if (nuvem.ligada() && nuvem.autenticado() && !fila.length) {
    const c = nuvem.estadoConversa();
    const parado = Date.now() - Math.max(c.em, inicioDoApp) > 45000;
    if (parado) {
      const hora = c.em ? new Date(c.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
      return { classe: "morna", nos: [
        el("span", {}, (hora ? `Sem contato com o banco desde ${hora}` : "Ainda sem contato com o banco") +
          " — o que os outros lançarem aparece quando voltar." + (c.erro ? ` (${c.erro})` : "")),
        el("button", { class: "discreto", onclick: atualizarAgora }, "Atualizar agora"),
      ] };
    }
  }

  if (nuvem.ligada() && fila.length) {
    const autores = await ev.autoresNaFila();
    // De outra pessoa é outra história: não é falta de rede, é falta da senha
    // de quem assinou. A política do banco recusaria o lançamento, e por isso
    // ele fica parado — dizer de quem é o único jeito de resolver.
    const meus = autores.filter(a => a.autor === pessoas.nome())
      .reduce((s, a) => s + a.quantos, 0);
    const outros = autores.filter(a => a.autor !== pessoas.nome());
    const nos = [];
    if (meus) {
      nos.push(el("span", {}, `${meus} lançamento${meus === 1 ? "" : "s"} seu${meus === 1 ? "" : "s"} ` +
        "ainda não subiu — sem rede, ou o banco não respondeu. Fica guardado aqui e sobe sozinho."));
    }
    if (outros.length) {
      nos.push(el("span", {}, (meus ? " E " : "") +
        outros.map(a => `${a.quantos} de ${a.autor}`).join(", ") +
        (outros.length === 1 && outros[0].quantos === 1 ? " espera" : " esperam") +
        " a senha de quem assinou, neste aparelho."));
    }
    nos.push(el("button", { class: "discreto", onclick: async () => {
      const r = await ev.sincronizar();
      avisar(r.erro ? "Ainda não: " + r.erro : `Subiu ${r.subiram}, desceu ${r.desceram}.`,
        r.erro ? "ruim" : "");
      faixa();
    } }, "Tentar agora"));
    return { classe: "morna", nos };
  }

  if (!nuvem.ligada() && ev.log.length && !pessoas.ehOperacao()) {
    const b = await bk.estado();
    const perigo = b.nunca ? b.desde > 30 : (b.desde > 50 || b.dias > 7);
    if (!perigo && !(b.nunca || b.desde > 0)) return null;
    return { classe: perigo ? "" : "morna", nos: [
      el("span", {}, b.nunca
        ? `Sem banco e sem cópia: ${b.desde} lançamentos só existem neste navegador.`
        : `Última cópia há ${b.dias === 0 ? "menos de um dia" : b.dias + (b.dias === 1 ? " dia" : " dias")}` +
          (b.desde ? `, com ${b.desde} lançamento${b.desde === 1 ? "" : "s"} depois dela.` : ".")),
      el("button", { class: "discreto", onclick: salvarBackup }, "Salvar agora"),
    ] };
  }
  return null;
}

const inicioDoApp = Date.now();

/** Sobe o que está na fila e busca as novidades já, sem esperar a próxima
 *  volta — o "não apareceu ainda?" se resolve aqui. */
async function atualizarAgora() {
  if (!nuvem.ligada() || !nuvem.autenticado()) {
    avisar("Sem sessão no banco: entre com a sua senha para atualizar.", "ruim");
    return;
  }
  const antes = ev.log.length;
  const r = await ev.sincronizar();
  await nuvem.consultarAgora();
  const veio = ev.log.length - antes;
  const c = nuvem.estadoConversa();
  if (r.erro || c.erro) avisar("Não deu: " + (r.erro || c.erro), "ruim");
  else avisar(veio ? `Atualizado — ${veio} novidade${veio === 1 ? "" : "s"}.` : "Atualizado — nada novo.");
  faixa();
}

async function salvarBackup() {
  bk.baixar(await bk.exportar(), bk.nomeDoArquivo());
  await bk.marcarFeito();
  avisar("Cópia salva. Guarde o arquivo fora deste computador.");
  await faixa();
}

// ── nuvem ───────────────────────────────────────────────────────────────────

async function ligarNuvem() {
  if (pararDeOuvirNuvem) { pararDeOuvirNuvem(); pararDeOuvirNuvem = null; }
  if (!nuvem.ligada() || !nuvem.autenticado()) return;
  await ev.sincronizar();
  pararDeOuvirNuvem = nuvem.observar(async novos => {
    const n = await ev.receber(novos);
    if (n) { avisar(`${n} lançamento${n === 1 ? "" : "s"} de outra pessoa.`); pintarMenu(alvo().id); }
  });
}

// ── começo ──────────────────────────────────────────────────────────────────

async function comecar() {
  await dados.abrir();
  await nuvem.carregarConfig();
  await pessoas.carregar();
  await ev.carregar();
  document.documentElement.dataset.tema = await dados.lerMeta("tema", "");

  const bAtualizar = $("#batualizar");
  if (bAtualizar) bAtualizar.addEventListener("click", atualizarAgora);
  // A faixa de "sem contato" depende do relógio, não só de lançamento novo.
  setInterval(() => { if (pessoas.quem()) faixa(); }, 15000);

  $("#btema").addEventListener("click", async () => {
    const novo = document.documentElement.dataset.tema === "claro" ? "" : "claro";
    document.documentElement.dataset.tema = novo;
    await dados.gravarMeta("tema", novo);
  });

  window.addEventListener("hashchange", pintar);
  ev.ouvir(() => { faixa(); pintarMenu(alvo().id); });
  nuvem.aoLigar(async () => {
    // O banco disse que a sessão deste aparelho acabou: quem estava dentro
    // volta para a porta, com o porquê, em vez de ficar numa tela que só
    // recebe recusa. O que foi lançado aqui fica na fila.
    if (nuvem.ligada() && !nuvem.autenticado() && nuvem.motivoDaSaida() &&
        pessoas.quem() && !pessoas.local()) {
      await pessoas.carregar();
      const naUrl = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
      if (!pessoas.quem() && !PORTAS.has(naUrl)) location.hash = "#/entrar";
      pintar();
    }
    ligarNuvem();
  });

  // Sem ninguém dentro a URL tem de ser uma das portas — mas se já FOR uma, não
  // se troca: mandar quem abriu o link do diagnóstico para a tela de entrar é
  // exatamente o que ele não consegue fazer agora.
  if (!pessoas.quem()) {
    const porta = alvo().id;
    if (!location.hash.startsWith("#/" + porta)) location.hash = "#/" + porta;
  }

  await pintar();
  await ligarNuvem();
  registrarOffline();
}

function registrarOffline() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").catch(() => { /* segue sem offline */ });
}

comecar().catch(e => {
  console.error(e);
  limpar($("#tela")).append(el("p", { class: "nada" }, "Não consegui começar: " + e.message));
});

globalThis.mkt = { ev, dados, bk, nuvem, pessoas, ctx, M,
  conferir: () => ev.conferir(), ligarNuvem };
