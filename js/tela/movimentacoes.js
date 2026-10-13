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
import { frotas, valoresDe, justificar, camposJustificativa, botaoMais } from "./comum.js";
import { busca as semAcento } from "../texto.js";

const QUEM = ["Operação", "Makro Engenharia", "Terceiro", "Manutenção"];
const ORDEM = ["Atrasada", "Vence hoje", "Aguardando aprovação", "Em aberto", "Sem prazo",
  "Concluída com atraso", "Concluída", "Cancelada"];

// Três níveis bastam para ordenar o dia da operação. Dentro da mesma situação,
// a alta vem primeiro; sem prioridade (as antigas, da planilha) fica por último.
export const PRIORIDADES = ["Alta", "Média", "Baixa"];
const PESO_PRIO = { Alta: 0, "Média": 1, Baixa: 2 };

/** O título da solicitação: o que fazer e onde — "Coletar · Cardan Service".
 *  As que vieram da planilha têm só o destino, e aparecem como antes. */
export function tituloMov(m) {
  return [m.acao, m.destino].filter(Boolean).join(" · ") || "—";
}

function chipPrio(p, longo = false) {
  if (!p) return null;
  const cls = p === "Alta" ? "prio-alta" : p === "Baixa" ? "prio-baixa" : "prio-media";
  return chip(longo ? `prioridade ${p.toLowerCase()}` : p, "prio " + cls);
}

// ── cartão (celular, e a tela Para você) ────────────────────────────────────

export function cartaoMov(m, ctx, { acoes = [] } = {}) {
  const s = M.situacaoMovimentacao(m);
  const atraso = M.atrasoMovimentacao(m);
  const tags = [chip(s, M.corDe(s)), chipPrio(m.prioridade, true)].filter(Boolean);
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
      el("div", { class: "tit" }, `${m.frota} · ${tituloMov(m)}`),
      sub.length ? el("div", { class: "sub" }, sub.join(" · ")) : null,
      m.devolvida && !m.chegou_em && m.motivo_devolucao
        ? el("div", { class: "sub", style: "color:var(--hoje)" }, "devolvida: " + m.motivo_devolucao) : null,
      m.motivo_atraso || m.quem_atrasou
        ? el("div", { class: "sub" }, "motivo: " + [m.motivo_atraso || m.justificativa,
          m.quem_atrasou].filter(Boolean).join(" · ")) : null,
      el("div", { class: "tags" }, tags)),
    el("div", { class: "acoes" }, [...acoes, botaoMais("movimentacao", m.id, ctx)].filter(Boolean)));
}

// ── ações ───────────────────────────────────────────────────────────────────

/** O formulário da solicitação — o mesmo para criar e para editar. Dois campos
 *  dizem tudo: o QUE fazer (a ação) e ONDE (para onde a frota vai, ou onde ela
 *  está). Os dois são texto livre; as sugestões são só o que a equipe já
 *  escreveu antes, para digitar menos. */
