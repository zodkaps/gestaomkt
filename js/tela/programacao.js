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
import { criarNova, frotas, programarEmLote, gravarOS } from "./comum.js";
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
  const fFrota = el("select", { onchange: () => { estado.frota = fFrota.value; pintarCorpo(); } });
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

  const topoResumo = el("div", {});
  const barraSel = el("div", { class: "barra-sel", hidden: true });
  const corpo = el("div", {});

  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Programação"),
      periodos,
      el("div", { class: "espaco" }),
      pessoas.pode("programar")
        ? el("button", { class: "primario", onclick: () => criarNova(ctx,
          estado.periodo === "semana" ? { ano: estado.ano, semana: estado.semana } : {}) }, "+ Nova")
        : null),
    topoResumo,
    el("div", { class: "filtros" }, fBusca, fFrota, bSemOS,
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

  function filtrar(lista) {
    const q = semAcento(estado.busca.trim());
    return lista.filter(a => {
      if (estado.semOS && (a.os || !M.aberta(a))) return false;
      if (estado.situacoes.size && !estado.situacoes.has(M.situacaoDe(a))) return false;
      if (estado.frota && a.frota !== estado.frota) return false;
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
            ? "na carteira — em aberto, sem semana" : "em aberto, em todas as semanas")));
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
    barraSel.append(
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
      el("button", { class: "primario", onclick: async () => {
        const alvos = [...sel].map(id => ev.porId(id)).filter(Boolean);
        if (await programarEmLote(alvos)) sel.clear();
      } }, "Programar"));
  }

  function opcoesFrota(base) {
    const antes = estado.frota;
    limpar(fFrota);
    fFrota.append(el("option", { value: "" }, "Frota: todas"));
    const lista = [...new Set(base.map(a => a.frota).filter(Boolean))].sort(natural);
    if (antes && !lista.includes(antes)) lista.unshift(antes);
    for (const f of lista) fFrota.append(el("option", { value: f, selected: f === antes }, f));
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
      aoSelecionar: tudo => (tudo ? pintarCorpo() : pintarBarraSel()),
      vazioTexto: estado.semOS ? "Todas as em aberto deste recorte já têm OS. 👍"
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
