// Preventivas em lote: marcar várias frotas no Plano e lançar o mesmo passo
// para todas de uma vez — a liberação, a parada, a chegada ou a realização.
//
// O PCM pediu (03/11/2026) "mais registros por opção": com 26 frotas
// esperando a liberação, uma caixa por frota era atrito. Cada caixa daqui
// monta os MESMOS lançamentos que a caixa de uma frota só (ev.informar…,
// ev.marcarParada, ev.registrarEntrega, ev.preventivaFeita): as regras — o
// motivo para remarcar, a justificativa de quem chegou atrasado, a data que
// não pode ser depois de hoje — são conferidas no mesmo lugar.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, caixa, campo, selecao, avisar, erro, br, brCurto } from "../ui.js";
import { camposJustificativa } from "./comum.js";

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const natural = (a, b) => String(a.frota || "").localeCompare(String(b.frota || ""), "pt-BR", { numeric: true });
const libDe = p => p.disponivel_agora ? "agora" : (p.disponivel_em || "");
const libTexto = p => p.disponivel_agora ? "liberada agora" : p.disponivel_em ? `liberação ${brCurto(p.disponivel_em)}` : "sem liberação";

/** O que cada lote faz, quem pode e a quem se aplica. A barra do Plano usa
 *  isto para mostrar só os botões que servem para as marcadas. */
export const LOTES = [
  { id: "liberar", rotulo: "Informar liberação", pode: "disponibilidade", serve: p => M.preventivaAberta(p) && !p.entregue_em && !p.em_andamento },
  { id: "parada", rotulo: "Marcar parada", pode: "parada", serve: p => M.preventivaAberta(p) && !p.entregue_em && !p.em_andamento },
  { id: "chegou", rotulo: "Chegou", pode: "parada", serve: p => M.preventivaAberta(p) && !p.entregue_em },
  { id: "feita", rotulo: "Já realizada", pode: "preventiva_feita", serve: p => M.preventivaAberta(p) },
];

/** A caixinha só aparece na linha em que algum lote que a pessoa pode fazer
 *  serve: a operação, que só libera, não marca a frota que já está na oficina. */
export const podeMarcar = p => LOTES.some(l => pessoas.pode(l.pode) && l.serve(p));

/** Abre a caixa do lote para as preventivas marcadas (só as que servem). */
export function abrirLote(id, marcadas) {
  const l = LOTES.find(x => x.id === id);
  const itens = marcadas.filter(l.serve).sort(natural);
  if (!itens.length) { avisar("Nenhuma das marcadas está nesse passo."); return Promise.resolve(false); }
  return ({ liberar: liberarEmLote, parada: pararEmLote, chegou: chegouEmLote, feita: realizadasEmLote })[id](itens);
}

/** A lista das frotas da caixa, cada uma com a caixinha (todas marcadas) e o
 *  que já se sabe dela. `extra(p)` põe um campo no fim da linha. */
function listaDoLote(itens, info, extra = null, aoMudar = () => {}) {
  const marcas = new Map();
  const ul = el("ul", { class: "lote-prev" }, itens.map(p => {
    const c = el("input", { type: "checkbox", checked: true, "aria-label": `Incluir ${p.frota}`, onchange: aoMudar });
    marcas.set(p.id, c);
    return el("li", {}, el("label", {}, c, el("b", {}, p.frota || "—"),
      el("small", {}, [p.plano, info(p)].filter(Boolean).join(" · "))), extra ? extra(p) : null);
  }));
  return { no: ul, escolhidas: () => itens.filter(p => marcas.get(p.id).checked) };
}

async function gravar(eventos, texto) {
  if (!eventos.length) { avisar("Nada mudou."); return false; }
  try {
    await ev.aplicar(eventos);
    avisar(texto);
    return true;
  } catch (x) { erro(x.message); return false; }
}

