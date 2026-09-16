// A carteira: tudo que ainda não tem semana.
//
// É a maior parte do acervo — 619 das 867 na carga inicial — e é de onde a
// programação sai. Por isso a tela é feita para uma coisa só: filtrar, marcar
// várias e jogar para uma semana de uma vez.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, caixa, campo, selecao, comSugestoes, avisar, erro, vazio } from "../ui.js";
import { cartao, secao, criarNova, frotas, executantes, valoresDe } from "./comum.js";
import { busca as semAcento } from "../texto.js";

export async function montar(raiz, ctx, params) {
  const sel = new Set();
  let modo = params.get("m") || "carteira";

  const fBusca = el("input", { class: "busca", type: "search",
    placeholder: "frota, OS, serviço…", oninput: pintar });
  const fFrota = el("select", { onchange: pintar });
  const fCliente = el("select", { onchange: pintar });
  const fTipo = el("select", { onchange: pintar });
  const fPri = selecao([{ v: "", t: "Prioridade: todas" }, "P1", "P2", "P3"], "", { onchange: pintar });
  const fOS = selecao([{ v: "", t: "OS: tanto faz" }, { v: "com", t: "Com OS" },
    { v: "sem", t: "Sem OS" }], "", { onchange: pintar });
  const fModo = selecao([{ v: "carteira", t: "Só a carteira" },
    { v: "abertas", t: "Todas em aberto" }, { v: "tudo", t: "Tudo, inclusive fechadas" }],
    modo, { onchange: () => { modo = fModo.value; pintar(); } });

  const barra = el("div", { class: "cabec", style: "display:none" });
  const corpo = el("div", {});
  const contagem = el("span", { class: "sub" });

  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Carteira"), contagem,
      el("div", { class: "espaco" }),
      el("button", { class: "primario", onclick: () => criarNova(ctx) }, "+ Nova")),
    el("div", { class: "filtros" }, fBusca, fFrota, fCliente, fTipo, fPri, fOS, fModo),
    barra, corpo);

  function opcoes(sel, rotulo, valores) {
    const antes = sel.value;
    limpar(sel);
    sel.append(el("option", { value: "" }, rotulo));
    for (const v of valores) sel.append(el("option", { value: v, selected: v === antes }, v));
  }

  function filtrar() {
    const q = semAcento(fBusca.value.trim());
    return ev.lista().filter(a => {
      if (modo === "carteira" && (a.semana || a.concluida_em || a.cancelada)) return false;
      if (modo === "abertas" && (a.concluida_em || a.cancelada)) return false;
      if (fFrota.value && a.frota !== fFrota.value) return false;
      if (fCliente.value && a.cliente !== fCliente.value) return false;
      if (fTipo.value && a.tipo !== fTipo.value) return false;
      if (fPri.value && a.prioridade !== fPri.value) return false;
      if (fOS.value === "com" && !a.os) return false;
      if (fOS.value === "sem" && a.os) return false;
      if (q) {
        const alvo = semAcento([a.frota, a.os, a.os_outras.join(" "), a.servico,
          a.atividade, a.cliente, a.obs, (a.executantes || []).join(" ")].join(" "));
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }

  function pintar() {
    opcoes(fFrota, "Frota: todas", frotas());
    opcoes(fCliente, "Cliente: todos", valoresDe("cliente"));
    opcoes(fTipo, "Tipo: todos", valoresDe("tipo"));

    const itens = filtrar().sort(ordenar);
    contagem.textContent = `${itens.length} atividade${itens.length === 1 ? "" : "s"}`;

    limpar(corpo);
    if (!itens.length) {
      corpo.append(vazio("Nada aqui com esses filtros."));
      pintarBarra();
      return;
    }

    // Agrupado por cliente e frota: é como a oficina pensa — o caminhão inteiro
    // entra na oficina, não a atividade solta.
    let clienteAtual = null, frotaAtual = null, lista = null;
    for (const a of itens) {
      const cli = a.cliente || "Sem cliente";
      if (cli !== clienteAtual) {
        clienteAtual = cli; frotaAtual = null;
        corpo.append(el("h2", { style: "font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--fraco);margin:18px 0 6px" }, cli));
      }
      if (a.frota !== frotaAtual) {
        frotaAtual = a.frota;
        const n = itens.filter(x => x.frota === frotaAtual && (x.cliente || "Sem cliente") === cli).length;
        corpo.append(el("div", { style: "display:flex;align-items:center;gap:8px;margin:10px 0 5px" },
          el("b", { style: "font-size:14px" }, a.frota || "Sem frota"),
          el("span", { class: "chip" }, `${n}`),
          el("button", { class: "discreto", onclick: () => marcarFrota(cli, frotaAtual) }, "marcar todas")));
        lista = el("div", { class: "lista" });
        corpo.append(lista);
      }
      lista.append(cartao(a, { ctx, compacto: true, seletor: caixinha(a) }));
    }
    pintarBarra();
  }

  function caixinha(a) {
    return el("input", { type: "checkbox", style: "width:20px;height:20px;flex:0 0 auto;margin-top:2px",
      checked: sel.has(a.id),
      onchange: e => { e.target.checked ? sel.add(a.id) : sel.delete(a.id); pintarBarra(); } });
  }

  function marcarFrota(cliente, frota) {
    for (const a of filtrar()) {
      if (a.frota === frota && (a.cliente || "Sem cliente") === cliente) sel.add(a.id);
    }
    pintar();
  }

  function pintarBarra() {
    limpar(barra);
    if (!sel.size) { barra.style.display = "none"; return; }
    barra.style.display = "";
    barra.append(
      el("b", {}, `${sel.size} marcada${sel.size === 1 ? "" : "s"}`),
      el("div", { class: "espaco" }),
      el("button", { onclick: () => { sel.clear(); pintar(); } }, "Desmarcar"),
      el("button", { class: "primario", onclick: programarLote }, "Programar"));
  }

  async function programarLote() {
    const ids = [...sel];
    const alvos = ids.map(i => ev.porId(i)).filter(Boolean);
    const jaProgramadas = alvos.filter(a => a.semana != null);
    const agora = M.semanaAtual();

    const eSemana = el("input", { type: "number", min: 1, max: 53, value: agora.semana });
    const eAno = el("input", { type: "number", min: 2020, max: 2100, value: agora.ano });
    const eDia = selecao([{ v: "", t: "— sem dia —" }, ...M.DIAS], "");
    const eDias = el("input", { type: "number", min: 1, max: 30, value: 1 });
    const eExec = el("input", { placeholder: "separe por vírgula" });
    const eMotivo = el("input", { placeholder: "Por que mudaram de semana" });

    const r = await caixa({
      titulo: `Programar ${alvos.length} atividade${alvos.length === 1 ? "" : "s"}`,
      corpo: el("div", {},
        el("div", { class: "tripla" },
          campo("Semana", eSemana), campo("Ano", eAno), campo("Dia", eDia)),
        campo("Duração em dias", eDias),
        campo("Executantes", comSugestoes(eExec, executantes(), "dl-exec-lote"),
          "Deixe vazio para não mexer em quem já está nas atividades."),
        jaProgramadas.length
          ? campo(`Motivo — ${jaProgramadas.length} já tinha${jaProgramadas.length === 1 ? "" : "m"} semana`,
            eMotivo, "Para essas é reprogramação, e reprogramação sem motivo o sistema recusa.")
          : null),
      acoes: [{ rotulo: "Cancelar", valor: false },
        { rotulo: "Programar", classe: "primario", valor: true }],
    });
    if (r !== true) return;

    const para = {
      ano: Number(eAno.value) || agora.ano,
      semana: Number(eSemana.value) || agora.semana,
      dia: eDia.value,
      dias: Number(eDias.value) || 1,
    };
    const equipe = eExec.value.split(",").map(s => s.trim()).filter(Boolean);

    const eventos = [];
    try {
      for (const a of alvos) {
        const e = ev.reprogramar(a, { ...para, dias: para.dias }, eMotivo.value.trim());
        if (e) eventos.push(e);
        if (equipe.length) {
          const ed = ev.editar(a, { executantes: equipe });
          if (ed) eventos.push(ed);
        }
      }
    } catch (e) { return erro(e.message); }

    if (!eventos.length) { avisar("Nada mudou."); return; }
    await ev.aplicar(eventos);
    sel.clear();
    avisar(`${alvos.length} para a semana ${para.semana}.`);
    ctx.atualizar();
  }

  function ordenar(x, y) {
    const pr = a => ({ P1: 0, P2: 1, P3: 2 })[a.prioridade] ?? 3;
    return String(x.cliente || "zzz").localeCompare(String(y.cliente || "zzz"), "pt-BR") ||
      String(x.frota).localeCompare(String(y.frota), "pt-BR") ||
      pr(x) - pr(y) ||
      String(x.servico).localeCompare(String(y.servico), "pt-BR");
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
