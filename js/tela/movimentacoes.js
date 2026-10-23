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
import { calendarioMes, navMes, agenda, cartaoTrilho, itemAgenda, anel, trocaVista, nomeMesISO, diaPorExtenso } from "./calendario.js";

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

/** O selo da categoria: o símbolo e o nome. */
export function chipCat(m) {
  const c = M.categoriaMovPorId(M.categoriaMov(m));
  return el("span", { class: "chip cat cat-" + c.id, title: m.categoria ? "Categoria" : "Categoria (pelo texto)" },
    el("span", { class: "cat-ic", "aria-hidden": "true" }, c.icone), " ", c.nome);
}

function chipPrio(p, longo = false) {
  if (!p) return null;
  const cls = p === "Alta" ? "prio-alta" : p === "Baixa" ? "prio-baixa" : "prio-media";
  return chip(longo ? `prioridade ${p.toLowerCase()}` : p, "prio " + cls);
}

/** "etapa 1/2" e, se a anterior não foi feita, "espera a 1". */
export function tagsEtapa(m, todas = ev.lista("movimentacao")) {
  if (!m.roteiro) return [];
  const n = M.etapasDe(m, todas).length;
  const espera = M.etapaAnteriorAberta(m, todas);
  return [chip(`etapa ${m.etapa}/${n}`, "etapa"), espera && M.movimentacaoAberta(m) ? chip(`espera a ${espera.etapa}`, "programada") : null];
}

// ── cartão (celular, e a tela Para você) ────────────────────────────────────

