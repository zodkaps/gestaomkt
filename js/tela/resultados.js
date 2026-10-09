// Resultados — o painel da reunião, no jeito de um Power BI.
//
// Em cima, uma fila só de filtros (frota, tipo, executante, quantas semanas)
// que vale para TUDO o que está embaixo: os números, os gráficos e a tabela
// mudam juntos, e sempre concordam entre si. Depois, os números do dia em
// cartões, com a variação contra a semana anterior e a minilinha das últimas
// semanas. Depois, os gráficos — e clicar neles filtra: a semana no gráfico
// de linha escolhe a semana, a frota na barra filtra pela frota, a situação
// abre a Programação já filtrada.
//
// As contas são as MESMAS da planilha (`M.resultados`, conferidas linha a linha
// em testes/resultados.mjs). Sem filtro, cada número aqui é o número da aba
// Resultados; com filtro, é o mesmo cálculo sobre o recorte.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, br, brCurto } from "../ui.js";
import { outrosIndicadores } from "./indicadores.js";
import { natural } from "./grade.js";
import { cartaoGrafico, graficoLinhas, graficoColunas, graficoBarras, minilinha } from "../graficos.js";

const pc = v => v == null ? "—" : (Math.round(v * 1000) / 10).toLocaleString("pt-BR") + "%";
const pc0 = v => v == null ? "—" : Math.round(v * 100) + "%";
const n1 = v => v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString("pt-BR");
const cor = v => v == null ? "" : v >= 0.9 ? "ok" : v >= 0.7 ? "hoje" : "vencida";

const S1 = "var(--s1)", S2 = "var(--s2)", S3 = "var(--s3)", CTX = "var(--ctx)";

// O recorte sobrevive à troca de tela, como na Programação.
const estado = {
  ano: null, semana: null,
  frota: "", tipo: "", executante: "",
  janela: 12,
  tabelaAberta: true, outrosAberto: false,
};

function semanaMenos(ano, semana, k) {
  let s = semana - k, a = ano;
  while (s < 1) { s += 52; a--; }
  while (s > 52) { s -= 52; a++; }
  return { ano: a, semana: s };
}