/** O motivo pronto, num toque, como na caixa de uma frota só. */
function motivoEmChips(rotulo) {
  let cat = "";
  const eDetalhe = el("input", { type: "text", placeholder: "detalhe, se quiser — ex.: saiu para viagem, volta sexta" });
  const bCat = M.MOTIVOS_ATRASO.map(m => el("button", { type: "button", class: "chip-op", dataset: { cat: m.id },
    onclick: () => { cat = m.id; bCat.forEach(b => b.classList.toggle("on", b.dataset.cat === cat)); if (cat === "outro") eDetalhe.focus(); } }, m.nome));
  const no = el("div", { class: "campo" }, el("span", {}, rotulo),
    el("div", { class: "chips-escolha", role: "group", "aria-label": rotulo }, bCat), eDetalhe);
  return {
    no, cat: () => cat,
    texto: () => {
      if (cat === "outro" && !eDetalhe.value.trim()) throw new Error("Escreva qual foi o motivo.");
      return cat && cat !== "outro" ? [M.nomeMotivo(cat), eDetalhe.value.trim()].filter(Boolean).join(" — ") : eDetalhe.value.trim();
    },
  };
}

// ── 1. liberação ────────────────────────────────────────────────────────────

async function liberarEmLote(itens) {
  const eQuando = el("input", { type: "date", value: M.hoje() });
  let escolha = "agora";
  const bAgora = el("button", { type: "button" }, "Disponível agora");
  const bData = el("button", { type: "button" }, "Disponível a partir de…");
  const linhaData = el("div", {}, campo("A partir de", eQuando));
  const motivo = motivoEmChips("Por que mudou (obrigatório para as que já tinham liberação)");
  const aviso = el("p", { class: "nada" });
  const quando = () => escolha === "agora" ? "agora" : eQuando.value;
  let lista;
  const atualizar = () => {
    bAgora.className = escolha === "agora" ? "primario" : "";
    bData.className = escolha === "data" ? "primario" : "";
    linhaData.style.display = escolha === "data" ? "" : "none";
    const remarca = lista ? lista.escolhidas().filter(p => libDe(p) && libDe(p) !== quando()) : [];
    motivo.no.hidden = !remarca.length;
    aviso.textContent = remarca.length
      ? `${plural(remarca.length, "frota já tinha", "frotas já tinham")} liberação (${remarca.map(p => p.frota).join(", ")}). Mudar fica no registro, com o motivo, e conta na Avaliação da operação.`
      : "A manutenção programa a parada depois desta informação.";
  };
  lista = listaDoLote(itens, libTexto, null, atualizar);
  bAgora.onclick = () => { escolha = "agora"; atualizar(); };
  bData.onclick = () => { escolha = "data"; atualizar(); };
  eQuando.addEventListener("input", atualizar);
  atualizar();
  const r = await caixa({
    titulo: `Liberação de ${plural(itens.length, "frota", "frotas")}`, largura: "560px",
    corpo: el("div", {},
      el("div", { style: "display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap" }, bAgora, bData),
      linhaData, lista.no, aviso, motivo.no),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Informar", classe: "primario", acao: () => {
        const q = quando();
        if (!q) throw new Error("Escolha a data.");
        const escolhidas = lista.escolhidas();
        if (!escolhidas.length) throw new Error("Marque ao menos uma frota.");
        const remarca = escolhidas.some(p => libDe(p) && libDe(p) !== q);
        const texto = remarca ? motivo.texto() : "";
        if (remarca && !texto && !motivo.cat()) throw new Error("Toque no motivo da mudança.");
        return escolhidas.filter(p => libDe(p) !== q).map(p => ev.informarDisponibilidade(p, q, libDe(p) ? texto : "", libDe(p) ? motivo.cat() : ""));
      } }],
  });
  if (!r) return false;
  const q = r.length ? r[0].dados.quando : "";
  return gravar(r, `${plural(r.length, "frota", "frotas")}: ${q === "agora" ? "disponível agora" : "disponível a partir de " + br(q)}.`);
}

