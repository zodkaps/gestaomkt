// A casca: carrega a fita, descobre quem entrou, escolhe o módulo.

import * as ev from "./eventos.js";
import * as dados from "./dados.js";
import * as nuvem from "./nuvem.js";
import * as pessoas from "./pessoas.js";
import * as M from "./modelo.js";
import * as bk from "./backup.js";
import { el, $, limpar, avisar, erro } from "./ui.js";

// Agrupadas como um sistema de manutenção agrupa: o que se faz hoje, o que se
// planeja, o que depende de outra área, e o que se olha depois.
const TELAS = [
  { id: "operacao", icone: "✋", nome: "Para você", grupo: "Operação", papeis: ["operacao"],
    carregar: () => import("./tela/operacao.js"),
    contar: () => contagemOperacao() },
  { id: "hoje", icone: "☀", nome: "Hoje", grupo: "Programação", papeis: ["pcm"],
    carregar: () => import("./tela/hoje.js") },
  { id: "semana", icone: "▦", nome: "Semana", grupo: "Programação", papeis: ["pcm"],
    carregar: () => import("./tela/semana.js") },
  { id: "carteira", icone: "☰", nome: "Carteira", grupo: "Programação", papeis: ["pcm"],
    carregar: () => import("./tela/carteira.js"),
    contar: () => ev.lista().filter(a => !a.semana && M.aberta(a)).length },
  { id: "movimentacoes", icone: "⇄", nome: "Movimentação", grupo: "Frota", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/movimentacoes.js"),
    contar: () => ev.lista("movimentacao").filter(M.movimentacaoAberta).length },
  { id: "preventivas", icone: "⏱", nome: "Preventivas", grupo: "Frota", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/preventivas.js"),
    contar: () => ev.lista("preventiva").filter(M.preventivaAberta).length },
  { id: "frota", icone: "▤", nome: "Frota", grupo: "Frota", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/frota.js") },
  { id: "indicadores", icone: "◔", nome: "Números", grupo: "Gestão", papeis: ["pcm"],
    carregar: () => import("./tela/indicadores.js") },
  { id: "historico", icone: "⟲", nome: "Registro", grupo: "Gestão", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/historico.js") },
  { id: "importar", icone: "⇪", nome: "Importar", grupo: "Gestão", papeis: ["pcm"],
    carregar: () => import("./tela/importar.js") },
  { id: "entrar", icone: "", nome: "Entrar", grupo: "", papeis: [], oculta: true,
    carregar: () => import("./tela/entrar.js") },
];

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

function alvo() {
  const h = (location.hash || "").replace(/^#\/?/, "");
  const [id, q] = h.split("?");
  const params = new URLSearchParams(q || "");
  if (!pessoas.quem()) return { id: "entrar", params };
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

function pintarPessoa() {
  const q = $("#quem");
  limpar(q);
  const p = pessoas.quem();
  if (!p) return;
  const iniciais = p.nome.split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase();
  q.append(el("button", {
    class: "discreto chip-pessoa", title: "Sair",
    onclick: async () => {
      await pessoas.sair();
      location.hash = "#/entrar";
      pintar();
    },
  },
    el("span", { class: "av" }, iniciais),
    el("span", { class: "quem" },
      el("b", {}, p.nome),
      el("small", {}, (pessoas.PAPEIS[p.papel] || {}).rotulo || "sem papel"))));
}

async function pintar() {
  const { id, params } = alvo();
  const tela = TELAS.find(t => t.id === id);
  pintarMenu(id);
  pintarPessoa();
  $("#topo .titulo").textContent = tela.oculta ? "" : tela.nome;
  limpar($("#acoes-topo"));

  const raiz = $("#tela");
  if (atual && atual.desmontar) { try { atual.desmontar(); } catch (e) { /* segue */ } }
  limpar(raiz);
  try {
    const mod = await tela.carregar();
    atual = (await mod.montar(raiz, ctx, params)) || null;
  } catch (e) {
    console.error(e);
    limpar(raiz).append(el("p", { class: "nada" }, "Não consegui abrir esta tela: " + e.message));
  }
  await faixa();
  window.scrollTo(0, 0);
}

// ── a faixa de avisos ───────────────────────────────────────────────────────

async function faixa() {
  const f = $("#faixa");
  limpar(f);
  f.className = "";
  if (!pessoas.quem()) return;

  if (dados.modo === "memória") {
    f.append(el("span", {}, "⚠ Este navegador não deixa guardar dados. " +
      "Enquanto esta aba estiver aberta funciona, mas nada fica salvo."));
    return;
  }

  const fila = await dados.pendentes();
  if (nuvem.ligada() && fila.length) {
    f.className = "morna";
    f.append(el("span", {}, `${fila.length} lançamento${fila.length === 1 ? "" : "s"} ` +
      "ainda não subiu — sem rede, ou o banco não respondeu. Fica guardado aqui e sobe sozinho."),
      el("button", { class: "discreto", onclick: async () => {
        const r = await ev.sincronizar();
        avisar(r.erro ? "Ainda não: " + r.erro : `Subiu ${r.subiram}, desceu ${r.desceram}.`,
          r.erro ? "ruim" : "");
        faixa();
      } }, "Tentar agora"));
    return;
  }

  if (!nuvem.ligada() && ev.log.length && !pessoas.ehOperacao()) {
    const b = await bk.estado();
    const perigo = b.nunca ? b.desde > 30 : (b.desde > 50 || b.dias > 7);
    if (!perigo && !(b.nunca || b.desde > 0)) return;
    f.className = perigo ? "" : "morna";
    f.append(el("span", {}, b.nunca
      ? `Sem banco e sem cópia: ${b.desde} lançamentos só existem neste navegador.`
      : `Última cópia há ${b.dias === 0 ? "menos de um dia" : b.dias + (b.dias === 1 ? " dia" : " dias")}` +
        (b.desde ? `, com ${b.desde} lançamento${b.desde === 1 ? "" : "s"} depois dela.` : ".")),
      el("button", { class: "discreto", onclick: salvarBackup }, "Salvar agora"));
  }
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

  $("#btema").addEventListener("click", async () => {
    const novo = document.documentElement.dataset.tema === "claro" ? "" : "claro";
    document.documentElement.dataset.tema = novo;
    await dados.gravarMeta("tema", novo);
  });

  window.addEventListener("hashchange", pintar);
  ev.ouvir(() => { faixa(); pintarMenu(alvo().id); });
  nuvem.aoLigar(() => { ligarNuvem(); });

  if (!pessoas.quem()) location.hash = "#/entrar";

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