export async function montar(raiz, ctx, params) {
  const agora = M.semanaAtual();
  if (estado.semana == null) { estado.ano = agora.ano; estado.semana = agora.semana; }
  if (params.get("s")) { estado.semana = Number(params.get("s")); estado.ano = Number(params.get("a")) || agora.ano; }

  const rotulo = el("b", {});
  const fFrota = el("select", { onchange: () => { estado.frota = fFrota.value; pintar(); } });
  const fTipo = el("select", { onchange: () => { estado.tipo = fTipo.value; pintar(); } });
  const fExec = el("select", { onchange: () => { estado.executante = fExec.value; pintar(); } });
  const fJanela = el("select", { onchange: () => { estado.janela = Number(fJanela.value); pintar(); } },
    [8, 12, 26].map(n => el("option", { value: n, selected: n === estado.janela }, `últimas ${n} semanas`)));
  const bLimpar = el("button", { class: "discreto", onclick: () => {
    estado.frota = estado.tipo = estado.executante = ""; pintar();
  } }, "Limpar filtros");
  const corpo = el("div", { class: "bi" });

  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Resultados"),
      el("span", { class: "navsem" },
        el("button", { onclick: () => andar(-1), title: "Semana anterior" }, "‹"), rotulo,
        el("button", { onclick: () => andar(1), title: "Próxima semana" }, "›")),
      el("button", { onclick: () => { estado.ano = agora.ano; estado.semana = agora.semana; pintar(); } },
        "Semana atual")),
    // Os filtros: uma fila só, acima de tudo o que eles recortam.
    el("div", { class: "filtros bi-filtros" },
      el("label", { class: "agrupar" }, "Frota ", fFrota),
      el("label", { class: "agrupar" }, "Tipo ", fTipo),
      el("label", { class: "agrupar" }, "Executante ", fExec),
      el("label", { class: "agrupar" }, "Tendência ", fJanela),
      bLimpar),
    corpo);

  function andar(n) {
    const w = semanaMenos(estado.ano, estado.semana, -n);
    estado.ano = w.ano; estado.semana = w.semana;
    pintar();
  }

  function opcoes(sel, valores, atual, rotuloTodos) {
    limpar(sel);
    sel.append(el("option", { value: "" }, rotuloTodos));
    const lista = [...valores];
    if (atual && !lista.includes(atual)) lista.unshift(atual);
    for (const v of lista) sel.append(el("option", { value: v, selected: v === atual }, v));
  }

  /** O recorte: o que os filtros deixam passar. */
  function recorte(todas) {
    return todas.filter(a =>
      (!estado.frota || a.frota === estado.frota) &&
      (!estado.tipo || (a.tipo || "Corretiva") === estado.tipo) &&
      (!estado.executante || (a.executantes || []).includes(estado.executante)));
  }

  const kpi = (rot, val, det, cls = "", extra = null) =>
    el("div", { class: "kpi " + cls },
      el("div", { class: "k-rot" }, rot),
      el("div", { class: "k-val" }, String(val)),
      det ? el("div", { class: "k-det" }, det) : null,
      extra);

  /** A variação contra a semana anterior, em pontos percentuais. */
  function variacao(atual, antes, { bomSobe = true } = {}) {
    if (atual == null || antes == null) return null;
    const d = Math.round((atual - antes) * 100);
    if (!d) return el("span", { class: "delta igual" }, "= semana anterior");
    const bom = bomSobe ? d > 0 : d < 0;
    return el("span", { class: "delta " + (bom ? "bom" : "ruim") },
      `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} p.p. vs semana anterior`);
  }

  function pintar() {
    limpar(corpo);
    const todas = ev.lista().filter(a => a.atividade || a.frota);
    opcoes(fFrota, [...new Set(todas.map(a => a.frota).filter(Boolean))].sort(natural), estado.frota, "todas");
    opcoes(fTipo, [...new Set([...M.TIPOS, ...todas.map(a => a.tipo).filter(Boolean)])], estado.tipo, "todos");
    opcoes(fExec, [...new Set(todas.flatMap(a => a.executantes || []).filter(Boolean))].sort(natural),
      estado.executante, "todos");
    const filtrado = !!(estado.frota || estado.tipo || estado.executante);
    bLimpar.style.display = filtrado ? "" : "none";

    const ats = recorte(todas);
    const { ano, semana } = estado;
    const r = M.resultados(ats, ano, semana);
    const hh = M.semanaEmHH(ats, ano, semana);
    rotulo.textContent = `${semana}/${ano} · ${br(r.datas[0])} a ${br(r.datas[6])}`;

    // As semanas da tendência, da mais velha para a escolhida.
    const semanas = [];
    for (let k = estado.janela - 1; k >= 0; k--) semanas.push(semanaMenos(ano, semana, k));
    const serie = semanas.map(w => M.resultados(ats, w.ano, w.semana));
    const ant = serie[serie.length - 2] || null;
    const xs = semanas.map(w => "S" + w.semana);
    const marcado = semanas.length - 1;

    corpo.append(el("p", { class: "nota", style: "margin-top:0" }, filtrado
      ? `Filtrado: ${[estado.frota && "frota " + estado.frota, estado.tipo && estado.tipo,
        estado.executante && estado.executante].filter(Boolean).join(" · ")}. Mesmas contas da ` +
        "planilha, sobre o recorte. Sem filtro, cada número é o da aba Resultados."
      : "A semana escolhida, só a oficina interna — extra programação, serviço de terceiro e " +
        "cancelada ficam fora dos dois lados, como na planilha. Clique nos gráficos para filtrar."));

    // ── os dois números da reunião, grandes, com a tendência
    const grande = (titulo, valor, texto, valores, delta) =>
      el("div", { class: "grande " + cor(valor) },
        el("div", { class: "g-tit" }, titulo),
        el("div", { class: "g-val" }, valor == null ? "—" : Math.round(valor * 100) + "%"),
        delta,
        el("div", { class: "g-txt" }, texto),
        el("div", { class: "g-tend" }, minilinha(valores, { largura: 180, altura: 30 }),
          el("span", {}, `${estado.janela} semanas`)));
    corpo.append(el("div", { class: "grandes" },
      grande("Aderência à programação", r.aderencia,
        `do plano da semana, ${r.concluidas_plano} de ${r.plano} atividades foram concluídas.`,
        serie.map(x => x.aderencia), variacao(r.aderencia, ant && ant.aderencia)),
      grande("Cumprimento geral", r.cumprimento,
        `contando o extra, a oficina fez ${r.concluidas} das ${r.total} atividades que teve.`,
        serie.map(x => x.cumprimento), variacao(r.cumprimento, ant && ant.cumprimento))));

    // ── os cartões de apoio
    corpo.append(el("div", { class: "kpis" },
      kpi("Concluídas", `${r.concluidas}`, `de ${r.total} · ${r.extras_concluidas} eram extra`, r.concluidas ? "ok" : ""),
      kpi("Extra programação", pc0(r.parte_extra), `${r.extra} de ${r.total} entraram depois`, r.extra ? "extra" : ""),
      kpi("Vencidas", r.vencidas, "a janela fechou e não saiu", r.vencidas ? "vencida" : ""),
      kpi("Pontualidade", pc0(r.pontualidade), `${r.no_prazo} saíram no próprio dia`),
      kpi("Cobertura de OS", pc0(r.cobertura_os), r.sem_os ? `${r.sem_os} sem OS na semana` : "todas com OS",
        r.sem_os ? "hoje" : "ok", r.sem_os ? el("button", { class: "mini k-acao",
          onclick: () => ctx.ir("programacao", `s=${semana}&a=${ano}&os=sem`) }, "Lançar as OS") : null),
      kpi("Preventiva", pc0(r.pct_preventiva), `da semana · ${pc0(r.pct_preventiva_acervo)} no acervo`),
      kpi("Carga da equipe", pc0(hh.ocupacao), `${n1(hh.hh_plano + hh.hh_extra)} de ${n1(hh.capacidade)} HH`,
        hh.ocupacao > 1 ? "vencida" : "")));

    // ── os gráficos
    const grade = el("div", { class: "bi-grade" });
    corpo.append(grade);
    const larguraDe = card => Math.max(280, (card.clientWidth || 600) - 28);
    const pendurar = (card, desenhar, larga = false) => {
      if (larga) card.classList.add("larga");
      grade.append(card);
      const caixa = card.querySelector(".g-corpo");
      caixa.append(desenhar(larguraDe(card)));
    };

    const irSemana = i => { estado.ano = semanas[i].ano; estado.semana = semanas[i].semana; pintar(); };

    // 1. a tendência
    pendurar(cartaoGrafico("Aderência e cumprimento, semana a semana",
      "clique numa semana para vê-la", el("div", { class: "g-corpo" }),
      { legendaDe: [{ nome: "Aderência à programação", cor: S1 }, { nome: "Cumprimento geral", cor: S2 }] }),
    w => graficoLinhas({ largura: w, xs, marcado, meta: 0.9,
      series: [{ nome: "Aderência", cor: S1, valores: serie.map(x => x.aderencia) },
        { nome: "Cumprimento", cor: S2, valores: serie.map(x => x.cumprimento) }],
      detalhe: i => [{ valor: `${serie[i].concluidas_plano} de ${serie[i].plano}`, rotulo: "do plano" },
        { valor: `${serie[i].concluidas} de ${serie[i].total}`, rotulo: "no total" }],
      aoClicar: irSemana }), true);

    // 2. o que a oficina teve por semana
    pendurar(cartaoGrafico("O que a oficina teve, por semana", "atividades da oficina interna",
      el("div", { class: "g-corpo" }),
      { forma: "caixa", legendaDe: [{ nome: "Do plano, concluídas", cor: S1 },
        { nome: "Do plano, não saíram", cor: CTX }, { nome: "Extra", cor: S2 }] }),
    w => graficoColunas({ largura: w, xs, marcado,
      series: [
        { nome: "Do plano, concluídas", cor: S1, valores: serie.map(x => x.concluidas_plano) },
        { nome: "Do plano, não saíram", cor: CTX, valores: serie.map(x => x.plano - x.concluidas_plano) },
        { nome: "Extra", cor: S2, valores: serie.map(x => x.extra) }],
      aoClicar: irSemana }));

    // 3. a situação da semana — abre a Programação filtrada
    const daSemana = ats.filter(a => !a.excluida && (a.atividade || a.frota) &&
      M.naSemana(a, ano, semana) && M.oficinaDe(a) === "Interna");
    const porSit = new Map();
    for (const a of daSemana) { const s = M.situacaoDe(a); porSit.set(s, (porSit.get(s) || 0) + 1); }
    const ORDEM_SIT = ["VENCIDA", "Fecha hoje", "Em execução", "Programada", "Concluída com atraso",
      "Concluída", "Cancelada"];
    const itensSit = [...porSit].sort((a, b) =>
      (ORDEM_SIT.indexOf(a[0]) + 1 || 99) - (ORDEM_SIT.indexOf(b[0]) + 1 || 99))
      .map(([s, n]) => ({ rotulo: s, chave: s, partes: [{ nome: s, cor: `var(--${M.corDe(s)})`, valor: n }] }));
    pendurar(cartaoGrafico("Situação das atividades da semana",
      "clique para abrir a Programação nessa situação", el("div", { class: "g-corpo" })),
    w => itensSit.length ? graficoBarras({ largura: w, itens: itensSit,
      aoClicar: it => ctx.ir("programacao", `s=${semana}&a=${ano}&sit=${encodeURIComponent(it.chave)}` +
        (estado.frota ? `&f=${encodeURIComponent(estado.frota)}` : "")) })
      : el("p", { class: "nada" }, "Nada programado nesta semana."));

    // 4. por frota
    const porFrota = new Map();
    for (const a of daSemana.filter(a => !a.cancelada)) {
      const f = a.frota || "sem frota";
      if (!porFrota.has(f)) porFrota.set(f, { feitas: 0, abertas: 0 });
      porFrota.get(f)[M.feita(a) ? "feitas" : "abertas"]++;
    }
    let frotasOrd = [...porFrota].sort((a, b) => (b[1].feitas + b[1].abertas) - (a[1].feitas + a[1].abertas) ||
      natural(a[0], b[0]));
    const resto = frotasOrd.slice(12);
    frotasOrd = frotasOrd.slice(0, 12);
    const itensFrota = frotasOrd.map(([f, v]) => ({ rotulo: f, chave: f, ativo: f === estado.frota,
      partes: [{ nome: "Concluídas", cor: S1, valor: v.feitas }, { nome: "Em aberto", cor: CTX, valor: v.abertas }] }));
    if (resto.length) {
      itensFrota.push({ rotulo: `outras ${resto.length} frotas`, chave: "",
        partes: [{ nome: "Concluídas", cor: S1, valor: resto.reduce((s, [, v]) => s + v.feitas, 0) },
          { nome: "Em aberto", cor: CTX, valor: resto.reduce((s, [, v]) => s + v.abertas, 0) }] });
    }
    pendurar(cartaoGrafico("Onde está o trabalho da semana", "por frota · clique para filtrar",
      el("div", { class: "g-corpo" }), { forma: "caixa",
        legendaDe: [{ nome: "Concluídas", cor: S1 }, { nome: "Em aberto", cor: CTX }] }),
    w => itensFrota.length ? graficoBarras({ largura: w, itens: itensFrota,
      aoClicar: it => { if (it.chave) { estado.frota = estado.frota === it.chave ? "" : it.chave; pintar(); } } })
      : el("p", { class: "nada" }, "Nada nesta semana."));

    // 5. carga por executante
    const itensExec = hh.carga.slice(0, 12).map(p => ({ rotulo: p.nome, chave: p.nome,
      ativo: p.nome === estado.executante,
      partes: [{ nome: "HH na semana", cor: S1, valor: Math.round(p.total * 10) / 10 }],
      extra: [{ valor: pc0(p.ocupacao), rotulo: "da capacidade" }] }));
    pendurar(cartaoGrafico("Carga da equipe na semana", `HH por pessoa · capacidade ${n1(M.HORAS_DIA * 5)} h ` +
      "(6,6 h por dia útil) · clique para filtrar", el("div", { class: "g-corpo" })),
    w => itensExec.length ? graficoBarras({ largura: w, itens: itensExec, formato: v => n1(v) + " h",
      marca: { valor: M.HORAS_DIA * 5, rotulo: "capacidade" },
      rotuloTotal: (it, t) => `${n1(t)} h · ${it.extra[0].valor}`,
      aoClicar: it => { estado.executante = estado.executante === it.chave ? "" : it.chave; pintar(); } })
      : el("p", { class: "nada" }, "Sem HH com executante nesta semana."));

    // 6. o mix de manutenção — semana × acervo
    const TIPOS_MIX = [["Corretiva", S1], ["Preventiva", S2], ["Inspeção", S3]];
    const mixDe = (lista, nome) => {
      const total = lista.length || 1;
      const partes = TIPOS_MIX.map(([t, c]) => ({ nome: t, cor: c,
        valor: Math.round(lista.filter(a => (a.tipo || "Corretiva") === t).length / total * 1000) / 10 }));
      const outros = lista.filter(a => !TIPOS_MIX.some(([t]) => (a.tipo || "Corretiva") === t)).length;
      partes.push({ nome: "Outros tipos", cor: CTX, valor: Math.round(outros / total * 1000) / 10 });
      return { rotulo: nome, partes, extra: [{ valor: String(lista.length), rotulo: "atividades" }] };
    };
    const internas = daSemana.filter(a => !a.cancelada);
    const acervo = ats.filter(a => !a.excluida && !a.cancelada && (a.atividade || a.frota));
    pendurar(cartaoGrafico("Mix de manutenção", "% por tipo · é aqui que se vê se o PCM está saindo da corretiva",
      el("div", { class: "g-corpo" }), { forma: "caixa",
        legendaDe: [...TIPOS_MIX.map(([t, c]) => ({ nome: t, cor: c })), { nome: "Outros", cor: CTX }] }),
    w => graficoBarras({ largura: w, maximo: 100, formato: v => n1(v) + "%",
      itens: [mixDe(internas, `Semana ${semana}`), mixDe(acervo, "Acervo")],
      rotuloTotal: it => it.extra[0].valor + " ativ." }));

    // 7. por que não saiu
    const ar = M.atrasoPorArea(daSemana);
    const itensArea = Object.entries(ar.por).sort((a, b) => b[1].total - a[1].total)
      .map(([area, d]) => ({ rotulo: area, partes: [{ nome: "Atividades em aberto", cor: S1, valor: d.total }],
        extra: Object.entries(d.motivos).sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([mot, n]) => ({ valor: String(n), rotulo: mot })) }));
    pendurar(cartaoGrafico("Por que não saiu", "em aberto na semana, pelo motivo escrito" +
      (ar.sem_motivo ? ` · ${ar.sem_motivo} sem motivo` : ""), el("div", { class: "g-corpo" })),
    w => itensArea.length ? graficoBarras({ largura: w, itens: itensArea })
      : el("p", { class: "nada" }, "Nada em aberto com motivo escrito nesta semana."));

    // ── a tabela da planilha — a versão em tabela de tudo isto
    const tabela = el("details", { class: "outros", open: estado.tabelaAberta },
      el("summary", {}, "Os números, como na aba Resultados da planilha"),
      tabelaIndicadores(r));
    tabela.addEventListener("toggle", () => { estado.tabelaAberta = tabela.open; });
    corpo.append(tabela);

    corpo.append(el("div", { class: "titulo-secao" }, "Fechamento das semanas",
      el("span", { class: "n" }, "· a tabela dos gráficos acima")));
    corpo.append(fechamento(serie));

    const outros = el("details", { class: "outros", open: estado.outrosAberto },
      el("summary", {}, "Outros indicadores — o que saiu nos sete dias, backlog, de quem é o atraso, pontualidade da operação"));
    if (estado.outrosAberto) outros.append(outrosIndicadores(ano, semana));
    outros.addEventListener("toggle", () => {
      estado.outrosAberto = outros.open;
      if (outros.open && outros.children.length === 1) outros.append(outrosIndicadores(ano, semana));
    });
    corpo.append(outros);
  }

  function tabelaIndicadores(r) {
    const sec = t => el("tr", { class: "sec" }, el("td", { colspan: 3 }, t));
    const lin = (rot, val, como = "", forte = false, cls = "") =>
      el("tr", { class: forte ? "forte" : "" },
        el("td", {}, rot), el("td", { class: "num " + cls }, val), el("td", { class: "como" }, como));
    return el("div", { class: "rolagem" }, el("table", { class: "tabela indicadores" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Indicador"), el("th", { class: "num" }, "Valor"), el("th", {}, "Como é medido"))),
      el("tbody", {},
        sec("O que a oficina interna tinha para fazer"),
        lin("Atividades do plano", r.plano, "estavam programadas para a semana"),
        lin("Extra programação", r.extra, "entraram depois: quebra, urgência, pedido da operação", false, "c-extra"),
        lin("Concluídas do plano", r.concluidas_plano, "do que estava programado, quanto saiu"),
        lin("Total interno", r.total, "plano + extra"),
        lin("Extras concluídas", r.extras_concluidas),
        lin("Total concluído", r.concluidas, "plano + extra"),
        sec("Os números"),
        lin("Aderência à programação", pc(r.aderencia),
          "concluídas do plano ÷ atividades do plano — o indicador principal", true, cor(r.aderencia)),
        lin("Cumprimento geral", pc(r.cumprimento),
          "total concluído ÷ total interno — inclui o extra", true, cor(r.cumprimento)),
        lin("Quanto da semana foi extra", pc(r.parte_extra), "extra ÷ total interno", false, "c-extra"),
        lin("Concluídas no prazo", r.no_prazo, "saíram no próprio dia programado"),
        lin("Pontualidade", pc(r.pontualidade), "no prazo ÷ concluídas"),
        lin("Aderência ao plano original", pc(r.aderencia_original),
          "contra a semana da 1ª programação — não melhora quando se empurra para a frente"),
        lin("Saíram desta semana", r.sairam,
          "estavam programadas para esta semana e foram empurradas para outra"),
        lin("Vencidas", r.vencidas, "a janela de execução fechou e a atividade não saiu", false,
          r.vencidas ? "vencida" : ""),
        lin("Atividades reprogramadas", r.reprogramadas, "mudaram de semana"),
        lin("Atraso médio, quando atrasa", n1(r.atraso_medio), "dias entre o dia programado e a conclusão"),
        sec("Dias de serviço"),
        lin("Diária — atividades por dia útil", n1(r.por_dia), "total interno ÷ 5 dias — quantas a semana pede por dia"),
        lin("Diária do que saiu", n1(r.saiu_por_dia), "total concluído ÷ 5 dias — o que a oficina entrega por dia"),
        lin("Soma das estimativas", n1(r.hh), "soma do HH previsto das atividades da semana"),
        sec("Fora da conta interna"),
        lin("Em empresa terceirizada", r.terceirizada, "serviço de fora: não mede a oficina da Makro"),
        lin("Canceladas", r.canceladas, "saem dos dois lados"),
        lin("Na carteira, sem dia", r.carteira, "não depende da semana — é o que ainda espera encaixe"),
        sec("Mix de manutenção"),
        lin("Corretiva na semana", r.corretiva, "quebrou e teve de consertar"),
        lin("Preventiva na semana", r.preventiva, "foi feita antes de quebrar"),
        lin("Inspeção na semana", r.inspecao, "olhar para achar o que vai quebrar"),
        lin("% preventiva na semana", pc(r.pct_preventiva), "preventiva ÷ total interno da semana"),
        lin("Corretiva no acervo", r.corretiva_acervo, "todas as semanas somadas"),
        lin("Preventiva no acervo", r.preventiva_acervo),
        lin("% preventiva no acervo", pc(r.pct_preventiva_acervo), "o retrato acumulado — mostra a tendência"),
        sec("Cobertura de OS · o que a oficina fez e o Protheus registrou"),
        lin("Com OS na semana", r.com_os, "atividades da semana com OS aberta no Protheus"),
        lin("Sem OS na semana", r.sem_os, "dá para lançar direto na Programação, no filtro \"sem OS\"", false, r.sem_os ? "c-semos" : ""),
        lin("Cobertura na semana", pc(r.cobertura_os), "com OS ÷ total interno da semana"),
        lin("Com OS no acervo", r.com_os_acervo,
          "uma célula escrita \"ABRIR OS\" é recado, não OS — a planilha conta, o site não"),
        lin("Sem OS no acervo", r.sem_os_acervo, "a fila do que falta lançar"),
        lin("Cobertura no acervo", pc(r.cobertura_os_acervo), "com OS ÷ todas as atividades"))));
  }

  function fechamento(serie) {
    const linhas = serie.filter(r => r.plano || r.extra).slice().reverse();
    if (!linhas.length) return el("p", { class: "nada" }, "Sem semanas com programação.");
    return el("div", { class: "rolagem" }, el("table", { class: "tabela indicadores" },
      el("thead", {}, el("tr", {},
        ["Semana", "De", "A", "Plano", "Concluídas", "Aderência", "Cumprimento", "Extra", "Vencidas"]
          .map((t, i) => el("th", { class: i > 2 ? "num" : "" }, t)))),
      el("tbody", {}, linhas.map(r => el("tr", {
        class: r.semana === estado.semana && r.ano === estado.ano ? "forte" : "",
        style: "cursor:pointer", title: "Ver esta semana",
        onclick: () => { estado.ano = r.ano; estado.semana = r.semana; pintar(); window.scrollTo(0, 0); },
      },
        el("td", {}, `${r.semana}/${r.ano}`),
        el("td", {}, brCurto(r.datas[0])),
        el("td", {}, brCurto(r.datas[4])),
        el("td", { class: "num" }, String(r.plano)),
        el("td", { class: "num" }, String(r.concluidas_plano)),
        el("td", { class: "num " + cor(r.aderencia) }, pc(r.aderencia)),
        el("td", { class: "num " + cor(r.cumprimento) }, pc(r.cumprimento)),
        el("td", { class: "num c-extra" }, String(r.extra)),
        el("td", { class: "num" + (r.vencidas ? " vencida" : "") }, String(r.vencidas)))))));
  }

  // Os gráficos são desenhados na largura do cartão: mudou a janela, redesenha.
  let tempo = null;
  const aoRedimensionar = () => { clearTimeout(tempo); tempo = setTimeout(pintar, 180); };
  window.addEventListener("resize", aoRedimensionar);

  pintar();
  const parar = ev.ouvir(pintar);
  return { desmontar: () => { parar(); window.removeEventListener("resize", aoRedimensionar); } };
}
