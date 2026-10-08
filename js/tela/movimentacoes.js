// Movimentação de frota: a oficina pede, a operação entrega.
//
// Os números da planilha dizem por que esta tela existe: 51 pedidos, 17 no
// prazo contra 14 com atraso, 16 ainda sem voltar, e dezenas de dias em que a
// frota ficou fora além do prometido. Cada um desses dias é um dia em que a
// oficina não pôde trabalhar nela — e até agora isso só existia como uma coluna
// digitada à mão, que podia discordar das datas ao lado.
//
// Aqui a situação é CALCULADA das datas. A data é o fato; a palavra era opinião.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, br, brCurto, chip, caixa, campo, selecao, comSugestoes,
  avisar, erro, confirmar, vazio, cartaoNumero, medidor, tabela, listaDupla } from "../ui.js";
import { secao, frotas, valoresDe } from "./comum.js";
import { busca as semAcento } from "../texto.js";

// ── cartão ──────────────────────────────────────────────────────────────────

export function cartaoMov(m, ctx, { acoes = [], compacto = false } = {}) {
  const s = M.situacaoMovimentacao(m);
  const atraso = M.atrasoMovimentacao(m);
  const tags = [chip(s, M.corDe(s))];
  if (atraso > 0) tags.push(chip(`${atraso} dia${atraso === 1 ? "" : "s"} de atraso`, "vencida"));
  if (m.quem_prometeu && m.quem_prometeu !== "Operação") tags.push(chip(m.quem_prometeu));

  const sub = [];
  if (m.para_que) sub.push(m.para_que);
  if (m.pedida_em) sub.push("pedida " + brCurto(m.pedida_em));
  if (m.prometida_para) sub.push("prometida " + brCurto(m.prometida_para));
  if (m.chegou_em) sub.push("chegou " + brCurto(m.chegou_em));

  return el("div", { class: `at ${M.corDe(s)}${m.chegou_em ? " feito" : ""}` },
    el("div", { class: "meio", style: "cursor:pointer",
      onclick: () => abrirFichaMov(m.id, ctx) },
      el("div", { class: "tit" }, `${m.frota} · ${m.destino || "—"}`),
      sub.length ? el("div", { class: "sub" }, sub.join(" · ")) : null,
      el("div", { class: "tags" }, tags)),
    acoes.length ? el("div", { class: "acoes" }, acoes) : null);
}

// ── ações ───────────────────────────────────────────────────────────────────

export async function novaMovimentacao(ctx, sugestao = {}) {
  const eFrota = el("input", { value: sugestao.frota || "" });
  const eDestino = el("input", { placeholder: "Para onde / qual fornecedor" });
  const eParaQue = el("input", { placeholder: "Para quê" });
  const ePedida = el("input", { type: "date", value: M.hoje() });
  const ePrometida = el("input", { type: "date" });
  const eQuem = selecao(["Operação", "Makro Engenharia", "Terceiro", "Manutenção"], "Operação");

  const r = await caixa({
    titulo: "Pedir movimentação",
    corpo: el("div", {},
      el("div", { class: "dupla" },
        campo("Frota", comSugestoes(eFrota, frotas(), "dl-mov-frota")),
        campo("Para quê", eParaQue)),
      campo("Destino / fornecedor",
        comSugestoes(eDestino, valoresDe("destino", "movimentacao"), "dl-mov-dest")),
      el("div", { class: "tripla" },
        campo("Pedida em", ePedida),
        campo("Prometida para", ePrometida),
        campo("Quem prometeu", eQuem))),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Pedir", classe: "primario", valor: true }],
  });
  if (r !== true) return null;
  if (!eFrota.value.trim()) { erro("Falta a frota."); return null; }

  try {
    const [criado] = await ev.aplicar(ev.pedirMovimentacao({
      frota: eFrota.value.trim(),
      destino: eDestino.value.trim(),
      para_que: eParaQue.value.trim(),
      pedida_em: ePedida.value,
      prometida_para: ePrometida.value,
      quem_prometeu: eQuem.value,
    }));
    avisar("Movimentação registrada.");
    ctx && ctx.atualizar();
    return criado.alvo;
  } catch (e) { erro(e.message); return null; }
}

