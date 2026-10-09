// Movimentações — a aba Movimentações da planilha, e o aperto de mão que ela
// não tinha.
//
// Os números do alto são os da planilha, com as mesmas contas: quantas, quantas
// concluídas, quantas no prazo, a pontualidade da operação, o atraso médio e
// os dias perdidos. A situação é CALCULADA das datas, com nomes genéricos —
// Em aberto, Vence hoje, Atrasada, Concluída, Concluída com atraso — que valem
// para frota que vai, frota que volta e box que libera.
//
// O que muda o jeito de trabalhar: quem faz a movimentação (a operação, o
// Pedro) é quem marca como concluída. Concluída pela operação fica
// "Aguardando aprovação" até o PCM conferir e aprovar — ou devolver, com o
// porquê. O PCM não lança mais o que a operação fez; ele confere.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, br, brCurto, chip, caixa, campo, selecao, comSugestoes,
  avisar, erro, confirmar, vazio, cliqueLimpo } from "../ui.js";
import { frotas, valoresDe, justificar, camposJustificativa } from "./comum.js";
import { busca as semAcento } from "../texto.js";

const QUEM = ["Operação", "Makro Engenharia", "Terceiro", "Manutenção"];
const ORDEM = ["Atrasada", "Vence hoje", "Aguardando aprovação", "Em aberto", "Sem prazo",
  "Concluída com atraso", "Concluída", "Cancelada"];

// ── cartão (celular, e a tela Para você) ────────────────────────────────────

export function cartaoMov(m, ctx, { acoes = [] } = {}) {
  const s = M.situacaoMovimentacao(m);
  const atraso = M.atrasoMovimentacao(m);
  const tags = [chip(s, M.corDe(s))];
  if (atraso > 0) tags.push(chip(`${atraso} dia${atraso === 1 ? "" : "s"} de atraso`, "vencida"));
  if (m.devolvida && !m.chegou_em) tags.push(chip("devolvida pelo PCM", "hoje"));
  if (m.quem_prometeu && m.quem_prometeu !== "Operação") tags.push(chip(m.quem_prometeu));

  const sub = [];
  if (m.para_que) sub.push(m.para_que);
  if (m.prometida_para) sub.push("prazo " + brCurto(m.prometida_para));
  if (m.chegou_em) sub.push("concluída " + brCurto(m.chegou_em) +
    (m.concluida_por ? ` por ${m.concluida_por}` : ""));

  return el("div", { class: `at ${M.corDe(s)}${m.chegou_em && m.aprovada ? " feito" : ""}` },
    el("div", { class: "meio", style: "cursor:pointer",
      onclick: cliqueLimpo(() => abrirFichaMov(m.id, ctx)) },
      el("div", { class: "tit" }, `${m.frota} · ${m.destino || "—"}`),
      sub.length ? el("div", { class: "sub" }, sub.join(" · ")) : null,
      m.devolvida && !m.chegou_em && m.motivo_devolucao
        ? el("div", { class: "sub", style: "color:var(--hoje)" }, "devolvida: " + m.motivo_devolucao) : null,
      m.motivo_atraso || m.quem_atrasou
        ? el("div", { class: "sub" }, "por quê: " + [m.motivo_atraso || m.justificativa,
          m.quem_atrasou].filter(Boolean).join(" · ")) : null,
      el("div", { class: "tags" }, tags)),
    acoes.length ? el("div", { class: "acoes" }, acoes) : null);
}

// ── ações ───────────────────────────────────────────────────────────────────

export async function novaMovimentacao(ctx, sugestao = {}) {
  const eFrota = el("input", { value: sugestao.frota || "" });
  const eDestino = el("input", { placeholder: "digite para onde vai ou o fornecedor" });
  const eParaQue = el("input", { placeholder: "digite para quê" });
  const ePedida = el("input", { type: "date", value: M.hoje() });
  const ePrometida = el("input", { type: "date" });
  const eQuem = selecao(QUEM, "Operação");

  const r = await caixa({
    titulo: "Nova movimentação",
    corpo: el("div", {},
      el("div", { class: "dupla" },
        campo("Frota", comSugestoes(eFrota, frotas(), "dl-mov-frota")),
        campo("Para quê", eParaQue)),
      // Texto livre: cada movimentação tem o seu destino, e lista pronta
      // virava "padrão" onde não devia.
      campo("Destino / fornecedor", eDestino),
      el("div", { class: "tripla" },
        campo("Pedida em", ePedida),
        campo("Prazo (prometida para)", ePrometida),
        campo("Quem prometeu", eQuem))),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Registrar", classe: "primario", valor: true }],
  });
  if (r !== true) return null;
  if (!eFrota.value.trim()) { erro("Falta a frota."); return null; }

  try {
    const [criado] = await ev.aplicar(ev.pedirMovimentacao({
      frota: eFrota.value.trim(),
      destino: eDestino.value.trim(),
      para_que: eParaQue.value.trim(),
      pedida_em: ePedida.value,
      prometida_para: ePrometida.value,
      quem_prometeu: eQuem.value,
    }));
    avisar("Movimentação registrada.");
    return criado.alvo;
  } catch (e) { erro(e.message); return null; }
}

