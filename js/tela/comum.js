// O cartão de atividade e a ficha — o que toda tela usa.
//
// Existe um lugar só onde uma atividade é desenhada e um lugar só onde ela é
// alterada. É o que impede a tela Hoje e a tela Semana de discordarem sobre o
// que significa "concluir".

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, br, brCurto, quando, caixa, campo, selecao, comSugestoes, chip,
  avisar, erro, confirmar, vazio, cliqueLimpo } from "../ui.js";

// ── listas que o próprio acervo alimenta ────────────────────────────────────
// Nada aqui é cadastro: a lista de executantes é quem já apareceu em alguma
// atividade. Cadastro separado envelhece e passa a mentir.

export function valoresDe(campoNome, tipo = "atividade") {
  const s = new Set();
  for (const a of ev.lista(tipo)) {
    if (campoNome === "executantes") (a.executantes || []).forEach(x => x && s.add(x));
    else if (a[campoNome]) s.add(a[campoNome]);
  }
  return [...s].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}

export function frotas() { return valoresDe("frota"); }
export function executantes() { return valoresDe("executantes"); }

// ── cartão ──────────────────────────────────────────────────────────────────

export function cartao(a, { ctx, acoes = [], seletor = null, compacto = false } = {}) {
  const s = M.situacaoDe(a);
  const cor = M.corDe(s);
  const tags = [];

  // A situação aparece sempre, em todo cartão: é o que se quer ver numa olhada.
  tags.push(chip(s, cor));
  if (a.os) tags.push(chip("OS " + a.os + (a.os_outras.length ? ` +${a.os_outras.length}` : ""), "os"));
  else if (M.aberta(a)) tags.push(chip("sem OS", "semos"));
  // Prioridade só no cartão completo: na lista ela aparece em quase toda linha
  // e vira ruído — na planilha a coluna é oculta.
  if (!compacto && a.prioridade) tags.push(chip(a.prioridade, a.prioridade === "P1" ? "p1" : ""));
  if (a.origem === "Extra") tags.push(chip("Extra"));
  if (a.reprogramacoes > 0) tags.push(chip(`reprogramada ${a.reprogramacoes}×`, "reprog"));
  if (a.oficina === "Terceirizada") tags.push(chip("terceirizada"));
  if (!compacto && a.tipo && a.tipo !== "Corretiva") tags.push(chip(a.tipo));

  const sub = [];
  if (a.servico && a.servico !== a.atividade) sub.push(a.servico);
  if ((a.executantes || []).length) sub.push(a.executantes.join(" e "));
  if (a.semana && !compacto) sub.push(`sem ${a.semana} · ${a.dia || "sem dia"}`);
  if (a.concluida_em) sub.push("feita em " + br(a.concluida_em));
  else if (a.feita_sem_data) sub.push("feita — falta a data");
  else if (a.semana && M.prazoDe(a)) sub.push("prazo " + brCurto(M.prazoDe(a)));

  const n = el("div", {
    class: `at ${cor}${M.feita(a) ? " feito" : ""}`,
    dataset: { id: a.id },
  },
    seletor,
    el("div", { class: "meio", onclick: cliqueLimpo(() => abrirFicha(a.id, ctx)),
      style: "cursor:pointer" },
      el("div", { class: "tit" }, (a.frota ? a.frota + " · " : "") + (a.atividade || "—")),
      sub.length ? el("div", { class: "sub" }, sub.join(" · ")) : null,
      tags.length ? el("div", { class: "tags" }, tags) : null),
    acoes.length ? el("div", { class: "acoes" }, acoes) : null);
  return n;
}

export function botaoConcluir(a, ctx) {
  return el("button", {
    class: "primario",
    onclick: async e => { e.stopPropagation(); await concluir(a, ctx); },
  }, "Concluir");
}

// ── as operações ────────────────────────────────────────────────────────────

