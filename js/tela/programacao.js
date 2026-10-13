// Programação — a aba principal da planilha, no site.
//
// Todas as atividades numa lista só, em blocos por frota, com a Situação
// colorida na frente. O que muda de uma pergunta para outra é o recorte: a
// semana (o padrão: o que está feito e o que não está NESTA semana), tudo que
// está em aberto, só a carteira, ou tudo. E a faixa de situações no alto diz,
// em números, o que a grade mostra em cor — e filtra com um clique.
//
// A carteira deixou de ser uma tela à parte: na planilha ela é a situação "Na
// carteira", e aqui também. Programar várias de uma vez continua: marca e
// programa.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, brCurto, caixa, campo } from "../ui.js";
import { criarNova, programarEmLote, gravarOS, retirarDaProgramacao } from "./comum.js";
import { imprimirSemana, imprimirPorFrota, imprimirFrota, imprimirPorExecutante } from "./imprimir.js";
import { grade, faixaSituacoes, progresso, natural, repintarMantendoFoco } from "./grade.js";
import { busca as semAcento } from "../texto.js";

// O recorte sobrevive à troca de tela: voltar para a Programação depois de
// abrir a Semana não pode jogar fora o filtro que estava montado.
const estado = {
  periodo: "semana",              // semana | abertas | carteira | tudo
  ano: null, semana: null,
  situacoes: new Set(),
  frota: "", busca: "",
  agrupar: "frota",
  semOS: false,                   // só as em aberto que ainda não têm OS
};
const sel = new Set();

