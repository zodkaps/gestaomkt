// Avaliação da operação — a tela que o site virou em 21/10/2026.
//
// A pergunta da reunião é uma só: a operação cumpriu o que combinou? Três
// coisas respondem, e são as contas de `js/avaliacao.js`: a movimentação
// concluída depois do prometido, a frota que chegou na oficina depois do dia
// combinado para a preventiva, e a liberação que foi remarcada para mais
// tarde.
//
// As cinco abas de sempre, na ordem em que se lê (em 12/11/2026 elas viraram
// três áreas por umas horas; o PCM pediu as cinco de volta, com a leitura nova
// dentro de cada uma):
//
//   Resumo            como está a operação: uma frase que compara com o período
//                     anterior, os quatro números de sempre (cada um com o valor
//                     de antes), o que precisa de ação, os principais motivos e
//                     um gráfico;
//   Para resolver     o que pede ação, cada coisa uma vez só — o que está
//                     atrasando agora e o atraso sem o porquê —, o mais atrasado
//                     primeiro, cada um com o botão que resolve;
//   Motivos           os motivos recorrentes: quantos atrasos, de que tipo, os
//                     dias e quem atrasou; tocar num motivo abre os atrasos dele;
//   Análise           os gráficos do período;
//   Todos os atrasos  a lista do período, com os filtros.
//
// As contas não mudaram: a comparação é a mesma conta com as datas do período
// anterior (`A.periodoAnterior`). No celular, as tabelas viram cartões, os
// filtros longos viram uma lista de escolha e as abas usam o nome curto. Os
// endereços das três áreas (?a=pendencias, ?a=historico) caem na aba certa.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import * as A from "../avaliacao.js";
import { el, limpar, br, brCurto, vazio, cliqueLimpo } from "../ui.js";
import { busca as semAcento, filtroDeFrota } from "../texto.js";
import { cartaoGrafico, graficoBarras, graficoColunas, graficoLinhas, graficoRosca } from "../graficos.js";
import { justificar } from "./comum.js";

// A cor de cada tipo de atraso, a mesma em todos os gráficos. No prazo é o
// cinza de contexto: o assunto da tela é o atraso, e só ele ganha cor.
const COR_TIPO = { mov: "var(--s1)", entrega: "var(--s5)", liberacao: "var(--s4)" };
const TIPOS = Object.keys(A.TIPOS_OCORRENCIA);
const NO_PRAZO = "var(--ctx)", ATRASO = "var(--s2)";
// Para contar: "3 movimentações · 1 chegada".
const CONTA_TIPO = { mov: ["movimentação", "movimentações"], entrega: ["chegada atrasada", "chegadas atrasadas"],
  liberacao: ["liberação remarcada", "liberações remarcadas"] };
// [id, nome, nome curto (celular e tablet)]
const ABAS = [["resumo", "Resumo"], ["resolver", "Para resolver", "Resolver"], ["motivos", "Motivos"], ["analise", "Análise"],
  ["lista", "Todos os atrasos", "Atrasos"]];
// Os endereços das três áreas (12/11/2026) continuam valendo.
const ABA_TRES = new Map([["pendencias", "resolver"], ["historico", "analise"]]);
const FILTROS_PEND = [["todas", "Todas"], ["agora", "Atrasando agora"], ["sem-porque", "Sem justificativa"]];
const NO_RESUMO = 3;    // as pendências mais atrasadas que aparecem no Resumo
const POR_VEZ = 15;     // linhas antes do "Mostrar as outras"

const estado = { periodo: "mes", frota: "", busca: "", tipo: "", aba: "resumo", pend: "todas", motivo: null, mais: false };

const pc = v => v == null ? "—" : Math.round(v * 100) + "%";
const n1 = v => (Math.round(v * 10) / 10).toLocaleString("pt-BR");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
// Motivo e categoria são frases: o rótulo das barras precisa de mais lugar que o de uma frota.
const rotuloLargo = w => Math.round(Math.min(220, Math.max(110, w * 0.42)));
const corPct = v => v == null ? "" : v >= 0.9 ? "ok" : v >= 0.7 ? "hoje" : "vencida";
const dataOuNada = d => d === "agora" ? "agora" : d ? brCurto(d) : "—";

