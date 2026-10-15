// O quadro da semana: arrastar e soltar.
//
// Os dias da semana em colunas e, à esquerda, o que pode entrar nela: a
// carteira (sem semana) ou as vencidas de outras semanas. Arrastar um cartão
// da carteira para um dia programa na hora. Mudar de dia, ou trazer uma
// vencida, é reprogramação e pede o motivo — a mesma regra da ficha e do
// "Programar várias", porque é o mesmo lançamento (`ev.reprogramar`). Soltar
// na coluna da esquerda tira da programação, com motivo também.
//
// Só no computador: arrastar com o dedo numa lista que rola não funciona
// direito. No celular, a Programação com "Programar várias" faz o mesmo.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, brCurto, avisar, erro, cliqueLimpo } from "../ui.js";
import { abrirFicha, pedirMotivo, retirarDaProgramacao } from "./comum.js";
import { celulaQuem, ordenarPorSituacao } from "./grade.js";

const n1 = v => (Math.round(v * 10) / 10).toLocaleString("pt-BR");
const LOTE = 40;

// a coluna da esquerda lembra o que estava aberto ao repintar
const estado = { origem: "carteira", busca: "", limite: LOTE };
// a rolagem de cada coluna, para voltar ao mesmo ponto depois de repintar
const rolagens = new Map();
const guardarRolagem = (chave, lista) => {
  lista.addEventListener("scroll", () => rolagens.set(chave, lista.scrollTop), { passive: true });
  requestAnimationFrame(() => { if (rolagens.has(chave)) lista.scrollTop = rolagens.get(chave); });
  return lista;
};

const temTexto = a => !!(a.atividade || a.frota);
const visivel = a => temTexto(a) && !a.excluida && !a.cancelada;

/** Onde a atividade está, em palavras: "Qua 14/10", "semana 41, Ter", "carteira". */
function ondeEsta(a, ano, semana) {
  if (a.semana == null) return "carteira";
  if (a.semana === semana && a.ano === ano) {
    if (!a.dia) return "sem dia nesta semana";
    const i = M.DIAS.indexOf(a.dia);
    return `${a.dia} ${brCurto(M.datasDaSemana(ano, semana)[i])}`;
  }
  return `semana ${a.semana}${a.dia ? ", " + a.dia : ""}`;
}

/** As que podem entrar na semana: a carteira, ou as vencidas de outras semanas. */
export function paraOQuadro(lista, { ano, semana, origem = "carteira", busca = "", ref = M.hoje() } = {}) {
  const q = String(busca || "").trim().toLowerCase();
  return lista.filter(a => visivel(a) && M.aberta(a) && (origem === "vencidas"
    ? a.semana != null && !(a.semana === semana && a.ano === ano) && M.situacaoDe(a, ref) === "VENCIDA"
    : a.semana == null))
    .filter(a => !q || [a.frota, a.atividade, a.os, ...(a.executantes || [])]
      .some(x => String(x || "").toLowerCase().includes(q)))
    .sort(origem === "vencidas" ? ordenarPorSituacao(ref) : M.ordemCarteira(ref));
}

/** As colunas da semana: Seg a Sáb (Dom só se tiver algo), e "Sem dia" se houver. */
export function colunasDaSemana(lista, { ano, semana }) {
  const daSemana = lista.filter(a => visivel(a) && a.semana === semana && a.ano === ano);
  const datas = M.datasDaSemana(ano, semana);
  const dias = M.DIAS.filter((d, i) => i < 6 || daSemana.some(a => a.dia === d));
  const cols = dias.map(d => ({ dia: d, data: datas[M.DIAS.indexOf(d)], itens: daSemana.filter(a => a.dia === d) }));
  const semDia = daSemana.filter(a => !M.DIAS.includes(a.dia));
  if (semDia.length) cols.push({ dia: "", data: "", itens: semDia });
  return cols;
}

