// Avaliação da operação — a tela que o site virou em 21/10/2026.
//
// A pergunta da reunião é uma só: a operação cumpriu o que combinou? Três
// coisas respondem, e são as contas de `js/avaliacao.js`: a movimentação
// concluída depois do prometido, a frota que chegou na oficina depois do dia
// combinado para a preventiva, e a liberação que foi remarcada para mais
// tarde. No alto, os números do período; logo abaixo, o que está atrasando
// agora e o que falta justificar (cada linha com o botão que resolve); depois
// os gráficos — semana a semana, por quê, quem, frota, categoria, tamanho —, e
// por último todos os atrasos do período numa tabela.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import * as A from "../avaliacao.js";
import { el, limpar, br, brCurto, vazio, cliqueLimpo } from "../ui.js";
import { busca as semAcento, filtroDeFrota } from "../texto.js";
import { cartaoGrafico, graficoBarras, graficoColunas, graficoLinhas, graficoRosca } from "../graficos.js";
import { justificar } from "./comum.js";

// A cor de cada tipo de atraso, a mesma em todos os gráficos.
const COR_TIPO = { mov: "var(--s1)", entrega: "var(--s5)", liberacao: "var(--s4)" };
const TIPOS = Object.keys(A.TIPOS_OCORRENCIA);
const NO_PRAZO = "var(--s3)", ATRASO = "var(--s2)";

const estado = { periodo: "mes", frota: "", busca: "", tipo: "" };

const pc = v => v == null ? "—" : Math.round(v * 100) + "%";
const n1 = v => (Math.round(v * 10) / 10).toLocaleString("pt-BR");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
// Motivo e categoria são frases: o rótulo das barras precisa de mais lugar que o de uma frota.
const rotuloLargo = w => Math.round(Math.min(220, Math.max(110, w * 0.42)));
const corPct = v => v == null ? "" : v >= 0.9 ? "ok" : v >= 0.7 ? "hoje" : "vencida";

