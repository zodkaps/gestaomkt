// A lista "O que decidir agora": as decisões de `js/decisoes.js` em linhas,
// do urgente à oportunidade, cada uma com o porquê e o botão que já abre a
// ação de sempre. Nada aqui grava sozinho.

import * as ev from "../eventos.js";
import { el, chip, erro } from "../ui.js";
import { copiar } from "./contexto.js";

const NIVEL = { 1: ["Urgente", "vencida"], 2: ["Atenção", "hoje"], 3: ["Oportunidade", "ok"] };

// O que se lança a partir daqui leva o título da decisão (ver
// `ev.porDecisao`): o Registro mostra e filtra o que saiu do Painel.
async function executar(a, ctx, d = {}) {
  if (a.ir) { ev.porDecisao(d, a.ir[0]); return ctx.ir(a.ir[0], a.ir[1]); }
  if (a.copiar) return copiar(a.copiar, "Texto");
  if (a.prev) {
    const pv = await import("./preventivas.js");
    const p = ev.porId(a.id, "preventiva");
    if (!p) return erro("Esta preventiva não existe mais.");
    ev.porDecisao(d);
    try {
      if (a.prev === "parada") return await pv.marcarParada(p, { sugestao: a.sugestao || "" });
      if (a.prev === "realizada") return await pv.darPorFeita(p);
      if (a.prev === "adiar") return await pv.passarParaOMesSeguinte(p);
    } finally { ev.porDecisao(null); }
  }
}

/** `max`: quantas mostrar antes do "ver todas" (0 = todas). */
export function listaDecisoes(ds, ctx, { max = 0, comArea = false } = {}) {
  if (!ds.length) return el("p", { class: "nada decisao-vazia" }, "Nada pedindo decisão agora.");
  const caixa = el("div", { class: "decisoes" });
  let limite = max || ds.length;
  const pintar = () => {
    caixa.replaceChildren(...ds.slice(0, limite).map(d => {
      const [rot, cor] = NIVEL[d.nivel] || NIVEL[2];
      // Com o id, o botão direito na linha abre o menu da preventiva.
      return el("div", { class: "decisao n" + d.nivel, "data-id": d.id || null },
        el("div", { class: "d-cab" }, chip(rot, cor), comArea ? el("span", { class: "d-area" }, d.area) : null),
        el("div", { class: "d-meio" },
          el("div", { class: "d-tit" }, d.titulo),
          d.detalhe ? el("div", { class: "d-det" }, d.detalhe) : null),
        el("div", { class: "d-acoes" }, (d.acoes || []).map((a, i) => el("button", {
          type: "button", class: i === 0 ? "mini primario-leve" : "mini",
          onclick: () => executar(a, ctx, d).catch(e => erro(e.message)) }, a.rotulo))));
    }), ds.length > limite ? el("button", { class: "discreto ver-mais",
      onclick: () => { limite = ds.length; pintar(); } }, `Ver todas (${ds.length})`) : "");
  };
  pintar();
  return caixa;
}