export async function apontarChegada(m, ctx) {
  const eData = el("input", { type: "date", value: M.hoje() });
  const prometida = m.prometida_para;
  const r = await caixa({
    titulo: "A frota voltou",
    corpo: el("div", {},
      el("p", {}, el("b", {}, m.frota), " · ", m.destino || "—",
        m.para_que ? ` — ${m.para_que}` : ""),
      prometida
        ? el("p", { class: "nada" }, `Estava prometida para ${br(prometida)}.`)
        : el("p", { class: "nada" }, "Não tinha data prometida."),
      campo("Chegou em", eData)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Confirmar", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  try {
    await ev.aplicar(ev.chegou(m, eData.value));
    const atraso = prometida ? Math.max(0, M.difDias(prometida, eData.value) || 0) : 0;
    avisar(atraso ? `${m.frota} voltou com ${atraso} dia(s) de atraso.`
      : `${m.frota} voltou no prazo.`);
    ctx && ctx.atualizar();
    return true;
  } catch (e) { erro(e.message); return false; }
}

export async function prometerData(m, ctx) {
  const eData = el("input", { type: "date", value: m.prometida_para || M.hoje() });
  const eQuem = selecao(["Operação", "Makro Engenharia", "Terceiro", "Manutenção"],
    m.quem_prometeu || "Operação");
  const r = await caixa({
    titulo: m.prometida_para ? "Mudar a promessa" : "Prometer data",
    corpo: el("div", {},
      el("p", {}, el("b", {}, m.frota), " · ", m.destino || "—"),
      campo("Prometida para", eData),
      campo("Quem prometeu", eQuem)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Gravar", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  try {
    await ev.aplicar(ev.prometer(m, eData.value, eQuem.value));
    avisar("Promessa registrada.");
    ctx && ctx.atualizar();
    return true;
  } catch (e) { erro(e.message); return false; }
}

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
      linha("Destino", m.destino),
      linha("Para quê", m.para_que),
      linha("Pedida em", m.pedida_em ? br(m.pedida_em) : null),
      linha("Prometida para", m.prometida_para ? br(m.prometida_para) : null),
      linha("Chegou em", m.chegou_em ? br(m.chegou_em) : null),
      linha("Atraso", atraso ? `${atraso} dia(s)` : null),
      linha("Quem prometeu", m.quem_prometeu),
      linha("Observação", m.obs)),
    el("h2", { class: "mini" }, `Registro · ${hist.length}`),
    el("div", {}, hist.map(e => el("div", { class: "evento" },
      el("div", { class: "qdo" }, e.ts.slice(8, 10) + "/" + e.ts.slice(5, 7)),
      el("div", { class: "oq" },
        el("b", {}, e.autor || "—"), " — ",
        ({ criada: "pediu a movimentação", importada: "veio da planilha",
          mov_prometida: `prometeu para ${br((e.dados || {}).para)}`,
          mov_chegou: `apontou a chegada em ${br((e.dados || {}).em)}`,
          mov_cancelada: "cancelou", editada: "editou" })[e.tipo] || e.tipo,
        e.motivo ? el("div", { class: "mot" }, "motivo: " + e.motivo) : null)))));

  const acoes = [];
  if (!m.chegou_em && !m.cancelada) {
    acoes.push({ rotulo: "Chegou", classe: "primario", acao: async () => { await apontarChegada(m, ctx); } });
    acoes.push({ rotulo: m.prometida_para ? "Mudar promessa" : "Prometer", acao: async () => { await prometerData(m, ctx); } });
    acoes.push({ rotulo: "Cancelar movimentação", classe: "perigo", acao: async () => {
      const e = el("input", { placeholder: "Por quê" });
      const ok = await caixa({ titulo: "Cancelar movimentação",
        corpo: campo("Motivo", e),
        acoes: [{ rotulo: "Voltar", valor: false }, { rotulo: "Cancelar", classe: "perigo", valor: true }] });
      if (ok !== true) return;
      try { await ev.aplicar(ev.cancelarMovimentacao(m, e.value)); avisar("Cancelada."); ctx && ctx.atualizar(); }
      catch (x) { erro(x.message); }
    } });
  }
  await caixa({ titulo: m.frota || "Movimentação", corpo, acoes, largura: "600px" });
}

// ── a tela ──────────────────────────────────────────────────────────────────

export async function montar(raiz, ctx, params) {
  let aba = params.get("v") || "abertas";

  const fBusca = el("input", { class: "busca", type: "search",
    placeholder: "frota, destino, para quê…", oninput: pintar });
  const fAba = selecao([{ v: "abertas", t: "Fora agora" },
    { v: "tudo", t: "Todas" }, { v: "entregues", t: "Já voltaram" }],
    aba, { onchange: () => { aba = fAba.value; pintar(); } });

  const corpo = el("div", {});
  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Movimentações"),
      el("div", { class: "espaco" }),
      el("button", { class: "primario", onclick: () => novaMovimentacao(ctx) }, "+ Pedir")),
    el("div", { class: "filtros" }, fBusca, fAba),
    corpo);

  function pintar() {
    limpar(corpo);
    const hoje = M.hoje();
    const todas = ev.lista("movimentacao");
    const pt = M.pontualidade(todas, hoje);

    corpo.append(el("div", { class: "paineis", style: "margin-bottom:16px" },
      el("div", { class: "painel" },
        el("h2", {}, "Pontualidade da operação"),
        medidor(pt.pct, `${pt.no_prazo} de ${pt.entregues} entregas no prazo`),
        el("div", { class: "numeros", style: "margin-top:12px" },
          cartaoNumero(pt.atrasadas, "passaram do prometido", "", pt.atrasadas ? "alerta" : ""),
          cartaoNumero(pt.aguardando, "aguardando"),
          cartaoNumero(String(pt.atraso_medio).replace(".", ","), "dias de atraso médio"),
          cartaoNumero(pt.dias_perdidos, "dias de frota perdidos", "além do prometido",
            pt.dias_perdidos ? "alerta" : "")),
        el("p", { class: "obs" },
          "Dia perdido é dia em que a frota ficou fora depois da data prometida — " +
          "tempo em que a oficina não pôde trabalhar nela. Conta também o que " +
          "ainda não voltou, porque o buraco não para de crescer enquanto se espera."))));

    const q = semAcento(fBusca.value.trim());
    let itens = todas.filter(m => {
      if (aba === "abertas" && !M.movimentacaoAberta(m)) return false;
      if (aba === "entregues" && !m.chegou_em) return false;
      if (q && !semAcento([m.frota, m.destino, m.para_que, m.quem_prometeu].join(" ")).includes(q)) return false;
      return true;
    });

    const ordem = { ATRASADA: 0, "Chega hoje": 1, Aguardando: 2 };
    itens.sort((a, b) =>
      (ordem[M.situacaoMovimentacao(a, hoje)] ?? 9) - (ordem[M.situacaoMovimentacao(b, hoje)] ?? 9) ||
      String(a.prometida_para || "9999").localeCompare(String(b.prometida_para || "9999")) ||
      String(b.chegou_em || "").localeCompare(String(a.chegou_em || "")));

    if (!itens.length) { corpo.append(vazio("Nada aqui.")); return; }

    const botao = m => M.movimentacaoAberta(m) && pessoas.pode("movimentar")
      ? el("button", { class: "primario",
        onclick: e => { e.stopPropagation(); apontarChegada(m, ctx); } }, "Chegou")
      : null;

    const emTabela = tabela(itens, [
      { rot: "Frota", principal: true, largura: "88px", val: m => m.frota },
      { rot: "Destino / fornecedor", val: m => m.destino || el("span", { class: "seg" }, "—") },
      { rot: "Para quê", val: m => m.para_que || el("span", { class: "seg" }, "—") },
      { rot: "Pedida", largura: "80px", val: m => brCurto(m.pedida_em), chave: m => m.pedida_em || "" },
      { rot: "Prometida", largura: "88px", val: m => brCurto(m.prometida_para), chave: m => m.prometida_para || "" },
      { rot: "Chegou", largura: "80px", val: m => brCurto(m.chegou_em), chave: m => m.chegou_em || "" },
      { rot: "Atraso", num: true, largura: "68px",
        val: m => { const d = M.atrasoMovimentacao(m); return d ? `${d}d` : el("span", { class: "seg" }, "—"); },
        chave: m => M.atrasoMovimentacao(m) },
      { rot: "Situação", largura: "132px", val: m => M.situacaoMovimentacao(m) },
      { rot: "", largura: "92px", val: m => botao(m) },
    ], {
      aoClicar: m => abrirFichaMov(m.id, ctx),
      classeDaLinha: m => M.corDe(M.situacaoMovimentacao(m)),
    });

    const emCartoes = el("div", { class: "lista" },
      itens.map(m => cartaoMov(m, ctx, { acoes: [botao(m)].filter(Boolean) })));

    corpo.append(secao(aba === "abertas" ? "Fora agora" : aba === "entregues" ? "Já voltaram" : "Todas",
      listaDupla(emTabela, emCartoes), itens.length));
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