export async function montar(raiz, ctx, params = new URLSearchParams()) {
  if (params.get("p")) estado.periodo = params.get("p");
  if (params.get("f") != null) estado.frota = params.get("f");

  const titulo = el("span", { class: "sub" });
  const periodos = el("div", { class: "segmentos", role: "group", "aria-label": "Período" });
  // A frota se digita, qualquer uma: a lista só sugere. "617" acha a F-617, e
  // um pedaço do número mostra as frotas que têm ele (ver `filtroDeFrota`).
  const lista = el("datalist", { id: "dl-frotas-avaliacao" });
  const fFrota = el("input", { type: "search", class: "busca-frota", placeholder: "Frota (qualquer uma)", list: "dl-frotas-avaliacao",
    autocomplete: "off", spellcheck: false, value: estado.frota, "aria-label": "Frota",
    oninput: () => { estado.frota = fFrota.value.trim(); pintar(); } });
  const corpo = el("div", {});
  raiz.append(
    el("div", { class: "cabec" }, el("h1", {}, "Avaliação da operação"), titulo, el("div", { class: "espaco" })),
    el("p", { class: "nota", style: "margin:0 0 10px" },
      "Os atrasos da operação: movimentação concluída depois do prometido, frota que chegou na oficina depois do dia " +
      "combinado para a preventiva, e liberação remarcada para mais tarde."),
    el("div", { class: "filtros" }, periodos, fFrota, lista),
    corpo);

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
  const irPara = id => () => { const n = corpo.querySelector("#" + id); if (n) n.scrollIntoView({ behavior: "smooth", block: "start" }); };

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

    // ── os números
    corpo.append(el("div", { class: "kpis" },
      kpi("Movimentações no prazo", pc(r.mov.pct),
        r.mov.com_prazo ? `${r.mov.no_prazo} de ${r.mov.com_prazo} concluídas` + (r.mov.atrasadas ? ` · atraso médio ${n1(r.mov.atraso_medio)} d` : "")
          : r.mov.total ? `${r.mov.total} concluída(s), nenhuma com prazo` : "nenhuma concluída no período", corPct(r.mov.pct),
        r.mov.atrasadas ? irPara("av-todos") : null),
      kpi("Frotas no dia da preventiva", pc(r.entrega.pct),
        r.entrega.com_prazo ? `${r.entrega.no_prazo} de ${r.entrega.com_prazo} chegaram no dia` + (r.entrega.atrasadas ? ` · atraso médio ${n1(r.entrega.atraso_medio)} d` : "")
          : "nenhuma chegada anotada no período", corPct(r.entrega.pct), r.entrega.atrasadas ? irPara("av-todos") : null),
      kpi("Liberações remarcadas", r.liberacao.remarcadas,
        r.liberacao.remarcadas ? `${plural(r.liberacao.frotas, "frota", "frotas")} · ${r.liberacao.dias} dia(s) adiados` : "nenhuma no período",
        r.liberacao.remarcadas ? "hoje" : "", r.liberacao.remarcadas ? irPara("av-todos") : null),
      kpi("Atrasando agora", r.agora.total,
        r.agora.total ? `${plural(r.agora.movs, "movimentação", "movimentações")} · ${plural(r.agora.entregas, "frota sem chegar", "frotas sem chegar")}` : "nada atrasado",
        r.agora.total ? "vencida" : "ok", r.agora.total ? irPara("av-agora") : null),
      kpi("Dias de atraso", r.dias_perdidos, `somados, nos ${plural(r.atrasos, "atraso", "atrasos")} do período`, r.dias_perdidos ? "hoje" : ""),
      kpi("Sem justificativa", semJ.length, semJ.length ? "atrasos sem o porquê, de qualquer período" : "todos justificados", semJ.length ? "hoje" : "ok",
        semJ.length ? irPara("av-justificar") : null)));

    // ── o que está atrasando agora
    corpo.append(el("div", { class: "titulo-secao", id: "av-agora" }, "Atrasando agora",
      el("span", { class: "n" }, "· a data prometida ou a parada passou e ainda não foi feito · os dias contam até hoje")));
    corpo.append(agora.length ? tabela(agora, [colTipo, colFrota, colOque,
      ["Combinado", o => dataOuNada(o.combinado), "num"], colDias,
      ["Porquê", o => o.motivo || el("span", { class: "seg" }, "—")]], { acoes: true })
      : el("p", { class: "nada" }, "Nada atrasado agora."));

    // ── o que falta justificar
    corpo.append(el("div", { class: "titulo-secao", id: "av-justificar" }, "Para justificar",
      el("span", { class: "n" }, "· atrasou e ninguém disse por quê, de qualquer período · sem o porquê, o atraso não ensina nada")));
    corpo.append(semJ.length ? tabela(semJ, [colTipo, colFrota, colOque,
      ["Combinado", o => dataOuNada(o.combinado), "num"], ["Feito", o => dataOuNada(o.quando), "num"], colDias],
      { acoes: true, justificarSo: true })
      : el("p", { class: "nada" }, "Todos os atrasos têm o porquê."));

    // ── os gráficos
    if (!ocs.length) {
      corpo.append(el("div", { class: "titulo-secao" }, "Os números do período"),
        vazio(nomeFrota && !movs.length && !prevs.length
          ? `Nenhuma movimentação ou preventiva da ${nomeFrota} lançada ainda.`
          : "Nada concluído, entregue ou remarcado neste período" + (nomeFrota ? ` · ${nomeFrota}` : "") + "."));
      return;
    }
    const grade = el("div", { class: "bi-grade" });
    corpo.append(el("div", { class: "titulo-secao" }, "Os números do período"), grade);
    const pendurar = (card, desenhar, larga = false) => {
      if (larga) card.classList.add("larga");
      grade.append(card);
      card.querySelector(".g-corpo").append(desenhar(Math.max(280, (card.clientWidth || 600) - 28)));
    };
    const legTipos = TIPOS.map(t => ({ nome: A.TIPOS_OCORRENCIA[t], cor: COR_TIPO[t] }));
    const partesTipo = x => TIPOS.map(t => ({ nome: A.TIPOS_OCORRENCIA[t], cor: COR_TIPO[t], valor: x[t] || 0 }));

    // 1. semana a semana
    const sem = A.porSemana(ocs, per.de, per.ate);
    pendurar(cartaoGrafico("No prazo e com atraso, por semana", "movimentações concluídas e frotas que chegaram para a preventiva · segunda a domingo",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: [{ nome: "No prazo", cor: NO_PRAZO }, { nome: "Com atraso", cor: ATRASO }] }),
    w => sem.some(s => s.no_prazo || s.atrasadas)
      ? graficoColunas({ largura: w, xs: sem.map(s => s.rotulo),
        series: [{ nome: "No prazo", cor: NO_PRAZO, valores: sem.map(s => s.no_prazo) }, { nome: "Com atraso", cor: ATRASO, valores: sem.map(s => s.atrasadas) }] })
      : el("p", { class: "nada" }, "Nada com prazo neste período."));

    // 2. a pontualidade de cada semana, em %
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

    // 3. por que atrasou
    const motivos = A.agruparAtrasos(ocs, "motivo", "Sem motivo informado").slice(0, 10);
    pendurar(cartaoGrafico("Por que atrasou", "os motivos mais citados, somando os três tipos de atraso",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: legTipos }),
    w => motivos.length ? graficoBarras({ largura: w, larguraRotulo: rotuloLargo(w), itens: motivos.map(x => ({ rotulo: x.rotulo, partes: partesTipo(x) })) })
      : el("p", { class: "nada" }, "Nenhum atraso no período."));

    // 4. quem atrasou
    const quem = A.agruparAtrasos(ocs, "quem", "Não informado");
    const paleta = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
    pendurar(cartaoGrafico("Quem atrasou", "o responsável apontado em cada atraso · a liberação remarcada conta para a operação",
      el("div", { class: "g-corpo" })),
    w => quem.length ? graficoRosca({ largura: w,
      itens: quem.map((x, i) => ({ rotulo: x.rotulo, valor: x.total, cor: x.rotulo === "Não informado" ? "var(--ctx)" : paleta[i % paleta.length],
        extra: [{ valor: `${x.dias} d`, rotulo: "de atraso somados" }] })),
      centro: { valor: quem.reduce((t, x) => t + x.total, 0), rotulo: "atrasos" } })
      : el("p", { class: "nada" }, "Nenhum atraso no período."));

    // 5. as frotas
    const pf = A.porFrota(ocs).filter(x => x.atrasos).slice(0, 10);
    pendurar(cartaoGrafico("Frotas com mais atrasos", "clique numa frota para ver só ela · a dica mostra os dias somados",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: legTipos }),
    w => pf.length ? graficoBarras({ largura: w, itens: pf.map(x => ({ rotulo: x.frota, chave: x.frota, ativo: !filtro.vazio && filtro.bate(x.frota),
      partes: partesTipo(x) })), aoClicar: it => { estado.frota = !filtro.vazio && filtro.bate(it.chave) ? "" : it.chave; pintar(); } })
      : el("p", { class: "nada" }, "Nenhum atraso no período."));

    // 6. as categorias da movimentação
    const cats = A.porCategoria(ocs).filter(x => x.no_prazo + x.atrasadas);
    pendurar(cartaoGrafico("Movimentações por categoria", "no prazo e com atraso, por tipo de movimentação",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: [{ nome: "No prazo", cor: NO_PRAZO }, { nome: "Com atraso", cor: ATRASO }] }),
    w => cats.length ? graficoBarras({ largura: w, larguraRotulo: rotuloLargo(w), itens: cats.map(x => ({ rotulo: x.categoria,
      partes: [{ nome: "No prazo", cor: NO_PRAZO, valor: x.no_prazo }, { nome: "Com atraso", cor: ATRASO, valor: x.atrasadas }] })) })
      : el("p", { class: "nada" }, "Nenhuma movimentação com prazo no período."));

    // 7. o tamanho dos atrasos
    const faixas = A.porFaixa(ocs);
    pendurar(cartaoGrafico("Tamanho dos atrasos", "quantos dias passou do combinado",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: legTipos }),
    w => faixas.some(f => f.total) ? graficoColunas({ largura: w, xs: faixas.map(f => f.rotulo),
      series: TIPOS.map(t => ({ nome: A.TIPOS_OCORRENCIA[t], cor: COR_TIPO[t], valores: faixas.map(f => f[t]) })) })
      : el("p", { class: "nada" }, "Nenhum atraso no período."), true);

    // ── todos os atrasos do período
    const fBusca = el("input", { class: "busca", type: "search", placeholder: "frota, motivo, quem…", value: estado.busca });
    const tiposBt = el("div", { class: "segmentos" }, [["", "Todos"], ...TIPOS.map(t => [t, A.TIPOS_OCORRENCIA[t]])].map(([t, rot]) =>
      el("button", { type: "button", class: "seg-op" + (estado.tipo === t ? " on" : ""), onclick: () => { estado.tipo = t; pintarTodos(); } }, rot)));
    const caixaTodos = el("div", {});
    corpo.append(el("div", { class: "titulo-secao", id: "av-todos" }, "Todos os atrasos do período",
      el("span", { class: "n" }, "· do mais recente para o mais antigo · clique para abrir")),
    el("div", { class: "filtros" }, tiposBt, fBusca), caixaTodos);
    fBusca.addEventListener("input", () => { estado.busca = fBusca.value; pintarTodos(); });
    function pintarTodos() {
      for (const b of tiposBt.querySelectorAll(".seg-op")) b.classList.remove("on");
      [...tiposBt.querySelectorAll(".seg-op")][["", ...TIPOS].indexOf(estado.tipo)].classList.add("on");
      const q = semAcento(estado.busca.trim());
      const itens = ocs.filter(o => o.atrasou && (!estado.tipo || o.tipo === estado.tipo) &&
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
