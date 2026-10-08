// A casca: carrega a fita, descobre quem está usando, escolhe a tela.

import * as ev from "./eventos.js";
import * as dados from "./dados.js";
import * as nuvem from "./nuvem.js";
import * as pessoas from "./pessoas.js";
import * as bk from "./backup.js";
import { el, $, limpar, avisar, erro } from "./ui.js";

const TELAS = [
  { id: "operacao", icone: "✋", nome: "Para você", papeis: ["operacao"],
    carregar: () => import("./tela/operacao.js") },
  { id: "hoje", icone: "☀", nome: "Hoje", papeis: ["pcm"],
    carregar: () => import("./tela/hoje.js") },
  { id: "semana", icone: "▦", nome: "Semana", papeis: ["pcm"],
    carregar: () => import("./tela/semana.js") },
  { id: "carteira", icone: "☰", nome: "Carteira", papeis: ["pcm"],
    carregar: () => import("./tela/carteira.js") },
  { id: "movimentacoes", icone: "⇄", nome: "Movimentação", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/movimentacoes.js") },
  { id: "preventivas", icone: "⏱", nome: "Preventivas", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/preventivas.js") },
  { id: "frota", icone: "▤", nome: "Frota", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/frota.js") },
  { id: "indicadores", icone: "◔", nome: "Números", papeis: ["pcm"],
    carregar: () => import("./tela/indicadores.js") },
  { id: "historico", icone: "⟲", nome: "Registro", papeis: ["pcm", "operacao"],
    carregar: () => import("./tela/historico.js") },
  { id: "importar", icone: "⇪", nome: "Importar", papeis: ["pcm"],
    carregar: () => import("./tela/importar.js") },
  { id: "entrar", icone: "👤", nome: "Entrar", papeis: [], oculta: true,
    carregar: () => import("./tela/entrar.js") },
];

const ctx = {
  ir(id, params = "") { location.hash = "#/" + id + (params ? "?" + params : ""); },
  atualizar() { pintar(); },
};

let atual = null;
let pararDeOuvirNuvem = null;

function telasDoPapel() {
  const p = pessoas.papel();
  return TELAS.filter(t => !t.oculta && t.papeis.includes(p));
}

function inicial() {
  return pessoas.ehOperacao() ? "operacao" : "hoje";
}

function alvo() {
  const h = (location.hash || "").replace(/^#\/?/, "");
  const [id, q] = h.split("?");
  const params = new URLSearchParams(q || "");
  if (!pessoas.quem()) return { id: "entrar", params };
  const permitida = TELAS.find(t => t.id === id && (t.oculta || t.papeis.includes(pessoas.papel())));
  return { id: permitida ? id : inicial(), params };
}

function pintarNav(id) {
  const nav = $("#nav");
  limpar(nav);
  if (!pessoas.quem()) return;
  for (const t of telasDoPapel()) {
    nav.append(el("a", { href: "#/" + t.id, class: t.id === id ? "ativo" : "" },
      el("b", {}, t.icone), el("span", {}, t.nome)));
  }
}

async function pintar() {
  const { id, params } = alvo();
  pintarNav(id);
  const tela = TELAS.find(t => t.id === id);
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
  pintarTopo();
  await faixa();
  window.scrollTo(0, 0);
}

// ── topo ────────────────────────────────────────────────────────────────────

function pintarTopo() {
  const q = $("#quem");
  limpar(q);
  const p = pessoas.quem();
  if (!p) return;
  q.append(el("button", {
    class: "discreto chip-pessoa",
    title: "Trocar de pessoa",
    onclick: () => ctx.ir("entrar"),
  }, el("b", {}, p.nome.split(" ")[0]),
    el("small", {}, pessoas.ehOperacao() ? "operação" : "PCM")));
}

// ── a faixa de avisos ───────────────────────────────────────────────────────
// Só aparece quando há o que dizer: onde os dados estão sendo guardados quando
// não é o lugar bom, quanto falta subir, e há quanto tempo não há cópia.

async function faixa() {
  const f = $("#faixa");
  limpar(f);
  f.className = "";

  if (dados.modo === "memória") {
    f.append(el("span", {}, "⚠ Este navegador não deixa guardar dados. " +
      "Enquanto esta aba estiver aberta funciona, mas nada fica salvo."));
    return;
  }

  const fila = await dados.pendentes();
  if (nuvem.ligada() && fila.length) {
    f.className = "morna";
    f.append(el("span", {}, `${fila.length} lançamento${fila.length === 1 ? "" : "s"} ` +
      "ainda não subiu — sem rede, ou a nuvem não respondeu. Fica guardado aqui e sobe sozinho."),
      el("button", { class: "discreto", onclick: async () => {
        const r = await ev.sincronizar();
        avisar(r.erro ? "Ainda não: " + r.erro : `Subiu ${r.subiram}, desceu ${r.desceram}.`,
          r.erro ? "ruim" : "");
        faixa();
      } }, "Tentar agora"));
    return;
  }

  // Sem nuvem ligada, o único seguro é o arquivo de backup — e aí o aviso de
  // cópia volta a ser o aviso importante.
  if (!nuvem.ligada() && ev.log.length && !pessoas.ehOperacao()) {
    const b = await bk.estado();
    const perigo = b.nunca ? b.desde > 30 : (b.desde > 50 || b.dias > 7);
    if (!perigo && !(b.nunca || b.desde > 0)) return;
    f.className = perigo ? "" : "morna";
    f.append(el("span", {}, b.nunca
      ? `Sem nuvem e sem cópia: ${b.desde} lançamentos só existem neste navegador.`
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
  if (!await nuvem.carregarConfig()) return;
  await ev.sincronizar();
  pararDeOuvirNuvem = nuvem.observar(async novos => {
    const n = await ev.receber(novos);
    if (n) avisar(`${n} lançamento${n === 1 ? "" : "s"} de outra pessoa.`);
  });
}

// ── tema ────────────────────────────────────────────────────────────────────

async function aplicarTema() {
  document.documentElement.dataset.tema = await dados.lerMeta("tema", "");
}

// ── começo ──────────────────────────────────────────────────────────────────

async function comecar() {
  await dados.abrir();
  await pessoas.carregar();
  await ev.carregar();
  await aplicarTema();

  $("#btema").addEventListener("click", async () => {
    const agora = document.documentElement.dataset.tema;
    const novo = agora === "escuro" ? "claro" : agora === "claro" ? "" : "escuro";
    document.documentElement.dataset.tema = novo;
    await dados.gravarMeta("tema", novo);
  });

  window.addEventListener("hashchange", pintar);
  ev.ouvir(() => { faixa(); });

  if (!pessoas.quem()) location.hash = "#/entrar";
  else if (!ev.log.length && !location.hash && !pessoas.ehOperacao()) location.hash = "#/importar";

  // Religa a escuta sempre que a nuvem for ligada ou desligada pela tela.
  nuvem.aoLigar(() => { ligarNuvem(); });

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

// À mão, para conferência pelo console.
globalThis.mkt = { ev, dados, bk, nuvem, pessoas, ctx,
  conferir: () => ev.conferir(), ligarNuvem };