/** Marcar como concluída. Da operação, vai para a fila de aprovação do PCM. */
export async function concluirMov(m) {
  const eData = el("input", { type: "date", value: M.hoje() });
  const prazo = m.prometida_para;
  const vaiAprovada = pessoas.pode("aprovar");
  // Passou do prazo: o porquê é pedido aqui — quem conclui é quem sabe.
  const j = camposJustificativa("movimentacao",
    { motivo: m.motivo_atraso, quem: m.quem_atrasou, texto: m.justificativa });
  const caixaAtraso = el("div", { class: "bloco-atraso" },
    el("p", { class: "nada" }, "Passou do prazo — por quê? (opcional, mas ajuda o PCM a aprovar)"), j.no);
  const verAtraso = () => { caixaAtraso.hidden = !(prazo && eData.value && eData.value > prazo); };
  eData.addEventListener("change", verAtraso);
  eData.addEventListener("input", verAtraso);
  verAtraso();
  const r = await caixa({
    titulo: "Concluir movimentação",
    corpo: el("div", {},
      el("p", {}, el("b", {}, m.frota), " · ", m.destino || "—",
        m.para_que ? ` — ${m.para_que}` : ""),
      el("p", { class: "nada" }, prazo ? `O prazo era ${br(prazo)}.` : "Não tinha prazo."),
      campo("Concluída em", eData),
      caixaAtraso,
      el("p", { class: "nada" }, vaiAprovada
        ? "Você é do PCM: ela já entra aprovada."
        : "Ela fica Aguardando aprovação até o PCM conferir.")),
    acoes: [{ rotulo: "Voltar", valor: false },
      { rotulo: "Concluir", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  try {
    const eventos = [ev.concluirMovimentacao(m, eData.value)];
    if (!caixaAtraso.hidden && j.preenchido()) eventos.push(ev.justificar(m, j.valores(), "movimentacao"));
    await ev.aplicar(eventos);
    const atraso = prazo ? Math.max(0, M.difDias(prazo, eData.value) || 0) : 0;
    avisar(`${m.frota}: concluída${atraso ? ` com ${atraso} dia(s) de atraso` : ""}` +
      (vaiAprovada ? "." : " — aguardando aprovação."));
    return true;
  } catch (e) { erro(e.message); return false; }
}
// O nome antigo continua valendo para quem ainda chama.
export const apontarChegada = concluirMov;

export async function aprovar(m) {
  try {
    await ev.aplicar(ev.aprovarMovimentacao(m));
    avisar(`${m.frota}: aprovada.`);
  } catch (e) { erro(e.message); }
}

export async function devolver(m) {
  const motivo = el("input", { placeholder: "o que não confere" });
  const r = await caixa({
    titulo: "Devolver para a operação",
    corpo: el("div", {},
      el("p", {}, el("b", {}, m.frota), " · ", m.destino || "—",
        ` — concluída em ${br(m.chegou_em)}${m.concluida_por ? " por " + m.concluida_por : ""}.`),
      el("p", { class: "nada" }, "Ela volta a ficar em aberto, com o motivo à vista de quem concluiu."),
      campo("Motivo", motivo)),
    acoes: [{ rotulo: "Voltar", valor: false },
      { rotulo: "Devolver", classe: "perigo", valor: true }],
  });
  if (r !== true) return;
  try {
    await ev.aplicar(ev.devolverMovimentacao(m, motivo.value.trim()));
    avisar(`${m.frota}: devolvida.`);
  } catch (e) { erro(e.message); }
}

export async function prometerData(m) {
  const eData = el("input", { type: "date", value: m.prometida_para || M.hoje() });
  const eQuem = selecao(QUEM, m.quem_prometeu || "Operação");
  const r = await caixa({
    titulo: m.prometida_para ? "Mudar o prazo" : "Dar o prazo",
    corpo: el("div", {},
      el("p", {}, el("b", {}, m.frota), " · ", m.destino || "—"),
      campo("Prometida para", eData),
      campo("Quem prometeu", eQuem)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Gravar", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  try {
    await ev.aplicar(ev.prometer(m, eData.value, eQuem.value));
    avisar("Prazo registrado.");
    return true;
  } catch (e) { erro(e.message); return false; }
}

async function cancelarMov(m) {
  const e = el("input", { placeholder: "Por quê" });
  const ok = await caixa({ titulo: "Cancelar movimentação",
    corpo: campo("Motivo", e),
    acoes: [{ rotulo: "Voltar", valor: false }, { rotulo: "Cancelar", classe: "perigo", valor: true }] });
  if (ok !== true) return;
  try { await ev.aplicar(ev.cancelarMovimentacao(m, e.value)); avisar("Cancelada."); }
  catch (x) { erro(x.message); }
}

const ROTULO_EVENTO = e => {
  const d = e.dados || {};
  return ({
    criada: "registrou a movimentação", importada: "veio da planilha",
    mov_prometida: `deu o prazo: ${br(d.para)}`,
    mov_chegou: `concluiu em ${br(d.em)}`,
    mov_aprovada: "aprovou",
    mov_devolvida: "devolveu",
    mov_cancelada: "cancelou", editada: "editou",
    justificada: "justificou: " + [d.motivo || d.texto, d.quem && `quem atrasou: ${d.quem}`]
      .filter(Boolean).join(" · "),
  })[e.tipo] || ev.TIPOS[e.tipo] || e.tipo;
};

export async function abrirFichaMov(id, ctx) {
  const m = ev.porId(id, "movimentacao");
  if (!m) return;
  const s = M.situacaoMovimentacao(m);
  const atraso = M.atrasoMovimentacao(m);
  const linha = (r, v) => v ? el("tr", {}, el("th", {}, r), el("td", {}, v)) : null;

  const hist = ev.historicoDe(id);
  const corpo = el("div", {},
    el("table", { class: "tabela" },
      linha("Situação", el("span", {}, chip(s, M.corDe(s)))),
      linha("Frota", m.frota),
      linha("Destino", m.destino),
      linha("Para quê", m.para_que),
      linha("Pedida em", m.pedida_em ? br(m.pedida_em) : null),
      linha("Prazo", m.prometida_para ? br(m.prometida_para) : null),
      linha("Quem prometeu", m.quem_prometeu),
      linha("Concluída em", m.chegou_em ? br(m.chegou_em) : null),
      linha("Concluída por", m.chegou_em ? m.concluida_por : null),
      linha("Aprovada", m.chegou_em && m.aprovada
        ? (m.aprovada_por ? `por ${m.aprovada_por}${m.aprovada_em ? " em " + br(m.aprovada_em) : ""}` : "sim (planilha)")
        : null),
      linha("Devolvida", m.devolvida && !m.chegou_em ? (m.motivo_devolucao || "sim") : null),
      linha("Atraso", atraso ? `${atraso} dia(s)` : null),
      linha("Por que atrasou", [m.motivo_atraso, m.justificativa && m.justificativa !== m.motivo_atraso
        ? m.justificativa : ""].filter(Boolean).join(" · ") || null),
      linha("Quem atrasou", m.quem_atrasou || null),
      linha("Observação", m.obs)),
    el("h2", { class: "mini" }, `Registro · ${hist.length}`),
    el("div", {}, hist.map(e => el("div", { class: "evento" },
      el("div", { class: "qdo" }, e.ts.slice(8, 10) + "/" + e.ts.slice(5, 7)),
      el("div", { class: "oq" },
        el("b", {}, e.autor || "—"), " — ", ROTULO_EVENTO(e),
        e.motivo ? el("div", { class: "mot" }, "motivo: " + e.motivo) : null)))));

  const acoes = [];
  if (M.movimentacaoAberta(m) && pessoas.pode("movimentar")) {
    acoes.push({ rotulo: "Concluir", classe: "primario", acao: async () => { await concluirMov(m); } });
    acoes.push({ rotulo: m.prometida_para ? "Mudar prazo" : "Dar prazo", acao: async () => { await prometerData(m); } });
    acoes.push({ rotulo: "Cancelar movimentação", classe: "perigo", acao: async () => { await cancelarMov(m); } });
  }
  if (!m.cancelada && pessoas.pode("movimentar") && (atraso > 0 || m.motivo_atraso)) {
    acoes.push({ rotulo: m.motivo_atraso ? "Mudar justificativa" : "Justificar",
      acao: async () => { await justificar(m, "movimentacao"); } });
  }
  if (m.chegou_em && !m.cancelada && pessoas.pode("aprovar")) {
    if (!m.aprovada) acoes.push({ rotulo: "Aprovar", classe: "primario", acao: async () => { await aprovar(m); } });
    acoes.push({ rotulo: m.aprovada ? "Reabrir" : "Devolver", classe: "perigo",
      acao: async () => { await devolver(m); } });
  }
  await caixa({ titulo: m.frota || "Movimentação", corpo, acoes, largura: "600px" });
}

// ── a tabela ────────────────────────────────────────────────────────────────

function acaoDaLinha(m) {
  const parar = fn => e => { e.stopPropagation(); fn(); };
  if (M.movimentacaoAberta(m) && pessoas.pode("movimentar")) {
    return el("button", { class: "mini concluir", onclick: parar(() => concluirMov(m)) }, "Concluir");
  }
  if (M.movimentacaoParaAprovar(m)) {
    if (!pessoas.pode("aprovar")) return el("span", { class: "seg" }, "com o PCM");
    return el("span", { class: "dois" },
      el("button", { class: "mini aprovar", onclick: parar(() => aprovar(m)) }, "Aprovar"),
      el("button", { class: "mini devolver", title: "Devolver para a operação",
        onclick: parar(() => devolver(m)) }, "↩"));
  }
  if (m.chegou_em) return el("span", { class: "feito-em" }, "✓ " + brCurto(m.chegou_em));
  return "";
}

/** O porquê do atraso na linha — clicável para mudar — ou, quando atrasou e
 *  ninguém disse por quê, o atalho para justificar. */
function linhaJustificativa(m, ref) {
  const pode = pessoas.pode("movimentar");
  const abrir = e => { e.stopPropagation(); justificar(m, "movimentacao"); };
  if (m.motivo_atraso || m.quem_atrasou) {
    return el("div", { class: "porque" + (pode ? " editavel" : ""), onclick: pode ? abrir : null,
      title: pode ? "Mudar a justificativa" : "" },
      m.motivo_atraso || m.justificativa || "—",
      m.quem_atrasou ? el("span", { class: "quem-atrasou" }, " · " + m.quem_atrasou) : null);
  }
  if (pode && M.movimentacaoSemJustificativa(m, ref)) {
    return el("button", { class: "mini justificar", onclick: abrir }, "+ justificar");
  }
  return null;
}

function tabelaMov(itens, ctx, ref) {
  const d = v => v ? brCurto(v) : el("span", { class: "seg" }, "—");
  const cab = el("tr", {},
    el("th", { class: "c-sit" }, "Situação"),
    el("th", { class: "c-fr" }, "Frota"),
    el("th", { class: "c-dest" }, "Destino / fornecedor · para quê"),
    el("th", { class: "c-dt num" }, "Pedida"),
    el("th", { class: "c-dt num" }, "Prazo"),
    el("th", { class: "c-dt num" }, "Concluída"),
    el("th", { class: "c-atr num" }, "Atraso"),
    el("th", { class: "c-quem" }, "Quem"),
    el("th", { class: "c-feito" }, ""));
  const corpo = el("tbody", {}, itens.map(m => {
    const s = M.situacaoMovimentacao(m, ref);
    const cor = M.corDe(s);
    const atraso = M.atrasoMovimentacao(m, ref);
    const tr = el("tr", {
      class: `lin ${cor}${m.chegou_em && m.aprovada ? " feita" : ""}${m.cancelada ? " cancel" : ""}`,
      dataset: { id: m.id },
    },
      el("td", { class: "c-sit" }, el("span", { class: "sit " + cor }, s)),
      el("td", { class: "c-fr" }, el("b", {}, m.frota)),
      el("td", { class: "c-dest" },
        el("div", { class: "t" }, m.destino || "—"),
        m.para_que ? el("div", { class: "seg" }, m.para_que) : null,
        m.devolvida && !m.chegou_em && m.motivo_devolucao
          ? el("div", { class: "porque" }, "devolvida: " + m.motivo_devolucao) : null,
        linhaJustificativa(m, ref)),
      el("td", { class: "c-dt num" }, d(m.pedida_em)),
      el("td", { class: "c-dt num" + (s === "Atrasada" ? " venceu" : "") }, d(m.prometida_para)),
      el("td", { class: "c-dt num" }, d(m.chegou_em)),
      el("td", { class: "c-atr num" }, atraso
        ? el("span", { class: "venceu" }, `${atraso}d`) : el("span", { class: "seg" }, "—")),
      el("td", { class: "c-quem" }, m.chegou_em && m.concluida_por
        ? m.concluida_por : (m.quem_prometeu || "")),
      el("td", { class: "c-feito" }, acaoDaLinha(m)));
    tr.addEventListener("click", cliqueLimpo(() => abrirFichaMov(m.id, ctx)));
    return tr;
  }));
  const tabela = el("table", { class: "grade mov" }, el("thead", {}, cab), corpo);
  const cartoes = el("div", { class: "lista" }, itens.map(m => {
    const a = acaoDaLinha(m);
    return cartaoMov(m, ctx, { acoes: a ? [a] : [] });
  }));
  return el("div", { class: "grade-caixa" },
    el("div", { class: "so-tabela" }, tabela),
    el("div", { class: "so-cartao" }, cartoes));
}

// ── a tela ──────────────────────────────────────────────────────────────────

const estado = { recorte: "", busca: "", quem: "" };

export async function montar(raiz, ctx, params) {
  // O PCM abre na fila de aprovação quando há o que aprovar; a operação, no
  // que está em aberto.
  if (params.get("v")) estado.recorte = params.get("v");
  const fBusca = el("input", { class: "busca", type: "search", value: estado.busca,
    placeholder: "frota, destino, para quê…",
    oninput: () => { estado.busca = fBusca.value; pintar(); } });
  const recortes = el("div", { class: "segmentos" });
  const topo = el("div", {});
  const corpo = el("div", {});

  // A busca fica FORA do que se repinta: repintar a cada tecla tirava o foco
  // do campo no meio da palavra.
  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Movimentações"),
      el("div", { class: "espaco" }),
      pessoas.pode("movimentar")
        ? el("button", { class: "primario", onclick: () => novaMovimentacao(ctx) }, "+ Nova")
        : null),
    topo,
    el("div", { class: "filtros" }, recortes, fBusca),
    corpo);

  const kpi = (rot, val, det, cls = "") =>
    el("div", { class: "kpi " + cls },
      el("div", { class: "k-rot" }, rot),
      el("div", { class: "k-val" }, String(val)),
      det ? el("div", { class: "k-det" }, det) : null);
  const n1 = v => (Math.round(v * 10) / 10).toLocaleString("pt-BR");

  function pintar() {
    limpar(topo);
    limpar(corpo);
    const ref = M.hoje();
    const todas = ev.lista("movimentacao");
    const pt = M.pontualidade(todas, ref);
    const pc = pt.pct == null ? "—" : `${Math.round(pt.pct * 1000) / 10}`.replace(".", ",") + "%";

    topo.append(el("div", { class: "kpis" },
      kpi("Movimentações", pt.total, `${pt.em_aberto} em aberto`),
      kpi("Concluídas", pt.concluidas, pt.para_aprovar ? `${pt.para_aprovar} aguardando aprovação` : "",
        pt.para_aprovar ? "andando" : ""),
      kpi("No prazo", pt.no_prazo, `${pt.com_atraso} com atraso`),
      kpi("Pontualidade da operação", pc, "no prazo ÷ concluídas",
        pt.pct == null ? "" : pt.pct >= 0.85 ? "ok" : pt.pct >= 0.6 ? "hoje" : "vencida"),
      kpi("Atraso médio", n1(pt.atraso_medio), "dias, quando atrasa"),
      kpi("Dias perdidos", pt.dias_perdidos, "além do prometido, nas concluídas",
        pt.dias_perdidos ? "vencida" : ""),
      kpi("Atrasadas agora", pt.atrasadas,
        pt.dias_correndo ? `${pt.dias_correndo} dias e contando` : "em aberto, prazo passou",
        pt.atrasadas ? "vencida" : "")));

    // ── os recortes, com a contagem de cada um
    const paraAprovar = todas.filter(M.movimentacaoParaAprovar);
    const abertas = todas.filter(M.movimentacaoAberta);
    const concluidas = todas.filter(m => m.chegou_em && m.aprovada && !m.cancelada);
    const canceladas = todas.filter(m => m.cancelada);
    const OPCOES = [
      ["abertas", "Em aberto", abertas],
      ["aprovar", "Aguardando aprovação", paraAprovar],
      ["concluidas", "Concluídas", concluidas],
      ["canceladas", "Canceladas", canceladas],
      ["todas", "Todas", todas],
    ].filter(([id, , l]) => l.length || id === "abertas" || id === "todas");
    if (!OPCOES.some(([id]) => id === estado.recorte)) {
      estado.recorte = paraAprovar.length && pessoas.pode("aprovar") ? "aprovar" : "abertas";
    }
    limpar(recortes);
    for (const [id, rot, l] of OPCOES) {
      recortes.append(el("button", {
        class: "seg-op" + (estado.recorte === id ? " on" : "") + (id === "aprovar" ? " destaque" : ""),
        onclick: () => { estado.recorte = id; pintar(); },
      }, rot, el("span", { class: "n" }, ` ${l.length}`)));
    }

    // Quem atrasou: as atrasadas e as concluídas com atraso, por responsável.
    // Clicar filtra; "sem justificativa" é a fila do que falta explicar.
    const atrasadas = todas.filter(m => !m.cancelada && M.atrasoMovimentacao(m, ref) > 0);
    if (atrasadas.length) {
      const por = new Map();
      for (const m of atrasadas) {
        const k = m.quem_atrasou || (m.motivo_atraso || m.justificativa ? "não informado" : "__sem");
        por.set(k, (por.get(k) || 0) + 1);
      }
      const ordem = [...por].sort((a, b) => (a[0] === "__sem") - (b[0] === "__sem") || b[1] - a[1]);
      corpo.append(el("div", { class: "faixa-sit quem-faixa" },
        el("span", { class: "rot-faixa" }, "Atrasos por quem atrasou:"),
        ordem.map(([k, n]) => el("button", {
          class: "fsit " + (k === "__sem" ? "hoje" : "programada") + (estado.quem === k ? " on" : ""),
          onclick: () => { estado.quem = estado.quem === k ? "" : k; pintar(); },
        }, el("b", {}, String(n)), " ", k === "__sem" ? "sem justificativa" : k))));
    } else estado.quem = "";

    const base = estado.quem
      ? atrasadas.filter(m => (m.quem_atrasou || (m.motivo_atraso || m.justificativa ? "não informado" : "__sem")) === estado.quem)
      : (OPCOES.find(([id]) => id === estado.recorte) || OPCOES[0])[2];
    const q = semAcento(estado.busca.trim());
    const itens = base.filter(m => !q ||
      semAcento([m.frota, m.destino, m.para_que, m.quem_prometeu, m.concluida_por, m.obs,
        m.motivo_atraso, m.quem_atrasou, m.justificativa].join(" ")).includes(q));
    const peso = m => { const i = ORDEM.indexOf(M.situacaoMovimentacao(m, ref)); return i < 0 ? 99 : i; };
    itens.sort((a, b) => peso(a) - peso(b) ||
      (a.chegou_em || b.chegou_em
        ? String(b.chegou_em || "").localeCompare(String(a.chegou_em || ""))
        : String(a.prometida_para || "9999").localeCompare(String(b.prometida_para || "9999"))));

    if (estado.recorte === "aprovar" && paraAprovar.length && pessoas.pode("aprovar")) {
      corpo.append(el("div", { class: "barra-sel" },
        el("span", {}, "A operação marcou estas como concluídas. Confira e aprove — ou devolva com o porquê."),
        el("div", { class: "espaco" }),
        el("button", { class: "primario", onclick: async () => {
          if (!await confirmar("Aprovar todas",
            `Aprovar as ${paraAprovar.length} movimentações concluídas que estão aguardando?`,
            "Aprovar todas")) return;
          try {
            await ev.aplicar(paraAprovar.map(m => ev.aprovarMovimentacao(m)));
            avisar(`${paraAprovar.length} aprovadas.`);
          } catch (e) { erro(e.message); }
        } }, `Aprovar todas (${paraAprovar.length})`)));
    } else if (estado.recorte === "abertas" && pessoas.ehOperacao()) {
      corpo.append(el("p", { class: "nota" },
        "Terminou a movimentação? Clique em Concluir. O PCM confere e aprova."));
    }

    if (!itens.length) {
      corpo.append(vazio(estado.recorte === "aprovar" ? "Nada aguardando aprovação." : "Nada aqui."));
      return;
    }
    corpo.append(tabelaMov(itens, ctx, ref));
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
