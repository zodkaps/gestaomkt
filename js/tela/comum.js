// O cartão de atividade e a ficha — o que toda tela usa.
//
// Existe um lugar só onde uma atividade é desenhada e um lugar só onde ela é
// alterada. É o que impede a tela Hoje e a tela Semana de discordarem sobre o
// que significa "concluir".

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { normalizarOSLista } from "../importar.js";
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

export function cartao(a, { ctx, acoes = [], seletor = null, compacto = false, idade = false } = {}) {
  const s = M.situacaoDe(a);
  const cor = M.corDe(s);
  const tags = [];

  // A situação aparece sempre, em todo cartão: é o que se quer ver numa olhada.
  tags.push(chip(M.rotulo(s), cor));
  if (a.os) tags.push(chip("OS " + a.os + (a.os_outras.length ? ` +${a.os_outras.length}` : ""), "os"));
  else if (M.aberta(a)) tags.push(chip("sem OS", "semos"));
  // Prioridade só no cartão completo: na lista ela aparece em quase toda linha
  // e vira ruído — na planilha a coluna é oculta.
  if (!compacto && a.prioridade) tags.push(chip(a.prioridade, a.prioridade === "P1" ? "p1" : ""));
  if (M.ehPreventiva(a)) tags.push(chip("Preventiva", "prev"));
  if (a.origem === "Extra") tags.push(chip("Extra"));
  if (a.reprogramacoes > 0) tags.push(chip(`reprogramada ${a.reprogramacoes}×`, "reprog"));
  if (a.oficina === "Terceirizada") tags.push(chip("terceirizada"));
  if (!compacto && a.tipo && a.tipo !== "Corretiva" && a.tipo !== "Preventiva") tags.push(chip(a.tipo));
  // Na carteira, há quanto tempo espera — e de onde veio a data (M.desdeQuando).
  const desde = idade && M.aberta(a) ? M.desdeQuando(a) : null;
  if (desde) {
    const n = M.idadeDias(a);
    tags.push(el("span", { class: "chip idade" + (n >= 30 ? " velha" : ""),
      title: `esperando desde ${br(desde.data)} — ${desde.fonte}` }, n === 0 ? "desde hoje" : `há ${n} d`));
  }

  const sub = [];
  if (a.servico && a.servico !== a.atividade) sub.push(a.servico);
  if ((a.executantes || []).length) sub.push(a.executantes.join(" e "));
  if (a.semana && !compacto) sub.push(`sem ${a.semana} · ${a.dia || "sem dia"}`);
  if (a.concluida_em) sub.push("concluída em " + br(a.concluida_em));
  else if (a.feita_sem_data) sub.push("concluída — sem a data");
  else if (a.semana && M.prazoDe(a)) sub.push("prazo " + brCurto(M.prazoDe(a)));

  const n = el("div", {
    class: `at ${cor}${M.feita(a) ? " feito" : ""}${M.ehPreventiva(a) ? " prev" : ""}`,
    dataset: { id: a.id },
  },
    seletor,
    el("div", { class: "meio", onclick: cliqueLimpo(() => abrirFicha(a.id, ctx)),
      style: "cursor:pointer" },
      el("div", { class: "tit" }, (a.frota ? a.frota + " · " : "") + (a.atividade || "—")),
      sub.length ? el("div", { class: "sub" }, sub.join(" · ")) : null,
      tags.length ? el("div", { class: "tags" }, tags) : null),
    el("div", { class: "acoes" }, [...acoes, botaoMais("atividade", a.id, ctx)].filter(Boolean)));
  return n;
}

/** O "⋯" de um item: abre as ações dele (ver acoes.js). Carregado só ao clicar,
 *  para não criar ciclo entre os módulos das telas. */
export function botaoMais(tipo, id, ctx) {
  // Sem permissão para nada neste tipo, não há o que oferecer: o botão some.
  const pode = { atividade: ["baixar", "programar", "editar_atividade"],
    movimentacao: ["movimentar", "aprovar", "editar_atividade"],
    preventiva: ["parada", "disponibilidade", "editar_atividade"] }[tipo];
  if (!pode.some(p => pessoas.pode(p))) return null;
  return el("button", { class: "mais", type: "button", title: "Mais ações",
    "aria-label": "Mais ações",
    onclick: async e => {
      e.stopPropagation();
      const { menuDe } = await import("./acoes.js");
      menuDe(tipo, id, ctx);
    } }, "⋯");
}