function cartaoQuadro(a, ctx, ref, pode) {
  const s = M.situacaoDe(a, ref);
  const aberta = M.aberta(a);
  return el("div", {
    class: "q-cartao" + (aberta ? "" : " feito") + (M.ehPreventiva(a) ? " prev" : ""),
    draggable: pode && aberta ? true : null, dataset: { id: a.id },
    title: aberta && pode ? "Arraste para um dia · clique para abrir" : "Clique para abrir",
    onclick: cliqueLimpo(() => abrirFicha(a.id, ctx)) },
    el("div", { class: "q-cab" },
      el("b", {}, a.frota || "—"),
      a.os ? el("span", { class: "q-os" }, a.os) : aberta ? el("span", { class: "q-os sem" }, "sem OS") : null,
      a.prioridade ? el("span", { class: "tag" + (a.prioridade === "P1" ? " p1" : "") }, a.prioridade) : null,
      (a.dias || 1) > 1 ? el("span", { class: "tag" }, `${a.dias} dias`) : null),
    el("div", { class: "q-ativ" }, a.atividade || "—"),
    el("div", { class: "q-pe" },
      el("span", { class: "sit " + M.corDe(s) }, M.rotulo(s)),
      a.hh ? el("span", { class: "q-hh" }, `${n1(a.hh)} HH`) : null),
    el("div", { class: "q-quem" }, celulaQuem(a)));
}

/** O quadro inteiro. `focarBusca`: devolver o foco à busca depois de repintar. */
export function quadroSemana({ ano, semana, ctx, focarBusca = false }) {
  const ref = M.hoje();
  const pode = pessoas.pode("programar");
  const todas = ev.lista();
  const cols = colunasDaSemana(todas, { ano, semana });

  // ── a coluna da esquerda: carteira ou vencidas, com busca
  const lista = guardarRolagem(`origem:${estado.origem}`, el("div", { class: "q-lista" }));
  const contagem = { carteira: paraOQuadro(todas, { ano, semana, origem: "carteira", ref }).length,
    vencidas: paraOQuadro(todas, { ano, semana, origem: "vencidas", ref }).length };
  const pintarLista = () => {
    const itens = paraOQuadro(todas, { ano, semana, origem: estado.origem, busca: estado.busca, ref });
    lista.replaceChildren(
      ...itens.slice(0, estado.limite).map(a => cartaoQuadro(a, ctx, ref, pode)),
      itens.length > estado.limite ? el("button", { type: "button", class: "discreto q-mais",
        onclick: () => { estado.limite += LOTE; pintarLista(); } }, `Mostrar mais (${itens.length - estado.limite})`) : null,
      !itens.length ? el("p", { class: "nada" }, estado.busca ? "Nada com essa busca."
        : estado.origem === "vencidas" ? "Nenhuma vencida de outra semana." : "Carteira vazia.") : null);
  };
  const busca = el("input", { type: "search", class: "q-busca", value: estado.busca,
    placeholder: "frota, atividade, OS…", "aria-label": "Buscar na coluna",
    oninput: e => { estado.busca = e.target.value; estado.limite = LOTE; pintarLista(); } });
  const origem = (id, nome) => el("button", { type: "button", class: "seg-op" + (estado.origem === id ? " on" : ""),
    onclick: () => { estado.origem = id; estado.limite = LOTE; quadro.replaceWith(quadroSemana({ ano, semana, ctx })); } },
    nome, " ", el("span", { class: "n" }, String(contagem[id])));
  const esquerda = el("section", { class: "q-col q-origem", dataset: { alvo: "carteira" } },
    el("header", { class: "q-col-cab" },
      el("div", { class: "segmentos" }, origem("carteira", "Carteira"), origem("vencidas", "Vencidas")),
      busca),
    lista);
  pintarLista();

  // ── os dias
  const colunaDia = c => {
    const hh = c.itens.reduce((t, a) => t + (Number(a.hh) || 0), 0);
    const feitas = c.itens.filter(a => M.feita(a)).length;
    return el("section", { class: "q-col q-dia" + (c.data === ref ? " hoje" : "") + (c.dia ? "" : " sem-dia"),
      dataset: { alvo: "dia", dia: c.dia } },
      el("header", { class: "q-col-cab" },
        el("div", { class: "q-dia-tit" }, el("b", {}, c.dia || "Sem dia"),
          c.data ? el("span", {}, brCurto(c.data)) : null,
          c.data === ref ? el("span", { class: "tag" }, "hoje") : null),
        el("div", { class: "q-dia-conta" },
          `${c.itens.length} atividade${c.itens.length === 1 ? "" : "s"}` +
          (feitas ? ` · ${feitas} concluída${feitas === 1 ? "" : "s"}` : "") +
          (hh ? ` · ${n1(hh)} HH` : ""))),
      guardarRolagem(`dia:${ano}-${semana}-${c.dia}`, el("div", { class: "q-lista" },
        c.itens.slice().sort(ordenarPorSituacao(ref)).map(a => cartaoQuadro(a, ctx, ref, pode)),
        !c.itens.length ? el("p", { class: "q-vazio" }, pode ? "Solte aqui" : "—") : null)));
  };

  const quadro = el("div", { class: "quadro" + (pode ? "" : " so-ver") },
    esquerda, el("div", { class: "q-dias" }, cols.map(colunaDia)));

  // ── arrastar e soltar (delegado no quadro)
  let arrastado = null;
  const alvoDe = e => e.target.closest && e.target.closest(".q-col");
  quadro.addEventListener("dragstart", e => {
    const c = e.target.closest && e.target.closest(".q-cartao[draggable=true]");
    if (!c) return;
    arrastado = c.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", arrastado);
    requestAnimationFrame(() => { c.classList.add("arrastando"); quadro.classList.add("arrastando"); });
  });
  quadro.addEventListener("dragend", e => {
    arrastado = null;
    quadro.classList.remove("arrastando");
    quadro.querySelectorAll(".arrastando, .sobre").forEach(n => n.classList.remove("arrastando", "sobre"));
  });
  quadro.addEventListener("dragover", e => {
    const col = alvoDe(e);
    if (!arrastado || !col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!col.classList.contains("sobre")) {
      quadro.querySelectorAll(".q-col.sobre").forEach(n => n.classList.remove("sobre"));
      col.classList.add("sobre");
    }
  });
  quadro.addEventListener("dragleave", e => {
    const col = alvoDe(e);
    if (col && !col.contains(e.relatedTarget)) col.classList.remove("sobre");
  });
  quadro.addEventListener("drop", e => {
    const col = alvoDe(e);
    if (!col) return;
    e.preventDefault();
    const id = arrastado || e.dataTransfer.getData("text/plain");
    col.classList.remove("sobre");
    const destino = col.dataset.alvo === "carteira" ? { carteira: true } : { dia: col.dataset.dia || "" };
    soltar(id, destino, { ano, semana }).catch(x => erro(x.message || String(x)));
  });

  if (focarBusca) requestAnimationFrame(() => {
    busca.focus();
    try { busca.setSelectionRange(busca.value.length, busca.value.length); } catch (x) { /* sem seleção */ }
  });
  return quadro;
}