export async function montar(raiz, ctx, params) {
  const agora = M.semanaAtual();
  if (estado.semana == null) { estado.ano = agora.ano; estado.semana = agora.semana; }
  const pedido = params.get("m");
  if (pedido && ["semana", "abertas", "carteira", "tudo"].includes(pedido)) {
    estado.periodo = pedido;
    estado.situacoes.clear();
  }
  if (params.get("s")) { estado.semana = Number(params.get("s")); estado.ano = Number(params.get("a")) || agora.ano; }
  if (params.get("os") === "sem") estado.semOS = true;
  // Vindo dos Resultados: a situação e a frota em que ele clicou.
  if (params.get("sit")) { estado.periodo = "semana"; estado.situacoes = new Set([params.get("sit")]); }
  if (params.get("f") != null && params.get("f") !== "") estado.frota = params.get("f");

  const fBusca = el("input", { class: "busca", type: "search", value: estado.busca,
    placeholder: "frota, OS, atividade, executante…",
    oninput: () => { estado.busca = fBusca.value; pintarCorpo(); } });
  // A frota se PESQUISA: no tablet, rolar a lista inteira de frotas para achar
  // a F-969 era o gargalo. Digitar "969" já filtra; escolher na lista, ou
  // digitar o nome inteiro, mostra só aquela.
  const fFrota = el("input", { class: "busca-frota", type: "search", value: estado.frota,
    placeholder: "Frota", list: "dl-frotas-prog", autocomplete: "off", spellcheck: false,
    title: "Digite parte do número da frota — ex.: 969",
    oninput: () => { estado.frota = fFrota.value.trim(); pintarCorpo(); } });
  const dlFrota = el("datalist", { id: "dl-frotas-prog" });
  const rotSemana = el("b", {});
  // "Só sem OS": a fila do que falta lançar. Com ela ligada, a coluna OS vira
  // uma coluna de campos — digita, Enter, desce para a próxima.
  const bSemOS = el("button", { class: "fsit hoje filtro-os",
    title: "Mostrar só as em aberto que ainda não têm OS",
    onclick: () => { estado.semOS = !estado.semOS; pintarCorpo(); } });

  const botaoPeriodo = (id, rotulo) => el("button", {
    class: "seg-op", dataset: { p: id },
    onclick: () => { estado.periodo = id; estado.situacoes.clear(); pintar(); },
  }, rotulo);
  const periodos = el("div", { class: "segmentos" },
    el("span", { class: "seg-sem", dataset: { p: "semana" } },
      el("button", { class: "seg-op seta", title: "Semana anterior", onclick: () => andar(-1) }, "‹"),
      el("button", { class: "seg-op", dataset: { p: "semana" },
        onclick: () => { estado.periodo = "semana"; estado.situacoes.clear(); pintar(); } }, rotSemana),
      el("button", { class: "seg-op seta", title: "Próxima semana", onclick: () => andar(1) }, "›")),
    botaoPeriodo("abertas", "Em aberto"),
    botaoPeriodo("carteira", "Carteira"),
    botaoPeriodo("tudo", "Tudo"));

  // Imprimir: na semana, a semana inteira — uma folha por frota; nos outros
  // recortes, o que está na tela. Cada bloco de frota tem o seu botão.
  const bImprimir = el("button", { title: "Uma folha por frota, com as pendências em aberto",
    onclick: () => estado.periodo === "semana"
      ? imprimirSemana(estado.ano, estado.semana)
      : imprimirPorFrota(filtrar(doPeriodo()), rotuloRecorte()) });
  const rotuloRecorte = () => estado.periodo === "semana"
    ? (() => { const d = M.datasDaSemana(estado.ano, estado.semana);
      return `semana ${estado.semana} · ${brCurto(d[0])} a ${brCurto(d[4])}`; })()
    : estado.periodo === "carteira" ? "carteira" : "";
  const topoResumo = el("div", {});
  const barraSel = el("div", { class: "barra-sel", hidden: true });
  const corpo = el("div", {});

  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Programação"),
      periodos,
      el("div", { class: "espaco" }),
      bImprimir,
      el("button", { class: "discreto", title: "Folhas por executante, com a escolha de quem",
        onclick: () => imprimirPorExecutante({ frota: frotaExata(doPeriodo()) }) }, "Por executante"),
      pessoas.pode("programar")
        ? el("button", { class: "primario", onclick: () => criarNova(ctx,
          estado.periodo === "semana" ? { ano: estado.ano, semana: estado.semana } : {}) }, "+ Nova")
        : null),
    topoResumo,
    el("div", { class: "filtros" }, fBusca, fFrota, dlFrota, bSemOS,
      el("label", { class: "agrupar" }, "Agrupar por ",
        el("select", { onchange: e => { estado.agrupar = e.target.value; pintarCorpo(); } },
          el("option", { value: "frota", selected: estado.agrupar === "frota" }, "frota"),
          el("option", { value: "dia", selected: estado.agrupar === "dia" }, "dia"),
          el("option", { value: "", selected: estado.agrupar === "" }, "nada")))),
    barraSel, corpo);

  function andar(n) {
    let { ano, semana } = estado;
    semana += n;
    if (semana > 53) { semana = 1; ano++; }
    if (semana < 1) { semana = 52; ano--; }
    Object.assign(estado, { ano, semana, periodo: "semana" });
    estado.situacoes.clear();
    pintar();
  }

  // O recorte de período, antes dos filtros de situação, frota e busca.
  function doPeriodo() {
    const todas = ev.lista().filter(a => a.atividade || a.frota);
    switch (estado.periodo) {
      case "semana": return todas.filter(a => a.semana === estado.semana && a.ano === estado.ano);
      case "abertas": return todas.filter(M.aberta);
      case "carteira": return todas.filter(a => M.aberta(a) && !a.semana);
      default: return todas;
    }
  }

  // "F-969", "f969" e "969" são a mesma pesquisa.
  const chaveFrota = s => semAcento(String(s || "")).replace(/[^a-z0-9]/g, "");

  /** A frota digitada, quando ela é o nome inteiro de uma frota do recorte. */
  function frotaExata(base) {
    const q = chaveFrota(estado.frota);
    if (!q) return "";
    return base.map(a => a.frota).find(f => f && chaveFrota(f) === q) || "";
  }

  function filtrar(lista) {
    const q = semAcento(estado.busca.trim());
    const qf = chaveFrota(estado.frota);
    const exata = frotaExata(lista);
    return lista.filter(a => {
      if (estado.semOS && (a.os || !M.aberta(a))) return false;
      if (estado.situacoes.size && !estado.situacoes.has(M.situacaoDe(a))) return false;
      if (qf && (exata ? a.frota !== exata : !chaveFrota(a.frota).includes(qf))) return false;
      if (q) {
        const alvo = semAcento([a.frota, a.os, (a.os_outras || []).join(" "), a.servico,
          a.atividade, a.cliente, a.obs, a.motivo, (a.executantes || []).join(" ")].join(" "));
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }

  function pintarPeriodo() {
    rotSemana.textContent = `Semana ${estado.semana}`;
    bImprimir.textContent = estado.periodo === "semana" ? `Imprimir semana ${estado.semana}` : "Imprimir";
    for (const b of periodos.querySelectorAll("[data-p]")) {
      b.classList.toggle("on", b.dataset.p === estado.periodo);
    }
  }

  function pintarResumo(base) {
    limpar(topoResumo);
    const vivas = base.filter(a => !a.cancelada);
    const feitas = vivas.filter(M.feita).length;
    let titulo;
    if (estado.periodo === "semana") {
      const d = M.datasDaSemana(estado.ano, estado.semana);
      const r = M.resultados(ev.lista(), estado.ano, estado.semana);
      const pc = v => v == null ? "—" : Math.round(v * 100) + "%";
      titulo = progresso(`Semana ${estado.semana} · ${brCurto(d[0])} a ${brCurto(d[6])}`,
        feitas, vivas.length,
        ` · aderência ao plano ${pc(r.aderencia)} (${r.concluidas_plano} de ${r.plano})` +
        ` · cumprimento geral ${pc(r.cumprimento)} (${r.concluidas} de ${r.total})` +
        " — só oficina interna, como a planilha");
    } else if (estado.periodo === "tudo") {
      titulo = progresso("Todo o acervo", feitas, vivas.length);
    } else {
      titulo = el("div", { class: "progresso so-texto" },
        el("div", { class: "p-num" }, String(vivas.length)),
        el("div", { class: "p-meio" },
          el("div", { class: "p-tit" }, estado.periodo === "carteira"
            ? "em carteira — em aberto, sem semana" : "em aberto, em todas as semanas")));
    }
    topoResumo.append(titulo, faixaSituacoes(base, undefined, estado.situacoes, pintarCorpo));
  }

  function pintarBarraSel() {
    limpar(barraSel);
    // Só o que ainda existe e está em aberto conta: uma marcada que alguém
    // concluiu em outro aparelho não pode ir junto para a semana.
    for (const id of [...sel]) { const a = ev.porId(id); if (!a || !M.aberta(a)) sel.delete(id); }
    barraSel.hidden = !sel.size;
    if (!sel.size) return;
    barraSel.append(...[
      el("b", {}, `${sel.size} marcada${sel.size === 1 ? "" : "s"}`),
      el("div", { class: "espaco" }),
      el("button", { onclick: () => { sel.clear(); pintarCorpo(); } }, "Desmarcar"),
      el("button", { onclick: async () => {
        const alvos = [...sel].map(id => ev.porId(id)).filter(Boolean);
        const eOS = el("input", { inputmode: "numeric", placeholder: "ex.: 022475" });
        const r = await caixa({
          titulo: `Mesma OS para ${alvos.length} atividade${alvos.length === 1 ? "" : "s"}`,
          corpo: el("div", {},
            el("p", { style: "font-size:13px;color:var(--fraco)" },
              "Uma OS do Protheus pode cobrir várias atividades. A OS digitada vai para ",
              "todas as marcadas — inclusive as que já tinham outra, que é trocada."),
            campo("OS", eOS)),
          acoes: [{ rotulo: "Cancelar", valor: false },
            { rotulo: "Gravar", classe: "primario", valor: true }],
        });
        if (r !== true) return;
        if (await gravarOS(alvos, eOS.value)) sel.clear();
      } }, "Mesma OS"),
      [...sel].some(id => ev.porId(id)?.semana != null)
        ? el("button", { title: "Voltam para a carteira, sem semana — um motivo para todas",
          onclick: async () => {
            const alvos = [...sel].map(id => ev.porId(id)).filter(Boolean);
            if (await retirarDaProgramacao(alvos)) sel.clear();
          } }, "Retirar da programação")
        : null,
      el("button", { class: "primario", onclick: async () => {
        const alvos = [...sel].map(id => ev.porId(id)).filter(Boolean);
        if (await programarEmLote(alvos)) sel.clear();
      } }, "Programar")].filter(Boolean));
  }

  function opcoesFrota(base) {
    limpar(dlFrota);
    const lista = [...new Set(base.map(a => a.frota).filter(Boolean))].sort(natural);
    for (const f of lista) dlFrota.append(el("option", { value: f }));
    // Quem chega por um link (Resultados → frota) vê a frota escrita no campo;
    // quem está digitando não tem o texto trocado por baixo dos dedos.
    if (document.activeElement !== fFrota && fFrota.value !== estado.frota) fFrota.value = estado.frota;
  }

  function pintarCorpo() {
    const base = doPeriodo();
    pintarResumo(base);
    const faltam = base.filter(a => !a.os && M.aberta(a)).length;
    bSemOS.textContent = "";
    bSemOS.append(el("b", {}, String(faltam)), " sem OS");
    bSemOS.classList.toggle("on", estado.semOS);
    bSemOS.hidden = !faltam && !estado.semOS;
    const itens = filtrar(base);
    repintarMantendoFoco(corpo, () => { limpar(corpo); corpo.append(grade(itens, {
      ctx, agrupar: estado.agrupar || null,
      datas: estado.periodo === "semana" ? M.datasDaSemana(estado.ano, estado.semana) : null,
      selecao: pessoas.pode("programar") ? sel : null,
      imprimirBloco: (frota, lista) => imprimirFrota(frota, lista, rotuloRecorte()),
      aoSelecionar: tudo => (tudo ? pintarCorpo() : pintarBarraSel()),
      vazioTexto: estado.semOS ? "Todas as atividades em aberto deste recorte já têm OS."
        : estado.periodo === "semana"
        ? `Nada na semana ${estado.semana} com estes filtros.`
        : "Nada aqui com estes filtros.",
    })); });
    pintarBarraSel();
  }

  function pintar() {
    pintarPeriodo();
    opcoesFrota(doPeriodo());
    pintarCorpo();
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