export function botaoConcluir(a, ctx) {
  return el("button", {
    class: "primario",
    onclick: async e => { e.stopPropagation(); await concluir(a, ctx); },
  }, "Concluir");
}

// ── a justificativa: por que atrasou e quem atrasou ─────────────────────────

/** Os campos da justificativa, em texto livre: o porquê e quem atrasou são
 *  digitados — cada atraso tem a sua história, e lista pronta empurrava tudo
 *  para "Outro". */
export function camposJustificativa(tipo = "atividade", atual = {}) {
  const ePorque = el("textarea", { rows: 2,
    placeholder: tipo === "movimentacao"
      ? "ex.: a frota estava em viagem para Natal e só voltou quinta"
      : "ex.: a peça só chegou na sexta; o fornecedor atrasou a entrega" });
  ePorque.value = [atual.motivo, atual.texto && atual.texto !== atual.motivo ? atual.texto : ""]
    .filter(Boolean).join(" — ");
  const eQuem = el("input", { value: atual.quem || "",
    placeholder: "ex.: Operação, fornecedor Cardan, Suprimentos, motorista…" });
  const no = el("div", { class: "justificar" },
    campo("Motivo do atraso ou da não execução", ePorque),
    campo("Responsável pelo atraso", eQuem));
  return {
    no,
    valores: () => ({ motivo: ePorque.value.trim(), quem: eQuem.value.trim(), texto: "" }),
    preenchido: () => !!ePorque.value.trim(),
  };
}