export async function concluir(a, ctx, quandoPadrao) {
  const entrada = el("input", { type: "date", value: quandoPadrao || M.hoje() });
  const r = await caixa({
    titulo: "Dar baixa",
    corpo: el("div", {},
      el("p", {}, el("b", {}, a.frota), " · ", a.atividade),
      campo("Concluída em", entrada,
        "O dia em que o serviço saiu. É por esta data que a aderência conta — " +
        "marcar sem datar deixa o serviço fechado na tela e invisível no número.")),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Confirmar baixa", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  if (!entrada.value) { erro("Falta a data."); return false; }
  await ev.aplicar(ev.concluir(a, entrada.value));
  avisar(`${a.frota} · baixa em ${br(entrada.value)}`);
  return true;
}

export async function reprogramar(a, ctx, sugestao = {}) {
  const jaEstava = a.semana != null;
  const sem = M.semanaAtual();
  const entradaSemana = el("input", { type: "number", min: 1, max: 53,
    value: sugestao.semana ?? a.semana ?? sem.semana });
  const entradaAno = el("input", { type: "number", min: 2020, max: 2100,
    value: sugestao.ano ?? a.ano ?? sem.ano });
  const entradaDia = selecao([{ v: "", t: "— sem dia —" }, ...M.DIAS],
    sugestao.dia ?? a.dia ?? "");
  const entradaDias = el("input", { type: "number", min: 1, max: 30,
    value: sugestao.dias ?? a.dias ?? 1 });
  const entradaHH = el("input", { type: "number", step: "0.5", min: "0",
    value: sugestao.hh ?? a.hh ?? 0 });
  const entradaMotivo = selecao([{ v: "", t: "— escolha —" }, ...M.MOTIVOS], "");
  const entradaOutro = el("input", { type: "text", placeholder: "Escreva o motivo" });
  const linhaOutro = campo("Qual?", entradaOutro);
  linhaOutro.style.display = "none";
  entradaMotivo.addEventListener("change", () => {
    linhaOutro.style.display = entradaMotivo.value === "Outro" ? "" : "none";
    if (entradaMotivo.value === "Outro") entradaOutro.focus();
  });

  const r = await caixa({
    titulo: jaEstava ? "Reprogramar" : "Programar",
    corpo: el("div", {},
      el("p", {}, el("b", {}, a.frota), " · ", a.atividade),
      jaEstava ? el("p", { class: "nada" },
        `Hoje está na semana ${a.semana}, ${a.dia || "sem dia"}.`) : null,
      el("div", { class: "tripla" },
        campo("Semana", entradaSemana), campo("Ano", entradaAno), campo("Dia", entradaDia)),
      el("div", { class: "dupla" },
        campo("Duração em dias", entradaDias),
        campo("HH previsto", entradaHH, "horas × pessoas")),
      jaEstava ? campo("Motivo da mudança", entradaMotivo,
        "Obrigatório. É este campo que transforma um empurrão em número — " +
        "sem ele não dá para dizer por que a semana não fechou.") : null,
      jaEstava ? linhaOutro : null),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: jaEstava ? "Reprogramar" : "Programar", classe: "primario", valor: true }],
  });
  if (r !== true) return false;

  const motivo = entradaMotivo.value === "Outro"
    ? entradaOutro.value.trim() : entradaMotivo.value;
  const para = {
    ano: Number(entradaAno.value) || null,
    semana: Number(entradaSemana.value) || null,
    dia: entradaDia.value,
    dias: Number(entradaDias.value) || 1,
    hh: Number(entradaHH.value) || 0,
  };
  try {
    const e = ev.reprogramar(a, para, motivo);
    if (!e) { avisar("Nada mudou."); return false; }
    await ev.aplicar(e);
  } catch (erroMotivo) { erro(erroMotivo.message); return false; }
  avisar(`${a.frota} · semana ${para.semana}${para.dia ? " · " + para.dia : ""}`);
  return true;
}