/** `categoria: false` quando o cartão já está dentro da seção da categoria. */
export function cartaoMov(m, ctx, { acoes = [], categoria = true } = {}) {
  const s = M.situacaoMovimentacao(m);
  const atraso = M.atrasoMovimentacao(m);
  const tags = [categoria ? chipCat(m) : null, chip(s, M.corDe(s)), chipPrio(m.prioridade, true), ...tagsEtapa(m)].filter(Boolean);
  if (atraso > 0) tags.push(chip(`${atraso} dia${atraso === 1 ? "" : "s"} de atraso`, "vencida"));
  if (m.devolvida && !m.chegou_em) tags.push(chip("devolvida pelo PCM", "hoje"));
  if (m.quem_prometeu && m.quem_prometeu !== "Operação") tags.push(chip(m.quem_prometeu));

  const sub = [];
  if (m.para_que) sub.push(m.para_que);
  if (m.prometida_para) sub.push("prazo " + brCurto(m.prometida_para));
  if (m.chegou_em) sub.push("concluída " + brCurto(m.chegou_em) +
    (m.concluida_por ? ` por ${m.concluida_por}` : ""));

  return el("div", { class: `at ${M.corDe(s)}${m.chegou_em && m.aprovada ? " feito" : ""}`, dataset: { id: m.id } },
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
 *  escreveu antes, para digitar menos.
 *
 *  Para criar, a solicitação pode ter várias ETAPAS em ordem para a mesma
 *  frota (lavar → levar ao fornecedor): "+ Adicionar etapa". Cada etapa tem a
 *  sua categoria, o que fazer, onde e o prazo, e vira uma movimentação inteira
 *  (ver ev.pedirSequencia). Editar mexe numa etapa só. */
function formularioMov(m = null, sugestao = {}, { umaEtapa = false } = {}) {
  const todas = ev.lista("movimentacao");
  const usados = (k, lista = todas) => [...new Set(lista.map(x => String(x[k] || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const eFrota = el("input", { value: m ? m.frota : (sugestao.frota || ""), placeholder: "ex.: F-745" });
  const eDetalhes = el("textarea", { rows: 2,
    placeholder: "opcional — OS, peça, contato, o que ajudar quem vai executar" });
  eDetalhes.value = m ? m.para_que || "" : "";
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

  // ── as etapas
  const etapas = [];
  const caixaEtapas = el("div", { class: "etapas" });
  const previa = el("div", { class: "previa-mov" });
  let seq = 0;
  function blocoEtapa(inicial = {}) {
    const n = ++seq;
    const eAcao = el("input", { value: inicial.acao || "", placeholder: "ex.: Coletar, Levar, Lavar, Realizar TOP" });
    const eOnde = el("input", { value: inicial.destino || "", placeholder: "ex.: Cardan Service, Lava-jato, Box de óleo" });
    const ePrazo = el("input", { type: "date", value: inicial.prazo || "" });
    // A categoria em botões: escolher preenche o "O que fazer" (se ainda
    // estiver vazio, ou com o texto da categoria de antes) e as sugestões de
    // "Onde" passam a ser as já usadas nessa categoria.
    let categoria = inicial.categoria || "";
    const dlOnde = el("datalist", { id: `dl-mov-onde-${n}` });
    const sugerirOnde = () => {
      const daCat = categoria ? todas.filter(x => M.categoriaMov(x) === categoria) : todas;
      dlOnde.replaceChildren(...usados("destino", daCat.length ? daCat : todas).map(v => el("option", { value: v })));
    };
    const botoesCat = M.CATEGORIAS_MOV.map(c => el("button", { type: "button", class: "cat-op",
      dataset: { cat: c.id }, title: c.nome,
      onclick: () => {
        const antes = M.categoriaMovPorId(categoria).acao;
        categoria = c.id;
        if (!eAcao.value.trim() || eAcao.value.trim() === antes) eAcao.value = c.acao;
        marcarCat(); sugerirOnde(); atualizar();
      } }, el("span", { class: "cat-ic", "aria-hidden": "true" }, c.icone), c.nome));
    const marcarCat = () => botoesCat.forEach(b => {
      const on = b.dataset.cat === categoria;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    marcarCat(); sugerirOnde();
    eOnde.setAttribute("list", dlOnde.id);
    for (const e of [eAcao, eOnde, ePrazo]) e.addEventListener("input", atualizar);
    const titulo = el("div", { class: "etapa-tit" });
    const tirar = el("button", { type: "button", class: "discreto mini", title: "Tirar esta etapa",
      onclick: () => { etapas.splice(etapas.indexOf(b), 1); b.no.remove(); renumerar(); atualizar(); } }, "Tirar");
    const b = {
      no: el("div", { class: "etapa", dataset: { n } },
        m ? null : el("div", { class: "etapa-cab" }, titulo, tirar),
        el("div", { class: "campo" }, el("span", {}, "Categoria"),
          el("div", { class: "cat-escolha", role: "group", "aria-label": "Categoria" }, botoesCat)),
        campo("O que fazer", comSugestoes(eAcao, usados("acao"), `dl-mov-acao-${n}`), "a ação que a operação vai executar"),
        el("div", { class: "dupla" },
          campo("Onde", el("span", { class: "com-lista" }, eOnde, dlOnde), "para onde a frota vai, ou onde ela está"),
          campo("Prazo", ePrazo, "até quando"))),
      titulo, tirar,
      valores: () => ({
        // sem escolher, vale a que o texto indica — toda movimentação nova tem categoria
        categoria: categoria || M.categoriaDoTexto([eAcao.value, eOnde.value, eDetalhes.value].join(" ")),
        acao: eAcao.value.trim(), destino: eOnde.value.trim(), prazo: ePrazo.value,
      }),
    };
    etapas.push(b);
    caixaEtapas.append(b.no);
    renumerar();
    return b;
  }
  function renumerar() {
    etapas.forEach((b, i) => {
      b.titulo.textContent = etapas.length > 1 ? `Etapa ${i + 1}` : "O que fazer";
      b.tirar.hidden = etapas.length < 2;
    });
  }
  const atualizar = () => {
    const linhas = etapas.map(b => b.valores()).map((v, i) => {
      const oque = [v.acao, v.destino].filter(Boolean).join(" · ") || "o que fazer · onde";
      return `${etapas.length > 1 ? `${i + 1}. ` : ""}${eFrota.value.trim() || "Frota"} — ${oque}${v.prazo ? ` · até ${br(v.prazo)}` : ""}`;
    });
    previa.replaceChildren(...linhas.map(t => el("div", {}, t)));
  };
  blocoEtapa(m ? { categoria: M.categoriaMov(m), acao: m.acao || "", destino: m.destino || "", prazo: m.prometida_para || "" }
    : { categoria: sugestao.categoria || "" });
  eFrota.addEventListener("input", atualizar);
  atualizar();

  const no = el("div", { class: "form-mov" },
    el("div", { class: "dupla" },
      campo("Frota", comSugestoes(eFrota, frotas(), "dl-mov-frota")),
      el("div", { class: "campo" }, el("span", {}, "Prioridade"),
        el("div", { class: "segmentos prio-escolha", role: "group", "aria-label": "Prioridade" }, botoes))),
    caixaEtapas,
    m || umaEtapa ? null : el("button", { type: "button", class: "mais-etapa", onclick: () => { blocoEtapa({}).no.querySelector("input").focus(); atualizar(); } },
      "+ Adicionar etapa", el("small", {}, " — outra tarefa para a mesma frota, depois desta")),
    el("div", { class: "dupla" },
      campo("Solicitada em", ePedida),
      campo("Responsável", eQuem)),
    campo("Detalhes", eDetalhes),
    el("div", { class: "previa-rot" }, "Vai aparecer assim na lista:"),
    previa);

  const comuns = () => ({ frota: eFrota.value.trim(), para_que: eDetalhes.value.trim(), prioridade,
    pedida_em: ePedida.value, quem_prometeu: eQuem.value });
  return {
    no,
    // a primeira etapa, achatada: é o que editar (e a solicitação de uma etapa só) usa
    valores: () => ({ ...comuns(), ...etapas[0].valores() }),
    comuns,
    etapas: () => etapas.map(b => b.valores()).filter(v => v.acao || v.destino),
  };
}

/** Abre o formulário até ele voltar preenchido (ou ser fechado). Faltando o
 *  essencial, avisa e reabre com o que já foi digitado — nada se perde. */
async function preencher(f, titulo, rotuloOk) {
  for (;;) {
    const r = await caixa({ titulo, corpo: f.no, largura: "620px",
      acoes: [{ rotulo: "Cancelar", valor: false }, { rotulo: rotuloOk, classe: "primario", valor: true }] });
    if (r !== true) return null;
    const v = f.valores();
    if (!v.frota) { erro("Informe a frota."); continue; }
    if (!v.acao && !v.destino) { erro("Informe o que fazer ou onde."); continue; }
    return v;
  }
}

export async function novaMovimentacao(ctx, sugestao = {}) {
  const f = formularioMov(null, sugestao);
  const v = await preencher(f, "Nova solicitação de movimentação", "Registrar");
  if (!v) return null;
  const etapas = f.etapas();
  try {
    if (etapas.length > 1) {
      const evs = ev.pedirSequencia(f.comuns(), etapas.map(({ prazo, ...e }) => ({ ...e, prometida_para: prazo })));
      await ev.aplicar(evs);
      avisar(`${v.frota}: sequência de ${evs.length} etapas registrada.`);
      return evs[0].alvo;
    }
    const { prazo, ...campos } = v;
    const [criado] = await ev.aplicar(ev.pedirMovimentacao({ ...campos, prometida_para: prazo }));
    avisar(`${v.frota}: solicitação registrada.`);
    return criado.alvo;
  } catch (e) { erro(e.message); return null; }
}

/** Mais uma etapa depois da última da sequência desta movimentação. */
export async function proximaEtapaMov(m) {
  const f = formularioMov(null, { frota: m.frota }, { umaEtapa: true });
  const r = await caixa({ titulo: `Próxima etapa · ${m.frota}`, largura: "620px",
    corpo: el("div", {}, el("p", { class: "nada", style: "margin-top:0" },
      `Entra depois de "${tituloMov(m)}"${m.roteiro ? ` e das outras etapas da sequência` : ""}, com prazo e baixa próprios.`),
      f.no),
    acoes: [{ rotulo: "Cancelar", valor: false }, { rotulo: "Adicionar", classe: "primario", acao: () => {
      const v = f.valores();
      const { prazo, frota, ...campos } = v;
      return ev.proximaEtapa(m, { ...campos, prometida_para: prazo }, ev.lista("movimentacao"));
    } }] });
  if (!r) return false;
  try {
    await ev.aplicar(r);
    avisar(`${m.frota}: próxima etapa adicionada.`);
    return true;
  } catch (e) { erro(e.message); return false; }
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
    // A categoria que só foi deduzida do texto não vira lançamento à toa.
    if (!m.categoria && campos.categoria === M.categoriaMov(m)) delete campos.categoria;
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
    { motivo: m.motivo_atraso, quem: m.quem_atrasou, texto: m.justificativa, categoria: m.motivo_cat });
  // Concluída depois do prazo só grava com o porquê e quem atrasou (o PCM
  // pediu em 23/10/2026): deixar para depois era deixar para nunca.
  const caixaAtraso = el("div", { class: "bloco-atraso" },
    el("p", { class: "aviso-atraso" }, "Concluída depois do prazo — toque no motivo e em quem atrasou."), j.no);
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
      { rotulo: "Concluir", classe: "primario", acao: () => {
        const f = !caixaAtraso.hidden && j.falta();
        if (f) throw new Error(f);
        return true;
      } }],
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
  const todas = ev.lista("movimentacao");
  const etapas = M.etapasDe(m, todas);
  const espera = M.etapaAnteriorAberta(m, todas);
  const sequencia = m.roteiro && etapas.length > 1 ? el("div", { class: "sequencia" },
    el("div", { class: "seq-tit" }, `Sequência · ${etapas.length} etapas`),
    el("ol", {}, etapas.map(x => {
      const sx = M.situacaoMovimentacao(x);
      const daVez = M.movimentacaoAberta(x) && !M.etapaAnteriorAberta(x, todas);
      return el("li", { class: "seq-lin" + (x.id === m.id ? " esta" : "") + (daVez ? " da-vez" : "") + (x.chegou_em ? " feita" : ""),
        onclick: x.id === m.id ? null : () => abrirFichaMov(x.id, ctx) },
        el("span", { class: "seq-n" }, String(x.etapa || "")),
        el("span", { class: "seq-oque" }, tituloMov(x), x.prometida_para ? el("small", {}, ` · prazo ${brCurto(x.prometida_para)}`) : null),
        daVez ? chip("é a da vez", "andando") : chip(sx, M.corDe(sx)));
    }))) : null;
  const corpo = el("div", {},
    espera ? el("p", { class: "aviso-atraso" }, `Esta é a etapa ${m.etapa}: espera a etapa ${espera.etapa} (${tituloMov(espera)}) ser feita.`) : null,
    sequencia,
    el("table", { class: "tabela" },
      linha("Situação", el("span", {}, chip(s, M.corDe(s)))),
      linha("Frota", m.frota),
      linha("Categoria", M.nomeCategoriaMov(M.categoriaMov(m)) + (m.categoria ? "" : " (pelo texto)")),
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
  if (!m.cancelada && pessoas.pode("movimentar")) {
    acoes.push({ rotulo: "+ Próxima etapa", acao: async () => { await proximaEtapaMov(m); } });
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

/** `agrupar`: uma faixa por categoria, na ordem de CATEGORIAS_MOV (os itens
 *  já vêm ordenados assim). */
function tabelaMov(itens, ctx, ref, { agrupar = false } = {}) {
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
  const contaCat = new Map();
  for (const m of itens) { const c = M.categoriaMov(m); contaCat.set(c, (contaCat.get(c) || 0) + 1); }
  const faixa = (c, tag) => {
    const cat = M.categoriaMovPorId(c);
    const conteudo = [el("span", { class: "cat-ic", "aria-hidden": "true" }, cat.icone), " ", cat.nome,
      el("span", { class: "n" }, ` · ${contaCat.get(c)}`)];
    return tag === "tr" ? el("tr", { class: "bloco cat-bloco", dataset: { cat: c } }, el("td", { colspan: 10 }, conteudo))
      : el("div", { class: "mov-grupo-tit", dataset: { cat: c } }, conteudo);
  };
  let catAnterior = null;
  const corpo = el("tbody", {}, itens.flatMap(m => {
    const linhas = [];
    if (agrupar && M.categoriaMov(m) !== catAnterior) { catAnterior = M.categoriaMov(m); linhas.push(faixa(catAnterior, "tr")); }
    linhas.push(linhaTabela(m));
    return linhas;
  }));
  function linhaTabela(m) {
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
        el("div", { class: "t" }, tituloMov(m), ...tagsEtapa(m)),
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
  }
  const tabela = el("table", { class: "grade mov" }, el("thead", {}, cab), corpo);
  let catCartao = null;
  const cartoes = el("div", { class: "lista" }, itens.flatMap(m => {
    const a = acaoDaLinha(m);
    const r = [];
    if (agrupar && M.categoriaMov(m) !== catCartao) { catCartao = M.categoriaMov(m); r.push(faixa(catCartao, "div")); }
    r.push(cartaoMov(m, ctx, { acoes: a ? [a] : [], categoria: !agrupar }));
    return r;
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

// ── a agenda ────────────────────────────────────────────────────────────────
// O mês em calendário: cada movimentação no dia do prazo (a concluída, no dia
// em que foi feita), na cor da situação; cada etapa de uma sequência no seu
// dia, com "1/2". Do lado, o dia tocado, as atrasadas, a pontualidade do mês
// e as sem prazo — cada linha com o botão que resolve.

const CLASSE_CAL = { "Atrasada": "atrasada", "Vence hoje": "hoje", "Em aberto": "aberta", "Sem prazo": "fila",
  "Aguardando aprovação": "aprovar", "Concluída": "feita", "Concluída com atraso": "tarde" };
export const LEGENDA_CAL = [["atrasada", "Atrasada"], ["hoje", "Vence hoje"], ["aberta", "Em aberto"],
  ["espera", "Espera a etapa anterior"], ["aprovar", "Aguardando aprovação"], ["feita", "Concluída"], ["tarde", "Concluída com atraso"]];

/** A cor da etiqueta no calendário. A etapa que espera a anterior fica
 *  apagada até chegar a vez dela — a não ser que já esteja atrasada. */
export function classeCal(m, ref, todas) {
  const s = M.situacaoMovimentacao(m, ref);
  if (M.movimentacaoAberta(m) && s !== "Atrasada" && M.etapaAnteriorAberta(m, todas)) return "espera";
  return CLASSE_CAL[s] || "aberta";
}
/** O dia da movimentação na agenda: o prazo; a concluída, o dia em que foi feita. */
export const diaNaAgenda = m => M.movimentacaoAberta(m) ? m.prometida_para || "" : m.chegou_em || m.prometida_para || "";

function linhaAgenda(m, ref, ctx, todas) {
  const s = M.situacaoMovimentacao(m, ref);
  const atraso = M.atrasoMovimentacao(m, ref);
  const mini = (rot, fn, cls = "mini") => el("button", { type: "button", class: cls, onclick: e => { e.stopPropagation(); fn(); } }, rot);
  const acoes = [];
  if (M.movimentacaoAberta(m) && pessoas.pode("movimentar")) acoes.push(mini("Concluir", () => concluirMov(m), "mini primario-leve"));
  else if (M.movimentacaoParaAprovar(m) && pessoas.pode("aprovar")) acoes.push(mini("Aprovar", () => aprovar(m), "mini primario-leve"));
  if (pessoas.pode("movimentar") && M.movimentacaoSemJustificativa(m, ref)) acoes.push(mini("Justificar", () => justificar(m, "movimentacao")));
  const sub = [M.rotulo(s), m.prometida_para && M.movimentacaoAberta(m) ? `prazo ${brCurto(m.prometida_para)}` : "",
    m.chegou_em ? `concluída ${brCurto(m.chegou_em)}` : "", atraso ? `${atraso} dia${atraso === 1 ? "" : "s"} de atraso` : ""].filter(Boolean).join(" · ");
  return itemAgenda({ classe: classeCal(m, ref, todas), id: m.id,
    titulo: [el("b", {}, m.frota || "—"), " · ", tituloMov(m)], sub,
    tags: [...tagsEtapa(m, todas), chipPrio(m.prioridade)].filter(Boolean), acoes,
    aoClicar: cliqueLimpo(() => abrirFichaMov(m.id, ctx)) });
}

// ── a tela ──────────────────────────────────────────────────────────────────

const estado = { recorte: "", busca: "", quem: "", cat: "", vista: "agenda", mes: "", dia: "" };

const bateBusca = (m, q) => !q || semAcento([m.frota, m.acao, m.destino, m.para_que, m.prioridade, m.quem_prometeu, m.concluida_por,
  m.obs, m.motivo_atraso, m.quem_atrasou, m.justificativa, M.nomeCategoriaMov(M.categoriaMov(m))].join(" ")).includes(q);

export async function montar(raiz, ctx, params) {
  // O PCM abre na fila de aprovação quando há o que aprovar; a operação, no
  // que está em aberto. Um recorte no endereço (?v=) é coisa da lista.
  if (params.get("v")) { estado.recorte = params.get("v"); estado.vista = "lista"; }
  if (["agenda", "lista"].includes(params.get("vista"))) estado.vista = params.get("vista");
  if (params.get("cat") != null) estado.cat = params.get("cat");
  const categorias = el("div", { class: "faixa-sit cat-faixa" });
  const fBusca = el("input", { class: "busca", type: "search", value: estado.busca,
    placeholder: "Buscar frota, o que fazer, onde…", "aria-label": "Buscar",
    oninput: () => { estado.busca = fBusca.value; pintar(); } });
  const recortes = el("div", { class: "segmentos" });
  const navCaixa = el("div", { class: "nav-caixa" });
  const vistaCaixa = el("div", { class: "vista-caixa" });
  const topo = el("div", {});
  const corpo = el("div", {});

  // A busca fica FORA do que se repinta: repintar a cada tecla tirava o foco
  // do campo no meio da palavra.
  // O que está na tela agora — é o que vira imagem.
  const naTela = { itens: [], rotulo: "" };
  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Movimentações"),
      vistaCaixa,
      el("div", { class: "espaco" }),
      el("button", { title: "A lista que está na tela, como imagem — para mandar no grupo",
        onclick: () => imagemMovimentacoes(naTela.itens, naTela.rotulo) }, "Baixar imagem"),
      pessoas.pode("movimentar")
        ? el("button", { class: "primario", onclick: () => novaMovimentacao(ctx) }, "+ Nova")
        : null),
    topo,
    el("div", { class: "filtros" }, navCaixa, recortes, fBusca),
    categorias,
    corpo);

  const kpi = (rot, val, det, cls = "") =>
    el("div", { class: "kpi " + cls },
      el("div", { class: "k-rot" }, rot),
      el("div", { class: "k-val" }, String(val)),
      det ? el("div", { class: "k-det" }, det) : null);
  const n1 = v => (Math.round(v * 10) / 10).toLocaleString("pt-BR");

  /** As categorias do que está na tela, com quantas de cada; tocar filtra.
   *  Devolve o que passa pela categoria escolhida. */
  function faixaCategorias(lista) {
    const porCat = new Map();
    for (const m of lista) { const c = M.categoriaMov(m); porCat.set(c, (porCat.get(c) || 0) + 1); }
    if (estado.cat && !porCat.has(estado.cat)) estado.cat = "";
    limpar(categorias).append(
      el("span", { class: "rot-faixa" }, "Categoria:"),
      el("button", { type: "button", class: "fsit todas" + (estado.cat ? "" : " on"),
        onclick: () => { estado.cat = ""; pintar(); } }, el("b", {}, String(lista.length)), " Todas"),
      ...M.CATEGORIAS_MOV.filter(c => porCat.has(c.id)).map(c => el("button", {
        type: "button", class: "fsit cat-fsit" + (estado.cat === c.id ? " on" : ""), dataset: { cat: c.id },
        onclick: () => { estado.cat = estado.cat === c.id ? "" : c.id; pintar(); },
      }, el("b", {}, String(porCat.get(c.id))), " ", el("span", { class: "cat-ic", "aria-hidden": "true" }, c.icone), " ", c.nome)));
    categorias.hidden = !lista.length;
    return { itens: lista.filter(m => !estado.cat || M.categoriaMov(m) === estado.cat), porCat };
  }

  function pintar() {
    limpar(topo);
    limpar(corpo);
    const ref = M.hoje();
    const todas = ev.lista("movimentacao");
    limpar(vistaCaixa).append(trocaVista(estado.vista, v => { estado.vista = v; pintar(); }));
    recortes.hidden = estado.vista !== "lista";
    navCaixa.hidden = estado.vista !== "agenda";
    if (estado.vista === "agenda") return pintarAgenda(todas, ref);
    pintarLista(todas, ref);
  }

  // ── a agenda ─────────────────────────────────────────────────────────────
  function pintarAgenda(todas, ref) {
    if (!/^\d{4}-\d\d$/.test(estado.mes)) estado.mes = ref.slice(0, 7);
    if (estado.dia && !estado.dia.startsWith(estado.mes)) estado.dia = "";
    limpar(navCaixa).append(navMes(estado.mes, m => { estado.mes = m; estado.dia = ""; pintar(); }, ref));
    const q = semAcento(estado.busca.trim());
    const vivas = todas.filter(m => !m.cancelada && !m.excluida && bateBusca(m, q));
    const doMes = vivas.filter(m => diaNaAgenda(m).startsWith(estado.mes));
    const { itens } = faixaCategorias(doMes);
    const naCat = m => !estado.cat || M.categoriaMov(m) === estado.cat;
    const abertas = vivas.filter(M.movimentacaoAberta).filter(naCat);
    const peso = m => { const i = ORDEM.indexOf(M.situacaoMovimentacao(m, ref)); return i < 0 ? 99 : i; };
    const prio = m => PESO_PRIO[m.prioridade] ?? 3;
    const ordem = (a, b) => peso(a) - peso(b) || prio(a) - prio(b) || natural(a, b);
    naTela.itens = [...abertas].sort((a, b) => String(a.prometida_para || "9999").localeCompare(String(b.prometida_para || "9999")) || ordem(a, b));
    naTela.rotulo = ["Em aberto", estado.cat ? M.nomeCategoriaMov(estado.cat) : "",
      estado.busca.trim() ? `busca "${estado.busca.trim()}"` : ""].filter(Boolean).join(" · ");

    const dia = estado.dia || (ref.startsWith(estado.mes) ? ref : "");
    const nEtapas = new Map();
    for (const m of todas) if (m.roteiro && !m.cancelada && !m.excluida) nEtapas.set(m.roteiro, (nEtapas.get(m.roteiro) || 0) + 1);
    const itensCal = [...itens].sort(ordem).map(m => {
      const s = M.situacaoMovimentacao(m, ref);
      const etapa = m.roteiro ? `${m.etapa}/${nEtapas.get(m.roteiro) || m.etapa} ` : "";
      return { dia: diaNaAgenda(m), id: m.id, classe: classeCal(m, ref, todas),
        rotulo: [el("b", {}, m.frota || "—"), ` ${etapa}${m.acao || m.destino || ""}`],
        titulo: `${m.frota} · ${tituloMov(m)} — ${M.rotulo(s)}` };
    });
    const presentes = new Set(itensCal.map(i => i.classe));
    const cal = el("div", { class: "cal-cartao" },
      calendarioMes({ mes: estado.mes, itens: itensCal, ref, selecionado: dia,
        aoDia: d => { estado.dia = d; pintar(); if (matchMedia("(max-width: 1100px)").matches) {
          const c = corpo.querySelector(".tr-card.dia"); if (c) c.scrollIntoView({ block: "nearest", behavior: "smooth" }); } },
        aoItem: it => abrirFichaMov(it.id, ctx) }),
      presentes.size ? el("div", { class: "cal-leg" }, LEGENDA_CAL.filter(([c]) => presentes.has(c))
        .map(([c, rot]) => el("span", { class: "leg-item" }, el("i", { class: "ev-cor " + c }), rot))) : null);

    // ── a coluna da direita
    const lista = (l, max = 0) => el("div", { class: "ag-lista" }, (max ? l.slice(0, max) : l).map(m => linhaAgenda(m, ref, ctx, todas)));
    const doDia = dia ? vivas.filter(naCat).filter(m => diaNaAgenda(m) === dia).sort(ordem) : [];
    const cartaoDia = cartaoTrilho(dia === ref ? "Hoje" : dia ? "Dia selecionado" : "Escolha um dia",
      dia ? (doDia.length ? lista(doDia) : el("p", { class: "tr-vazio" }, "Nada com prazo neste dia."))
        : el("p", { class: "tr-vazio" }, "Toque num dia do calendário para ver o que tem nele."),
      { classe: "dia", sub: dia ? diaPorExtenso(dia) : "",
        acao: dia && dia !== ref ? el("button", { type: "button", class: "discreto mini", onclick: () => {
          estado.mes = ref.slice(0, 7); estado.dia = ""; pintar(); } }, "Voltar para hoje") : null });

    const atrasadas = abertas.filter(m => M.situacaoMovimentacao(m, ref) === "Atrasada")
      .sort((a, b) => String(a.prometida_para).localeCompare(String(b.prometida_para)) || prio(a) - prio(b));
    const semJ = todas.filter(m => !m.excluida && M.movimentacaoSemJustificativa(m, ref) && naCat(m) && bateBusca(m, q));
    const alerta = atrasadas.length || semJ.length ? cartaoTrilho(
      atrasadas.length ? `${atrasadas.length} atrasada${atrasadas.length === 1 ? "" : "s"}` : "Atrasos sem o porquê",
      el("div", {},
        atrasadas.length ? lista(atrasadas, 4) : null,
        semJ.length ? el("p", { class: "tr-nota" }, `${semJ.length} atraso${semJ.length === 1 ? "" : "s"} sem justificativa.`) : null),
      { classe: "alerta", sub: atrasadas.length ? "o prazo passou e não foi concluída" : "",
        acao: el("div", { class: "tr-acoes" },
          atrasadas.length > 4 ? el("button", { type: "button", class: "mini", onclick: () => {
            estado.vista = "lista"; estado.recorte = "abertas"; pintar(); } }, `Ver as ${atrasadas.length}`) : null,
          semJ.length ? el("button", { type: "button", class: "mini", onclick: () => { location.hash = "#/avaliacao?a=resolver"; } },
            "Justificar") : null) }) : null;

    const paraAprovar = todas.filter(M.movimentacaoParaAprovar);
    const aprovarCard = paraAprovar.length && pessoas.pode("aprovar") ? cartaoTrilho(`Aguardando aprovação · ${paraAprovar.length}`,
      el("p", { class: "tr-nota" }, "A operação marcou como concluídas. Confira e aprove."),
      { classe: "aprovar", acao: el("button", { type: "button", class: "mini primario-leve", onclick: () => {
        estado.vista = "lista"; estado.recorte = "aprovar"; pintar(); } }, "Conferir") }) : null;

    // A pontualidade do mês na tela: das concluídas nele, quantas no prazo.
    const concl = vivas.filter(naCat).filter(m => m.chegou_em && m.chegou_em.startsWith(estado.mes));
    const tarde = concl.filter(m => M.atrasoMovimentacao(m, ref) > 0).length;
    const pontual = cartaoTrilho(`Pontualidade · ${nomeMesISO(estado.mes).split(" ")[0]}`,
      concl.length ? anel([{ rotulo: "No prazo", valor: concl.length - tarde, cor: "var(--s1)" },
        { rotulo: "Com atraso", valor: tarde, cor: "var(--s2)" }], { rotuloCentro: "no prazo" })
        : el("p", { class: "tr-vazio" }, "Nenhuma concluída neste mês ainda."),
      { classe: "pontual", sub: concl.length ? `${concl.length} concluída${concl.length === 1 ? "" : "s"} no mês` : "",
        acao: el("button", { type: "button", class: "mini", onclick: () => { location.hash = "#/avaliacao"; } }, "Ver a avaliação") });

    const semPrazo = abertas.filter(m => !m.prometida_para).sort(ordem);
    const semPrazoCard = semPrazo.length ? cartaoTrilho(`Sem prazo · ${semPrazo.length}`, lista(semPrazo, 5),
      { classe: "sem-prazo", sub: "não aparecem no calendário",
        acao: semPrazo.length > 5 ? el("button", { type: "button", class: "mini", onclick: () => {
          estado.vista = "lista"; estado.recorte = "abertas"; pintar(); } }, `Ver as ${semPrazo.length}`) : null }) : null;

    corpo.append(agenda(cal, cartaoDia, alerta, aprovarCard, pontual, semPrazoCard));
  }

  // ── a lista ──────────────────────────────────────────────────────────────
  function pintarLista(todas, ref) {
    const pt = M.pontualidade(todas, ref);
    const pc = pt.pct == null ? "—" : `${Math.round(pt.pct * 1000) / 10}`.replace(".", ",") + "%";

    // Quatro números, os que respondem "como está a operação": o resto (o
    // total, as concluídas, os dias somados) vai no detalhe de cada um.
    topo.append(el("div", { class: "kpis kpis-4" },
      kpi("Em aberto", pt.em_aberto, pt.para_aprovar ? `${pt.para_aprovar} aguardando aprovação · ${pt.total} no total`
        : `de ${pt.total} movimentações`, pt.para_aprovar ? "andando" : ""),
      kpi("Pontualidade da operação", pc, `${pt.no_prazo} de ${pt.concluidas} concluídas no prazo`,
        pt.pct == null ? "" : pt.pct >= 0.85 ? "ok" : pt.pct >= 0.6 ? "hoje" : "vencida"),
      kpi("Atrasadas agora", pt.atrasadas,
        pt.dias_correndo ? `${pt.dias_correndo} dias de atraso acumulados` : "em aberto com prazo vencido",
        pt.atrasadas ? "vencida" : ""),
      kpi("Atraso médio", `${n1(pt.atraso_medio)} d`, `entre as atrasadas · ${pt.dias_perdidos} dias somados nas concluídas`)));

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
    const buscadas = base.filter(m => bateBusca(m, q));

    // ── as categorias: quantas de cada uma neste recorte; tocar filtra
    const { itens, porCat } = faixaCategorias(buscadas);
    const peso = m => { const i = ORDEM.indexOf(M.situacaoMovimentacao(m, ref)); return i < 0 ? 99 : i; };
    const prio = m => PESO_PRIO[m.prioridade] ?? 3;
    const ordemCat = m => M.CATEGORIAS_MOV.findIndex(c => c.id === M.categoriaMov(m));
    itens.sort((a, b) => (estado.cat ? 0 : ordemCat(a) - ordemCat(b)) || peso(a) - peso(b) || prio(a) - prio(b) ||
      (a.chegou_em || b.chegou_em
        ? String(b.chegou_em || "").localeCompare(String(a.chegou_em || ""))
        : String(a.prometida_para || "9999").localeCompare(String(b.prometida_para || "9999"))));
    naTela.itens = itens;
    naTela.rotulo = [
      estado.quem ? `Atrasos — ${estado.quem === "__sem" ? "sem justificativa" : estado.quem}`
        : (OPCOES.find(([id]) => id === estado.recorte) || OPCOES[0])[1],
      estado.cat ? M.nomeCategoriaMov(estado.cat) : "",
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
    corpo.append(tabelaMov(itens, ctx, ref, { agrupar: !estado.cat && porCat.size > 1 }));
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}

/** A ordem estável da agenda, depois da situação e da prioridade: a frota. */
const natural = (a, b) => String(a.frota || "").localeCompare(String(b.frota || ""), "pt-BR", { numeric: true });