/** Justificar uma atividade (OS) ou uma movimentação. */
export async function justificar(alvo, tipo = "atividade") {
  const atual = tipo === "movimentacao"
    ? { motivo: alvo.motivo_atraso, quem: alvo.quem_atrasou, texto: alvo.justificativa }
    : { motivo: alvo.motivo, quem: alvo.quem_atrasou, texto: alvo.justificativa };
  const j = camposJustificativa(tipo, atual);
  const titulo = tipo === "movimentacao"
    ? `${alvo.frota} · ${[alvo.acao, alvo.destino].filter(Boolean).join(" · ") || "movimentação"}`
    : `${alvo.frota} · ${alvo.atividade || "atividade"}`;
  const r = await caixa({
    titulo: "Justificar",
    corpo: el("div", {}, el("p", {}, el("b", {}, titulo)), j.no),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Gravar", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  try {
    await ev.aplicar(ev.justificar(alvo, j.valores(), tipo));
    avisar("Justificativa registrada.");
    return true;
  } catch (e) { erro(e.message); return false; }
}

// ── as operações ────────────────────────────────────────────────────────────

export async function concluir(a, ctx, quandoPadrao) {
  const entrada = el("input", { type: "date", value: quandoPadrao || M.hoje() });
  // Saiu depois do prazo? Então o porquê é pedido aqui mesmo — é o momento em
  // que quem dá a baixa sabe o que aconteceu. Não é obrigatório.
  const prazo = M.prazoDe(a);
  const j = camposJustificativa("atividade",
    { motivo: a.motivo, quem: a.quem_atrasou, texto: a.justificativa });
  const caixaAtraso = el("div", { class: "bloco-atraso" },
    el("p", { class: "nada" }, "Concluída após o prazo — informe o motivo (opcional)"), j.no);
  const verAtraso = () => { caixaAtraso.hidden = !(prazo && entrada.value && entrada.value > prazo); };
  entrada.addEventListener("change", verAtraso);
  entrada.addEventListener("input", verAtraso);
  verAtraso();
  const r = await caixa({
    titulo: "Dar baixa",
    corpo: el("div", {},
      el("p", {}, el("b", {}, a.frota), " · ", a.atividade),
      campo("Concluída em", entrada,
        "Data em que o serviço foi concluído. A aderência é calculada por esta data — " +
        "sem a data, o serviço aparece concluído na tela, mas não entra no indicador."),
      caixaAtraso),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Confirmar baixa", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  if (!entrada.value) { erro("Falta a data."); return false; }
  const eventos = [ev.concluir(a, entrada.value)];
  if (!caixaAtraso.hidden && j.preenchido()) eventos.push(ev.justificar(a, j.valores(), "atividade"));
  await ev.aplicar(eventos);
  avisar(`${a.frota} · baixa em ${br(entrada.value)}`);
  return true;
}

/** Dar baixa em várias de uma vez. A data é escolha de quem lança, para todas:
 *  o último dia programado de cada uma (o prazo dela — a que ainda está no
 *  prazo fica com a data de hoje, que baixa no futuro não existe) ou uma data
 *  só. A que não tem dia programado usa a data do campo. Saiu depois do prazo?
 *  Um motivo opcional vale para todas as atrasadas, como na baixa de uma. */
export async function concluirEmLote(alvos) {
  const abertas = alvos.filter(a => a && M.aberta(a));
  if (!abertas.length) { avisar("Nenhuma das marcadas está em aberto."); return false; }
  const hoje = M.hoje();
  const comPrazo = abertas.filter(a => M.prazoDe(a));
  let modo = comPrazo.length ? "prazo" : "uma";
  const dataDe = a => {
    const p = M.prazoDe(a);
    if (modo === "prazo" && p) return p > hoje ? hoje : p;
    return eData.value;
  };

  const eData = el("input", { type: "date", value: hoje, max: hoje });
  const bPrazo = el("button", { type: "button" }, "Último dia programado de cada uma");
  const bUma = el("button", { type: "button" }, "Uma data para todas");
  const rotuloData = el("span", {});
  const linhaData = el("label", { class: "campo" }, rotuloData, eData);
  const resumo = el("div", { class: "lote-resumo" });
  const j = camposJustificativa("atividade");
  const caixaAtraso = el("div", { class: "bloco-atraso" },
    el("p", { class: "nada" }, "Motivo do atraso (opcional) — vale para todas as concluídas depois do prazo"), j.no);

  const pintar = () => {
    bPrazo.className = modo === "prazo" ? "primario" : "";
    bUma.className = modo === "uma" ? "primario" : "";
    bPrazo.disabled = !comPrazo.length;
    const semPrazo = abertas.length - comPrazo.length;
    linhaData.hidden = modo === "prazo" && !semPrazo;
    rotuloData.textContent = modo === "prazo"
      ? `Data para ${semPrazo === 1 ? "a que não tem" : `as ${semPrazo} que não têm`} dia programado`
      : "Concluídas em";
    const porData = new Map();
    for (const a of abertas) { const d = dataDe(a) || ""; porData.set(d, (porData.get(d) || 0) + 1); }
    const atrasadas = abertas.filter(a => { const p = M.prazoDe(a), d = dataDe(a); return p && d && d > p; }).length;
    caixaAtraso.hidden = !atrasadas;
    resumo.replaceChildren(
      el("p", {}, el("b", {}, "Datas da baixa: "),
        [...porData].sort().map(([d, n]) => `${d ? br(d) : "falta a data"} (${n})`).join(" · ")),
      atrasadas ? el("p", { class: "nada" },
        `${atrasadas} fica${atrasadas === 1 ? "" : "m"} como concluída${atrasadas === 1 ? "" : "s"} com atraso.`) : "");
  };
  bPrazo.onclick = () => { modo = "prazo"; pintar(); };
  bUma.onclick = () => { modo = "uma"; pintar(); };
  eData.addEventListener("input", pintar);
  eData.addEventListener("change", pintar);
  pintar();

  const frotas = [...new Set(abertas.map(a => a.frota).filter(Boolean))];
  const r = await caixa({
    titulo: `Dar baixa em ${abertas.length} atividade${abertas.length === 1 ? "" : "s"}`,
    largura: "560px",
    corpo: el("div", {},
      el("p", {}, el("b", {}, frotas.slice(0, 6).join(", ") + (frotas.length > 6 ? ` e mais ${frotas.length - 6}` : "")),
        alvos.length > abertas.length ? ` · ${alvos.length - abertas.length} já concluída(s) fica(m) como está(ão)` : ""),
      el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 12px" }, bPrazo, bUma),
      linhaData, resumo, caixaAtraso),
    // O lançamento se monta no botão: faltando a data, a caixa fica aberta.
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: `Dar baixa em ${abertas.length}`, classe: "primario", acao: () => {
        const eventos = [];
        for (const a of abertas) {
          const d = dataDe(a);
          if (!d) throw new Error("Falta a data de conclusão.");
          if (d > hoje) throw new Error("A data de conclusão não pode ser depois de hoje.");
          eventos.push(ev.concluir(a, d));
          const p = M.prazoDe(a);
          if (p && d > p && j.preenchido()) eventos.push(ev.justificar(a, j.valores(), "atividade"));
        }
        return eventos;
      } }],
  });
  if (!r) return false;
  await ev.aplicar(r);
  const n = r.filter(e => e.tipo === "concluida").length;
  avisar(`${n} baixa${n === 1 ? "" : "s"} lançada${n === 1 ? "" : "s"}.`);
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
  const entradaMotivo = el("input", { type: "text",
    placeholder: "motivo da mudança — ex.: frota não chegou, peça atrasou" });

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
        "Obrigatório. É este campo que registra o motivo da reprogramação — " +
        "sem ele não é possível explicar por que a semana não foi cumprida.") : null),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: jaEstava ? "Reprogramar" : "Programar", classe: "primario", valor: true }],
  });
  if (r !== true) return false;

  const motivo = entradaMotivo.value.trim();
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
  return retirarDaProgramacao([a]);
}

