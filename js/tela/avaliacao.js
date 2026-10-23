// Avaliação da operação — a tela que o site virou em 21/10/2026.
//
// A pergunta da reunião é uma só: a operação cumpriu o que combinou? Três
// coisas respondem, e são as contas de `js/avaliacao.js`: a movimentação
// concluída depois do prometido, a frota que chegou na oficina depois do dia
// combinado para a preventiva, e a liberação que foi remarcada para mais
// tarde. Em quatro abas, para cada olhada ter um assunto só: o Resumo (quatro
// números, o que pede ação e três gráficos), Para resolver (o que está
// atrasando agora e o que falta justificar, cada linha com o botão que
// resolve), os Motivos (cada motivo pronto com quantos atrasos, os dias e
// quem atrasou), a Análise (os outros gráficos) e Todos os atrasos, numa
// tabela.

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
const ABAS = [["resumo", "Resumo"], ["resolver", "Para resolver"], ["motivos", "Motivos"], ["analise", "Análise"], ["lista", "Todos os atrasos"]];

const estado = { periodo: "mes", frota: "", busca: "", tipo: "", aba: "resumo", motivo: null };

const pc = v => v == null ? "—" : Math.round(v * 100) + "%";
const n1 = v => (Math.round(v * 10) / 10).toLocaleString("pt-BR");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
// Motivo e categoria são frases: o rótulo das barras precisa de mais lugar que o de uma frota.
const rotuloLargo = w => Math.round(Math.min(220, Math.max(110, w * 0.42)));
const corPct = v => v == null ? "" : v >= 0.9 ? "ok" : v >= 0.7 ? "hoje" : "vencida";