export async function devolverParaCarteira(a, ctx) {
  const entradaMotivo = selecao([{ v: "", t: "— escolha —" }, ...M.MOTIVOS], "");
  const entradaOutro = el("input", { type: "text", placeholder: "Escreva o motivo" });
  const r = await caixa({
    titulo: "Tirar da semana",
    corpo: el("div", {},
      el("p", {}, "A atividade volta para a carteira, sem semana e sem dia. " +
        "Continua sendo reprogramação, e por isso pede motivo."),
      campo("Motivo", entradaMotivo), campo("Ou escreva", entradaOutro)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Tirar da semana", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  const motivo = entradaOutro.value.trim() || entradaMotivo.value;
  try {
    await ev.aplicar(ev.devolverParaCarteira(a, motivo));
  } catch (e) { erro(e.message); return false; }
  avisar(`${a.frota} · de volta para a carteira`);
  return true;
}

export async function editar(a, ctx) {
  const c = {};
  const f = (k, entrada) => { c[k] = entrada; return entrada; };
  const corpo = el("div", {},
    el("div", { class: "dupla" },
      campo("Frota", comSugestoes(f("frota", el("input", { value: a.frota })), frotas(), "dl-frotas-e")),
      campo("OS", f("os", el("input", { value: a.os, inputmode: "numeric",
        placeholder: "6 dígitos" })))),
    campo("Atividade", f("atividade", el("textarea", {}, a.atividade))),
    el("div", { class: "dupla" },
      campo("Serviço / sistema", f("servico", el("input", { value: a.servico }))),
      campo("Cliente", comSugestoes(f("cliente", el("input", { value: a.cliente })),
        valoresDe("cliente"), "dl-clientes"))),
    el("div", { class: "tripla" },
      campo("Tipo", f("tipo", selecao(M.TIPOS, a.tipo))),
      campo("Origem", f("origem", selecao(M.ORIGENS, a.origem))),
      campo("Prioridade", f("prioridade", selecao(M.PRIORIDADES, a.prioridade)))),
    el("div", { class: "dupla" },
      campo("Oficina", f("oficina", selecao(M.OFICINAS, a.oficina))),
      // HH é hora-homem: horas × pessoas. Mede carga de equipe, não prazo — o
      // prazo continua vindo da duração em dias. Zero quer dizer "ninguém
      // estimou", e é assim que ele é contado nos números.
      campo("HH previsto", f("hh", el("input", { type: "number", step: "0.5",
        min: "0", value: a.hh || 0 })), "horas × pessoas")),
    campo("Executantes", comSugestoes(
      f("executantes", el("input", { value: (a.executantes || []).join(", "),
        placeholder: "separe por vírgula" })), executantes(), "dl-exec-e")),
    campo("Observação", f("obs", el("textarea", {}, a.obs))));

  const r = await caixa({ titulo: "Editar atividade", corpo,
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Gravar", classe: "primario", valor: true }] });
  if (r !== true) return false;

  const campos = {};
  for (const [k, entrada] of Object.entries(c)) {
    let v = entrada.value;
    if (k === "executantes") v = v.split(",").map(x => x.trim()).filter(Boolean);
    if (k === "hh") v = Number(v) || 0;
    if (k === "os") v = v.replace(/\D+/g, "") ? v.replace(/\D+/g, "").padStart(6, "0") : "";
    campos[k] = v;
  }
  const e = ev.editar(a, campos);
  if (!e) { avisar("Nada mudou."); return false; }
  await ev.aplicar(e);
  avisar("Gravado.");
  return true;
}

export async function criarNova(ctx, sugestao = {}) {
  const c = {};
  const f = (k, entrada) => { c[k] = entrada; return entrada; };
  const corpo = el("div", {},
    el("div", { class: "dupla" },
      campo("Frota", comSugestoes(f("frota", el("input", { value: sugestao.frota || "" })),
        frotas(), "dl-frotas-n")),
      campo("OS", f("os", el("input", { inputmode: "numeric", placeholder: "se já tiver" })))),
    campo("Atividade", f("atividade", el("textarea", { placeholder: "O que fazer" }))),
    el("div", { class: "dupla" },
      campo("Serviço / sistema", f("servico", el("input", {}))),
      campo("Tipo", f("tipo", selecao(M.TIPOS, "Corretiva")))),
    el("div", { class: "dupla" },
      campo("Origem", f("origem", selecao(M.ORIGENS, sugestao.origem || "Programada"))),
      campo("Prioridade", f("prioridade", selecao(M.PRIORIDADES, "")))),
    campo("Executantes", comSugestoes(f("executantes", el("input",
      { placeholder: "separe por vírgula" })), executantes(), "dl-exec-n")),
    campo("Observação", f("obs", el("textarea", {}))));

  const r = await caixa({ titulo: "Nova atividade", corpo,
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Criar", classe: "primario", valor: true }] });
  if (r !== true) return null;
  if (!c.atividade.value.trim()) { erro("Falta escrever a atividade."); return null; }

  const campos = { ...M.molde() };
  for (const [k, entrada] of Object.entries(c)) {
    let v = entrada.value;
    if (k === "executantes") v = v.split(",").map(x => x.trim()).filter(Boolean);
    if (k === "hh") v = Number(v) || 0;
    if (k === "os") v = v.replace(/\D+/g, "") ? v.replace(/\D+/g, "").padStart(6, "0") : "";
    campos[k] = v;
  }
  delete campos.id;
  const [criado] = await ev.aplicar(ev.criar(campos));
  const nova = ev.porId(criado.alvo);

  // Nasce na carteira. Se veio de uma tela de semana, já cai na semana dela —
  // e isso é uma PROGRAMAÇÃO, com evento próprio, não um campo preenchido.
  if (sugestao.semana) {
    await ev.aplicar(ev.reprogramar(nova, {
      ano: sugestao.ano, semana: sugestao.semana,
      dia: sugestao.dia || "", dias: 1 }));
  }
  avisar("Atividade criada.");
  return ev.porId(criado.alvo);
}

/** Programar (ou reprogramar) várias de uma vez — semana, dia, executantes.
 *  Para as que já tinham semana é reprogramação, e o motivo é obrigatório. */
export async function programarEmLote(alvos) {
  const jaProgramadas = alvos.filter(a => a.semana != null);
  const agora = M.semanaAtual();

  const eSemana = el("input", { type: "number", min: 1, max: 53, value: agora.semana });
  const eAno = el("input", { type: "number", min: 2020, max: 2100, value: agora.ano });
  const eDia = selecao([{ v: "", t: "— sem dia —" }, ...M.DIAS], "");
  const eDias = el("input", { type: "number", min: 1, max: 30, value: 1 });
  const eExec = el("input", { placeholder: "separe por vírgula" });
  const eMotivo = selecao([{ v: "", t: "— escolha —" }, ...M.MOTIVOS], "");

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
  if (r !== true) return false;

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
      const e = ev.reprogramar(a, para, eMotivo.value);
      if (e) eventos.push(e);
      if (equipe.length) {
        const ed = ev.editar(a, { executantes: equipe });
        if (ed) eventos.push(ed);
      }
    }
  } catch (e) { erro(e.message); return false; }

  if (!eventos.length) { avisar("Nada mudou."); return false; }
  await ev.aplicar(eventos);
  avisar(`${alvos.length} para a semana ${para.semana}${para.dia ? " · " + para.dia : ""}.`);
  return true;
}

// ── a ficha ─────────────────────────────────────────────────────────────────

export async function abrirFicha(id, ctx) {
  const a = ev.porId(id);
  if (!a) return;
  const s = M.situacaoDe(a);

  const linha = (r, v) => v ? el("tr", {}, el("th", {}, r), el("td", {}, v)) : null;
  const ficha = el("table", { class: "tabela" },
    linha("Situação", el("span", {}, chip(s, M.corDe(s)))),
    linha("Frota", a.frota),
    linha("Cliente", a.cliente),
    linha("OS", [a.os, ...a.os_outras].filter(Boolean).join(", ")),
    linha("Serviço", a.servico),
    linha("Tipo", `${a.tipo} · ${a.origem} · oficina ${a.oficina || "Interna"}`),
    linha("HH previsto", a.hh ? `${a.hh} (horas × pessoas)` : null),
    linha("Prioridade", a.prioridade),
    linha("Semana", a.semana ? `${a.semana}/${a.ano} · ${a.dia || "sem dia"} · ${a.dias || 1} dia(s)` : null),
    linha("Janela", a.semana ? `${br(M.inicioDe(a))} a ${br(M.prazoDe(a))}` : null),
    linha("Concluída em", a.concluida_em ? br(a.concluida_em)
      : (a.feita_sem_data ? "marcada Concluída na planilha, sem a data" : null)),
    linha("Semana original", a.semana_orig && a.semana_orig !== a.semana ? String(a.semana_orig) : null),
    linha("Reprogramações", a.reprogramacoes ? String(a.reprogramacoes) : null),
    linha("Motivo", a.motivo
      ? `${a.motivo}${M.areaDoMotivo(a.motivo) ? " — " + M.areaDoMotivo(a.motivo) : ""}`
      : null),
    linha("Executantes", (a.executantes || []).join(", ")),
    linha("Observação", a.obs));

  const hist = ev.historicoDe(id);
  const corpo = el("div", {},
    el("p", { style: "font-size:15px;font-weight:600" }, a.atividade || "—"),
    ficha,
    el("h2", { style: "font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--fraco);margin:16px 0 6px" },
      `Registro · ${hist.length} lançamento${hist.length === 1 ? "" : "s"}`),
    el("div", {}, hist.map(descreverEvento)));

  const acoes = [];
  if (M.aberta(a)) {
    acoes.push({ rotulo: "Concluir", classe: "primario", acao: async () => { await concluir(a, ctx); } });
    acoes.push({ rotulo: a.semana ? "Reprogramar" : "Programar",
      acao: async () => { await reprogramar(a, ctx); } });
  }
  if (a.feita_sem_data) {
    acoes.push({ rotulo: "Dar a data", classe: "primario",
      acao: async () => { await concluir(a, ctx); } });
  }
  if (M.feita(a)) {
    acoes.push({ rotulo: "Reabrir", acao: async () => {
      if (!await confirmar("Reabrir", "A data de conclusão sai e a atividade volta a pesar na aderência.", "Reabrir")) return;
      await ev.aplicar(ev.reabrir(a));
      avisar("Reaberta.");
    } });
  }
  acoes.push({ rotulo: "Editar", acao: async () => { await editar(a, ctx); } });
  acoes.push({ rotulo: "Mais", acao: async () => { await maisAcoes(a, ctx); } });

  await caixa({ titulo: `${a.frota || "Atividade"}`, corpo, acoes, largura: "620px" });
}

async function maisAcoes(a, ctx) {
  // Os botões do corpo fecham a caixa devolvendo a própria escolha: é para isso
  // que `corpo` recebe o `fechar`.
  const r = await caixa({
    titulo: "Mais ações",
    corpo: ({ fechar }) => el("div", { class: "lista" },
      a.semana && !M.feita(a)
        ? el("button", { onclick: () => fechar("carteira") },
          "Tirar da semana e devolver à carteira") : null,
      !a.cancelada
        ? el("button", { onclick: () => fechar("cancelar") }, "Cancelar a atividade")
        : el("button", { onclick: () => fechar("restaurar") }, "Desfazer o cancelamento"),
      el("button", { class: "perigo", onclick: () => fechar("excluir") },
        "Excluir da lista")),
    acoes: [{ rotulo: "Voltar", valor: "" }],
  });

  if (r === "carteira") return devolverParaCarteira(a, ctx);

  if (r === "cancelar") {
    const entrada = el("input", { type: "text", placeholder: "Por que não vai ser feita" });
    const conf = await caixa({
      titulo: "Cancelar a atividade",
      corpo: el("div", {},
        el("p", {}, "Cancelada não é concluída: sai da aderência em vez de contar como feita."),
        campo("Motivo", entrada)),
      acoes: [{ rotulo: "Voltar", valor: false },
        { rotulo: "Cancelar a atividade", classe: "perigo", valor: true }],
    });
    if (conf !== true) return;
    try { await ev.aplicar(ev.cancelar(a, entrada.value)); }
    catch (e) { return erro(e.message); }
    avisar("Cancelada."); return;
  }

  if (r === "restaurar") {
    await ev.aplicar(ev.restaurar(a));
    avisar("Cancelamento desfeito."); return;
  }

  if (r === "excluir") {
    if (!await confirmar("Excluir da lista",
      "A atividade some das telas. O registro dela fica no histórico — " +
      "excluir não apaga o que aconteceu.", "Excluir")) return;
    await ev.aplicar(ev.excluir(a));
    avisar("Excluída."); return;
  }
}

/** Uma linha do registro em português, dizendo o que mudou de fato. */
export function descreverEvento(e, comAtividade = false) {
  const a = ev.porId(e.alvo);
  const q = [];
  if (comAtividade && a) q.push(el("b", {}, `${a.frota} · ${a.atividade} — `));

  let txt;
  switch (e.tipo) {
    case "criada": txt = "criada à mão"; break;
    case "importada": txt = `importada${e.dados.fonte ? " de " + e.dados.fonte : ""}`; break;
    case "programada":
      txt = `programada para a semana ${e.dados.para.semana}${e.dados.para.dia ? " · " + e.dados.para.dia : ""}`;
      break;
    case "reprogramada":
      txt = `reprogramada da semana ${e.dados.de.semana ?? "—"}${e.dados.de.dia ? " · " + e.dados.de.dia : ""}` +
        ` para ${e.dados.para.semana ?? "carteira"}${e.dados.para.dia ? " · " + e.dados.para.dia : ""}`;
      break;
    case "concluida": txt = `concluída em ${br(e.dados.em)}`; break;
    case "reaberta": txt = "reaberta"; break;
    case "cancelada": txt = "cancelada"; break;
    case "restaurada": txt = "cancelamento desfeito"; break;
    case "excluida": txt = "excluída da lista"; break;
    case "editada": txt = "editada: " + Object.keys(e.dados.para || {}).join(", "); break;
    default: txt = e.tipo;
  }
  q.push(txt);
  if (e.origem && e.origem !== "manual") q.push(el("i", { style: "color:var(--muito-fraco)" }, ` (${e.origem})`));

  return el("div", { class: "evento" },
    el("div", { class: "qdo" }, quando(e.ts)),
    el("div", { class: "oq" }, q,
      e.motivo ? el("div", { class: "mot" }, "motivo: " + e.motivo) : null));
}

/** Agrupa mantendo a ordem de uma lista de chaves. */
export function agrupar(itens, chave) {
  const m = new Map();
  for (const i of itens) {
    const k = chave(i);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(i);
  }
  return m;
}

export function secao(titulo, conteudo, contagem = null) {
  return el("section", { class: "secao" },
    el("h2", {}, titulo, contagem != null ? el("span", { class: "cont" }, String(contagem)) : null),
    conteudo);
}
