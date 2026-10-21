// O registro inteiro, do mais novo para o mais velho.
//
// É a tela que responde "por que isto mudou?" — e o pedido que deu origem ao
// site. A pergunta quase nunca é sobre tudo: é sobre uma frota, numa semana,
// ou sobre o que alguém lançou ontem. Por isso, desde 21/10/2026, o alto tem
// só o que se usa sempre — a busca, a frota e o período —, e o resto (pessoa,
// tipo, origem, datas) fica em "Mais filtros". A lista vem separada por dia.
// O resumo do dia, que conta as decisões do Painel, só aparece com a oficina.

import * as ev from "../eventos.js";
import { TIPOS } from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, selecao, avisar, erro, vazio, confirmar, br, cartaoNumero, quando } from "../ui.js";
import { descreverEvento, valoresDe } from "./comum.js";
import { diaDe, filtrarRegistro, resumoDoDia } from "../registro.js";
import { OFICINA } from "../foco.js";

const PAGINA = 150;
const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const ALVOS = OFICINA ? { atividade: "atividades", movimentacao: "movimentações", preventiva: "preventivas",
  semana: "semanas fechadas" } : { movimentacao: "movimentações", preventiva: "preventivas" };
// Sem a oficina no site, o registro mostra só o que o site cuida: as
// movimentações e as preventivas. Os lançamentos da oficina continuam na fita.
const fita = () => OFICINA ? ev.log : ev.log.filter(e => e.alvo_tipo in ALVOS);
// Os tipos de lançamento de movimentação e preventiva — os que o site mostra
// sem a oficina.
const TIPOS_DO_SITE = new Set(["criada", "importada", "editada", "excluida", "justificada",
  "mov_prometida", "mov_chegou", "mov_aprovada", "mov_devolvida", "mov_cancelada",
  "prev_disponivel", "prev_parada", "prev_entregue", "prev_andamento", "prev_realizada", "prev_adiada",
  "prev_cancelada", "prev_reaberta"]);
const ORIGENS = { manual: "lançado no site", planilha: "da planilha", claude: "pedido ao Claude",
  painel: "decisão do Painel", vinculo: "preventiva ↔ OS (automático)" };

/** "terça-feira, 14/10/2026" — com "hoje" e "ontem" quando é o caso. */
function rotuloDia(d) {
  const h = M.hoje();
  const nome = SEMANA[M.data(d).getUTCDay()];
  const prefixo = d === h ? "hoje · " : d === M.somaDias(h, -1) ? "ontem · " : "";
  return `${prefixo}${nome}, ${br(d)}`;
}