function formularioMov(m = null, sugestao = {}) {
  const todas = ev.lista("movimentacao");
  const usados = k => [...new Set(todas.map(x => String(x[k] || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const eFrota = el("input", { value: m ? m.frota : (sugestao.frota || ""), placeholder: "ex.: F-745" });
  const eAcao = el("input", { value: m ? m.acao || "" : "",
    placeholder: "ex.: Coletar, Levar, Buscar, Realizar TOP" });
  const eOnde = el("input", { value: m ? m.destino || "" : "",
    placeholder: "ex.: Cardan Service, Borracharia, Box de óleo" });
  const eDetalhes = el("textarea", { rows: 2,
    placeholder: "opcional — OS, peça, contato, o que ajudar quem vai executar" });
  eDetalhes.value = m ? m.para_que || "" : "";
  const ePrazo = el("input", { type: "date", value: m ? m.prometida_para || "" : "" });
  const ePedida = el("input", { type: "date", value: m ? m.pedida_em || "" : M.hoje() });
  const eQuem = selecao(QUEM, m ? m.quem_prometeu || "Operação" : "Operação");

  // Prioridade em botões: um toque, sem abrir lista. Fica num bloco à parte —
  // dentro de um <label>, clicar no texto apertaria o primeiro botão.
  let prioridade = m ? m.prioridade || "" : "Média";
  const botoes = PRIORIDADES.map(p => el("button", { type: "button", class: "seg-op",
    dataset: { prio: p }, onclick: () => { prioridade = p; marcar(); } }, p));
  const marcar = () => botoes.forEach(b => {
    const on = b.dataset.prio === prioridade;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  marcar();

  const previa = el("div", { class: "previa-mov" });
  const atualizar = () => {
    const oque = [eAcao.value.trim(), eOnde.value.trim()].filter(Boolean).join(" · ");
    previa.textContent = `${eFrota.value.trim() || "Frota"} — ${oque || "o que fazer · onde"}` +
      (ePrazo.value ? ` · até ${br(ePrazo.value)}` : "");
  };
  for (const e of [eFrota, eAcao, eOnde, ePrazo]) e.addEventListener("input", atualizar);
  atualizar();

  const no = el("div", { class: "form-mov" },
    el("div", { class: "dupla" },
      campo("Frota", comSugestoes(eFrota, frotas(), "dl-mov-frota")),
      el("div", { class: "campo" }, el("span", {}, "Prioridade"),
        el("div", { class: "segmentos prio-escolha", role: "group", "aria-label": "Prioridade" }, botoes))),
    campo("O que fazer", comSugestoes(eAcao, usados("acao"), "dl-mov-acao"),
      "a ação que a operação vai executar"),
    campo("Onde", comSugestoes(eOnde, usados("destino"), "dl-mov-onde"),
      "para onde a frota vai, ou onde ela está"),
    el("div", { class: "tripla" },
      campo("Prazo", ePrazo, "até quando"),
      campo("Solicitada em", ePedida),
      campo("Responsável", eQuem)),
    campo("Detalhes", eDetalhes),
    el("div", { class: "previa-rot" }, "Vai aparecer assim na lista:"),
    previa);

  return {
    no,
    valores: () => ({
      frota: eFrota.value.trim(),
      acao: eAcao.value.trim(),
      destino: eOnde.value.trim(),
      para_que: eDetalhes.value.trim(),
      prioridade,
      prazo: ePrazo.value,
      pedida_em: ePedida.value,
      quem_prometeu: eQuem.value,
    }),
  };
}

/** Abre o formulário até ele voltar preenchido (ou ser fechado). Faltando o
 *  essencial, avisa e reabre com o que já foi digitado — nada se perde. */
async function preencher(f, titulo, rotuloOk) {
  for (;;) {
    const r = await caixa({ titulo, corpo: f.no, largura: "560px",
      acoes: [{ rotulo: "Cancelar", valor: false }, { rotulo: rotuloOk, classe: "primario", valor: true }] });
    if (r !== true) return null;
    const v = f.valores();
    if (!v.frota) { erro("Informe a frota."); continue; }
    if (!v.acao && !v.destino) { erro("Informe o que fazer ou onde."); continue; }
    return v;
  }
}

export async function novaMovimentacao(ctx, sugestao = {}) {
  const v = await preencher(formularioMov(null, sugestao), "Nova solicitação de movimentação", "Registrar");
  if (!v) return null;
  const { prazo, ...campos } = v;
  try {
    const [criado] = await ev.aplicar(ev.pedirMovimentacao({ ...campos, prometida_para: prazo }));
    avisar(`${v.frota}: solicitação registrada.`);
    return criado.alvo;
  } catch (e) { erro(e.message); return null; }
}

/** Mudar a solicitação depois de criada. Só vai para o registro o que mudou;
 *  o prazo tem lançamento próprio, que o Registro e a pontualidade leem. */
export async function editarMov(m) {
  const v = await preencher(formularioMov(m), "Editar movimentação", "Salvar alterações");
  if (!v) return false;
  const { prazo, ...campos } = v;
  const eventos = [];
  try {
    const novoPrazo = prazo && prazo !== m.prometida_para;
    if (!prazo && m.prometida_para) campos.prometida_para = "";
    if (novoPrazo) delete campos.quem_prometeu;        // vai junto com o prazo
    const e = ev.editar(m, campos, "movimentacao");
    if (e) eventos.push(e);
    if (novoPrazo) eventos.push(ev.prometer(m, prazo, v.quem_prometeu));
    if (!eventos.length) { avisar("Nada mudou."); return false; }
    await ev.aplicar(eventos);
    avisar(`${v.frota}: movimentação atualizada.`);
    return true;
  } catch (x) { erro(x.message); return false; }
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
    el("p", { class: "nada" }, "Concluída após o prazo — informe o motivo (opcional, ajuda o PCM na aprovação)"), j.no);
  const verAtraso = () => { caixaAtraso.hidden = !(prazo && eData.value && eData.value > prazo); };
  eData.addEventListener("change", verAtraso);
  eData.addEventListener("input", verAtraso);
  verAtraso();
  const r = await caixa({
    titulo: "Concluir movimentação",
    corpo: el("div", {},
      el("p", {}, el("b", {}, m.frota), " · ", tituloMov(m)),
      m.para_que ? el("p", { class: "nada" }, m.para_que) : null,
      el("p", { class: "nada" }, prazo ? `O prazo era ${br(prazo)}.` : "Não tinha prazo."),
      campo("Concluída em", eData),
      caixaAtraso,
      el("p", { class: "nada" }, vaiAprovada
        ? "Como você é do PCM, ela já entra aprovada."
        : "Ela fica aguardando aprovação até o PCM conferir.")),
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

export async function aprovar(m) {
  try {
    await ev.aplicar(ev.aprovarMovimentacao(m));
    avisar(`${m.frota}: aprovada.`);
  } catch (e) { erro(e.message); }
}

export async function devolver(m) {
  const motivo = el("input", { placeholder: "o que precisa ser corrigido" });
  const r = await caixa({
    titulo: "Devolver à operação",
    corpo: el("div", {},
      el("p", {}, el("b", {}, m.frota), " · ", tituloMov(m),
        ` — concluída em ${br(m.chegou_em)}${m.concluida_por ? " por " + m.concluida_por : ""}.`),
      el("p", { class: "nada" }, "Ela volta a ficar em aberto, com o motivo visível para quem concluiu."),
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
    titulo: m.prometida_para ? "Alterar o prazo" : "Definir o prazo",
    corpo: el("div", {},
      el("p", {}, el("b", {}, m.frota), " · ", tituloMov(m)),
      campo("Prazo", eData),
      campo("Responsável", eQuem)),
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

export async function cancelarMov(m) {
  const e = el("input", { placeholder: "Motivo" });
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
    mov_prometida: `definiu o prazo: ${br(d.para)}`,
    mov_chegou: `concluiu em ${br(d.em)}`,
    mov_aprovada: "aprovou",
    mov_devolvida: "devolveu",
    mov_cancelada: "cancelou", editada: "editou",
    justificada: "justificou: " + [d.motivo || d.texto, d.quem && `responsável: ${d.quem}`]
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
      linha("O que fazer", m.acao),
      linha("Onde", m.destino),
      linha("Prioridade", m.prioridade ? chipPrio(m.prioridade) : null),
      linha("Detalhes", m.para_que),
      linha("Solicitada em", m.pedida_em ? br(m.pedida_em) : null),
      linha("Prazo", m.prometida_para ? br(m.prometida_para) : null),
      linha("Responsável", m.quem_prometeu),
      linha("Concluída em", m.chegou_em ? br(m.chegou_em) : null),
      linha("Concluída por", m.chegou_em ? m.concluida_por : null),
      linha("Aprovada", m.chegou_em && m.aprovada
        ? (m.aprovada_por ? `por ${m.aprovada_por}${m.aprovada_em ? " em " + br(m.aprovada_em) : ""}` : "sim (planilha)")
        : null),
      linha("Devolvida", m.devolvida && !m.chegou_em ? (m.motivo_devolucao || "sim") : null),
      linha("Atraso", atraso ? `${atraso} dia(s)` : null),
      linha("Motivo do atraso", [m.motivo_atraso, m.justificativa && m.justificativa !== m.motivo_atraso
        ? m.justificativa : ""].filter(Boolean).join(" · ") || null),
      linha("Responsável pelo atraso", m.quem_atrasou || null),
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
  }
  if (!m.cancelada && pessoas.pode("movimentar")) {
    acoes.push({ rotulo: "Editar", acao: async () => { await editarMov(m); } });
  }
  if (M.movimentacaoAberta(m) && pessoas.pode("movimentar")) {
    acoes.push({ rotulo: m.prometida_para ? "Alterar o prazo" : "Definir o prazo", acao: async () => { await prometerData(m); } });
    acoes.push({ rotulo: "Cancelar movimentação", classe: "perigo", acao: async () => { await cancelarMov(m); } });
  }
  if (!m.cancelada && pessoas.pode("movimentar") && (atraso > 0 || m.motivo_atraso)) {
    acoes.push({ rotulo: m.motivo_atraso ? "Alterar a justificativa" : "Justificar",
      acao: async () => { await justificar(m, "movimentacao"); } });
  }
  if (m.chegou_em && !m.cancelada && pessoas.pode("aprovar")) {
    if (!m.aprovada) acoes.push({ rotulo: "Aprovar", classe: "primario", acao: async () => { await aprovar(m); } });
    acoes.push({ rotulo: m.aprovada ? "Reabrir" : "Devolver", classe: "perigo",
      acao: async () => { await devolver(m); } });
  }
  await caixa({ titulo: `${m.frota || "Movimentação"} · ${tituloMov(m)}`, corpo, acoes, largura: "600px" });
}

// ── a tabela ────────────────────────────────────────────────────────────────

function acaoDaLinha(m) {
  const parar = fn => e => { e.stopPropagation(); fn(); };
  if (M.movimentacaoAberta(m) && pessoas.pode("movimentar")) {
    return el("button", { class: "mini concluir", onclick: parar(() => concluirMov(m)) }, "Concluir");
  }
  if (M.movimentacaoParaAprovar(m)) {
    if (!pessoas.pode("aprovar")) return el("span", { class: "seg" }, "aguardando o PCM");
    return el("span", { class: "dois" },
      el("button", { class: "mini aprovar", onclick: parar(() => aprovar(m)) }, "Aprovar"),
      el("button", { class: "mini devolver", title: "Devolver à operação",
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
      title: pode ? "Alterar a justificativa" : "" },
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
    el("th", { class: "c-prio" }, "Prioridade"),
    el("th", { class: "c-fr" }, "Frota"),
    el("th", { class: "c-dest" }, "O que fazer · onde"),
    el("th", { class: "c-dt num" }, "Solicitada"),
    el("th", { class: "c-dt num" }, "Prazo"),
    el("th", { class: "c-dt num" }, "Concluída"),
    el("th", { class: "c-atr num" }, "Atraso"),
    el("th", { class: "c-quem" }, "Responsável"),
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
      el("td", { class: "c-prio" }, chipPrio(m.prioridade) || el("span", { class: "seg" }, "—")),
      el("td", { class: "c-fr" }, el("b", {}, m.frota)),
      el("td", { class: "c-dest" },
        el("div", { class: "t" }, tituloMov(m)),
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
      el("td", { class: "c-feito" }, acaoDaLinha(m), botaoMais("movimentacao", m.id, ctx)));
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

// ── a imagem para o grupo ───────────────────────────────────────────────────
// A lista que está na tela, como figura: para cobrar no grupo sem ninguém
// precisar abrir o site. Fundo claro (lê bem no WhatsApp em qualquer tema),
// uma linha por solicitação, prioridade e atraso à vista. Desenhada no canvas
// à mão — puxar biblioteca de "print de tela" custaria mais do que resolve.

const COR = { fundo: "#ffffff", texto: "#17181a", fraco: "#5f6368", linha: "#e2e4e8",
  cab: "#f3f4f6", verm: "#c62828", ambar: "#a85d00", verde: "#2e7d32" };

function quebrar(ctx, texto, largura) {
  const linhas = [];
  let atual = "";
  for (const p of String(texto || "").split(/\s+/).filter(Boolean)) {
    const t = atual ? atual + " " + p : p;
    if (!atual || ctx.measureText(t).width <= largura) atual = t;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}

/** Cabe na coluna? Se não, corta com reticências — nada invade a vizinha. */
function caber(ctx, texto, largura) {
  let t = String(texto || "");
  if (ctx.measureText(t).width <= largura) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > largura) t = t.slice(0, -1);
  return t + "…";
}

export async function desenharMovimentacoes(itens, rotulo, ref = M.hoje()) {
  const W = 1080, P = 36, E = 2;                    // largura, margem, escala (nitidez)
  const FONTE = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const cols = [
    { t: "Prioridade", w: 112 }, { t: "Frota", w: 96 }, { t: "O que fazer · onde", w: 0 },
    { t: "Prazo", w: 96 }, { t: "Situação", w: 196 },
  ];
  cols[2].w = W - 2 * P - cols.reduce((s, c) => s + c.w, 0);
  const tela = document.createElement("canvas");
  const ctx = tela.getContext("2d");

  // 1ª passada: mede cada linha (o "o que fazer" e os detalhes quebram).
  const linhas = itens.map(m => {
    const s = M.situacaoMovimentacao(m, ref);
    const atraso = M.atrasoMovimentacao(m, ref);
    ctx.font = `600 17px ${FONTE}`;
    const tit = quebrar(ctx, tituloMov(m), cols[2].w - 12);
    ctx.font = `14px ${FONTE}`;
    const det = m.para_que ? quebrar(ctx, m.para_que, cols[2].w - 12).slice(0, 2) : [];
    const altura = Math.max(46, 16 + tit.length * 22 + det.length * 19);
    return { m, s, atraso, tit, det, altura };
  });
  const TOPO = 112, CAB = 34, PE = 46;
  const H = TOPO + CAB + linhas.reduce((s, l) => s + l.altura, 0) + PE;
  tela.width = W * E; tela.height = H * E;
  ctx.scale(E, E);
  ctx.fillStyle = COR.fundo; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";

  // título
  ctx.fillStyle = COR.texto; ctx.font = `700 26px ${FONTE}`;
  ctx.fillText("Solicitações de movimentação", P, 30);
  ctx.fillStyle = COR.fraco; ctx.font = `15px ${FONTE}`;
  const agora = new Date();
  const hora = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  ctx.fillText(`${rotulo} · ${itens.length} solicitaç${itens.length === 1 ? "ão" : "ões"} · ${br(ref)} ${hora}`, P, 66);

  // cabeçalho da tabela
  let y = TOPO;
  ctx.fillStyle = COR.cab; ctx.fillRect(P, y, W - 2 * P, CAB);
  ctx.fillStyle = COR.fraco; ctx.font = `700 12px ${FONTE}`;
  let x = P;
  for (const c of cols) { ctx.fillText(c.t.toUpperCase(), x + 8, y + 11); x += c.w; }
  y += CAB;

  for (const l of linhas) {
    const { m, s, atraso } = l;
    x = P;
    // prioridade
    ctx.font = `600 15px ${FONTE}`;
    ctx.fillStyle = m.prioridade === "Alta" ? COR.ambar : m.prioridade ? COR.texto : COR.fraco;
    ctx.fillText(m.prioridade || "—", x + 8, y + 14); x += cols[0].w;
    // frota
    ctx.fillStyle = COR.texto; ctx.font = `700 16px ${FONTE}`;
    ctx.fillText(caber(ctx, m.frota || "—", cols[1].w - 14), x + 8, y + 13); x += cols[1].w;
    // o que fazer · onde, e os detalhes
    ctx.font = `600 17px ${FONTE}`;
    l.tit.forEach((t, i) => ctx.fillText(t, x + 8, y + 12 + i * 22));
    ctx.fillStyle = COR.fraco; ctx.font = `14px ${FONTE}`;
    l.det.forEach((t, i) => ctx.fillText(t, x + 8, y + 14 + l.tit.length * 22 + i * 19));
    x += cols[2].w;
    // prazo
    ctx.font = `600 15px ${FONTE}`;
    ctx.fillStyle = s === "Atrasada" ? COR.verm : s === "Vence hoje" ? COR.ambar : COR.texto;
    ctx.fillText(m.prometida_para ? brCurto(m.prometida_para) : "—", x + 8, y + 14); x += cols[3].w;
    // situação
    ctx.fillStyle = s === "Atrasada" ? COR.verm : s === "Vence hoje" ? COR.ambar
      : s.startsWith("Concluída") ? COR.verde : COR.texto;
    ctx.fillText(caber(ctx, s, cols[4].w - 12), x + 8, y + 12);
    if (atraso > 0) {
      ctx.fillStyle = COR.verm; ctx.font = `13px ${FONTE}`;
      ctx.fillText(`${atraso} dia${atraso === 1 ? "" : "s"} de atraso`, x + 8, y + 32);
    }
    y += l.altura;
    ctx.fillStyle = COR.linha; ctx.fillRect(P, y - 1, W - 2 * P, 1);
  }

  ctx.fillStyle = COR.fraco; ctx.font = `13px ${FONTE}`;
  ctx.fillText("Makro Transportes · PCM", P, H - 30);
  return new Promise(ok => tela.toBlob(ok, "image/png"));
}

/** Gera a imagem e entrega: no celular, abre o compartilhar (WhatsApp direto);
 *  no computador, baixa o arquivo. */
export async function imagemMovimentacoes(itens, rotulo) {
  if (!itens.length) { erro("Nada na lista para virar imagem."); return; }
  const blob = await desenharMovimentacoes(itens, rotulo);
  const nome = `movimentacoes-${M.hoje()}.png`;
  const arquivo = new File([blob], nome, { type: "image/png" });
  if (matchMedia("(max-width: 860px)").matches && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo], title: "Solicitações de movimentação" }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  avisar("Imagem baixada.");
}

// ── a tela ──────────────────────────────────────────────────────────────────

const estado = { recorte: "", busca: "", quem: "" };

export async function montar(raiz, ctx, params) {
  // O PCM abre na fila de aprovação quando há o que aprovar; a operação, no
  // que está em aberto.
  if (params.get("v")) estado.recorte = params.get("v");
  const fBusca = el("input", { class: "busca", type: "search", value: estado.busca,
    placeholder: "frota, o que fazer, onde…",
    oninput: () => { estado.busca = fBusca.value; pintar(); } });
  const recortes = el("div", { class: "segmentos" });
  const topo = el("div", {});
  const corpo = el("div", {});

  // A busca fica FORA do que se repinta: repintar a cada tecla tirava o foco
  // do campo no meio da palavra.
  // O que está na tela agora — é o que vira imagem.
  const naTela = { itens: [], rotulo: "" };
  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Movimentações"),
      el("div", { class: "espaco" }),
      el("button", { title: "A lista que está na tela, como imagem — para mandar no grupo",
        onclick: () => imagemMovimentacoes(naTela.itens, naTela.rotulo) }, "Baixar imagem"),
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
      kpi("Atraso médio", n1(pt.atraso_medio), "dias, entre as atrasadas"),
      kpi("Dias de atraso", pt.dias_perdidos, "acumulados nas concluídas",
        pt.dias_perdidos ? "vencida" : ""),
      kpi("Atrasadas agora", pt.atrasadas,
        pt.dias_correndo ? `${pt.dias_correndo} dias de atraso acumulados` : "em aberto com prazo vencido",
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
        el("span", { class: "rot-faixa" }, "Atrasos por responsável:"),
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
      semAcento([m.frota, m.acao, m.destino, m.para_que, m.prioridade, m.quem_prometeu, m.concluida_por,
        m.obs, m.motivo_atraso, m.quem_atrasou, m.justificativa].join(" ")).includes(q));
    const peso = m => { const i = ORDEM.indexOf(M.situacaoMovimentacao(m, ref)); return i < 0 ? 99 : i; };
    const prio = m => PESO_PRIO[m.prioridade] ?? 3;
    itens.sort((a, b) => peso(a) - peso(b) || prio(a) - prio(b) ||
      (a.chegou_em || b.chegou_em
        ? String(b.chegou_em || "").localeCompare(String(a.chegou_em || ""))
        : String(a.prometida_para || "9999").localeCompare(String(b.prometida_para || "9999"))));
    naTela.itens = itens;
    naTela.rotulo = [
      estado.quem ? `Atrasos — ${estado.quem === "__sem" ? "sem justificativa" : estado.quem}`
        : (OPCOES.find(([id]) => id === estado.recorte) || OPCOES[0])[1],
      estado.busca.trim() ? `busca "${estado.busca.trim()}"` : "",
    ].filter(Boolean).join(" · ");

    if (estado.recorte === "aprovar" && paraAprovar.length && pessoas.pode("aprovar")) {
      corpo.append(el("div", { class: "barra-sel" },
        el("span", {}, "A operação registrou estas como concluídas. Confira e aprove, ou devolva informando o motivo."),
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
      corpo.append(vazio(estado.recorte === "aprovar" ? "Nenhuma movimentação aguardando aprovação." : "Nada aqui."));
      return;
    }
    corpo.append(tabelaMov(itens, ctx, ref));
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