/** O que acontece ao soltar `id` em `destino` ({ dia } ou { carteira }). */
export async function soltar(id, destino, { ano, semana }) {
  const a = ev.porId(id);
  if (!a || !M.aberta(a)) return false;
  if (destino.carteira) {
    if (a.semana == null) return false;
    return retirarDaProgramacao([a]);
  }
  const dia = destino.dia || "";
  if (a.semana === semana && a.ano === ano && (a.dia || "") === dia) return false;
  const para = { ano, semana, dia, dias: a.dias || 1, hh: a.hh ?? 0 };
  const onde = dia ? `${dia} ${brCurto(M.datasDaSemana(ano, semana)[M.DIAS.indexOf(dia)])}` : `semana ${semana}, sem dia`;

  let motivo = "";
  if (a.semana != null) {
    motivo = await pedirMotivo({
      titulo: "Reprogramar",
      corpo: el("div", {},
        el("p", {}, el("b", {}, a.frota || "—"), " · ", a.atividade || "—"),
        el("p", { class: "nada" }, `De ${ondeEsta(a, ano, semana)} para ${onde}.`)),
    });
    if (motivo == null) return false;
  }
  const e = ev.reprogramar(a, para, motivo);
  if (!e) return false;
  const aviso = `${a.frota || "Atividade"} · ${a.semana == null ? "programada" : "reprogramada"} para ${onde}`;
  await ev.aplicar(e);
  avisar(aviso);
  return true;
}

