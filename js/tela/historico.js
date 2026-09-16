// O registro inteiro, do mais novo para o mais velho.
//
// É a tela que responde "por que isto mudou?" — e o pedido que deu origem ao
// site. Filtra por frota, por OS, por tipo de lançamento e por período, porque
// a pergunta quase nunca é sobre tudo: é sobre uma frota, numa semana.

import * as ev from "../eventos.js";
import { TIPOS } from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, selecao, avisar, vazio } from "../ui.js";
import { descreverEvento, frotas } from "./comum.js";
import { busca as semAcento } from "../texto.js";

const PAGINA = 150;

export async function montar(raiz, ctx, params) {
  let mostrando = PAGINA;

  const fBusca = el("input", { class: "busca", type: "search",
    placeholder: "frota, OS, atividade, motivo…", oninput: reiniciar });
  const fTipo = selecao([{ v: "", t: "Tipo: todos" },
    ...Object.entries(TIPOS).map(([v, t]) => ({ v, t }))], "", { onchange: reiniciar });
  const fFrota = el("select", { onchange: reiniciar });
  const fDe = el("input", { type: "date", onchange: reiniciar, style: "width:auto" });
  const fAte = el("input", { type: "date", onchange: reiniciar, style: "width:auto" });

  const contagem = el("span", { class: "sub" });
  const corpo = el("div", {});

  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Registro"), contagem,
      el("div", { class: "espaco" }),
      el("button", { onclick: conferir }, "Conferir o registro")),
    el("p", { style: "color:var(--fraco);font-size:13px;margin-bottom:10px" },
      "Tudo que mudou, com data, hora e motivo. Nenhuma alteração entra no " +
      "sistema por fora daqui — é a mesma fita que monta as outras telas."),
    el("div", { class: "filtros" }, fBusca, fTipo, fFrota,
      el("span", { style: "font-size:12.5px;color:var(--fraco)" }, "de"), fDe,
      el("span", { style: "font-size:12.5px;color:var(--fraco)" }, "até"), fAte),
    corpo);

  function reiniciar() { mostrando = PAGINA; pintar(); }

  function filtrar() {
    const q = semAcento(fBusca.value.trim());
    return ev.log.filter(e => {
      if (fTipo.value && e.tipo !== fTipo.value) return false;
      const d = e.ts.slice(0, 10);
      if (fDe.value && d < fDe.value) return false;
      if (fAte.value && d > fAte.value) return false;
      const a = ev.porId(e.alvo);
      if (fFrota.value && (!a || a.frota !== fFrota.value)) return false;
      if (q) {
        const alvo = semAcento([a && a.frota, a && a.os, a && a.atividade,
          e.motivo, e.tipo, e.origem].filter(Boolean).join(" "));
        if (!alvo.includes(q)) return false;
      }
      return true;
    }).reverse();
  }

  function pintar() {
    const antes = fFrota.value;
    limpar(fFrota);
    fFrota.append(el("option", { value: "" }, "Frota: todas"));
    for (const f of frotas()) fFrota.append(el("option", { value: f, selected: f === antes }, f));

    const itens = filtrar();
    contagem.textContent = `${itens.length} lançamento${itens.length === 1 ? "" : "s"}`;

    limpar(corpo);
    if (!itens.length) { corpo.append(vazio("Nada com esses filtros.")); return; }

    corpo.append(el("div", {}, itens.slice(0, mostrando).map(e => descreverEvento(e, true))));
    if (itens.length > mostrando) {
      corpo.append(el("button", { style: "margin-top:12px",
        onclick: () => { mostrando += PAGINA; pintar(); } },
        `Mostrar mais (${itens.length - mostrando} restantes)`));
    }
  }

  // O botão que prova a promessa: toca a fita do zero e compara com o que está
  // na tela. Divergência aqui é bug, não opinião.
  function conferir() {
    const r = ev.conferir();
    avisar(r.ok
      ? `Confere: ${ev.log.length} lançamentos reconstroem as ${r.total} atividades.`
      : `Divergiram ${r.divergencias.length} de ${r.total} — veja o console.`,
      r.ok ? "" : "ruim");
    if (!r.ok) console.warn("divergências", r.divergencias);
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