export async function montar(raiz, ctx, params) {
  let mostrando = PAGINA;
  const f = { busca: "", tipo: "", alvo: "", autor: params.get("autor") || "", origem: params.get("origem") || "",
    frota: params.get("f") || "", de: params.get("de") || "", ate: params.get("ate") || "" };
  let diaResumo = params.get("dia") || M.hoje();

  const fBusca = el("input", { class: "busca", type: "search",
    placeholder: OFICINA ? "frota, OS, atividade, motivo…" : "buscar: motivo, destino, plano, pessoa…",
    oninput: () => { f.busca = fBusca.value; reiniciar(); } });
  const fAutor = el("select", { onchange: () => { f.autor = fAutor.value; reiniciar(); }, "aria-label": "Pessoa" });
  const fTipo = selecao([{ v: "", t: "O quê: tudo" }, ...(OFICINA ? [{ v: "_baixas", t: "baixas (as três)" }] : []),
    ...Object.entries(TIPOS).filter(([v]) => OFICINA || TIPOS_DO_SITE.has(v)).map(([v, t]) => ({ v, t }))], "",
    { onchange: () => { f.tipo = fTipo.value; reiniciar(); }, "aria-label": "Tipo de lançamento" });
  const fAlvo = selecao([{ v: "", t: "Em: tudo" }, ...Object.entries(ALVOS).map(([v, t]) => ({ v, t: "Em " + t }))], "",
    { onchange: () => { f.alvo = fAlvo.value; reiniciar(); }, "aria-label": "Onde" });
  // A frota se digita, qualquer uma, como na Avaliação: a lista só sugere.
  const dlFrota = el("datalist", { id: "dl-frotas-registro" });
  const fFrota = el("input", { type: "search", class: "busca-frota", placeholder: "Digite a frota", title: "Qualquer frota: 617 acha a F-617",
    list: "dl-frotas-registro", autocomplete: "off", spellcheck: false, value: f.frota, "aria-label": "Frota",
    oninput: () => { f.frota = fFrota.value.trim(); reiniciar(); } });
  // As frotas do que o Registro mostra: sem a oficina, só movimentação e preventiva.
  const frotasDoRegistro = () => [...new Set(Object.keys(ALVOS).flatMap(t => valoresDe("frota", t)))]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const fOrigem = selecao([{ v: "", t: "Origem: todas" }, ...Object.entries(ORIGENS).map(([v, t]) => ({ v, t }))],
    f.origem, { onchange: () => { f.origem = fOrigem.value; reiniciar(); }, "aria-label": "Origem" });
  const fDe = el("input", { type: "date", value: f.de, onchange: () => { f.de = fDe.value; reiniciar(); },
    style: "width:auto", "aria-label": "De" });
  const fAte = el("input", { type: "date", value: f.ate, onchange: () => { f.ate = fAte.value; reiniciar(); },
    style: "width:auto", "aria-label": "Até" });

  // Os períodos de sempre num toque; as datas continuam para o resto.
  const PERIODOS = [["hoje", "Hoje", () => [M.hoje(), M.hoje()]],
    ["7", "7 dias", () => [M.somaDias(M.hoje(), -6), M.hoje()]],
    ["30", "30 dias", () => [M.somaDias(M.hoje(), -29), M.hoje()]],
    ["tudo", "Tudo", () => ["", ""]]];
  const periodos = el("div", { class: "segmentos", role: "group", "aria-label": "Período" });

  const contagem = el("span", { class: "sub" });
  const resumo = el("section", { class: "resumo-dia" });
  const etiquetas = el("div", { class: "etiquetas" });
  const corpo = el("div", {});

  // Os filtros de sempre ficam à vista; os outros, recolhidos. Com algum deles
  // ligado, "Mais filtros" mostra quantos.
  const contaMais = el("span", { class: "n" });
  const mais = el("details", { class: "mais-filtros" },
    el("summary", {}, "Mais filtros", contaMais),
    el("div", { class: "filtros reg" }, fAutor, fTipo, OFICINA ? fAlvo : null, fOrigem,
      el("span", { class: "rot-data" }, "de"), fDe, el("span", { class: "rot-data" }, "até"), fAte));

  // replaceChildren/append(null) escreve "null" na tela: só o que existe entra
  raiz.append(...[
    el("div", { class: "cabec" }, el("h1", {}, "Registro"), contagem),
    el("p", { class: "nota", style: "margin:0 0 10px" },
      "Tudo o que foi lançado, do mais novo para o mais antigo, com quem lançou e o motivo."),
    OFICINA ? resumo : null,
    el("div", { class: "filtros reg" }, fBusca, fFrota, dlFrota, periodos, mais),
    etiquetas,
    corpo,
    el("div", { class: "reg-pe" },
      el("button", { type: "button", class: "discreto", onclick: conferir,
        title: "Toca a fita do zero e compara com o que está nas telas" }, "Conferir o registro"))].filter(Boolean));

  function reiniciar() { mostrando = PAGINA; pintar(); }

  /** Põe os filtros de uma vez (o resumo do dia e as etiquetas usam). */
  function filtrarPor(novo) {
    Object.assign(f, novo);
    fBusca.value = f.busca; fFrota.value = f.frota; fTipo.value = f.tipo; fAlvo.value = f.alvo; fOrigem.value = f.origem;
    fDe.value = f.de; fAte.value = f.ate;
    reiniciar();
  }

  function pintarOpcoes() {
    limpar(dlFrota).append(...frotasDoRegistro().map(x => el("option", { value: x })));
    const autores = [...new Set(fita().map(e => e.autor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (f.autor && !autores.includes(f.autor)) autores.push(f.autor);
    limpar(fAutor).append(el("option", { value: "" }, "Pessoa: todas"),
      ...autores.map(x => el("option", { value: x, selected: x === f.autor }, x)));
    limpar(periodos).append(...PERIODOS.map(([id, rot, faixa]) => {
      const [de, ate] = faixa();
      return el("button", { type: "button", class: "seg-op" + (f.de === de && f.ate === ate ? " on" : ""),
        "data-periodo": id, onclick: () => filtrarPor({ de, ate }) }, rot);
    }));
  }

  // ── o resumo de um dia ──
  function pintarResumo() {
    const r = resumoDoDia(fita(), diaResumo);
    const h = M.hoje();
    const irDia = d => () => { diaResumo = d; pintarResumo(); };
    const verDoDia = extra => () => {
      filtrarPor({ tipo: "", autor: "", origem: "", alvo: "", ...extra, de: diaResumo, ate: diaResumo });
      corpo.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const nav = el("div", { class: "rd-nav" },
      el("button", { type: "button", class: "discreto", title: "Dia anterior", "aria-label": "Dia anterior",
        onclick: irDia(M.somaDias(diaResumo, -1)) }, "‹"),
      el("b", {}, rotuloDia(diaResumo)),
      el("button", { type: "button", class: "discreto", title: "Dia seguinte", "aria-label": "Dia seguinte",
        disabled: diaResumo >= h, onclick: irDia(M.somaDias(diaResumo, 1)) }, "›"),
      diaResumo !== h ? el("button", { type: "button", class: "discreto", onclick: irDia(h) }, "hoje") : null);

    limpar(resumo).append(el("div", { class: "rd-cab" }, el("h2", {}, "Resumo do dia"), nav));
    if (!r.total) {
      // Sem nada no dia, aponta o último dia que teve lançamento.
      const ultimo = fita().length ? diaDe(fita()[fita().length - 1].ts) : "";
      resumo.append(el("p", { class: "nada rd-nada" }, "Nada lançado neste dia.",
        ultimo && ultimo !== diaResumo ? el("button", { type: "button", class: "discreto",
          onclick: irDia(ultimo) }, ` Ver ${rotuloDia(ultimo)}`) : null));
      return;
    }
    const num = (v, rot, extra, classe = "") => {
      const c = cartaoNumero(v, rot, "", classe);
      if (v && extra) { c.classList.add("clicavel"); c.tabIndex = 0; c.setAttribute("role", "button");
        c.onclick = verDoDia(extra); c.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.onclick(); } }; }
      return c;
    };
    resumo.append(
      el("div", { class: "numeros" },
        num(r.total, r.total === 1 ? "lançamento" : "lançamentos", {}),
        num(r.baixas, "baixas", { tipo: "_baixas" }),
        num(r.reprogramacoes, "reprogramações", { tipo: "reprogramada" }),
        num(r.novas, "novas", { tipo: "criada" }),
        num(r.painel, "pelo Painel", { origem: "painel" }, r.painel ? "painel" : "")),
      el("div", { class: "rd-linhas" },
        el("div", { class: "rd-linha" }, el("span", { class: "rd-rot" }, "Quem lançou"),
          r.porPessoa.map(([quem, n]) => el("button", { type: "button", class: "rd-chip",
            onclick: verDoDia({ autor: quem }) }, quem, el("b", {}, String(n))))),
        el("div", { class: "rd-linha" }, el("span", { class: "rd-rot" }, "O quê"),
          r.porTipo.map(([tipo, n]) => el("button", { type: "button", class: "rd-chip",
            onclick: verDoDia({ tipo }) }, TIPOS[tipo] || tipo, el("b", {}, String(n)))))));
  }

  // ── os filtros ligados, como etiquetas que se tiram com um clique ──
  function pintarEtiquetas() {
    const ligados = [];
    const et = (rot, tirar) => ligados.push(el("button", { type: "button", class: "etiqueta",
      title: "Tirar este filtro", onclick: tirar }, rot, el("span", { class: "x", "aria-hidden": "true" }, "×")));
    if (f.busca) et(`Busca: “${f.busca}”`, () => filtrarPor({ busca: "" }));
    if (f.autor) et(`Pessoa: ${f.autor}`, () => { fAutor.value = ""; filtrarPor({ autor: "" }); });
    if (f.tipo) et(`Tipo: ${f.tipo === "_baixas" ? "baixas" : TIPOS[f.tipo] || f.tipo}`, () => filtrarPor({ tipo: "" }));
    if (f.alvo) et(`Em: ${ALVOS[f.alvo]}`, () => filtrarPor({ alvo: "" }));
    if (f.frota) et(`Frota: ${f.frota}`, () => { fFrota.value = ""; filtrarPor({ frota: "" }); });
    if (f.origem) et(`Origem: ${ORIGENS[f.origem] || f.origem}`, () => filtrarPor({ origem: "" }));
    if (f.de || f.ate) {
      et(f.de && f.de === f.ate ? `Dia: ${br(f.de)}` : `Período: ${f.de ? br(f.de) : "início"} a ${f.ate ? br(f.ate) : "hoje"}`,
        () => filtrarPor({ de: "", ate: "" }));
    }
    limpar(etiquetas);
    etiquetas.hidden = !ligados.length;
    if (ligados.length) {
      etiquetas.append(...ligados, el("button", { type: "button", class: "discreto limpar-filtros",
        onclick: () => { fAutor.value = ""; fFrota.value = "";
          filtrarPor({ busca: "", tipo: "", alvo: "", autor: "", origem: "", frota: "", de: "", ate: "" }); } },
        "Limpar filtros"));
    }
  }

  function pintar() {
    pintarOpcoes();
    if (OFICINA) pintarResumo();
    pintarEtiquetas();
    const nMais = [f.autor, f.tipo, f.alvo, f.origem].filter(Boolean).length +
      ((f.de || f.ate) && !PERIODOS.some(([, , faixa]) => { const [de, ate] = faixa(); return de === f.de && ate === f.ate; }) ? 1 : 0);
    contaMais.textContent = nMais ? ` · ${nMais}` : "";
    const itens = filtrarRegistro(fita(), { ...f, frotas: frotasDoRegistro() }, ev.achar);
    contagem.textContent = `${itens.length} lançamento${itens.length === 1 ? "" : "s"}`;

    limpar(corpo);
    if (!itens.length) { corpo.append(vazio("Nada com esses filtros.")); return; }

    // Separado por dia, cada dia com quantos e quem.
    const visiveis = itens.slice(0, mostrando);
    const porDia = new Map();
    for (const e of visiveis) {
      const d = diaDe(e.ts);
      if (!porDia.has(d)) porDia.set(d, []);
      porDia.get(d).push(e);
    }
    const totalDia = new Map();
    for (const e of itens) { const d = diaDe(e.ts); totalDia.set(d, (totalDia.get(d) || 0) + 1); }
    for (const [d, evs] of porDia) {
      const quem = new Map();
      for (const e of itens) if (diaDe(e.ts) === d) quem.set(e.autor || "—", (quem.get(e.autor || "—") || 0) + 1);
      const n = totalDia.get(d);
      corpo.append(el("div", { class: "dia-reg", "data-dia": d },
        el("div", { class: "dr-cab" },
          el("b", {}, rotuloDia(d)),
          el("span", { class: "dr-n" }, `${n} lançamento${n === 1 ? "" : "s"}`),
          el("span", { class: "dr-quem" }, [...quem].sort((a, b) => b[1] - a[1]).map(([q, k]) => `${q} ${k}`).join(" · ")),
          el("div", { class: "espaco" }),
          OFICINA ? el("button", { type: "button", class: "discreto mini", title: "Ver o resumo deste dia no alto",
            onclick: () => { diaResumo = d; pintarResumo(); resumo.scrollIntoView({ behavior: "smooth", block: "start" }); } },
          "resumo do dia") : null),
        el("div", {}, juntarImportadas(evs).map(x => Array.isArray(x) ? linhaDaImportacao(x) : linhaDoRegistro(x)))));
    }
    if (itens.length > mostrando) {
      corpo.append(el("button", { style: "margin-top:12px",
        onclick: () => { mostrando += PAGINA; pintar(); } },
        `Mostrar mais (${itens.length - mostrando} restantes)`));
    }
  }

  // Uma importação lança dezenas de itens de uma vez, e cada um virava uma
  // linha igual à outra. Os seguidos da mesma planilha e da mesma pessoa viram
  // uma linha só, que abre para mostrar os itens.
  function juntarImportadas(evs) {
    const r = [];
    for (const e of evs) {
      const ult = r[r.length - 1];
      if (e.tipo === "importada" && Array.isArray(ult) && ult[0].autor === e.autor &&
        (ult[0].dados || {}).fonte === (e.dados || {}).fonte) ult.push(e);
      else r.push(e.tipo === "importada" ? [e] : e);
    }
    return r.map(x => Array.isArray(x) && x.length === 1 ? x[0] : x);
  }
  function linhaDaImportacao(evs) {
    const conta = new Map();
    for (const e of evs) conta.set(e.alvo_tipo, (conta.get(e.alvo_tipo) || 0) + 1);
    const nomes = { movimentacao: ["movimentação", "movimentações"], preventiva: ["preventiva", "preventivas"],
      atividade: ["atividade", "atividades"], semana: ["semana", "semanas"] };
    const partes = [...conta].map(([t, n]) => `${n} ${(nomes[t] || [t, t])[n === 1 ? 0 : 1]}`).join(", ");
    const fonte = (evs[0].dados || {}).fonte || "a planilha";
    return el("details", { class: "evento importacao" },
      el("summary", {},
        el("div", { class: "qdo" }, quando(evs[0].ts)),
        el("div", { class: "oq" }, evs[0].autor ? el("span", { class: "autor" }, evs[0].autor + " — ") : null,
          `importou ${fonte}: `, el("b", {}, `${evs.length} itens`), ` (${partes})`, el("span", { class: "abrir" }, " · ver os itens"))),
      el("div", { class: "itens" }, evs.map(linhaDoRegistro)));
  }

  // Exclusão e cancelamento se desfazem daqui: o item volta do jeito que estava,
  // e a própria desfeita fica no registro.
  function linhaDoRegistro(e) {
    const linha = descreverEvento(e, true);
    const achado = ev.achar(e.alvo);
    const item = achado && achado.item;
    if (!item || !pessoas.pode("editar_atividade")) return linha;
    let desfazer = null;
    if (e.tipo === "excluida" && item.excluida) {
      desfazer = ["Desfazer exclusão", () => ev.reincluir(item, achado.tipo)];
    } else if (e.tipo === "cancelada" && item.cancelada && achado.tipo === "atividade") {
      desfazer = ["Desfazer cancelamento", () => ev.restaurar(item)];
    }
    if (!desfazer) return linha;
    linha.append(el("button", { class: "mini", type: "button", onclick: async () => {
      if (!await confirmar(desfazer[0], "O que estava antes volta para as telas.", desfazer[0])) return;
      try { await ev.aplicar(desfazer[1]()); avisar("Desfeito."); }
      catch (x) { erro(x.message); }
    } }, desfazer[0]));
    return linha;
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