export async function montar(raiz, ctx, params = new URLSearchParams()) {
  if (params.get("p")) estado.periodo = params.get("p");
  if (params.get("f") != null) estado.frota = params.get("f");
  const pedida = params.get("a"), vista = params.get("v") || "";
  // ?a=historico&v=lista (ou com um motivo) era a lista de todos os atrasos
  const aba = pedida === "historico" && (vista === "lista" || params.get("m") != null) ? "lista" : ABA_TRES.get(pedida) || pedida;
  if (ABAS.some(([id]) => id === aba)) {
    estado.aba = aba;
    estado.mais = false;
    if (aba === "resolver") estado.pend = FILTROS_PEND.some(([id]) => id === vista) ? vista : "todas";
  }
  if (params.get("m") != null) estado.motivo = params.get("m");

  const titulo = el("span", { class: "sub" });
  // O período: botões no computador e no tablet; no celular, uma lista de escolha (cabe numa linha).
  const periodos = el("div", { class: "segmentos av-seg-largo", role: "group", "aria-label": "Período" });
  const periodoSel = el("select", { class: "av-seg-cel", "aria-label": "Período",
    onchange: () => { estado.periodo = periodoSel.value; pintar(); } });
  // A frota se digita, qualquer uma: a lista só sugere. "617" acha a F-617, e
  // um pedaço do número mostra as frotas que têm ele (ver `filtroDeFrota`).
  const lista = el("datalist", { id: "dl-frotas-avaliacao" });
  const fFrota = el("input", { type: "search", class: "busca-frota", placeholder: "Digite a frota", title: "Qualquer frota: 617 acha a F-617", list: "dl-frotas-avaliacao",
    autocomplete: "off", spellcheck: false, value: estado.frota, "aria-label": "Frota",
    oninput: () => { estado.frota = fFrota.value.trim(); estado.mais = false; pintar(); } });
  const corpo = el("div", { class: "av-corpo" });
  const abas = el("div", { class: "abas av-abas", role: "tablist", "aria-label": "Área da avaliação" });
  raiz.append(el("div", { class: "av" },
    el("div", { class: "cabec" }, el("h1", {}, "Avaliação da operação"), titulo, el("div", { class: "espaco" })),
    el("div", { class: "filtros av-filtros" }, periodos, periodoSel, fFrota, lista),
    abas,
    corpo));
  // Ir para uma área (e, nela, um recorte). Trocar de área volta para o alto.
  const ir = (aba, extra = {}) => () => {
    Object.assign(estado, { mais: false }, extra, { aba });
    pintar(); window.scrollTo({ top: 0 });
  };

  function frotas() {
    return [...new Set([...ev.lista("movimentacao"), ...ev.lista("preventiva")].map(x => x.frota).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }
  // "01/10 a 12/10" no ano de hoje; com o ano quando é outro.
  const faixa = (p, ano) => p.de.slice(0, 4) === ano && p.ate.slice(0, 4) === ano
    ? `${brCurto(p.de)} a ${brCurto(p.ate)}` : `${br(p.de)} a ${br(p.ate)}`;

  // Um botão de escolha: segmentos no computador e no tablet, lista no celular.
  function escolha(rotulo, opcoes, atual, escolher, { celular = true } = {}) {
    const seg = el("div", { class: "segmentos" + (celular ? " av-seg-largo" : ""), role: "group", "aria-label": rotulo },
      opcoes.map(([id, rot, n]) => el("button", { type: "button", class: "seg-op" + (id === atual ? " on" : ""), dataset: { op: id },
        "aria-pressed": String(id === atual), onclick: () => escolher(id) }, rot, n != null ? el("span", { class: "n" }, " " + n) : null)));
    if (!celular) return seg;
    const sel = el("select", { class: "av-seg-cel", "aria-label": rotulo, onchange: () => escolher(sel.value) },
      opcoes.map(([id, rot, n, rotLista]) => el("option", { value: id, selected: id === atual }, (rotLista || rot) + (n != null ? ` (${n})` : ""))));
    return [seg, sel];
  }

  const kpi = (rot, val, det, comp, cls = "", fazer = null) => {
    const k = el("div", { class: "kpi " + cls },
      el("div", { class: "k-rot" }, rot), el("div", { class: "k-val" }, String(val)), det ? el("div", { class: "k-det" }, det) : null, comp);
    if (fazer) { k.classList.add("clicavel"); k.tabIndex = 0; k.setAttribute("role", "button"); k.onclick = fazer;
      k.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fazer(); } }; }
    return k;
  };

  // A comparação de um número com o período anterior: a diferença, com a cor
  // do que ela quer dizer (mais no prazo é bom; mais remarcação é ruim), e o
  // valor de antes. Sem dado num dos lados, não compara.
  function comparar(atual, antes, { pct = false, bomQuando = "sobe", detalhe = "" } = {}) {
    if (antes == null) return el("div", { class: "k-comp" }, "sem registros antes para comparar");
    const txtAntes = "antes " + (pct ? pc(antes) : String(antes));
    if (atual == null) return el("div", { class: "k-comp", title: detalhe }, txtAntes);
    const d = pct ? Math.round(atual * 100) - Math.round(antes * 100) : atual - antes;
    const unidade = pct ? " p.p." : "";
    const cls = !d ? "igual" : (d > 0) === (bomQuando === "sobe") ? "bom" : "ruim";
    return el("div", { class: "k-comp " + cls, title: detalhe },
      el("span", { class: "k-delta" }, d > 0 ? `▲ ${d}${unidade}` : d < 0 ? `▼ ${-d}${unidade}` : "= igual"), el("span", {}, txtAntes));
  }

  // ── as ações de cada linha ───────────────────────────────────────────────
  async function abrir(o) {
    if (o.tipo === "mov") { const { abrirFichaMov } = await import("./movimentacoes.js"); return abrirFichaMov(o.id, ctx); }
    const { abrirFichaPrev } = await import("./preventivas.js");
    return abrirFichaPrev(o.id, ctx);
  }
  // Os mesmos botões de antes, com as mesmas permissões: concluir e justificar
  // a movimentação; a chegada da frota (e o porquê dela) é do PCM.
  function botoes(o) {
    const b = [];
    const mini = (rot, fn, cls = "mini") => el("button", { type: "button", class: cls, onclick: e => { e.stopPropagation(); fn(); } }, rot);
    if (o.tipo === "mov") {
      const m = ev.porId(o.id, "movimentacao");
      if (!m) return b;
      if (M.movimentacaoAberta(m) && pessoas.pode("movimentar")) {
        b.push(mini("Concluir", async () => { const { concluirMov } = await import("./movimentacoes.js"); concluirMov(m); }, "mini primario-leve"));
      }
      if (pessoas.pode("movimentar") && !m.motivo_atraso && !m.justificativa) b.push(mini("Justificar", () => justificar(m, "movimentacao")));
    } else if (o.tipo === "entrega") {
      const p = ev.porId(o.id, "preventiva");
      if (!p || !pessoas.pode("parada")) return b;
      const registrarEntregaPrev = async (...x) => (await import("./preventivas.js")).registrarEntregaPrev(...x);
      if (!p.entregue_em) b.push(mini("A frota chegou", () => registrarEntregaPrev(p), "mini primario-leve"));
      else if (!p.motivo_entrega) b.push(mini("Justificar", () => registrarEntregaPrev(p, { soJustificar: true })));
    }
    return b;
  }

  // ── pedaços comuns ───────────────────────────────────────────────────────
  const tipoOc = o => el("span", { class: "tipo-oc" }, el("i", { style: `background:${COR_TIPO[o.tipo]}` }), A.TIPOS_OCORRENCIA[o.tipo]);
  const dias = o => [el("b", { class: o.dias > 7 ? "t-venc" : "" }, String(o.dias)), el("small", { class: "av-so-cartao" }, o.dias === 1 ? " dia" : " dias")];
  // Onde a pendência está: atrasando (e desde quando) ou feita com atraso.
  function situacao(o) {
    const entrega = o.tipo === "entrega";
    if (o.atrasando) return [el("span", { class: "av-sit atrasando" }, entrega ? "Frota não chegou" : "Atrasada"),
      el("small", {}, (entrega ? "parada em " : "combinado ") + dataOuNada(o.combinado))];
    return [el("span", { class: "av-sit feita" }, (entrega ? "Chegou " : "Concluída ") + dataOuNada(o.quando)),
      el("small", {}, (entrega ? "parada era " : "combinado ") + dataOuNada(o.combinado))];
  }
  const motivoQuem = o => o.motivo
    ? [el("span", { class: "c-motivo" }, o.motivo), o.quem ? el("small", {}, o.quem) : null]
    : o.semPorque ? el("span", { class: "av-sit falta" }, "Falta justificar")
    : o.tipo === "entrega" && o.atrasando ? el("span", { class: "seg" }, "o porquê vem com a chegada")
    : el("span", { class: "seg" }, "—");
  // A linha (cartão, no celular) abre a ficha, pelo mouse ou pelo teclado.
  const linhaAbre = o => ({ tabIndex: 0, onclick: cliqueLimpo(() => abrir(o)),
    onkeydown: e => { if (e.key === "Enter" && e.target === e.currentTarget) abrir(o); } });

  // ── a tela ───────────────────────────────────────────────────────────────
  function pintar() {
    limpar(corpo);
    const ref = M.hoje();
    const pers = A.periodos(ref);
    const per = pers.find(x => x.id === estado.periodo) || pers[0];
    estado.periodo = per.id;
    const ant = A.periodoAnterior(per);
    limpar(periodos).append(...pers.map(x => el("button", { type: "button", class: "seg-op" + (x.id === per.id ? " on" : ""),
      "aria-pressed": String(x.id === per.id), onclick: () => { estado.periodo = x.id; pintar(); } }, x.rotulo)));
    limpar(periodoSel).append(...pers.map(x => el("option", { value: x.id, selected: x.id === per.id }, x.rotulo)));
    limpar(lista).append(...frotas().map(f => el("option", { value: f })));
    if (document.activeElement !== fFrota) fFrota.value = estado.frota;
    const filtro = filtroDeFrota(estado.frota, frotas());
    const nomeFrota = filtro.vazio ? "" : filtro.exata || estado.frota;
    titulo.textContent = `${br(per.de)} a ${br(per.ate)}` + (nomeFrota ? ` · ${nomeFrota}` : "");

    const daFrota = x => filtro.bate(x.frota);
    const movs = ev.lista("movimentacao").filter(daFrota);
    const prevs = ev.lista("preventiva").filter(daFrota);
    const ocs = A.ocorrencias({ movs, prevs, log: ev.log, de: per.de, ate: per.ate });
    const ocsAnt = A.ocorrencias({ movs, prevs, log: ev.log, de: ant.de, ate: ant.ate });
    const agora = A.atrasandoAgora({ movs, prevs, ref });
    const semJ = A.semJustificativa(movs, prevs, ev.log, ref);
    const pend = A.pendencias(agora, semJ);
    const r = A.resumo(ocs, agora);

    limpar(abas).append(...ABAS.map(([id, rot, curto]) => el("button", { type: "button", role: "tab", class: "aba" + (estado.aba === id ? " on" : ""),
      "aria-selected": estado.aba === id ? "true" : "false", dataset: { aba: id }, onclick: ir(id, id === "lista" ? { motivo: null } : {}) },
      curto ? [el("span", { class: "so-largo" }, rot), el("span", { class: "so-curto" }, curto)] : rot,
      id === "resolver" && pend.length ? el("span", { class: "cont" }, String(pend.length)) : null)));

    if (estado.aba === "resolver") return pintarPendencias(pend);
    const semNada = !ocs.length && el("div", {}, vazio(nomeFrota && !movs.length && !prevs.length
      ? `Nenhuma movimentação ou preventiva da ${nomeFrota} lançada ainda.`
      : "Nada concluído, entregue ou remarcado neste período" + (nomeFrota ? ` · ${nomeFrota}` : "") + "."));
    if (estado.aba !== "resumo" && semNada) return corpo.append(semNada);
    if (estado.aba === "motivos") return pintarMotivos(ocs, semJ.length);
    if (estado.aba === "analise") return pintarGraficos(ocs, per, filtro);
    if (estado.aba === "lista") return pintarLista(ocs);
    pintarResumo({ ref, per, ant, ocs, ocsAnt, r, ra: A.resumo(ocsAnt), agora, pend, semNada });
  }

  // ── Resumo ───────────────────────────────────────────────────────────────
  // Na ordem de leitura: como foi o período (a frase e os quatro números, com o
  // de antes), o que precisa de ação, os principais motivos e a semana a semana.
  function pintarResumo({ ref, per, ant, ocs, ocsAnt, r, ra, agora, pend, semNada }) {
    const ano = ref.slice(0, 4);
    const quandoAntes = faixa(ant, ano);
    // A frase: só o que os números dizem — a contagem de atrasos deste período e
    // a do anterior, com as datas. Sem registro antes, diz que não há com que comparar.
    if (ocs.length) {
      const n = r.atrasos, p = ra.atrasos;
      const [cls, tit, txt] = !ocsAnt.length
        ? ["", plural(n, "atraso", "atrasos") + " no período", ` · sem registros de ${quandoAntes} para comparar.`]
        : !n && !p ? ["bom", "Nenhum atraso", ` no período nem de ${quandoAntes}.`]
        : n < p ? ["bom", "Atrasos diminuíram", `: ${n || "nenhum"} no período, contra ${p} de ${quandoAntes}.`]
        : n > p ? ["ruim", "Atrasos aumentaram", `: ${n} no período, contra ${p || "nenhum"} de ${quandoAntes}.`]
        : ["", "Atrasos estáveis", `: ${n} no período e ${p} de ${quandoAntes}.`];
      corpo.append(el("p", { class: "av-leitura " + cls }, el("b", {}, tit), txt,
        r.dias_perdidos ? el("span", { class: "av-leitura-det" }, ` ${plural(r.dias_perdidos, "dia", "dias")} de atraso somados.`) : null));
    }
    // Os quatro números: as contas de sempre, cada um com o valor do período anterior.
    const antes = ocsAnt.length ? ra : null;
    const compPct = (parte, nenhuma) => !antes ? comparar(null, null)
      : !antes[parte].com_prazo ? el("div", { class: "k-comp" }, "antes: " + nenhuma)
      : comparar(r[parte].pct, antes[parte].pct, { pct: true, detalhe: `De ${quandoAntes}: ${antes[parte].no_prazo} de ${antes[parte].com_prazo} no prazo` });
    const maisAntigo = agora.reduce((mx, o) => Math.max(mx, o.dias), 0);
    corpo.append(el("div", { class: "kpis kpis-4 av-kpis" },
      kpi("Movimentações no prazo", pc(r.mov.pct),
        r.mov.com_prazo ? `${r.mov.no_prazo} de ${r.mov.com_prazo} concluídas` + (r.mov.atrasadas ? ` · atraso médio ${n1(r.mov.atraso_medio)} d` : "")
          : r.mov.total ? `${r.mov.total} concluída(s), nenhuma com prazo` : "nenhuma concluída no período",
        compPct("mov", "nenhuma com prazo"), corPct(r.mov.pct), r.mov.atrasadas ? ir("lista", { tipo: "mov", motivo: null }) : null),
      kpi("Frotas no dia da preventiva", pc(r.entrega.pct),
        r.entrega.com_prazo ? `${r.entrega.no_prazo} de ${r.entrega.com_prazo} chegaram no dia` + (r.entrega.atrasadas ? ` · atraso médio ${n1(r.entrega.atraso_medio)} d` : "")
          : "nenhuma chegada anotada no período",
        compPct("entrega", "nenhuma chegada anotada"), corPct(r.entrega.pct), r.entrega.atrasadas ? ir("lista", { tipo: "entrega", motivo: null }) : null),
      kpi("Liberações remarcadas", r.liberacao.remarcadas,
        r.liberacao.remarcadas ? `${plural(r.liberacao.frotas, "frota", "frotas")} · ${r.liberacao.dias} dia(s) adiados` : "nenhuma no período",
        comparar(r.liberacao.remarcadas, antes ? antes.liberacao.remarcadas : null, { bomQuando: "desce",
          detalhe: antes ? `De ${quandoAntes}: ${antes.liberacao.remarcadas}` : "" }),
        r.liberacao.remarcadas ? "hoje" : "", r.liberacao.remarcadas ? ir("lista", { tipo: "liberacao", motivo: null }) : null),
      kpi("Atrasando agora", r.agora.total,
        r.agora.total ? `${plural(r.agora.movs, "movimentação", "movimentações")} · ${plural(r.agora.entregas, "frota sem chegar", "frotas sem chegar")}` : "nada atrasado",
        el("div", { class: "k-comp" }, r.agora.total ? `a mais atrasada: ${plural(maisAntigo, "dia", "dias")}` : "conta até hoje"),
        r.agora.total ? "vencida" : "ok", r.agora.total ? ir("resolver", { pend: "agora" }) : null)));

    corpo.append(el("div", { class: "av-dupla" }, cartaoAcao(pend), semNada ? null : cartaoMotivos(ocs)));
    if (semNada) return corpo.append(semNada);

    // Um gráfico só: a semana a semana do período, com a semana de mais atrasos dita em palavras.
    const grade = el("div", { class: "bi-grade" });
    corpo.append(grade);
    const pendurar = penduradorEm(grade);
    const sem = A.porSemana(ocs, per.de, per.ate);
    const rotSem = s => brCurto(s.ini < per.de ? per.de : s.ini);
    const pior = sem.reduce((x, s) => !x || s.atrasadas > x.atrasadas ? s : x, null);
    pendurar(cartaoGrafico("No prazo e com atraso, por semana",
      "movimentações e chegadas para a preventiva, pela semana em que foram feitas (a data é o início da semana)",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: [{ nome: "No prazo", cor: NO_PRAZO }, { nome: "Com atraso", cor: ATRASO }] }),
    w => sem.some(s => s.no_prazo || s.atrasadas)
      ? graficoColunas({ largura: w, xs: sem.map(rotSem),
        series: [{ nome: "No prazo", cor: NO_PRAZO, valores: sem.map(s => s.no_prazo) }, { nome: "Com atraso", cor: ATRASO, valores: sem.map(s => s.atrasadas) }] })
      : el("p", { class: "nada" }, "Nada com prazo neste período."), true);
    const card = grade.lastElementChild;
    const fimSem = s => brCurto(s.fim > per.ate ? per.ate : s.fim);
    if (pior && pior.atrasadas) card.append(el("p", { class: "av-grafico-nota" }, "Semana com mais atrasos: ",
      el("b", {}, rotSem(pior) === fimSem(pior) ? rotSem(pior) : `${rotSem(pior)} a ${fimSem(pior)}`),
      ` — ${pior.atrasadas} de ${pior.atrasadas + pior.no_prazo} com atraso.`));
    else if (sem.some(s => s.no_prazo)) card.append(el("p", { class: "av-grafico-nota" }, "Nenhuma semana com atraso no período."));

    corpo.append(el("p", { class: "nota av-nota" },
      "Conta como atraso: movimentação concluída depois do prometido, frota que chegou na oficina depois do dia " +
      "da parada, e liberação remarcada para mais tarde. A comparação é com " + quandoAntes + ", pelas mesmas contas."));
  }

  // O que precisa de ação: quantas, e as mais atrasadas, cada uma com o botão.
  function cartaoAcao(pend) {
    const nAgora = pend.filter(o => o.atrasando).length, nFeitas = pend.length - nAgora;
    if (!pend.length) return el("section", { class: "av-cartao av-acao ok" },
      el("div", { class: "av-cartao-cab" }, el("h2", {}, "Precisa de ação")),
      el("p", { class: "av-tudo-ok" }, el("b", {}, "Nada pendente."), " Nada atrasando agora, e todo atraso tem o porquê."));
    return el("section", { class: "av-cartao av-acao" },
      el("div", { class: "av-cartao-cab" }, el("h2", {}, "Precisa de ação"),
        el("span", { class: "av-cartao-n" }, plural(pend.length, "pendência", "pendências"))),
      el("p", { class: "av-cartao-sub" }, [nAgora ? `${nAgora} atrasando agora` : null,
        nFeitas ? `${plural(nFeitas, "feita", "feitas")} com atraso e sem o porquê` : null].filter(Boolean).join(" · ") + " · as mais atrasadas primeiro"),
      el("ul", { class: "av-mini-lista" }, pend.slice(0, NO_RESUMO).map(o => el("li", { class: "av-mini", dataset: { tipo: o.tipo, id: o.id }, ...linhaAbre(o) },
        el("span", { class: "av-mini-dias" + (o.dias > 7 ? " t-venc" : "") }, String(o.dias), el("small", {}, o.dias === 1 ? "dia" : "dias")),
        el("span", { class: "av-mini-txt" }, el("b", {}, o.frota || "—"), " · ", o.oque || A.TIPOS_OCORRENCIA[o.tipo],
          el("small", {}, o.atrasando ? (o.tipo === "entrega" ? "frota não chegou" : "atrasada") + (o.semPorque ? " · sem o porquê" : "")
            : "feita com atraso · falta justificar")),
        el("span", { class: "av-mini-acoes" }, botoes(o))))),
      el("button", { type: "button", class: "av-ver", onclick: ir("resolver", { pend: "todas" }) },
        pend.length > NO_RESUMO ? `Ver as ${pend.length} pendências →` : "Abrir as pendências →"));
  }

  // Os principais motivos do período: os quatro maiores e o "sem motivo", se houver.
  function cartaoMotivos(ocs) {
    const ms = A.porMotivo(ocs);
    const total = ms.reduce((t, x) => t + x.total, 0);
    const mostrar = [...ms.filter(x => x.id).slice(0, 4), ...ms.filter(x => !x.id)];
    const max = Math.max(1, ...mostrar.map(x => x.total));
    return el("section", { class: "av-cartao av-motivos" },
      el("div", { class: "av-cartao-cab" }, el("h2", {}, "Principais motivos"),
        total ? el("span", { class: "av-cartao-n neutro" }, plural(total, "atraso", "atrasos")) : null),
      total ? el("p", { class: "av-cartao-sub" }, "toque num motivo para ver os atrasos dele") : null,
      total ? el("ul", { class: "av-mot-lista" }, mostrar.map(x => el("li", {},
        el("button", { type: "button", class: "av-mot" + (x.id ? "" : " sem"), dataset: { motivo: x.id },
          onclick: ir("lista", { motivo: x.id, tipo: "" }) },
          el("span", { class: "av-mot-nome" }, x.nome),
          el("span", { class: "av-mot-barra", "aria-hidden": "true" }, el("i", { style: `width:${Math.round(x.total * 100 / max)}%` })),
          el("span", { class: "av-mot-n" }, String(x.total), el("small", {}, ` ${Math.round(x.total * 100 / total)}%`))))))
        : el("p", { class: "nada" }, "Nenhum atraso no período."),
      el("button", { type: "button", class: "av-ver", onclick: ir("motivos") }, "Ver todos os motivos →"));
  }

  const legTipos = TIPOS.map(t => ({ nome: A.TIPOS_OCORRENCIA[t], cor: COR_TIPO[t] }));
  const partesTipo = x => TIPOS.map(t => ({ nome: A.TIPOS_OCORRENCIA[t], cor: COR_TIPO[t], valor: x[t] || 0 }));
  const penduradorEm = grade => (card, desenhar, larga = false) => {
    if (larga) card.classList.add("larga");
    grade.append(card);
    card.querySelector(".g-corpo").append(desenhar(Math.max(280, (card.clientWidth || 600) - 28)));
  };

  // ── Pendências ───────────────────────────────────────────────────────────
  // Uma lista só: o que está atrasando agora (os dias contam até hoje) e o que
  // atrasou sem o porquê, de qualquer período. A mais atrasada primeiro.
  function pintarPendencias(pend) {
    const conta = { todas: pend.length, agora: pend.filter(o => o.atrasando).length, "sem-porque": pend.filter(o => o.semPorque).length };
    const passa = { todas: () => true, agora: o => o.atrasando, "sem-porque": o => o.semPorque }[estado.pend] || (() => true);
    corpo.append(el("div", { class: "av-barra" },
      escolha("Quais pendências", FILTROS_PEND.map(([id, rot]) => [id, rot, conta[id]]), estado.pend,
        id => { estado.pend = id; estado.mais = false; pintar(); }, { celular: false }),
      el("p", { class: "av-dica" }, "A mais atrasada primeiro. Tocar na linha abre a ficha.")));
    if (!pend.length) return corpo.append(el("div", { class: "av-vazio ok" }, el("b", {}, "Nada pendente."),
      " Nada atrasando agora, e todo atraso tem o porquê."));
    const itens = pend.filter(passa);
    if (!itens.length) return corpo.append(vazio(estado.pend === "agora" ? "Nada atrasando agora." : "Todo atraso tem o porquê."));
    const mostrar = estado.mais ? itens : itens.slice(0, POR_VEZ);
    corpo.append(el("table", { class: "tabela avaliacao av-tab av-pend" },
      el("thead", {}, el("tr", {}, el("th", {}, "Frota"), el("th", {}, "Ocorrência"), el("th", {}, "Situação"),
        el("th", { class: "num" }, "Dias"), el("th", {}, "Motivo e responsável"), el("th", { class: "c-acoes" }, el("span", { class: "so-leitor" }, "Ações")))),
      el("tbody", {}, mostrar.map(o => el("tr", { class: "pend" + (o.atrasando ? " atrasando" : ""), dataset: { tipo: o.tipo, id: o.id }, ...linhaAbre(o) },
        el("td", { class: "c-frota" }, el("b", {}, o.frota || "—")),
        el("td", { class: "c-oc" }, tipoOc(o), el("div", { class: "c-oque" }, o.oque || "—")),
        el("td", { class: "c-sit" }, situacao(o)),
        el("td", { class: "c-dias num" }, dias(o)),
        el("td", { class: "c-mot" }, motivoQuem(o)),
        el("td", { class: "c-acoes" }, botoes(o)))))));
    if (itens.length > mostrar.length) corpo.append(el("button", { type: "button", class: "av-mais",
      onclick: () => { estado.mais = true; pintar(); } }, `Mostrar as outras ${itens.length - mostrar.length}`));
  }

  // ── Motivos ──────────────────────────────────────────────────────────────
  // Os motivos recorrentes: cada motivo com quantos atrasos, de que tipo, os
  // dias e quem atrasou; tocar abre os atrasos dele.
  function pintarMotivos(ocs, nSemJ) {
    const ms = A.porMotivo(ocs);
    const total = ms.reduce((t, x) => t + x.total, 0);
    corpo.append(el("h2", { class: "av-titulo" }, "Motivos recorrentes",
      el("span", { class: "n" }, total ? `${plural(total, "atraso", "atrasos")} no período · toque num motivo para ver os atrasos dele` : "")));
    if (!ms.length) corpo.append(el("p", { class: "nada" }, "Nenhum atraso no período."));
    else {
      const max = Math.max(...ms.map(x => x.total));
      const linha = x => el("button", { type: "button", class: "mt-lin" + (x.id ? "" : " sem"), dataset: { motivo: x.id },
        onclick: ir("lista", { motivo: x.id, tipo: "" }) },
        el("span", { class: "mt-nome" }, el("b", {}, x.nome),
          el("small", {}, TIPOS.filter(t => x[t]).map(t => plural(x[t], ...CONTA_TIPO[t])).join(" · "))),
        el("span", { class: "mt-barra", title: `${x.total} de ${total} atrasos` },
          el("span", { class: "mt-trilho" }, TIPOS.filter(t => x[t]).map(t =>
            el("i", { style: `width:${x[t] * 100 / max}%;background:${COR_TIPO[t]}` }))),
          el("b", {}, String(x.total))),
        el("span", { class: "mt-dias" }, `${x.dias} d`),
        el("span", { class: "mt-quem" }, x.quem.map(([q, n]) => el("span", { class: "chip" + (q === "Não informado" ? "" : " quem") }, `${q} ${n}`))));
      corpo.append(el("div", { class: "motivos" },
        el("div", { class: "mt-cab" }, el("span", {}, "Motivo"), el("span", {}, "Atrasos"), el("span", {}, "Dias"), el("span", {}, "Quem atrasou")),
        ms.map(linha),
        el("div", { class: "mt-leg" }, legTipos.map(t => el("span", { class: "leg-item" }, el("i", { class: "mt-cor", style: `background:${t.cor}` }), t.nome)))));
    }
    if (nSemJ) corpo.append(el("div", { class: "av-aviso" },
      el("span", {}, el("b", {}, plural(nSemJ, "atraso sem justificativa", "atrasos sem justificativa")),
        " — sem o porquê, o atraso entra em \"Sem motivo informado\"."),
      el("button", { type: "button", class: "mini primario-leve", onclick: ir("resolver", { pend: "sem-porque" }) }, "Justificar")));
  }

  // ── Análise ──────────────────────────────────────────────────────────────
  // Os gráficos do período.
  function pintarGraficos(ocs, per, filtro) {
    const grade = el("div", { class: "bi-grade" });
    corpo.append(grade);
    const pendurar = penduradorEm(grade);
    const sem = A.porSemana(ocs, per.de, per.ate);
    const rotSem = s => brCurto(s.ini < per.de ? per.de : s.ini);
    const pctSem = t => sem.map(s => {
      const l = ocs.filter(o => o.tipo === t && !o.semPrazo && o.quando >= s.ini && o.quando <= s.fim);
      return l.length ? l.filter(o => !o.atrasou).length / l.length : null;
    });
    const seriesPct = [{ nome: "Movimentações", cor: COR_TIPO.mov, valores: pctSem("mov") },
      { nome: "Chegada para a preventiva", cor: COR_TIPO.entrega, valores: pctSem("entrega") }].filter(s => s.valores.some(v => v != null));
    pendurar(cartaoGrafico("Pontualidade por semana", "a parte no prazo, das que tinham data combinada · a data é o início da semana",
      el("div", { class: "g-corpo" }), { legendaDe: seriesPct.map(s => ({ nome: s.nome, cor: s.cor })) }),
    w => seriesPct.length ? graficoLinhas({ largura: w, xs: sem.map(rotSem), series: seriesPct })
      : el("p", { class: "nada" }, "Nada com prazo neste período."), true);

    const pf = A.porFrota(ocs).filter(x => x.atrasos).slice(0, 10);
    pendurar(cartaoGrafico("Frotas com mais atrasos", "clique numa frota para ver só ela",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: legTipos }),
    w => pf.length ? graficoBarras({ largura: w, itens: pf.map(x => ({ rotulo: x.frota, chave: x.frota, ativo: !filtro.vazio && filtro.bate(x.frota),
      partes: partesTipo(x) })), aoClicar: it => { estado.frota = !filtro.vazio && filtro.bate(it.chave) ? "" : it.chave; pintar(); } })
      : el("p", { class: "nada" }, "Nenhum atraso no período."));

    const quem = A.agruparAtrasos(ocs, "quem", "Não informado");
    const paleta = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
    pendurar(cartaoGrafico("Quem atrasou", "o responsável apontado · a liberação remarcada conta para a operação",
      el("div", { class: "g-corpo" })),
    w => quem.length ? graficoRosca({ largura: w,
      itens: quem.map((x, i) => ({ rotulo: x.rotulo, valor: x.total, cor: x.rotulo === "Não informado" ? "var(--ctx)" : paleta[i % paleta.length],
        extra: [{ valor: `${x.dias} d`, rotulo: "de atraso somados" }] })),
      centro: { valor: quem.reduce((t, x) => t + x.total, 0), rotulo: "atrasos" } })
      : el("p", { class: "nada" }, "Nenhum atraso no período."));

    const cats = A.porCategoria(ocs).filter(x => x.no_prazo + x.atrasadas);
    pendurar(cartaoGrafico("Movimentações por categoria", "no prazo e com atraso, por tipo de movimentação",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: [{ nome: "No prazo", cor: NO_PRAZO }, { nome: "Com atraso", cor: ATRASO }] }),
    w => cats.length ? graficoBarras({ largura: w, larguraRotulo: rotuloLargo(w), itens: cats.map(x => ({ rotulo: x.categoria,
      partes: [{ nome: "No prazo", cor: NO_PRAZO, valor: x.no_prazo }, { nome: "Com atraso", cor: ATRASO, valor: x.atrasadas }] })) })
      : el("p", { class: "nada" }, "Nenhuma movimentação com prazo no período."));

    const faixas = A.porFaixa(ocs);
    pendurar(cartaoGrafico("Tamanho dos atrasos", "quantos dias passou do combinado",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: legTipos }),
    w => faixas.some(f => f.total) ? graficoColunas({ largura: w, xs: faixas.map(f => f.rotulo),
      series: TIPOS.map(t => ({ nome: A.TIPOS_OCORRENCIA[t], cor: COR_TIPO[t], valores: faixas.map(f => f[t]) })) })
      : el("p", { class: "nada" }, "Nenhum atraso no período."));
  }

  // Todos os atrasos do período, numa tabela (cartões no celular), com o tipo,
  // a busca e o motivo escolhido na análise ou no Resumo.
  function pintarLista(ocs) {
    const fBusca = el("input", { class: "busca", type: "search", placeholder: "frota, motivo, quem…", value: estado.busca, "aria-label": "Buscar nos atrasos" });
    const tiposOp = [["", "Todos", null, "Todos os tipos"], ...TIPOS.map(t => [t, A.TIPOS_OCORRENCIA[t]])];
    const tiposCaixa = el("span", { class: "av-tipos" });
    const caixaTodos = el("div", {});
    // O motivo escolhido nos motivos (ou no Resumo): uma etiqueta que tira.
    const fMotivo = estado.motivo != null ? el("button", { type: "button", class: "chip-filtro", title: "Tirar este filtro",
      onclick: () => { estado.motivo = null; pintar(); } }, `Motivo: ${M.nomeMotivo(estado.motivo)}`, el("b", { "aria-hidden": "true" }, " ✕")) : null;
    corpo.append(el("div", { class: "filtros av-filtros-lista", id: "av-todos" }, tiposCaixa, fBusca, fMotivo), caixaTodos);
    fBusca.addEventListener("input", () => { estado.busca = fBusca.value; pintarTodos(); });
    function pintarTodos() {
      limpar(tiposCaixa).append(...[escolha("Tipo de atraso", tiposOp, estado.tipo, t => { estado.tipo = t; pintarTodos(); })].flat());
      const q = semAcento(estado.busca.trim());
      const itens = ocs.filter(o => o.atrasou && (!estado.tipo || o.tipo === estado.tipo) &&
        (estado.motivo == null || (o.motivoCat || "") === estado.motivo) &&
        (!q || semAcento([o.frota, o.oque, o.motivo, o.quem, o.categoria].join(" ")).includes(q)));
      limpar(caixaTodos).append(itens.length ? el("table", { class: "tabela avaliacao av-tab av-hist" },
        el("thead", {}, el("tr", {}, el("th", { class: "num" }, "Data"), el("th", {}, "Frota"), el("th", {}, "Ocorrência"),
          el("th", { class: "num" }, "Combinado"), el("th", { class: "num" }, "Dias"), el("th", {}, "Motivo e responsável"))),
        el("tbody", {}, itens.map(o => el("tr", { dataset: { tipo: o.tipo, id: o.id }, ...linhaAbre(o) },
          el("td", { class: "c-data num" }, brCurto(o.quando)),
          el("td", { class: "c-frota" }, el("b", {}, o.frota || "—")),
          el("td", { class: "c-oc" }, tipoOc(o), el("div", { class: "c-oque" }, o.oque || "—",
            o.tipo === "liberacao" ? ` · remarcada para ${dataOuNada(o.feito)}` : "")),
          el("td", { class: "c-comb num" }, el("span", { class: "av-so-cartao" }, "combinado "), dataOuNada(o.combinado)),
          el("td", { class: "c-dias num" }, dias(o)),
          el("td", { class: "c-mot" }, o.motivo ? [el("span", { class: "c-motivo" }, o.motivo), o.quem ? el("small", {}, o.quem) : null]
            : [el("span", { class: "seg" }, "sem motivo informado"), o.quem ? el("small", {}, o.quem) : null])))))
        : el("p", { class: "nada" }, "Nenhum atraso com estes filtros."));
    }
    pintarTodos();
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