// ── 2. parada ───────────────────────────────────────────────────────────────

async function pararEmLote(itens) {
  const eDia = el("input", { type: "date", value: M.hoje() });
  const eOnde = selecao([{ v: "", t: "— manter o de cada uma —" }, "Interna", "Terceiro"], "");
  const eMotivo = el("input", { type: "text", placeholder: "ex.: frota em viagem, oficina cheia, peça não chegou" });
  const caixaMotivo = el("div", {}, campo("Motivo da reprogramação", eMotivo,
    "Obrigatório para as que já tinham parada em outro dia. Fica no registro de cada uma."));
  const aviso = el("p", { class: "nada" });
  let lista;
  const atualizar = () => {
    const esc = lista ? lista.escolhidas() : [];
    const reprog = esc.filter(p => p.dia_parada && p.dia_parada !== eDia.value);
    const semLib = esc.filter(p => !libDe(p));
    caixaMotivo.hidden = !reprog.length;
    aviso.textContent = [reprog.length ? `${plural(reprog.length, "já tinha", "já tinham")} parada: ${reprog.map(p => `${p.frota} (${brCurto(p.dia_parada)})`).join(", ")}.` : "",
      semLib.length ? `⚠ ${plural(semLib.length, "frota ainda sem", "frotas ainda sem")} a liberação da operação.` : ""].filter(Boolean).join(" ");
  };
  lista = listaDoLote(itens, p => [libTexto(p), p.dia_parada ? `parada ${brCurto(p.dia_parada)}` : ""].filter(Boolean).join(" · "), null, atualizar);
  eDia.addEventListener("input", atualizar);
  atualizar();
  const r = await caixa({
    titulo: `Parada de ${plural(itens.length, "frota", "frotas")}`, largura: "560px",
    corpo: el("div", {}, campo("Dia da parada", eDia), campo("Onde fazer", eOnde), lista.no, aviso, caixaMotivo),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Marcar", classe: "primario", acao: () => {
        const escolhidas = lista.escolhidas();
        if (!escolhidas.length) throw new Error("Marque ao menos uma frota.");
        return escolhidas.filter(p => p.dia_parada !== eDia.value || (eOnde.value && eOnde.value !== p.onde_fazer))
          .map(p => ev.marcarParada(p, eDia.value, eOnde.value || p.onde_fazer || "", eMotivo.value));
      } }],
  });
  if (!r) return false;
  return gravar(r, `${plural(r.length, "parada marcada", "paradas marcadas")} para ${br(eDia.value)}.`);
}

// ── 3. chegada ──────────────────────────────────────────────────────────────

async function chegouEmLote(itens) {
  const ref = M.hoje();
  const dias = new Map();
  const j = camposJustificativa("movimentacao");
  const caixaJ = el("div", {}, el("p", { class: "nada", style: "color:var(--hoje)" }), j.no);
  let lista;
  const atrasadas = () => (lista ? lista.escolhidas() : []).filter(p => {
    const c = M.combinadoEntrega(p), d = dias.get(p.id).value;
    return c && d && d > c;
  });
  const atualizar = () => {
    const a = atrasadas();
    caixaJ.hidden = !a.length;
    caixaJ.firstChild.textContent = a.length
      ? `${a.map(p => `${p.frota} (${M.difDias(M.combinadoEntrega(p), dias.get(p.id).value)} d)`).join(", ")} chegou depois do combinado. Toque no motivo e em quem atrasou — vale para ${a.length === 1 ? "ela" : "todas essas"}.`
      : "";
  };
  const campoDia = p => {
    const d = el("input", { type: "date", max: ref, value: p.dia_parada && p.dia_parada <= ref ? p.dia_parada : ref,
      "aria-label": `Chegou em (${p.frota})`, oninput: atualizar });
    dias.set(p.id, d);
    return d;
  };
  lista = listaDoLote(itens, p => p.dia_parada ? `parada ${brCurto(p.dia_parada)}` : "sem parada marcada", campoDia, atualizar);
  atualizar();
  const r = await caixa({
    titulo: `Chegada de ${plural(itens.length, "frota", "frotas")} na oficina`, largura: "600px",
    corpo: el("div", {}, el("p", { class: "nada", style: "margin-top:0" }, "O dia em que cada frota chegou. Vem com o dia da parada, se já passou; senão, hoje."),
      lista.no, caixaJ),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Gravar", classe: "primario", acao: () => {
        const escolhidas = lista.escolhidas();
        if (!escolhidas.length) throw new Error("Marque ao menos uma frota.");
        const tarde = new Set(atrasadas().map(p => p.id));
        const f = tarde.size && j.falta();
        if (f) throw new Error(f);
        return escolhidas.map(p => ev.registrarEntrega(p, dias.get(p.id).value, tarde.has(p.id) ? j.valores() : {}));
      } }],
  });
  if (!r) return false;
  return gravar(r, `${plural(r.length, "chegada anotada", "chegadas anotadas")}.`);
}