/** Os últimos motivos de reprogramação escritos pela equipe, sem repetir.
 *  Não é lista pronta — são as palavras de quem lançou, à mão para o caso
 *  que se repete (seis frotas no mesmo fornecedor, o mesmo motivo seis vezes). */
function motivosRecentes(max = 4) {
  const vistos = new Map();
  for (let i = ev.log.length - 1; i >= 0 && vistos.size < max; i--) {
    const e = ev.log[i];
    if (e.tipo !== "reprogramada" || (e.alvo_tipo || "atividade") !== "atividade") continue;
    const m = String(e.motivo || "").trim();
    const k = m.toLowerCase();
    if (m && !vistos.has(k)) vistos.set(k, m);
  }
  return [...vistos.values()];
}

/** Retirar da programação: uma ou várias atividades voltam para a carteira,
 *  sem semana e sem dia, com UM motivo para todas. Conta como reprogramação —
 *  é o que a aderência precisa saber —, por isso o motivo é obrigatório. */
export async function retirarDaProgramacao(alvos) {
  const comSemana = alvos.filter(a => a && M.aberta(a) && a.semana != null);
  const ficam = alvos.length - comSemana.length;
  if (!comSemana.length) { avisar("Nenhuma das marcadas está programada."); return false; }

  const entradaMotivo = el("input", { type: "text",
    placeholder: "ex.: frota em fornecedor externo, peça não chegou" });
  const recentes = motivosRecentes();
  const sugestoes = recentes.length ? el("div", { class: "motivos-rapidos" },
    el("span", { class: "seg" }, "Usados por último:"),
    recentes.map(m => el("button", { type: "button", class: "motivo-rapido",
      onclick: () => { entradaMotivo.value = m; entradaMotivo.focus(); } }, m))) : null;

  const uma = comSemana.length === 1 ? comSemana[0] : null;
  const porFrota = [...agrupar(comSemana, a => a.frota || "—")]
    .map(([f, l]) => `${f} (${l.length})`).join(", ");
  const r = await caixa({
    titulo: uma ? "Retirar da programação"
      : `Retirar ${comSemana.length} atividades da programação`,
    corpo: el("div", {},
      uma
        ? el("p", {}, el("b", {}, uma.frota), " · ", uma.atividade,
          el("br"), el("span", { class: "seg" }, `Semana ${uma.semana}${uma.dia ? ", " + uma.dia : ""}`))
        : el("p", {}, porFrota),
      el("p", { class: "nada" }, (uma ? "Volta" : "Voltam") + " para a carteira, sem semana e sem dia. " +
        "Conta como reprogramação e, por isso, exige motivo."),
      ficam ? el("p", { class: "nada" },
        `${ficam} marcada${ficam === 1 ? " não está programada e fica" : "s não estão programadas e ficam"} como está.`) : null,
      campo(uma ? "Motivo" : "Motivo (o mesmo para todas)", entradaMotivo),
      sugestoes),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Retirar", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  const motivo = entradaMotivo.value.trim();
  let eventos;
  try {
    eventos = comSemana.map(a => ev.devolverParaCarteira(a, motivo)).filter(Boolean);
  } catch (e) { erro(e.message); return false; }
  if (!eventos.length) { avisar("Nada mudou."); return false; }
  await ev.aplicar(eventos);
  avisar(uma ? `${uma.frota} · de volta para a carteira`
    : `${eventos.length} atividades de volta para a carteira.`);
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

/** Gravar a OS digitada em uma ou várias atividades.
 *
 *  Só grava o que foi DIGITADO: nada é deduzido. Uma célula pode trazer mais de
 *  uma ordem ("7381, 7382"): a primeira vira a OS e as outras ficam junto,
 *  como na importação. E se a mesma OS já está em atividade de OUTRA frota,
 *  pergunta antes — número trocado é o erro mais comum de quem digita uma
 *  coluna inteira. */
export async function gravarOS(alvos, texto) {
  const lista = normalizarOSLista(texto);
  if (!lista.length) { erro("Digite o número da OS."); return false; }
  const [os, ...outras] = lista;
  const ids = new Set(alvos.map(a => a.id));
  const frotasAqui = new Set(alvos.map(a => a.frota));
  const emOutra = ev.lista().filter(x => !ids.has(x.id) &&
    (x.os === os || (x.os_outras || []).includes(os)) && !frotasAqui.has(x.frota));
  if (emOutra.length) {
    const ondes = [...new Set(emOutra.map(x => x.frota || "sem frota"))].join(", ");
    const ok = await confirmar("Esta OS já está em outra frota",
      `A OS ${os} já aparece em ${emOutra.length} atividade(s) de ${ondes}. ` +
      "Gravar mesmo assim?", "Gravar");
    if (!ok) return false;
  }
  const eventos = alvos.map(a => ev.editar(a, {
    os, os_outras: [...new Set([...(a.os_outras || []), ...outras])].filter(o => o !== os),
  })).filter(Boolean);
  if (!eventos.length) { avisar("Nada mudou."); return false; }
  try {
    await ev.aplicar(eventos);
    avisar(alvos.length === 1 ? `OS ${os} gravada.` : `OS ${os} gravada em ${alvos.length} atividades.`);
    return true;
  } catch (e) { erro(e.message); return false; }
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
  const eMotivo = el("input", { type: "text", placeholder: "motivo da mudança de semana" });

  const r = await caixa({
    titulo: `Programar ${alvos.length} atividade${alvos.length === 1 ? "" : "s"}`,
    corpo: el("div", {},
      el("div", { class: "tripla" },
        campo("Semana", eSemana), campo("Ano", eAno), campo("Dia", eDia)),
      campo("Duração em dias", eDias),
      campo("Executantes", comSugestoes(eExec, executantes(), "dl-exec-lote"),
        "Deixe em branco para manter os executantes atuais."),
      jaProgramadas.length
        ? campo(`Motivo — ${jaProgramadas.length} já tinha${jaProgramadas.length === 1 ? "" : "m"} semana`,
          eMotivo, "Para essas é reprogramação, que exige motivo.")
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
      const e = ev.reprogramar(a, para, eMotivo.value.trim());
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
    linha("Situação", el("span", {}, chip(M.rotulo(s), M.corDe(s)))),
    linha("Frota", a.frota),
    linha("Cliente", a.cliente),
    linha("OS", [a.os, ...a.os_outras].filter(Boolean).join(", ")),
    linha("Serviço", a.servico),
    linha("Tipo", `${a.tipo} · ${a.origem} · oficina ${a.oficina || "Interna"}`),
    linha("Preventiva do plano", (() => {
      const p = ev.preventivaDaAtividade(a);
      if (!p) return null;
      const sp = M.situacaoPreventiva(p);
      return el("span", {}, `${p.plano || "preventiva"} · plano ${p.mes || ""} · `, chip(M.rotulo(sp), M.corDe(sp)),
        el("span", { class: "nada" }, " — a baixa aqui registra a preventiva como realizada"));
    })()),
    linha("HH previsto", a.hh ? `${a.hh} (horas × pessoas)` : null),
    linha("Prioridade", a.prioridade),
    linha("Semana", a.semana ? `${a.semana}/${a.ano} · ${a.dia || "sem dia"} · ${a.dias || 1} dia(s)` : null),
    linha("Janela", a.semana ? `${br(M.inicioDe(a))} a ${br(M.prazoDe(a))}` : null),
    linha("Concluída em", a.concluida_em ? br(a.concluida_em)
      : (a.feita_sem_data ? "marcada Concluída na planilha, sem a data" : null)),
    linha("Semana original", a.semana_orig && a.semana_orig !== a.semana ? String(a.semana_orig) : null),
    linha("Reprogramações", a.reprogramacoes ? String(a.reprogramacoes) : null),
    linha("Motivo", a.motivo || a.justificativa
      ? [a.motivo, a.justificativa && a.justificativa !== a.motivo ? a.justificativa : ""]
        .filter(Boolean).join(" · ")
      : null),
    linha("Responsável pelo atraso", a.quem_atrasou || M.areaDoMotivo(a.motivo) || null),
    linha("Executantes", (a.executantes || []).join(", ")),
    linha("Observação", a.obs));

  const hist = ev.historicoDe(id);
  const corpo = el("div", {},
    el("p", { style: "font-size:15px;font-weight:600" }, a.atividade || "—"),
    ficha,
    el("h2", { style: "font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--fraco);margin:16px 0 6px" },
      `Registro · ${hist.length} lançamento${hist.length === 1 ? "" : "s"}`),
    el("div", {}, hist.map(e => descreverEvento(e))));

  const acoes = [];
  if (M.aberta(a)) {
    acoes.push({ rotulo: "Concluir", classe: "primario", acao: async () => { await concluir(a, ctx); } });
    acoes.push({ rotulo: a.semana ? "Reprogramar" : "Programar",
      acao: async () => { await reprogramar(a, ctx); } });
  }
  if (a.feita_sem_data) {
    acoes.push({ rotulo: "Informar a data", classe: "primario",
      acao: async () => { await concluir(a, ctx); } });
  }
  if (M.feita(a)) {
    acoes.push({ rotulo: "Reabrir", acao: async () => {
      if (!await confirmar("Reabrir", "A data de conclusão é removida e a atividade volta a contar na aderência.", "Reabrir")) return;
      await ev.aplicar(ev.reabrir(a));
      avisar("Reaberta.");
    } });
  }
  if (pessoas.pode("editar_atividade") && !a.cancelada) {
    acoes.push({ rotulo: a.motivo ? "Alterar a justificativa" : "Justificar",
      acao: async () => { await justificar(a, "atividade"); } });
  }
  acoes.push({ rotulo: "Editar", acao: async () => { await editar(a, ctx); } });
  acoes.push({ rotulo: "Mais ações", acao: async () => { const { menuAtividade } = await import("./acoes.js"); await menuAtividade(a, ctx); } });

  await caixa({ titulo: `${a.frota || "Atividade"}`, corpo, acoes, largura: "620px" });
}


/** Uma linha do registro em português, dizendo o que mudou de fato. */
export function descreverEvento(e, comAtividade = false) {
  const achado = ev.achar(e.alvo);
  const a = achado && achado.item;
  const d = e.dados || {};
  const q = [];
  if (comAtividade && a && achado.tipo === "semana") {
    q.push(el("b", {}, `Semana ${a.semana}/${a.ano} — `));
  } else if (comAtividade && a) {
    const oque = achado.tipo === "movimentacao" ? `movimentação ${[a.acao, a.destino].filter(Boolean).join(" · ")}`.trim()
      : achado.tipo === "preventiva" ? `preventiva ${a.plano || ""}`.trim()
      : a.atividade;
    q.push(el("b", {}, `${a.frota || "—"} · ${oque || "—"} — `));
  }

  let txt;
  switch (e.tipo) {
    case "criada": txt = d.fonte ? `criada — ${d.fonte}` : "criada manualmente"; break;
    case "importada": txt = `importada${d.fonte ? " de " + d.fonte : ""}`; break;
    case "programada":
      txt = `programada para a semana ${d.para.semana}${d.para.dia ? " · " + d.para.dia : ""}`;
      break;
    case "reprogramada":
      txt = `reprogramada da semana ${d.de.semana ?? "—"}${d.de.dia ? " · " + d.de.dia : ""}` +
        ` para ${d.para.semana ?? "carteira"}${d.para.dia ? " · " + d.para.dia : ""}`;
      break;
    case "concluida": txt = `concluída em ${br(d.em)}`; break;
    case "reaberta": txt = "reaberta"; break;
    case "cancelada": txt = "cancelada"; break;
    case "restaurada": txt = "cancelamento desfeito"; break;
    case "excluida": txt = "excluída"; break;
    case "editada": {
      const para = d.para || {};
      txt = "editada: " + Object.keys(para).map(k =>
        k === "os" ? `OS ${para.os || "(vazia)"}` : k).join(", ");
      break;
    }
    case "mov_prometida": txt = `prazo ${br(d.para)}`; break;
    case "mov_chegou": txt = `movimentação concluída em ${br(d.em)}`; break;
    case "prev_disponivel": txt = `liberada ${d.quando === "agora" ? "agora" : "em " + br(d.quando)}`; break;
    case "prev_parada": txt = `parada programada para ${br(d.dia)}`; break;
    case "prev_realizada": txt = `preventiva realizada em ${br(d.em)}`; break;
    case "semana_fechada": {
      const p = v => v == null ? "—" : (Math.round(v * 1000) / 10).toLocaleString("pt-BR") + "%";
      txt = `semana ${d.semana} fechada: aderência ${p(d.aderencia)} · cumprimento ${p(d.cumprimento)}` +
        (d.fonte === "sexta" ? " (como estava na sexta às 23h59)"
          : d.fonte === "sexta_baixas" ? " (na sexta, com as baixas lançadas depois)" : "") +
        (d.obs ? ` · ${d.obs}` : "");
      break;
    }
    case "justificada":
      txt = "justificou: " + [d.motivo || d.texto, d.quem && `responsável: ${d.quem}`,
        d.motivo && d.texto ? d.texto : ""].filter(Boolean).join(" · ");
      break;
    default: txt = ev.TIPOS[e.tipo] || e.tipo;
  }
  q.push(txt);
  // O que entrou por pedido ao Claude, pelo banco, fica marcado: é lançamento
  // como outro qualquer, assinado por quem pediu, mas tem de dar para saber.
  if (e.origem === "claude") q.push(" ", el("span", { class: "tag claude" }, "pedido ao Claude"));
  else if (e.origem === "vinculo") q.push(" ", el("span", { class: "tag vinc",
    title: "Lançado sozinho: a preventiva do plano e a OS preventiva andam juntas" }, "preventiva ↔ OS"));
  else if (e.origem && e.origem !== "manual") q.push(el("i", { style: "color:var(--muito-fraco)" }, ` (${e.origem})`));
  // Saiu de uma decisão do Painel (ver ev.porDecisao).
  const via = d.via && d.via.decisao ? d.via : null;
  if (via) q.push(" ", el("span", { class: "tag painel", title: "Lançado a partir do Painel" }, "decisão do Painel"));

  return el("div", { class: "evento" + (via ? " pela-decisao" : "") },
    el("div", { class: "qdo" }, quando(e.ts)),
    el("div", { class: "oq" },
      e.autor ? el("span", { class: "autor" }, e.autor + " — ") : null, q,
      e.motivo ? el("div", { class: "mot" }, "motivo: " + e.motivo) : null,
      via ? el("div", { class: "via" }, "pela decisão: " + via.decisao) : null));
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
