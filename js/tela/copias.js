// A caixa "Lançamentos em cópias antigas": o que foi lançado nas cópias que
// este aparelho tinha de antes da sincronização (ver `js/legado.js`), com a
// atividade certa de cada um, para levar com um clique — ou dispensar o que
// não tem correspondência. Nada vai sem a pessoa confirmar.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { lancamentosEmCopias, levarParaAsCertas, descrever } from "../legado.js";
import { el, caixa, avisar, erro } from "../ui.js";

const CHAVE = "mkt:copias-dispensadas";

function dispensados() {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || "[]")); } catch (e) { return new Set(); }
}
function dispensar(ids) {
  try { localStorage.setItem(CHAVE, JSON.stringify([...dispensados(), ...ids])); } catch (e) { /* só conveniência */ }
}

/** O que ainda pede decisão: com certa e por levar, ou sem certa e não dispensado. */
export function pendentesDeCopias() {
  const fora = dispensados();
  return lancamentosEmCopias().filter(it => !it.feito && !fora.has(it.e.id));
}

export async function abrirCopias() {
  const itens = pendentesDeCopias();
  if (!itens.length) { avisar("Nada lançado em cópias antigas."); return false; }
  const comCerta = itens.filter(it => it.certa);
  const semCerta = itens.filter(it => !it.certa);
  const linha = it => el("tr", {},
    el("td", {}, el("b", {}, it.copia.frota || "—")),
    el("td", {}, it.copia.atividade || "—"),
    el("td", {}, descrever(it.e)),
    el("td", {}, it.certa
      ? el("span", {}, el("b", {}, it.certa.id), ` · ${M.situacaoDe(it.certa)}`, it.por === "OS" ? " · pela OS" : "")
      : el("span", { class: "t-hoje" }, it.porque)));
  const r = await caixa({
    titulo: "Lançamentos em cópias antigas deste aparelho",
    largura: "860px",
    corpo: el("div", {},
      el("p", {}, "Este navegador guardava a planilha importada antes da sincronização com o banco, com códigos ",
        "próprios. Cada atividade aparecia duas vezes, e estes lançamentos foram feitos na cópia antiga — ",
        el("b", {}, "a atividade de verdade, a do banco, não recebeu"), ". As cópias já não aparecem nas telas."),
      comCerta.length ? el("p", {}, `${comCerta.length} têm a atividade certa encontrada (mesma frota e mesma atividade). ` +
        "Levar faz o mesmo lançamento nela, com a mesma data e o mesmo motivo.") : null,
      semCerta.length ? el("p", { class: "nada" }, `${semCerta.length} sem correspondência certa: confira na Programação e lance à mão, ` +
        "depois dispense aqui.") : null,
      el("div", { class: "tabela-rolagem" }, el("table", { class: "tabela" },
        el("thead", {}, el("tr", {}, el("th", {}, "Frota"), el("th", {}, "Atividade (cópia)"),
          el("th", {}, "Lançamento"), el("th", {}, "Atividade certa"))),
        el("tbody", {}, [...comCerta, ...semCerta].map(linha))))),
    acoes: [
      { rotulo: "Agora não", valor: false },
      semCerta.length ? { rotulo: `Dispensar as ${semCerta.length} sem correspondência`, valor: "dispensar" } : null,
      comCerta.length ? { rotulo: `Levar ${comCerta.length} para as certas`, classe: "primario",
        acao: () => ({ eventos: levarParaAsCertas(comCerta) }) } : null,
    ].filter(Boolean),
  });
  if (r === "dispensar") { dispensar(semCerta.map(it => it.e.id)); avisar("Dispensados."); return true; }
  if (!r || !r.eventos) return false;
  if (!r.eventos.length) { avisar("As atividades certas já estavam assim."); return true; }
  try {
    await ev.aplicar(r.eventos);
    avisar(`${r.eventos.length} lançamento${r.eventos.length === 1 ? "" : "s"} levado${r.eventos.length === 1 ? "" : "s"} para as atividades certas.`);
    return true;
  } catch (e) { erro(e.message); return false; }
}
