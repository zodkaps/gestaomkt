// O calendário do mês e a coluna da direita — a agenda que a Movimentação e
// as Preventivas usam desde 23/10/2026 (o exemplo que o PCM mandou: o mês em
// grade, cada coisa como uma etiqueta no seu dia, e ao lado o que é do dia,
// um número do andamento e o alerta do que está atrasado).
//
// Aqui só a forma: quem chama diz o que vai em cada dia (`itens`), a cor de
// cada etiqueta (`classe`) e o que fazer ao tocar no dia ou na etiqueta. No
// celular a etiqueta vira um ponto e o dia tocado abre a lista embaixo.

import * as M from "../modelo.js";
import { el, brCurto } from "../ui.js";

export const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "2026-10" e um número de meses → "2026-11". */
export function somaMesISO(mes, n) {
  const [a, m] = String(mes).split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, "0")}`;
}
/** "2026-10" → "Outubro 2026". */
export const nomeMesISO = mes => {
  const [a, m] = String(mes).split("-").map(Number);
  return NOMES[m - 1] ? `${NOMES[m - 1][0].toUpperCase()}${NOMES[m - 1].slice(1)} ${a}` : String(mes);
};
/** "2026-10-23" → "quinta, 23/10". */
export const diaPorExtenso = iso => `${DIA_SEMANA[M.data(iso).getUTCDay()]}, ${brCurto(iso)}`;

/** ‹ Outubro 2026 › e o botão Hoje. */
export function navMes(mes, aoMudar, ref = M.hoje()) {
  const mesHoje = ref.slice(0, 7);
  return el("div", { class: "cal-nav" },
    el("button", { type: "button", class: "cal-seta", title: "Mês anterior", "aria-label": "Mês anterior",
      onclick: () => aoMudar(somaMesISO(mes, -1)) }, "‹"),
    el("b", { class: "cal-mes" }, nomeMesISO(mes)),
    el("button", { type: "button", class: "cal-seta", title: "Próximo mês", "aria-label": "Próximo mês",
      onclick: () => aoMudar(somaMesISO(mes, 1)) }, "›"),
    mes !== mesHoje ? el("button", { type: "button", class: "cal-hoje-b", onclick: () => aoMudar(mesHoje) }, "Hoje") : null);
}

/** O mês em grade, de segunda a domingo. `itens`: { dia, rotulo (texto ou
 *  nós), classe, titulo, id }. Cabem `max` etiquetas por dia; o resto vira "+N", que abre
 *  o dia. */
export function calendarioMes({ mes, itens = [], ref = M.hoje(), selecionado = "", aoDia = null, aoItem = null, max = 3 }) {
  const [a, m] = mes.split("-").map(Number);
  const primeiro = `${mes}-01`;
  const recuo = (M.data(primeiro).getUTCDay() + 6) % 7;          // segunda = 0
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const semanas = Math.ceil((recuo + diasMes) / 7);
  const inicio = M.somaDias(primeiro, -recuo);
  const porDia = new Map();
  for (const it of itens) {
    if (!it.dia) continue;
    if (!porDia.has(it.dia)) porDia.set(it.dia, []);
    porDia.get(it.dia).push(it);
  }

  const celulas = [];
  for (let i = 0; i < semanas * 7; i++) {
    const d = M.somaDias(inicio, i);
    const doDia = porDia.get(d) || [];
    const fora = d.slice(0, 7) !== mes;
    const fim = i % 7 >= 5;
    const abrir = () => aoDia && aoDia(d);
    const chips = doDia.slice(0, doDia.length > max ? max - 1 : max).map(it => el("button", {
      type: "button", class: "ev-chip " + (it.classe || ""), title: it.titulo || String(it.rotulo), dataset: { id: it.id || "" },
      onclick: e => { e.stopPropagation(); aoItem ? aoItem(it) : abrir(); } }, it.rotulo));
    const resto = doDia.length - chips.length;
    celulas.push(el("div", {
      class: "cal-dia" + (fora ? " fora" : "") + (fim ? " fim" : "") + (d === ref ? " hoje" : "") +
        (d === selecionado ? " sel" : "") + (doDia.length ? " tem" : ""),
      dataset: { dia: d }, onclick: abrir },
      el("button", { type: "button", class: "cal-num", "aria-label": diaPorExtenso(d) + (doDia.length ? ` · ${doDia.length}` : ""),
        onclick: e => { e.stopPropagation(); abrir(); } }, String(Number(d.slice(8, 10)))),
      el("div", { class: "cal-evs" }, chips,
        resto > 0 ? el("button", { type: "button", class: "ev-mais", onclick: e => { e.stopPropagation(); abrir(); } }, `+${resto} mais`) : null),
      // no celular: um ponto por etiqueta (até quatro), na cor dela
      doDia.length ? el("div", { class: "cal-pontos", "aria-hidden": "true" },
        doDia.slice(0, 4).map(it => el("i", { class: it.classe || "" }))) : null));
  }
  return el("div", { class: "cal" },
    el("div", { class: "cal-sem" }, SEMANA.map((s, i) => el("span", { class: i >= 5 ? "fim" : "" }, s))),
    el("div", { class: "cal-grade", style: `grid-template-rows: repeat(${semanas}, minmax(0, 1fr))` }, celulas));
}

/** A tela da agenda: o calendário (num cartão) e a coluna da direita. */
export function agenda(calendario, ...trilho) {
  return el("div", { class: "agenda" },
    el("div", { class: "agenda-cal" }, calendario),
    el("aside", { class: "trilho" }, trilho.filter(Boolean)));
}

/** Um cartão da coluna da direita. */
export function cartaoTrilho(titulo, conteudo, { classe = "", acao = null, sub = "" } = {}) {
  return el("section", { class: "tr-card " + classe },
    el("header", { class: "tr-cab" }, el("h2", {}, titulo), sub ? el("span", { class: "tr-sub" }, sub) : null),
    conteudo, acao);
}

/** Uma linha da agenda do dia: o ponto na cor da situação, o que é, e os
 *  botões. */
export function itemAgenda({ classe = "", titulo, sub = "", tags = [], acoes = [], aoClicar = null, id = "" }) {
  return el("div", { class: "ag-item " + classe, dataset: { id }, onclick: aoClicar },
    el("i", { class: "ag-ponto", "aria-hidden": "true" }),
    el("div", { class: "ag-meio" },
      el("div", { class: "ag-tit" }, titulo),
      sub ? el("div", { class: "ag-sub" }, sub) : null,
      tags.length || acoes.length ? el("div", { class: "ag-pe" },
        tags.length ? el("div", { class: "ag-tags" }, tags) : null,
        acoes.length ? el("div", { class: "ag-acoes", onclick: e => e.stopPropagation() }, acoes) : null) : null));
}

/** O anel do andamento: a parte feita, o número no meio e a legenda ao lado
 *  — o "Weekly Goals" do exemplo. `partes`: [{ rotulo, valor, cor }]; a
 *  primeira é a que o número do meio conta. */
export function anel(partes, { centro = null, rotuloCentro = "" } = {}) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const L = 96, R = 42, esp = 11, C = 2 * Math.PI * (R - esp / 2);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${L} ${L}`);
  svg.setAttribute("width", L); svg.setAttribute("height", L);
  svg.setAttribute("class", "anel-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", partes.map(p => `${p.rotulo}: ${p.valor}`).join("; "));
  const circulo = (cor, frac, inicio) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", L / 2); c.setAttribute("cy", L / 2); c.setAttribute("r", R - esp / 2);
    c.setAttribute("fill", "none"); c.setAttribute("stroke-width", esp);
    c.style.stroke = cor;
    if (frac != null) {
      // 2px de folga entre as partes, como o espaço entre barras
      const comp = Math.max(0, frac * C - (partes.length > 1 && frac < 1 ? 2 : 0));
      c.setAttribute("stroke-dasharray", `${comp} ${C}`);
      c.setAttribute("stroke-dashoffset", String(-inicio * C));
      c.setAttribute("transform", `rotate(-90 ${L / 2} ${L / 2})`);
    }
    return c;
  };
  svg.append(circulo("var(--anel-fundo)", null));
  let ac = 0;
  if (total) for (const p of partes) {
    if (!p.valor) continue;
    svg.append(circulo(p.cor, p.valor / total, ac));
    ac += p.valor / total;
  }
  const meio = centro != null ? centro : total ? Math.round(partes[0].valor * 100 / total) + "%" : "—";
  return el("div", { class: "anel" },
    el("div", { class: "anel-roda" }, svg, el("div", { class: "anel-meio" }, el("b", {}, meio),
      rotuloCentro ? el("small", {}, rotuloCentro) : null)),
    el("ul", { class: "anel-leg" }, partes.map(p => el("li", {},
      el("i", { style: `background:${p.cor}` }), el("span", {}, p.rotulo), el("b", {}, String(p.valor))))));
}

/** A segunda e o domingo da semana de `ref`. */
export function semanaDe(ref) {
  const seg = M.somaDias(ref, -((M.data(ref).getUTCDay() + 6) % 7));
  return { de: seg, ate: M.somaDias(seg, 6) };
}

/** Agenda ou Lista: os dois jeitos de ver a mesma coisa. */
export function trocaVista(atual, aoMudar, opcoes = [["agenda", "Agenda"], ["lista", "Lista"]]) {
  return el("div", { class: "segmentos troca-vista", role: "group", "aria-label": "Ver como" },
    opcoes.map(([v, rot]) => el("button", { type: "button", class: "seg-op" + (v === atual ? " on" : ""), dataset: { vista: v },
      "aria-pressed": v === atual ? "true" : "false", onclick: () => aoMudar(v) }, rot)));
}