// ── 4. já realizada ─────────────────────────────────────────────────────────
// Também é o atalho de adiantar: a preventiva feita sem ter passado pelos
// passos no site (a frota foi direto, ou a parada foi combinada de boca) vai
// para Realizadas de uma vez; os passos que faltaram ficam em branco.

export async function realizadasEmLote(itens) {
  const ref = M.hoje();
  const dias = new Map(), oss = new Map();
  const eTodas = el("input", { type: "date", max: ref, value: ref, "aria-label": "Mesma data para todas",
    oninput: () => { if (eTodas.value) for (const d of dias.values()) d.value = eTodas.value; } });
  const campos = p => {
    const d = el("input", { type: "date", max: ref, value: ref, "aria-label": `Realizada em (${p.frota})` });
    const o = el("input", { value: p.os || "", inputmode: "numeric", placeholder: "OS", class: "lote-os", "aria-label": `OS (${p.frota})` });
    dias.set(p.id, d); oss.set(p.id, o);
    return el("span", { class: "lote-campos" }, d, o);
  };
  const pulam = itens.filter(p => M.passoPreventiva(p) !== "baixa");
  const lista = listaDoLote(itens, p => M.passoPreventiva(p) === "baixa" ? (p.entregue_em ? `na oficina desde ${brCurto(p.entregue_em)}` : "na oficina")
    : `pula: ${M.PASSOS_PREV.slice(M.PASSOS_PREV.findIndex(x => x.id === M.passoPreventiva(p)), 3).map(x => x.nome.toLowerCase()).join(", ")}`, campos);
  const r = await caixa({
    titulo: itens.length === 1 ? "Preventiva já realizada" : `${itens.length} preventivas já realizadas`, largura: "640px",
    corpo: el("div", {},
      pulam.length ? el("p", { class: "nada", style: "margin-top:0" },
        "Adiantar: a preventiva vai direto para Realizadas. Os passos que faltaram ficam em branco no registro.") : null,
      itens.length > 1 ? campo("Mesma data para todas", eTodas) : null,
      lista.no),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: itens.length === 1 ? "Dar a baixa" : "Dar a baixa nas marcadas", classe: "primario", acao: () => {
        const escolhidas = lista.escolhidas();
        if (!escolhidas.length) throw new Error("Marque ao menos uma frota.");
        return escolhidas.map(p => {
          const os = oss.get(p.id).value.replace(/\D+/g, "");
          return ev.preventivaFeita(p, dias.get(p.id).value, os ? os.padStart(6, "0") : "");
        });
      } }],
  });
  if (!r) return false;
  return gravar(r, r.length === 1 ? `${itens.find(p => p.id === r[0].alvo).frota}: preventiva realizada.` : `${r.length} preventivas realizadas.`);
}