export async function montar(raiz, ctx, params = new URLSearchParams()) {
  if (params.get("p")) estado.periodo = params.get("p");
  if (params.get("f") != null) estado.frota = params.get("f");
  if (ABAS.some(([id]) => id === params.get("a"))) estado.aba = params.get("a");
  if (params.get("m") != null) estado.motivo = params.get("m");

  const titulo = el("span", { class: "sub" });
  const periodos = el("div", { class: "segmentos", role: "group", "aria-label": "Período" });
  // A frota se digita, qualquer uma: a lista só sugere. "617" acha a F-617, e
  // um pedaço do número mostra as frotas que têm ele (ver `filtroDeFrota`).
  const lista = el("datalist", { id: "dl-frotas-avaliacao" });
  const fFrota = el("input", { type: "search", class: "busca-frota", placeholder: "Digite a frota", title: "Qualquer frota: 617 acha a F-617", list: "dl-frotas-avaliacao",
    autocomplete: "off", spellcheck: false, value: estado.frota, "aria-label": "Frota",
    oninput: () => { estado.frota = fFrota.value.trim(); pintar(); } });
  const corpo = el("div", { class: "av-corpo" });
  const abas = el("div", { class: "abas", role: "tablist", "aria-label": "Assunto" });
  raiz.append(
    el("div", { class: "cabec" }, el("h1", {}, "Avaliação da operação"), titulo, el("div", { class: "espaco" })),
    el("div", { class: "filtros" }, periodos, fFrota, lista),
    abas,
    corpo);
  // Ir para Todos os atrasos sem dizer o motivo tira o motivo de antes.
  const irAba = (aba, extra = {}) => () => {
    Object.assign(estado, aba === "lista" && !("motivo" in extra) ? { motivo: null } : {}, extra, { aba });
    pintar(); window.scrollTo({ top: 0 });
  };

  function frotas() {
    return [...new Set([...ev.lista("movimentacao"), ...ev.lista("preventiva")].map(x => x.frota).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }

  const kpi = (rot, val, det, cls = "", fazer = null) => {
    const k = el("div", { class: "kpi " + cls },
      el("div", { class: "k-rot" }, rot), el("div", { class: "k-val" }, String(val)), det ? el("div", { class: "k-det" }, det) : null);
    if (fazer) { k.classList.add("clicavel"); k.tabIndex = 0; k.setAttribute("role", "button"); k.onclick = fazer;
      k.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fazer(); } }; }
    return k;
  };

  // ── as ações de cada linha ───────────────────────────────────────────────
  async function abrir(o) {
    if (o.tipo === "mov") { const { abrirFichaMov } = await import("./movimentacoes.js"); return abrirFichaMov(o.id, ctx); }
    const { abrirFichaPrev } = await import("./preventivas.js");
    return abrirFichaPrev(o.id, ctx);
  }
  function botoes(o, { justificarSo = false } = {}) {
    const b = [];
    const mini = (rot, fn, cls = "mini") => el("button", { type: "button", class: cls, onclick: e => { e.stopPropagation(); fn(); } }, rot);
    if (o.tipo === "mov") {
      const m = ev.porId(o.id, "movimentacao");
      if (!m) return b;
      if (!justificarSo && M.movimentacaoAberta(m) && pessoas.pode("movimentar")) {
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

  // ── a tabela de ocorrências ──────────────────────────────────────────────
  function tabela(itens, cols, { acoes = false, justificarSo = false } = {}) {
    const cab = el("tr", {}, cols.map(([t, , cls]) => el("th", { class: cls || "" }, t)), acoes ? el("th", {}, "") : null);
    const corpoT = el("tbody", {}, itens.map(o => {
      const tr = el("tr", { style: "cursor:pointer", onclick: cliqueLimpo(() => abrir(o)) },
        cols.map(([, f, cls]) => el("td", { class: cls || "" }, f(o))),
        acoes ? el("td", { class: "acoes-linha" }, botoes(o, { justificarSo })) : null);
      return tr;
    }));
    return el("div", { class: "tabela-rolagem" }, el("table", { class: "tabela avaliacao" }, el("thead", {}, cab), corpoT));
  }
  const colTipo = ["Tipo", o => el("span", { class: "tipo-oc" }, el("i", { style: `background:${COR_TIPO[o.tipo]}` }), A.TIPOS_OCORRENCIA[o.tipo])];
  const colFrota = ["Frota", o => el("b", {}, o.frota || "—")];
  const colOque = ["O quê", o => o.oque || "—"];
  const colDias = ["Dias", o => el("b", { class: o.dias > 7 ? "t-venc" : "" }, String(o.dias)), "num"];
  const dataOuNada = d => d === "agora" ? "agora" : d ? brCurto(d) : el("span", { class: "seg" }, "—");

  // ── a tela ───────────────────────────────────────────────────────────────
  function pintar() {
    limpar(corpo);
    const ref = M.hoje();
    const pers = A.periodos(ref);
    const per = pers.find(x => x.id === estado.periodo) || pers[0];
    estado.periodo = per.id;
    limpar(periodos).append(...pers.map(x => el("button", { type: "button", class: "seg-op" + (x.id === per.id ? " on" : ""),
      onclick: () => { estado.periodo = x.id; pintar(); } }, x.rotulo)));
    limpar(lista).append(...frotas().map(f => el("option", { value: f })));
    if (document.activeElement !== fFrota) fFrota.value = estado.frota;
    const filtro = filtroDeFrota(estado.frota, frotas());
    const nomeFrota = filtro.vazio ? "" : filtro.exata || estado.frota;
    titulo.textContent = `${br(per.de)} a ${br(per.ate)}` + (nomeFrota ? ` · ${nomeFrota}` : "");

    const daFrota = x => filtro.bate(x.frota);
    const movs = ev.lista("movimentacao").filter(daFrota);
    const prevs = ev.lista("preventiva").filter(daFrota);
    const ocs = A.ocorrencias({ movs, prevs, log: ev.log, de: per.de, ate: per.ate });
    const agora = A.atrasandoAgora({ movs, prevs, ref });
    const semJ = A.semJustificativa(movs, prevs, ev.log, ref);
    const r = A.resumo(ocs, agora);

    const nResolver = agora.length + semJ.length;
    limpar(abas).append(...ABAS.map(([id, rot]) => el("button", { type: "button", role: "tab", class: "aba" + (estado.aba === id ? " on" : ""),
      "aria-selected": estado.aba === id ? "true" : "false", dataset: { aba: id }, onclick: irAba(id) },
      rot, id === "resolver" && nResolver ? el("span", { class: "cont" }, String(nResolver)) : null)));

    if (estado.aba === "resolver") return pintarResolver(agora, semJ);
    const semNada = !ocs.length && el("div", {}, vazio(nomeFrota && !movs.length && !prevs.length
      ? `Nenhuma movimentação ou preventiva da ${nomeFrota} lançada ainda.`
      : "Nada concluído, entregue ou remarcado neste período" + (nomeFrota ? ` · ${nomeFrota}` : "") + "."));
    if (estado.aba === "lista") return semNada ? corpo.append(semNada) : pintarLista(ocs);
    if (estado.aba === "motivos") return semNada ? corpo.append(semNada) : pintarMotivos(ocs, semJ.length);
    if (estado.aba === "analise") {
      if (semNada) return corpo.append(semNada);
      return pintarAnalise(ocs, per, filtro);
    }

    // ── Resumo: quatro números, o que pede ação, três gráficos
    corpo.append(el("div", { class: "kpis kpis-4" },
      kpi("Movimentações no prazo", pc(r.mov.pct),
        r.mov.com_prazo ? `${r.mov.no_prazo} de ${r.mov.com_prazo} concluídas` + (r.mov.atrasadas ? ` · atraso médio ${n1(r.mov.atraso_medio)} d` : "")
          : r.mov.total ? `${r.mov.total} concluída(s), nenhuma com prazo` : "nenhuma concluída no período", corPct(r.mov.pct),
        r.mov.atrasadas ? irAba("lista", { tipo: "mov" }) : null),
      kpi("Frotas no dia da preventiva", pc(r.entrega.pct),
        r.entrega.com_prazo ? `${r.entrega.no_prazo} de ${r.entrega.com_prazo} chegaram no dia` + (r.entrega.atrasadas ? ` · atraso médio ${n1(r.entrega.atraso_medio)} d` : "")
          : "nenhuma chegada anotada no período", corPct(r.entrega.pct), r.entrega.atrasadas ? irAba("lista", { tipo: "entrega" }) : null),
      kpi("Liberações remarcadas", r.liberacao.remarcadas,
        r.liberacao.remarcadas ? `${plural(r.liberacao.frotas, "frota", "frotas")} · ${r.liberacao.dias} dia(s) adiados` : "nenhuma no período",
        r.liberacao.remarcadas ? "hoje" : "", r.liberacao.remarcadas ? irAba("lista", { tipo: "liberacao" }) : null),
      kpi("Atrasando agora", r.agora.total,
        r.agora.total ? `${plural(r.agora.movs, "movimentação", "movimentações")} · ${plural(r.agora.entregas, "frota sem chegar", "frotas sem chegar")}` : "nada atrasado",
        r.agora.total ? "vencida" : "ok", r.agora.total ? irAba("resolver") : null)));

    if (nResolver) {
      corpo.append(el("div", { class: "pede-acao" },
        el("span", { class: "pa-txt" },
          agora.length ? el("b", {}, plural(agora.length, "atraso acontecendo agora", "atrasos acontecendo agora")) : null,
          agora.length && semJ.length ? " · " : null,
          semJ.length ? el("b", {}, plural(semJ.length, "atraso sem justificativa", "atrasos sem justificativa")) : null,
          el("span", { class: "seg" }, " — cada um com o botão que resolve")),
        el("button", { type: "button", class: "primario-leve", onclick: irAba("resolver") }, "Resolver")));
    }
    if (semNada) return corpo.append(semNada);

    const grade = el("div", { class: "bi-grade" });
    corpo.append(grade);
    const pendurar = penduradorEm(grade);
    const sem = A.porSemana(ocs, per.de, per.ate);
    pendurar(cartaoGrafico("No prazo e com atraso, por semana",
      `movimentações e chegadas para a preventiva · ${plural(r.atrasos, "atraso", "atrasos")}, ${r.dias_perdidos} dia(s) somados no período`,
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: [{ nome: "No prazo", cor: NO_PRAZO }, { nome: "Com atraso", cor: ATRASO }] }),
    w => sem.some(s => s.no_prazo || s.atrasadas)
      ? graficoColunas({ largura: w, xs: sem.map(s => s.rotulo),
        series: [{ nome: "No prazo", cor: NO_PRAZO, valores: sem.map(s => s.no_prazo) }, { nome: "Com atraso", cor: ATRASO, valores: sem.map(s => s.atrasadas) }] })
      : el("p", { class: "nada" }, "Nada com prazo neste período."), true);

    const motivos = A.porMotivo(ocs).slice(0, 8);
    pendurar(cartaoGrafico("Por que atrasou", "os motivos mais citados · clique para ver os atrasos de um",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: legTipos }),
    w => motivos.length ? graficoBarras({ largura: w, larguraRotulo: rotuloLargo(w),
      itens: motivos.map(x => ({ rotulo: x.nome, chave: x.id, partes: partesTipo(x) })),
      aoClicar: it => irAba("lista", { motivo: it.chave })() })
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

    corpo.append(el("p", { class: "nota av-nota" },
      "Conta como atraso: movimentação concluída depois do prometido, frota que chegou na oficina depois do dia " +
      "da parada, e liberação remarcada para mais tarde."));
  }

  const legTipos = TIPOS.map(t => ({ nome: A.TIPOS_OCORRENCIA[t], cor: COR_TIPO[t] }));
  const partesTipo = x => TIPOS.map(t => ({ nome: A.TIPOS_OCORRENCIA[t], cor: COR_TIPO[t], valor: x[t] || 0 }));
  const penduradorEm = grade => (card, desenhar, larga = false) => {
    if (larga) card.classList.add("larga");
    grade.append(card);
    card.querySelector(".g-corpo").append(desenhar(Math.max(280, (card.clientWidth || 600) - 28)));
  };

  // ── Para resolver ────────────────────────────────────────────────────────
  function pintarResolver(agora, semJ) {
    corpo.append(el("div", { class: "titulo-secao", id: "av-agora" }, "Atrasando agora",
      el("span", { class: "n" }, "· a data prometida ou a parada passou e ainda não foi feito · os dias contam até hoje")));
    corpo.append(agora.length ? tabela(agora, [colTipo, colFrota, colOque,
      ["Combinado", o => dataOuNada(o.combinado), "num"], colDias,
      ["Porquê", o => o.motivo || el("span", { class: "seg" }, "—")]], { acoes: true })
      : el("p", { class: "nada" }, "Nada atrasado agora."));
    corpo.append(el("div", { class: "titulo-secao", id: "av-justificar" }, "Para justificar",
      el("span", { class: "n" }, "· atrasou e ninguém disse por quê, de qualquer período")));
    corpo.append(semJ.length ? tabela(semJ, [colTipo, colFrota, colOque,
      ["Combinado", o => dataOuNada(o.combinado), "num"], ["Feito", o => dataOuNada(o.quando), "num"], colDias],
      { acoes: true, justificarSo: true })
      : el("p", { class: "nada" }, "Todos os atrasos têm o porquê."));
  }

  // ── Motivos ──────────────────────────────────────────────────────────────
  // Cada motivo pronto numa linha: quantos atrasos, de que tipo (a barra, nas
  // cores dos tipos), os dias somados e quem atrasou. Tocar abre os atrasos
  // daquele motivo. As justificativas antigas, em texto livre, entram pelo
  // motivo que o texto indica (ver M.categoriaDoMotivo).
  function pintarMotivos(ocs, nSemJ) {
    const ms = A.porMotivo(ocs);
    if (!ms.length) return corpo.append(el("p", { class: "nada" }, "Nenhum atraso no período."));
    const max = Math.max(...ms.map(x => x.total));
    const total = ms.reduce((t, x) => t + x.total, 0);
    const linha = x => el("button", { type: "button", class: "mt-lin" + (x.id ? "" : " sem"), dataset: { motivo: x.id },
      onclick: irAba("lista", { motivo: x.id }) },
      el("span", { class: "mt-nome" }, el("b", {}, x.nome),
        el("small", {}, TIPOS.filter(t => x[t]).map(t => plural(x[t], ...CONTA_TIPO[t])).join(" · "))),
      el("span", { class: "mt-barra", title: `${x.total} de ${total} atrasos` },
        el("span", { class: "mt-trilho" }, TIPOS.filter(t => x[t]).map(t =>
          el("i", { style: `width:${x[t] * 100 / max}%;background:${COR_TIPO[t]}` }))),
        el("b", {}, String(x.total))),
      el("span", { class: "mt-dias" }, `${x.dias} d`),
      el("span", { class: "mt-quem" }, x.quem.map(([q, n]) => el("span", { class: "chip" + (q === "Não informado" ? "" : " quem") }, `${q} ${n}`))));
    corpo.append(el("div", { class: "titulo-secao" }, "Por que atrasou",
      el("span", { class: "n" }, `· ${plural(total, "atraso", "atrasos")} no período · toque num motivo para ver os atrasos dele`)));
    corpo.append(el("div", { class: "motivos" },
      el("div", { class: "mt-cab" }, el("span", {}, "Motivo"), el("span", {}, "Atrasos"), el("span", {}, "Dias"), el("span", {}, "Quem atrasou")),
      ms.map(linha),
      el("div", { class: "mt-leg" }, legTipos.map(t => el("span", { class: "leg-item" }, el("i", { class: "mt-cor", style: `background:${t.cor}` }), t.nome)))));
    if (nSemJ) corpo.append(el("div", { class: "pede-acao" },
      el("span", {}, el("b", {}, plural(nSemJ, "atraso sem justificativa", "atrasos sem justificativa")),
        el("span", { class: "seg" }, " — sem o porquê, o atraso entra em \"Sem motivo informado\".")),
      el("button", { type: "button", class: "primario-leve", onclick: irAba("resolver") }, "Justificar")));
  }

  // ── Análise ──────────────────────────────────────────────────────────────
  function pintarAnalise(ocs, per, filtro) {
    const grade = el("div", { class: "bi-grade" });
    corpo.append(grade);
    const pendurar = penduradorEm(grade);
    const sem = A.porSemana(ocs, per.de, per.ate);
    const pctSem = t => sem.map(s => {
      const l = ocs.filter(o => o.tipo === t && !o.semPrazo && o.quando >= s.ini && o.quando <= s.fim);
      return l.length ? l.filter(o => !o.atrasou).length / l.length : null;
    });
    const seriesPct = [{ nome: "Movimentações", cor: COR_TIPO.mov, valores: pctSem("mov") },
      { nome: "Chegada para a preventiva", cor: COR_TIPO.entrega, valores: pctSem("entrega") }].filter(s => s.valores.some(v => v != null));
    pendurar(cartaoGrafico("Pontualidade por semana", "a parte no prazo, das que tinham data combinada",
      el("div", { class: "g-corpo" }), { legendaDe: seriesPct.map(s => ({ nome: s.nome, cor: s.cor })) }),
    w => seriesPct.length ? graficoLinhas({ largura: w, xs: sem.map(s => s.rotulo), series: seriesPct })
      : el("p", { class: "nada" }, "Nada com prazo neste período."));

    const pf = A.porFrota(ocs).filter(x => x.atrasos).slice(0, 10);
    pendurar(cartaoGrafico("Frotas com mais atrasos", "clique numa frota para ver só ela",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: legTipos }),
    w => pf.length ? graficoBarras({ largura: w, itens: pf.map(x => ({ rotulo: x.frota, chave: x.frota, ativo: !filtro.vazio && filtro.bate(x.frota),
      partes: partesTipo(x) })), aoClicar: it => { estado.frota = !filtro.vazio && filtro.bate(it.chave) ? "" : it.chave; pintar(); } })
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

  // ── Todos os atrasos ─────────────────────────────────────────────────────
  function pintarLista(ocs) {
    const fBusca = el("input", { class: "busca", type: "search", placeholder: "frota, motivo, quem…", value: estado.busca });
    const tiposBt = el("div", { class: "segmentos" }, [["", "Todos"], ...TIPOS.map(t => [t, A.TIPOS_OCORRENCIA[t]])].map(([t, rot]) =>
      el("button", { type: "button", class: "seg-op" + (estado.tipo === t ? " on" : ""), onclick: () => { estado.tipo = t; pintarTodos(); } }, rot)));
    const caixaTodos = el("div", {});
    // O motivo escolhido nos Motivos (ou no gráfico): uma etiqueta que tira.
    const fMotivo = estado.motivo != null ? el("button", { type: "button", class: "chip-filtro", title: "Tirar este filtro",
      onclick: () => { estado.motivo = null; pintar(); } }, `Motivo: ${M.nomeMotivo(estado.motivo)}`, el("b", { "aria-hidden": "true" }, " ✕")) : null;
    corpo.append(el("div", { class: "filtros", id: "av-todos" }, tiposBt, fBusca, fMotivo), caixaTodos);
    fBusca.addEventListener("input", () => { estado.busca = fBusca.value; pintarTodos(); });
    function pintarTodos() {
      for (const b of tiposBt.querySelectorAll(".seg-op")) b.classList.remove("on");
      [...tiposBt.querySelectorAll(".seg-op")][["", ...TIPOS].indexOf(estado.tipo)].classList.add("on");
      const q = semAcento(estado.busca.trim());
      const itens = ocs.filter(o => o.atrasou && (!estado.tipo || o.tipo === estado.tipo) &&
        (estado.motivo == null || (o.motivoCat || "") === estado.motivo) &&
        (!q || semAcento([o.frota, o.oque, o.motivo, o.quem, o.categoria].join(" ")).includes(q)));
      limpar(caixaTodos).append(itens.length ? tabela(itens, [
        ["Feito em", o => brCurto(o.quando), "num"], colTipo, colFrota, colOque,
        ["Combinado", o => dataOuNada(o.combinado), "num"],
        ["Ficou para", o => o.tipo === "liberacao" ? dataOuNada(o.feito) : dataOuNada(o.quando), "num"], colDias,
        ["Porquê", o => o.motivo || el("span", { class: "seg" }, "—")],
        ["Quem", o => o.quem || el("span", { class: "seg" }, "—")]])
        : el("p", { class: "nada" }, "Nenhum atraso com estes filtros."));
    }
    pintarTodos();
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
