// Preventivas — a aba "Preventivas" da planilha, no site.
//
// Uma linha por frota, os mesmos números no alto (preventivas a fazer, frotas,
// com e sem data da operação, parada marcada, conflitos, vencidas, realizadas,
// HH) e a mesma Situação colorida, calculada pela mesma fórmula
// (`M.situacaoPreventiva`, conferida linha a linha em testes/resultados.mjs).
//
// O que o site acrescenta é a separação: uma preventiva só anda quando duas
// áreas respondem coisas diferentes — a operação diz QUANDO o caminhão fica
// livre, o PCM diz QUE DIA ele para. Por isso o alto da tela é "Para fazer":
// três filas curtas — programar a parada, dar baixa, cobrar (ou informar) a
// liberação —, cada linha com o botão que resolve. Uma olhada diz o que está
// parado esperando quem. Embaixo, as próximas paradas num calendário curto e,
// por último, o plano inteiro numa tabela só, com a faixa de situações que
// filtra. O quadro "fora do plano" fica recolhido, fora do caminho.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, br, brCurto, chip, caixa, campo, selecao, comSugestoes,
  avisar, erro, vazio, cliqueLimpo, confirmar, medidor, fecharCaixa } from "../ui.js";
import { busca as semAcento } from "../texto.js";
import { natural } from "./grade.js";
import { botaoMais, frotas as frotasDasAtividades, camposJustificativa } from "./comum.js";
import { mesDaData, mesDoPlano, decisoesPreventivas, sugestoesDeParada, textoCobranca } from "../decisoes.js";
import { copiar } from "./contexto.js";
import { normalizarOSLista } from "../importar.js";
import { cartaoGrafico, graficoBarras, graficoColunas, graficoLinhas, graficoRosca } from "../graficos.js";
import { listaDecisoes } from "./decidir.js";
import { conciliacao, descrever as descreverLigacao, eventosDaConciliacao } from "../vinculo.js";
import { OFICINA } from "../foco.js";
import { calendarioMes, agenda, cartaoTrilho, itemAgenda, anel, diaPorExtenso } from "./calendario.js";
import { pintarPlanilha } from "./prevplanilha.js";

// ── o cartão (celular, e a tela Para você) ──────────────────────────────────

export function cartaoPrev(p, ctx, { acoes = [] } = {}) {
  const s = M.situacaoPreventiva(p);
  const esperando = M.esperandoQuem(p);
  const tags = [chip(M.rotulo(s), M.corDe(s))];
  if (esperando) tags.push(chip(esperando === "Operação" ? "aguardando a operação" : "aguardando o PCM", esperando === "Operação" ? "hoje" : "andando"));
  if (M.preventivaVencida(p)) tags.push(chip("vencida", "vencida"));
  if (p.os) tags.push(chip("OS " + p.os, "os"));
  if (OFICINA && p.pendencias > 0) tags.push(chip(`${p.pendencias} pendência${p.pendencias === 1 ? "" : "s"} na carteira`));
  if (p.entregue_em) {
    const n = M.atrasoEntrega(p);
    tags.push(chip(n ? `chegou ${brCurto(p.entregue_em)} · +${n} d` : `chegou ${brCurto(p.entregue_em)}`, n ? "hoje" : "ok"));
  } else if (M.entregaAtrasando(p)) tags.push(chip(`não chegou · +${M.atrasoEntrega(p)} d`, "vencida"));
  if (p.onde_fazer === "Terceiro") tags.push(chip("terceiro"));

  const sub = [];
  if (p.plano) sub.push(p.plano + (p.qtd > 1 ? ` (${p.qtd})` : ""));
  if (p.equipamento) sub.push(p.equipamento);
  if (p.local) sub.push(p.local);
  if (M.venceEfetivo(p)) sub.push("vence " + brCurto(M.venceEfetivo(p)));
  if (p.disponivel_agora) sub.push("disponível agora");
  else if (p.disponivel_em) sub.push("liberação " + brCurto(p.disponivel_em));
  if (p.dia_parada) sub.push("parada " + brCurto(p.dia_parada));

  return el("div", { class: `at ${M.corDe(s)}${M.preventivaFeita(p) ? " feito" : ""}`, dataset: { id: p.id } },
    el("div", { class: "meio", style: "cursor:pointer",
      onclick: cliqueLimpo(() => abrirFichaPrev(p.id, ctx)) },
      el("div", { class: "tit" }, p.frota),
      sub.length ? el("div", { class: "sub" }, sub.join(" · ")) : null,
      el("div", { class: "tags" }, tags)),
    el("div", { class: "acoes" }, [...acoes, botaoMais("preventiva", p.id, ctx)].filter(Boolean)));
}

// ── as respostas ────────────────────────────────────────────────────────────

export async function informarDisponibilidade(p) {
  const eQuando = el("input", { type: "date", value: p.disponivel_em || M.hoje() });
  let escolha = p.disponivel_agora ? "agora" : "data";
  const bAgora = el("button", {}, "Disponível agora");
  const bData = el("button", {}, "Disponível a partir de…");
  const linhaData = el("div", {}, campo("A partir de", eQuando));
  const trocar = v => {
    escolha = v;
    bAgora.className = v === "agora" ? "primario" : "";
    bData.className = v === "data" ? "primario" : "";
    linhaData.style.display = v === "data" ? "" : "none";
  };
  bAgora.onclick = () => trocar("agora");
  bData.onclick = () => trocar("data");
  trocar(escolha);

  const lim = M.venceEfetivo(p);
  const antes = p.disponivel_agora ? "agora" : (p.disponivel_em ? br(p.disponivel_em) : "");
  // Remarcar: o motivo num toque (os mesmos da justificativa), o detalhe se quiser.
  const eMotivo = el("input", { type: "text", placeholder: "detalhe, se quiser — ex.: saiu para viagem, volta sexta" });
  let cat = "";
  const bCat = M.MOTIVOS_ATRASO.map(m => el("button", { type: "button", class: "chip-op", dataset: { cat: m.id },
    onclick: () => { cat = m.id; bCat.forEach(b => b.classList.toggle("on", b.dataset.cat === cat)); if (cat === "outro") eMotivo.focus(); } }, m.nome));
  const r = await caixa({
    titulo: "Quando esta frota fica disponível para a manutenção?",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : "",
        lim ? ` · vence ${br(lim)}` : ""),
      el("p", { class: "nada" }, antes
        ? `Hoje a liberação informada é: ${antes}. Mudar fica no registro, com o motivo, e conta na Avaliação da operação.`
        : "A manutenção só programa a parada depois desta informação."),
      el("div", { style: "display:flex;gap:8px;margin-bottom:12px" }, bAgora, bData),
      linhaData,
      antes ? el("div", { class: "campo" }, el("span", {}, "Por que mudou (obrigatório se a data mudar)"),
        el("div", { class: "chips-escolha", role: "group", "aria-label": "Motivo da mudança" }, bCat), eMotivo) : null),
    // O lançamento se monta no botão: se faltar algo, a caixa fica aberta com
    // o aviso, sem perder o que já foi escolhido.
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Responder", classe: "primario",
        acao: () => {
          if (cat === "outro" && !eMotivo.value.trim()) throw new Error("Escreva qual foi o motivo.");
          const texto = cat && cat !== "outro" ? [M.nomeMotivo(cat), eMotivo.value.trim()].filter(Boolean).join(" — ") : eMotivo.value;
          return ev.informarDisponibilidade(p, escolha === "agora" ? "agora" : eQuando.value, texto, cat);
        } }],
  });
  if (!r) return false;
  const quando = r.dados.quando;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: ${quando === "agora" ? "disponível agora" : "disponível a partir de " + br(quando)}.`);
    return true;
  } catch (e) { erro(e.message); return false; }
}

/** Os motivos de reprogramação de preventiva escritos por último — à mão
 *  para o caso que se repete, sem lista pronta. */
function motivosRecentesPrev(max = 4) {
  const vistos = new Map();
  for (let i = ev.log.length - 1; i >= 0 && vistos.size < max; i--) {
    const e = ev.log[i];
    if (e.alvo_tipo !== "preventiva" || !["prev_parada", "prev_adiada", "prev_disponivel"].includes(e.tipo)) continue;
    const m = String(e.motivo || "").trim();
    if (m && !vistos.has(m.toLowerCase())) vistos.set(m.toLowerCase(), m);
  }
  return [...vistos.values()];
}

export async function marcarParada(p, { sugestao = "" } = {}) {
  const reprograma = !!p.dia_parada;
  const eDia = el("input", { type: "date", value: sugestao || p.dia_parada ||
    (p.disponivel_agora ? M.hoje() : p.disponivel_em || M.hoje()) });
  const eOnde = selecao([{ v: "", t: "— local de execução —" }, "Interna", "Terceiro"], p.onde_fazer || "");
  const eMotivo = el("input", { type: "text", placeholder: "ex.: frota em viagem, oficina cheia, peça não chegou" });
  const livre = p.disponivel_agora ? "agora" : (p.disponivel_em ? br(p.disponivel_em) : null);
  const lim = M.venceEfetivo(p);
  const recentes = reprograma ? motivosRecentesPrev() : [];

  const r = await caixa({
    titulo: reprograma ? "Reprogramar a parada" : "Programar a parada",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : "",
        lim ? ` · vence ${br(lim)}` : ""),
      reprograma ? el("p", { class: "nada" }, `Hoje a parada está em ${br(p.dia_parada)}` +
        (p.reprog_parada ? ` · já reprogramada ${p.reprog_parada}× (a primeira data era ${br(p.parada_orig)})` : "") + ".") : null,
      livre
        ? el("p", { class: "nada" }, `Liberação informada pela operação: ${livre}.`)
        : el("p", { style: "color:var(--hoje)" },
          "⚠ A operação ainda não informou a liberação desta frota. " +
          "Programar sem essa informação é arriscado."),
      OFICINA && p.pendencias > 0
        ? el("p", { class: "nada" },
          `Há ${p.pendencias} pendência(s) na carteira desta frota — é possível ` +
          "aproveitar a parada para executá-las.")
        : null,
      campo("Dia da parada", eDia),
      campo("Onde fazer", eOnde),
      reprograma ? campo("Motivo da reprogramação", eMotivo,
        "Obrigatório se o dia mudar. Fica no registro e conta na reprogramação do mês.") : null,
      recentes.length ? el("div", { class: "motivos-rapidos" },
        el("span", { class: "seg" }, "Usados por último:"),
        recentes.map(m => el("button", { type: "button", class: "motivo-rapido",
          onclick: () => { eMotivo.value = m; eMotivo.focus(); } }, m))) : null),
    // Sem motivo para mudar o dia, a caixa não fecha: o aviso aparece e o dia
    // escolhido continua lá.
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: reprograma ? "Reprogramar" : "Marcar", classe: "primario",
        acao: () => ev.marcarParada(p, eDia.value, eOnde.value, eMotivo.value) }],
  });
  if (!r) return false;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: parada ${reprograma && eDia.value !== p.dia_parada ? "reprogramada" : "programada"} para ${br(eDia.value)}.`);
    return true;
  } catch (e) { erro(e.message); return false; }
}

// ── a frota chegou na oficina ───────────────────────────────────────────────
// É a outra metade do aperto de mão: a operação prometeu a frota, o PCM marcou
// o dia — e o dia em que ela de fato chegou é o que diz se a operação cumpriu.
// Chegou depois do combinado: o porquê e quem atrasou são pedidos aqui, e
// sem eles não grava (o PCM pediu em 23/10/2026).

export async function registrarEntregaPrev(p, { soJustificar = false } = {}) {
  const combinado = p.entregue_em ? p.entrega_combinada : M.combinadoEntrega(p);
  const eDia = el("input", { type: "date", value: p.entregue_em || M.hoje(), max: M.hoje() });
  const j = camposJustificativa("movimentacao", { motivo: p.motivo_entrega, quem: p.quem_atrasou_entrega, categoria: p.motivo_entrega_cat });
  const caixaJ = el("div", {}, j.no);
  const aviso = el("p", { class: "nada" });
  const atualizar = () => {
    const n = combinado && eDia.value ? M.difDias(combinado, eDia.value) : 0;
    aviso.textContent = !combinado ? "Sem dia combinado: a parada não foi marcada."
      : n > 0 ? `Chegou ${n} dia${n === 1 ? "" : "s"} depois do combinado (${br(combinado)}). Toque no motivo e em quem atrasou.`
      : `No dia combinado (${br(combinado)}) ou antes.`;
    aviso.style.color = n > 0 ? "var(--hoje)" : "";
    caixaJ.hidden = !(n > 0);
  };
  eDia.addEventListener("input", atualizar);
  atualizar();
  const r = await caixa({
    titulo: soJustificar ? "Por que a frota chegou atrasada" : p.entregue_em ? "Corrigir a chegada da frota" : "A frota chegou na oficina",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : "",
        p.dia_parada ? ` · parada ${br(p.dia_parada)}` : ""),
      soJustificar ? null : campo("Chegou em", eDia), aviso, caixaJ),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Gravar", classe: "primario", acao: () => {
        const f = !caixaJ.hidden && j.falta();
        if (f) throw new Error(f);
        return ev.registrarEntrega(p, eDia.value, caixaJ.hidden ? {} : j.valores());
      } }],
  });
  if (!r) return false;
  try {
    await ev.aplicar(r);
    const n = r.dados.combinado ? Math.max(0, M.difDias(r.dados.combinado, r.dados.em) || 0) : 0;
    avisar(`${p.frota}: chegou em ${br(r.dados.em)}` + (n ? ` · ${n} dia${n === 1 ? "" : "s"} de atraso.` : "."));
    return true;
  } catch (e) { erro(e.message); return false; }
}

// ── ligar à Programação o que existia antes ─────────────────────────────────

export async function ligarAProgramacao(prevs) {
  const todos = conciliacao(prevs);
  const itens = todos.filter(it => it.passos.length);
  const avisos = todos.filter(it => !it.passos.length);
  if (!itens.length) { avisar("Tudo já está ligado à Programação."); return false; }
  const linha = it => el("tr", {}, el("td", {}, el("b", {}, it.p.frota)),
    el("td", {}, it.p.plano || "—"), el("td", {}, descreverLigacao(it)));
  const r = await caixa({
    titulo: "Ligar as preventivas à Programação",
    largura: "820px",
    corpo: el("div", {},
      el("p", {}, "A preventiva do plano e a OS preventiva da oficina passam a ser uma coisa só: a parada marcada ",
        "entra no dia da Programação, e a baixa num lado registra a realização no outro. Para as que já existiam:"),
      el("div", { class: "tabela-rolagem" }, el("table", { class: "tabela" },
        el("thead", {}, el("tr", {}, el("th", {}, "Frota"), el("th", {}, "Preventiva"), el("th", {}, "O que acontece"))),
        el("tbody", {}, itens.map(linha)))),
      avisos.length ? el("p", { class: "nada" }, `${avisos.length} só com aviso (nada é mudado): ` +
        avisos.map(it => `${it.p.frota} — ${it.aviso}`).join("; ") + ".") : null),
    acoes: [{ rotulo: "Agora não", valor: false },
      { rotulo: `Ligar ${itens.length}`, classe: "primario", acao: () => eventosDaConciliacao(itens) }],
  });
  if (!r) return false;
  await ev.aplicar(r);
  avisar(`${itens.length} preventiva${itens.length === 1 ? "" : "s"} ligada${itens.length === 1 ? "" : "s"} à Programação.`);
  return true;
}

// ── incluir uma frota no plano, e editar ────────────────────────────────────

const PLANOS_COMUNS = ["1 ano", "15 mil km", "30 mil km", "500 h"];

function formularioPreventiva(p, mesPadrao, frotaPadrao = "") {
  const todas = ev.lista("preventiva");
  const unicos = f => [...new Set(todas.map(f).filter(Boolean))].sort(natural);
  const frotasConhecidas = [...new Set([...frotasDasAtividades(), ...unicos(x => x.frota)])].sort(natural);
  // Qualquer mês: o plano de novembro se monta em outubro.
  const c = {
    frota: el("input", { value: p ? p.frota : frotaPadrao, placeholder: "ex.: F-745", autocomplete: "off" }),
    mes: el("input", { type: "month", value: mesDoPlano(p ? p.mes : mesPadrao) || M.hoje().slice(0, 7), required: true }),
    plano: el("input", { value: p ? p.plano : "", placeholder: "ex.: 15 mil km, 1 ano" }),
    qtd: el("input", { type: "number", min: 1, value: p ? p.qtd || 1 : 1 }),
    vence: el("input", { type: "date", value: p ? p.vence : "" }),
    prazo_service: el("input", { type: "date", value: p ? p.prazo_service : "" }),
    equipamento: el("input", { value: p ? p.equipamento : "", placeholder: "ex.: Cavalo, Carga seca" }),
    local: el("input", { value: p ? p.local : "", placeholder: "ex.: Matriz" }),
    onde_fazer: selecao([{ v: "", t: "— a definir —" }, "Interna", "Terceiro"], p ? p.onde_fazer : ""),
    hh: el("input", { type: "number", min: 0, step: "0.5", value: p ? p.hh || "" : "" }),
    os: el("input", { value: p ? p.os : "", inputmode: "numeric", placeholder: "se já tiver" }),
    obs: el("textarea", { rows: 2 }, p ? p.obs : ""),
  };
  const no = el("div", { class: "form-prev" },
    el("div", { class: "dupla" },
      campo("Frota", comSugestoes(c.frota, frotasConhecidas, "dl-prev-frotas")),
      campo("Mês do plano", c.mes)),
    el("div", { class: "dupla" },
      campo("Preventivas", comSugestoes(c.plano, [...new Set([...unicos(x => x.plano), ...PLANOS_COMUNS])], "dl-prev-planos")),
      campo("Quantidade", c.qtd)),
    el("div", { class: "dupla" },
      campo("Vencimento", c.vence), campo("Prazo do Service", c.prazo_service, "se houver — passa a valer no lugar do vencimento")),
    el("div", { class: "dupla" },
      campo("Equipamento", comSugestoes(c.equipamento, unicos(x => x.equipamento), "dl-prev-equip")),
      campo("Local", comSugestoes(c.local, unicos(x => x.local), "dl-prev-local"))),
    el("div", { class: "tripla" }, campo("Onde fazer", c.onde_fazer), campo("HH previsto", c.hh), campo("OS", c.os)),
    campo("Observação", c.obs));
  const valores = () => {
    const os = c.os.value.replace(/\D+/g, "");
    return {
      frota: c.frota.value.trim(), mes: c.mes.value ? mesDeISO(c.mes.value) : "", plano: c.plano.value.trim(),
      qtd: Math.max(1, Number(c.qtd.value) || 1), vence: c.vence.value, prazo_service: c.prazo_service.value,
      equipamento: c.equipamento.value.trim(), local: c.local.value.trim(), onde_fazer: c.onde_fazer.value,
      hh: Number(String(c.hh.value).replace(",", ".")) || 0, os: os ? os.padStart(6, "0") : "", obs: c.obs.value.trim(),
    };
  };
  return { no, valores };
}

// ── o mês do plano ──────────────────────────────────────────────────────────
// O plano tem nome de aba da planilha ("Out-26"); o campo de mês do navegador
// fala ISO ("2026-10"). Qualquer mês se abre — o vazio também, para montar.

const mesDeISO = iso => mesDaData(String(iso).slice(0, 7) + "-01");
export function somaMes(mes, n) {
  const [a, m] = mesDoPlano(mes).split("-").map(Number);
  if (!a) return mes;
  return mesDaData(new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10));
}
const mesesComPlano = () => [...new Set(ev.lista("preventiva").filter(p => !p.excluida).map(p => p.mes).filter(Boolean))]
  .sort((a, b) => ordemMes(b) - ordemMes(a));

/** Trazer frotas de um mês que já tem plano para outro: a lista do mês de
 *  origem, cada frota com o plano para conferir e o vencimento em branco. Só
 *  entra o que a pessoa marca; parada, liberação e OS começam do zero. */
export async function trazerDeOutroMes(destino) {
  const meses = mesesComPlano().filter(m => m !== destino);
  if (!meses.length) { avisar("Nenhum outro mês tem plano ainda."); return 0; }
  const anterior = somaMes(destino, -1);
  const fOrigem = selecao(meses.map(m => ({ v: m, t: rotuloMes(m) })), meses.includes(anterior) ? anterior : meses[0]);
  const lista = el("div", { class: "trazer-lista" });
  const chaveF = f => String(f || "").replace(/\W/g, "").toLowerCase();
  let linhas = [];
  const pintarLista = () => {
    const jaNoDestino = new Set(ev.lista("preventiva").filter(x => x.mes === destino && !x.excluida && !x.fora).map(x => chaveF(x.frota)));
    const daOrigem = ev.lista("preventiva").filter(x => x.mes === fOrigem.value && !x.excluida && !x.fora)
      .sort((a, b) => natural(a.frota, b.frota));
    linhas = daOrigem.map(x => {
      const ja = jaNoDestino.has(chaveF(x.frota));
      const marca = el("input", { type: "checkbox", disabled: ja });
      const plano = el("input", { value: x.plano || "", placeholder: "plano", "aria-label": `Plano da ${x.frota}` });
      const vence = el("input", { type: "date", "aria-label": `Vencimento da ${x.frota}` });
      return { x, ja, marca, plano, vence, no: el("label", { class: "trazer-lin" + (ja ? " ja" : "") }, marca,
        el("b", {}, x.frota), el("span", { class: "seg" }, x.equipamento || ""),
        ja ? el("span", { class: "seg" }, `já está em ${rotuloMes(destino).split("/")[0]}`) : plano, ja ? null : vence) };
    });
    lista.replaceChildren(...(linhas.length ? linhas.map(l => l.no) : [el("p", { class: "nada" }, "Esse mês não tem frota no plano.")]));
  };
  fOrigem.addEventListener("change", pintarLista);
  pintarLista();
  const marcarTodas = v => linhas.forEach(l => { if (!l.ja) l.marca.checked = v; });
  const r = await caixa({ titulo: `Montar o plano de ${rotuloMes(destino)}`, largura: "680px",
    corpo: el("div", {},
      el("p", { class: "nada", style: "margin-top:0" },
        "Marque as frotas que entram. Vem a frota, o equipamento e o local; o plano vem do mês de origem para você conferir. " +
        "Vencimento, liberação, parada e OS começam em branco."),
      el("div", { class: "filtros" }, campo("Trazer de", fOrigem),
        el("button", { type: "button", class: "discreto", onclick: () => marcarTodas(true) }, "Marcar todas"),
        el("button", { type: "button", class: "discreto", onclick: () => marcarTodas(false) }, "Desmarcar")),
      lista),
    acoes: [{ rotulo: "Cancelar", valor: false }, { rotulo: "Incluir as marcadas", classe: "primario", acao: () => {
      const escolhidas = linhas.filter(l => l.marca.checked);
      if (!escolhidas.length) throw new Error("Marque ao menos uma frota.");
      return escolhidas.map(({ x, plano, vence }) => ev.novaPreventiva({ ...M.moldePreventiva(), id: undefined, mes: destino,
        frota: x.frota, equipamento: x.equipamento || "", local: x.local || "", plano: plano.value.trim(),
        qtd: plano.value.trim() === (x.plano || "") ? x.qtd || 1 : 1, vence: vence.value }));
    } }] });
  if (!r) return 0;
  try {
    await ev.aplicar(r);
    avisar(`${r.length} frota${r.length === 1 ? "" : "s"} no plano de ${rotuloMes(destino)}.`);
    return r.length;
  } catch (x) { erro(x.message); return 0; }
}

/** "+ Incluir frota": uma preventiva nova no plano do mês, lançada no site. */
export async function incluirPreventiva(mesPadrao, { frota = "" } = {}) {
  const f = formularioPreventiva(null, mesPadrao || mesDaData(M.hoje()), frota);
  const r = await caixa({ titulo: "Incluir frota no plano de preventivas", largura: "620px",
    corpo: el("div", {}, el("p", { class: "nada", style: "margin-top:0" },
      "A frota entra no plano do mês escolhido — qualquer mês —, aguardando a liberação da operação. " +
      "Fica no registro como incluída no site — e uma reimportação da planilha não a tira."), f.no),
    acoes: [{ rotulo: "Cancelar", valor: false }, { rotulo: "Incluir", classe: "primario", acao: () => {
      const v = f.valores();
      return { v, e: ev.novaPreventiva({ ...M.moldePreventiva(), ...v, id: undefined }) };
    } }] });
  if (!r) return null;
  const { v } = r;
  const ja = ev.lista("preventiva").filter(x => x.mes === v.mes && !x.fora &&
    x.frota.replace(/\W/g, "").toLowerCase() === v.frota.replace(/\W/g, "").toLowerCase());
  if (ja.length && !await confirmar("Esta frota já está no plano",
    `${v.frota} já tem ${ja.length === 1 ? "uma preventiva" : ja.length + " preventivas"} em ${v.mes} ` +
    `(${ja.map(x => x.plano || "sem plano").join(", ")}). Incluir outra mesmo assim?`, "Incluir mesmo assim")) return null;
  try {
    const [e] = await ev.aplicar(r.e);
    avisar(`${v.frota} incluída no plano de ${v.mes}.`);
    return e.alvo;
  } catch (x) { erro(x.message); return null; }
}

export async function editarPreventiva(p) {
  const f = formularioPreventiva(p, p.mes);
  const r = await caixa({ titulo: `Editar a preventiva · ${p.frota}`, largura: "620px",
    corpo: el("div", {}, el("p", { class: "nada", style: "margin-top:0" },
      "Parada, liberação e realização têm botão próprio — é por eles que a reprogramação se conta."), f.no),
    acoes: [{ rotulo: "Cancelar", valor: false }, { rotulo: "Salvar", classe: "primario", acao: () => {
      const v = f.valores();
      if (!v.frota) throw new Error("Falta a frota.");
      return { v, e: ev.editar(p, v, "preventiva") };
    } }] });
  if (!r) return false;
  const { v, e } = r;
  if (!e) { avisar("Nada mudou."); return false; }
  try {
    await ev.aplicar(e);
    avisar(`${v.frota}: preventiva atualizada.`);
    return true;
  } catch (x) { erro(x.message); return false; }
}

// ── o que cada lançamento mudou ─────────────────────────────────────────────

const LIB = a => !a ? "" : a.disponivel_agora ? "agora" : (a.disponivel_em ? brCurto(a.disponivel_em) : "");
const CAMPOS_PREV = {
  frota: ["frota"], plano: ["preventivas"], qtd: ["quantidade"], vence: ["vencimento", "data"],
  prazo_service: ["prazo do Service", "data"], dia_parada: ["parada", "data"], onde_fazer: ["onde fazer"],
  equipamento: ["equipamento"], local: ["local"], os: ["OS"], hh: ["HH"], realizada_em: ["realizada em", "data"],
  fechada_em: ["OS fechada em", "data"],
  em_andamento: ["em andamento", "sim"], fora: ["fora do plano", "sim"], obs: ["observação"], mes: ["mês do plano"],
};
const valorCampo = (v, tipo) => v == null || v === "" ? "—"
  : tipo === "data" ? brCurto(v) : tipo === "sim" ? (v ? "sim" : "não") : String(v);

/** Um lançamento de preventiva em palavras: o tipo (para filtrar), a frase e
 *  o antes → depois do que mudou. Reimportação que não mudou nada não aparece. */
export function descreverMudancaPrev(m) {
  const { e, antes, depois, mudou } = m;
  const d = e.dados || {};
  const detalhes = (pular = []) => mudou
    .filter(x => CAMPOS_PREV[x.campo] && !pular.includes(x.campo))
    .map(x => `${CAMPOS_PREV[x.campo][0]}: ${valorCampo(x.de, CAMPOS_PREV[x.campo][1])} → ${valorCampo(x.para, CAMPOS_PREV[x.campo][1])}`);
  const r = (tipo, texto, det = []) => ({ tipo, texto, detalhes: det, e, depois });
  switch (e.tipo) {
    case "criada": return r("inclusao", `incluiu no plano${depois && depois.plano ? " (" + depois.plano + ")" : ""}` +
      (depois && M.venceEfetivo(depois) ? ` · vence ${brCurto(M.venceEfetivo(depois))}` : ""));
    case "importada": {
      if (!antes) return r("inclusao", "veio da planilha" + (depois && depois.fora ? " (fora do plano)" : ""));
      const det = detalhes();
      return det.length ? r("edicao", "a planilha atualizou", det) : null;
    }
    case "prev_disponivel": {
      const de = LIB(antes), para = LIB(depois);
      return de ? r("reprogramacao", `mudou a liberação: ${de} → ${para}`)
        : r("liberacao", `informou a liberação: ${para}`);
    }
    case "prev_parada": {
      const de = antes && antes.dia_parada, para = depois && depois.dia_parada;
      if (de && para && de !== para) return r("reprogramacao", `reprogramou a parada: ${brCurto(de)} → ${brCurto(para)}`, detalhes(["dia_parada"]));
      return r("parada", `programou a parada para ${brCurto(para)}`, detalhes(["dia_parada"]));
    }
    case "prev_adiada": return r("reprogramacao", "adiou para o próximo mês");
    case "prev_realizada": return r("realizacao", `registrou a realização em ${brCurto(d.em)}`, detalhes(["realizada_em", "em_andamento"]));
    case "prev_fechada": {
      const de = antes && antes.fechada_em;
      return r("fechamento", de && de !== d.em ? `corrigiu o fechamento da OS: ${brCurto(de)} → ${brCurto(d.em)}`
        : `fechou a OS${d.os ? " " + d.os : ""} em ${brCurto(d.em)}`, detalhes(["fechada_em", "os"]));
    }
    case "prev_andamento": return r("andamento", d.sim === false ? "retirou de em andamento" : "marcou em andamento");
    case "prev_entregue": {
      const n = d.combinado ? Math.max(0, M.difDias(d.combinado, d.em) || 0) : 0;
      return r("entrega", `registrou a chegada da frota em ${brCurto(d.em)}` +
        (d.combinado ? (n ? ` · ${n} dia${n === 1 ? "" : "s"} depois do combinado (${brCurto(d.combinado)})` : " · no dia combinado") : ""),
        [d.motivo && `motivo: ${d.motivo}`, d.quem && `quem atrasou: ${d.quem}`].filter(Boolean));
    }
    case "prev_cancelada": return r("cancelamento", "cancelou");
    case "prev_reaberta": return r("reabertura", "reabriu");
    case "excluida": return r("cancelamento", "excluiu do plano");
    case "reincluida": return r("reabertura", "desfez a exclusão");
    case "editada": return r("edicao", "editou", detalhes());
    default: return r("edicao", ev.TIPOS[e.tipo] || e.tipo, detalhes());
  }
}

export async function darPorFeita(p) {
  const eData = el("input", { type: "date", value: M.hoje() });
  const eOS = el("input", { value: p.os, inputmode: "numeric", placeholder: "OS no Protheus" });
  const r = await caixa({
    titulo: "Preventiva realizada",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : ""),
      campo("Realizada em", eData), campo("OS", eOS)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Confirmar", classe: "primario", acao: () => {
        const os = eOS.value.replace(/\D+/g, "");
        return ev.preventivaFeita(p, eData.value, os ? os.padStart(6, "0") : "");
      } }],
  });
  if (!r) return;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: preventiva realizada.`);
  } catch (e) { erro(e.message); }
}

/** O fechamento: a OS da preventiva encerrada no Protheus. Vem depois da
 *  realização — às vezes dias depois —, por isso tem data própria. */
export async function fecharOSPrev(p) {
  const eData = el("input", { type: "date", value: p.fechada_em || M.hoje(), max: M.hoje(), min: p.realizada_em || "" });
  const eOS = el("input", { value: p.os, inputmode: "numeric", placeholder: "OS no Protheus" });
  const r = await caixa({
    titulo: p.fechada_em ? "Corrigir o fechamento da OS" : "Fechar a OS da preventiva",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : "",
        p.realizada_em ? ` · realizada em ${br(p.realizada_em)}` : ""),
      el("p", { class: "nada" }, "O dia em que a OS foi encerrada no Protheus. Fica no registro da preventiva."),
      campo("OS fechada em", eData), campo("OS", eOS)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Gravar", classe: "primario", acao: () => {
        const os = eOS.value.replace(/\D+/g, "");
        return ev.fecharPreventiva(p, eData.value, os ? os.padStart(6, "0") : "");
      } }],
  });
  if (!r) return false;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: OS fechada em ${br(r.dados.em)}.`);
    return true;
  } catch (x) { erro(x.message); return false; }
}

export async function passarParaOMesSeguinte(p) {
  const livre = el("input", { placeholder: "motivo do adiamento" });
  const r = await caixa({
    titulo: "Adiar para o próximo mês",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), " sai da contagem deste mês (é o Status ",
        el("b", {}, "Reprogramada"), " da planilha) e o motivo fica registrado."),
      campo("Motivo", livre)),
    acoes: [{ rotulo: "Voltar", valor: false },
      { rotulo: "Passar", classe: "perigo", acao: () => ev.adiarPreventiva(p, livre.value.trim()) }],
  });
  if (!r) return;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: adiada para o próximo mês.`);
  } catch (x) { erro(x.message); }
}

export async function cancelarPrev(p) {
  const motivo = el("input", { placeholder: "motivo da não execução" });
  const r = await caixa({
    titulo: "Cancelar a preventiva",
    corpo: el("div", {}, el("p", {}, el("b", {}, p.frota), " sai da contagem do mês."),
      campo("Motivo", motivo)),
    acoes: [{ rotulo: "Voltar", valor: false },
      { rotulo: "Cancelar a preventiva", classe: "perigo", acao: () => ev.cancelarPreventiva(p, motivo.value.trim()) }],
  });
  if (!r) return;
  try {
    await ev.aplicar(r);
    avisar(`${p.frota}: cancelada.`);
  } catch (x) { erro(x.message); }
}

export async function andamento(p, sim) {
  try {
    await ev.aplicar(ev.preventivaEmAndamento(p, sim));
    avisar(sim ? `${p.frota}: em andamento.` : `${p.frota}: não está mais em andamento.`);
  } catch (x) { erro(x.message); }
}

export async function reabrirPrev(p) {
  try {
    await ev.aplicar(ev.reabrirPreventiva(p));
    avisar(`${p.frota} voltou para o plano.`);
  } catch (x) { erro(x.message); }
}

export const TIPO_MUDANCA = {
  inclusao: ["Inclusão", ""], liberacao: ["Liberação", "andando"], parada: ["Parada", "andando"],
  reprogramacao: ["Reprogramação", "hoje"], realizacao: ["Realização", "ok"], andamento: ["Andamento", ""],
  cancelamento: ["Cancelamento", "vencida"], reabertura: ["Reabertura", ""], edicao: ["Edição", ""],
  entrega: ["Chegada", "ok"], fechamento: ["Fechamento", "ok"],
};

export function linhaMudanca(m, comFrota = false) {
  const e = m.e;
  const [rot, cor] = TIPO_MUDANCA[m.tipo] || ["Mudança", ""];
  const quando = new Date(e.ts);
  return el("div", { class: "evento mudanca" },
    el("div", { class: "qdo" }, brCurto(e.ts.slice(0, 10)),
      el("small", {}, quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))),
    el("div", { class: "oq" },
      chip(rot, "tipo-mud " + cor), " ",
      comFrota && m.depois ? el("b", {}, m.depois.frota + " · ") : null,
      el("span", { class: "autor" }, (e.autor || "—") + " "), m.texto,
      e.origem === "claude" ? el("span", { class: "tag claude" }, " pedido ao Claude") : null,
      m.detalhes.length ? el("div", { class: "mud-det" }, m.detalhes.join(" · ")) : null,
      e.motivo ? el("div", { class: "mot" }, "motivo: " + e.motivo) : null));
}

export async function abrirFichaPrev(id, ctx) {
  const p = ev.porId(id, "preventiva");
  if (!p) return;
  const s = M.situacaoPreventiva(p);
  const linha = (r, v) => v ? el("tr", {}, el("th", {}, r), el("td", {}, v)) : null;
  const hist = ev.mudancasDe(id, "preventiva").map(descreverMudancaPrev).filter(Boolean).reverse();
  const ref = M.hoje();
  const t = textoPasso(p, ref);
  const passo = t.passo;
  const pcm = pessoas.pode("parada");

  const corpo = el("div", {},
    // No alto, o passo a passo com as datas, e o que falta numa frase.
    p.fora ? null : el("div", { class: "ficha-passo" + (t.alerta ? " alerta" : "") },
      passoAPasso(p, ref),
      el("p", { class: "fp-falta" }, el("b", {}, M.preventivaAberta(p) ? "O que falta: " : ""), t.texto)),
    el("table", { class: "tabela" },
      linha("Situação", el("span", {}, chip(M.rotulo(s), M.corDe(s)),
        M.preventivaVencida(p) ? chip("vencida", "vencida") : null)),
      linha("Aguardando", ({ "Operação": "a operação", PCM: "o PCM" })[M.esperandoQuem(p)] || null),
      linha("Frota", p.frota),
      linha("Equipamento", [p.equipamento, p.local].filter(Boolean).join(" · ")),
      linha("Preventivas", p.plano ? `${p.plano}${p.qtd > 1 ? ` (${p.qtd})` : ""}` : null),
      linha("Vencimento (plano)", p.vence ? br(p.vence) : null),
      linha("Prazo do Service", p.prazo_service ? br(p.prazo_service) : p.prazo_service_texto),
      linha("Liberação (operação)", p.disponivel_agora ? "agora" : (p.disponivel_em ? br(p.disponivel_em) : null)),
      linha("Dia da parada (PCM)", p.dia_parada ? br(p.dia_parada) : null),
      linha("Reprogramações da parada", p.reprog_parada
        ? `${p.reprog_parada}× · a primeira data era ${br(p.parada_orig)}` +
          (p.motivo_parada ? ` · último motivo: ${p.motivo_parada}` : "") : null),
      linha("Liberação alterada", p.reprog_liberacao ? `${p.reprog_liberacao}×` : null),
      linha("Chegou na oficina", p.entregue_em ? (() => {
        const n = M.atrasoEntrega(p);
        return el("span", {}, br(p.entregue_em), " ", p.entrega_combinada
          ? chip(n ? `${n} dia${n === 1 ? "" : "s"} depois do combinado (${brCurto(p.entrega_combinada)})` : "no dia combinado", n ? "hoje" : "ok")
          : el("span", { class: "nada" }, "sem dia combinado"));
      })() : M.entregaAtrasando(p) ? el("span", {}, chip(`ainda não chegou · ${M.atrasoEntrega(p)} dia(s) de atraso`, "vencida")) : null),
      linha("Por que chegou atrasada", p.motivo_entrega),
      linha("Quem atrasou a entrega", p.quem_atrasou_entrega),
      linha("Onde fazer", p.onde_fazer),
      linha("OS", p.os || (pcm && !p.cancelada && !p.excluida ? campoOSPrev(p) : null)),
      OFICINA && linha("Na Programação", (() => {
        const a = ev.atividadeDaPreventiva(p);
        if (!a) return M.preventivaAberta(p) ? el("span", { class: "nada" }, "ainda não — entra no dia da parada, quando ela for marcada") : null;
        const s2 = M.situacaoDe(a);
        return el("span", {}, chip(M.rotulo(s2), M.corDe(s2)), " ",
          a.semana ? `semana ${a.semana}${a.dia ? " · " + a.dia : ""}` : "na carteira", a.os ? ` · OS ${a.os}` : "", " ",
          el("button", { class: "mini", onclick: () => { fecharCaixa(); ctx && ctx.ir("programacao",
            a.semana ? `s=${a.semana}&a=${a.ano}&f=${encodeURIComponent(a.frota)}` : `m=carteira&f=${encodeURIComponent(a.frota)}`); } },
            "Abrir na Programação"));
      })()),
      linha("HH previsto", p.hh ? String(p.hh).replace(".", ",") : null),
      OFICINA ? linha("Pendências na carteira", p.pendencias ? String(p.pendencias) : null) : null,
      linha("Realizada em", p.realizada_em ? br(p.realizada_em)
        : p.realizada_sem_data ? "marcada Realizada na planilha, sem a data" : null),
      linha("OS fechada em", p.fechada_em ? br(p.fechada_em) : M.preventivaFeita(p) ? el("span", { class: "nada" }, "a fechar") : null),
      linha("Por que está fora", p.por_que_fora),
      linha("Se não for realizada, motivo", p.motivo),
      linha("Observação", p.obs)),
    el("h2", { class: "mini" }, `Registro de mudanças · ${hist.length}`),
    el("div", {}, hist.map(m => linhaMudanca(m))));

  // O botão do próximo passo vem primeiro e em destaque; os outros, depois.
  const acoes = [];
  if (pcm && !p.excluida) acoes.push({ rotulo: "Editar", acao: async () => { await editarPreventiva(p); } });
  if (M.preventivaAberta(p)) {
    const vez = (id, rot) => passo === id ? { rotulo: rot, classe: "primario" } : { rotulo: rot };
    if (pessoas.pode("disponibilidade")) {
      acoes.push({ ...vez("liberar", p.disponivel_agora || p.disponivel_em ? "Mudar a liberação" : "Informar liberação"),
        acao: async () => { await informarDisponibilidade(p); } });
    }
    if (pcm) {
      acoes.push({ ...vez("parada", p.dia_parada ? "Reprogramar a parada" : "Marcar parada"),
        ...(passo === "chegada" && M.passoAtrasado(p, ref) && p.dia_parada > ref ? { classe: "primario" } : {}),
        acao: async () => { await marcarParada(p); } });
      if (!p.entregue_em) acoes.push({ ...(passo === "chegada" && p.dia_parada <= ref ? { classe: "primario" } : {}),
        rotulo: "A frota chegou", acao: async () => { await registrarEntregaPrev(p); } });
      else acoes.push({ rotulo: "Corrigir a chegada", acao: async () => { await registrarEntregaPrev(p); } });
      if (p.em_andamento && !p.entregue_em) acoes.push({ rotulo: "Não está em andamento", acao: async () => { await andamento(p, false); } });
      acoes.push({ ...vez("baixa", "Dar baixa"), acao: async () => { await darPorFeita(p); } });
      acoes.push({ rotulo: "Adiar para o próximo mês", acao: async () => { await passarParaOMesSeguinte(p); } });
      acoes.push({ rotulo: "Cancelar", classe: "perigo", acao: async () => { await cancelarPrev(p); } });
    }
    acoes.sort((a, b) => (b.classe === "primario") - (a.classe === "primario"));
  } else if (pcm && !p.fora) {
    if (p.entregue_em && M.atrasoEntrega(p) > 0 && !p.motivo_entrega) {
      acoes.push({ rotulo: "Justificar a chegada", acao: async () => { await registrarEntregaPrev(p, { soJustificar: true }); } });
    }
    if (p.realizada_sem_data) {
      acoes.push({ rotulo: "Informar a data", classe: "primario", acao: async () => { await darPorFeita(p); } });
    }
    if (M.preventivaFeita(p) && pessoas.pode("preventiva_feita")) {
      acoes.push({ rotulo: p.fechada_em ? "Corrigir o fechamento" : "Fechar a OS", ...(p.fechada_em || p.realizada_sem_data ? {} : { classe: "primario" }),
        acao: async () => { await fecharOSPrev(p); } });
    }
    acoes.push({ rotulo: "Reabrir", acao: async () => { await reabrirPrev(p); } });
  }
  await caixa({ titulo: p.frota || "Preventiva", corpo, acoes, largura: "640px" });
}

// ── a OS da preventiva, digitada na linha ───────────────────────────────────
// Como na Programação: digita e Enter. Vale também para a já realizada — a OS
// do Protheus às vezes só sai depois. Se a OS preventiva na Programação ainda
// não tem número, recebe o mesmo.

export async function gravarOSPrev(p, texto) {
  const [os] = normalizarOSLista(texto);
  if (!os) { erro("Digite o número da OS."); return false; }
  const eventos = [ev.editar(p, { os }, "preventiva")];
  const a = ev.atividadeDaPreventiva(p);
  if (a && !a.os && !a.cancelada) eventos.push(ev.editar(a, { os }));
  const validos = eventos.filter(Boolean);
  if (!validos.length) { avisar("Nada mudou."); return false; }
  try {
    await ev.aplicar(validos);
    avisar(`OS ${os} gravada na preventiva da ${p.frota}` + (OFICINA && validos.length > 1 ? " e na OS da Programação." : "."));
    return true;
  } catch (x) { erro(x.message); return false; }
}

export function campoOSPrev(p) {
  const entrada = el("input", {
    class: "os-in", inputmode: "numeric", placeholder: "sem OS", "aria-label": `OS da preventiva da ${p.frota}`,
    title: "Digite a OS e aperte Enter", dataset: { id: p.id },
    onclick: e => e.stopPropagation(),
    onkeydown: async e => {
      if (e.key === "Escape") { entrada.value = ""; entrada.blur(); return; }
      if (e.key !== "Enter" && e.key !== "Tab") return;
      if (!entrada.value.trim()) return;
      e.preventDefault();
      if (!await gravarOSPrev(p, entrada.value)) entrada.focus();
    },
  });
  return entrada;
}

// ── o passo a passo ─────────────────────────────────────────────────────────
// Cada frota do plano está num de quatro passos (M.PASSOS_PREV): liberação,
// parada, chegada e baixa. A linha diz numa frase o que falta, e tem UM botão:
// o do próximo passo. O resto (editar, adiar, cancelar…) fica no ⋯ e na ficha.

export const ORDEM_PASSO = ["liberar", "parada", "chegada", "baixa", "feita", "fora"];
const PASSO = new Map(M.PASSOS_PREV.map(x => [x.id, x]));
const NOME_PASSO = { feita: "Realizadas", fora: "Adiadas e canceladas" };
const quemDoPasso = x => x.quem === "PCM" ? "com o PCM" : "com a operação";

/** O que falta, numa frase, e se está com problema. */
export function textoPasso(p, ref = M.hoje()) {
  const passo = M.passoPreventiva(p);
  const lim = M.venceEfetivo(p);
  const alerta = M.passoAtrasado(p, ref);
  const depois = lim ? `, depois do vencimento (${brCurto(lim)})` : "";
  if (passo === "liberar") return { passo, alerta, texto: "Falta a operação dizer quando a frota fica livre" };
  if (passo === "parada") return { passo, alerta, texto: alerta ? `Liberada só a partir de ${brCurto(p.disponivel_em)}${depois}`
    : `Liberada ${p.disponivel_agora ? "agora" : "a partir de " + brCurto(p.disponivel_em)} · falta marcar o dia da parada` };
  if (passo === "chegada") {
    if (p.dia_parada < ref) return { passo, alerta: true, texto: `A parada era ${brCurto(p.dia_parada)} e a frota não chegou` };
    if (p.dia_parada === ref) return { passo, alerta, texto: "Parada hoje · anote quando a frota chegar" };
    return { passo, alerta, texto: `Parada marcada para ${diaPorExtenso(p.dia_parada)}${alerta ? depois : ""}` };
  }
  if (passo === "baixa") {
    const n = M.atrasoEntrega(p);
    return { passo, alerta: false, texto: (p.entregue_em ? `Na oficina desde ${brCurto(p.entregue_em)}` : "Na oficina") +
      (n ? ` (chegou ${n} dia${n === 1 ? "" : "s"} depois)` : "") + " · dar a baixa quando terminar" };
  }
  if (passo === "feita") return { passo, alerta: false, texto: p.realizada_em ? `Realizada em ${brCurto(p.realizada_em)}` : "Realizada, sem a data" };
  return { passo, alerta: false, texto: (p.cancelada ? "Cancelada" : "Adiada para o próximo mês") + (p.motivo ? ` · ${p.motivo}` : "") };
}

/** O botão do próximo passo — um só — ou nada, se o passo não é de quem
 *  está olhando (ou se é só esperar o dia). */
function botaoPasso(p, ref, sug = "") {
  const passo = M.passoPreventiva(p);
  const b = (rot, fn, title = "") => el("button", { type: "button", class: "mini primario-leve passo-b", title,
    onclick: e => { e.stopPropagation(); fn(); } }, rot);
  if (passo === "liberar") return pessoas.pode("disponibilidade") ? b("Informar liberação", () => informarDisponibilidade(p)) : null;
  if (!pessoas.pode("parada")) return null;
  if (passo === "parada") return sug ? b(`Marcar ${brCurto(sug)}`, () => marcarParada(p, { sugestao: sug }), `Marcar a parada em ${br(sug)} (sugestão)`)
    : b("Marcar parada", () => marcarParada(p));
  if (passo === "chegada") return p.dia_parada <= ref ? b("Chegou", () => registrarEntregaPrev(p), "Anotar o dia em que a frota chegou na oficina")
    : M.passoAtrasado(p, ref) ? b("Antecipar", () => marcarParada(p), "A parada está depois do vencimento") : null;
  if (passo === "baixa") return b("Dar baixa", () => darPorFeita(p));
  if (passo === "feita" && p.realizada_sem_data) return b("Informar a data", () => darPorFeita(p));
  return null;
}

/** Os quatro passos em bolinhas: feito (✓), o da vez (aceso; vermelho se
 *  com problema) e os que faltam. */
export function trilhaPassos(p, ref = M.hoje()) {
  const passo = M.passoPreventiva(p);
  const i = ORDEM_PASSO.indexOf(passo);
  const alerta = M.passoAtrasado(p, ref);
  const nome = passo === "feita" ? "realizada" : passo === "fora" ? NOME_PASSO.fora.toLowerCase() : `passo ${i + 1} de 4: ${PASSO.get(passo).nome}`;
  return el("span", { class: "trilha" + (passo === "fora" ? " fora" : ""), title: nome, role: "img", "aria-label": nome },
    M.PASSOS_PREV.map((x, k) => {
      const feito = passo === "feita" || (passo !== "fora" && k < i);
      return el("i", { class: feito ? "feito" : k === i ? "agora" + (alerta ? " alerta" : "") : "" }, feito ? "✓" : String(x.n));
    }));
}

function linhaPrev(p, ref, ctx, sug = "") {
  const t = textoPasso(p, ref);
  const venc = M.preventivaVencida(p, ref);
  const lim = M.venceEfetivo(p);
  return el("div", { class: "pv-lin" + (t.alerta ? " alerta" : "") + (t.passo === "feita" || t.passo === "fora" ? " apagada" : ""),
    dataset: { id: p.id, passo: t.passo }, onclick: cliqueLimpo(() => abrirFichaPrev(p.id, ctx)) },
    trilhaPassos(p, ref),
    el("div", { class: "pv-frota" }, el("b", {}, p.frota || "—"),
      el("span", {}, [p.plano || "preventiva", p.qtd > 1 ? `${p.qtd}×` : "", p.onde_fazer === "Terceiro" ? "terceiro" : ""].filter(Boolean).join(" · "))),
    el("div", { class: "pv-venc" + (venc ? " venceu" : "") }, lim ? `${venc ? "venceu" : "vence"} ${brCurto(lim)}` : "sem vencimento"),
    el("div", { class: "pv-falta" }, t.texto),
    el("div", { class: "pv-acoes", onclick: e => e.stopPropagation() }, botaoPasso(p, ref, sug), botaoMais("preventiva", p.id, ctx)));
}

/** Os passos em cartões, com quantas frotas em cada: é o filtro da lista. */
function quadroPassos(plano, ref, atual, ir) {
  const conta = new Map(ORDEM_PASSO.map(x => [x, 0]));
  const problema = new Map();
  for (const p of plano) {
    const x = M.passoPreventiva(p);
    conta.set(x, conta.get(x) + 1);
    if (M.passoAtrasado(p, ref)) problema.set(x, (problema.get(x) || 0) + 1);
  }
  const cartao = (id, marca, nome, n, sub, cls = "") => el("button", { type: "button", class: "passo-c " + cls + (atual === id ? " on" : ""),
    dataset: { passo: id }, "aria-pressed": atual === id ? "true" : "false", onclick: () => ir(atual === id ? "" : id) },
    el("span", { class: "pc-cab" }, marca ? el("span", { class: "pc-n" }, marca) : null, el("span", { class: "pc-nome" }, nome)),
    el("b", { class: "pc-v" }, String(n)),
    el("small", { class: "pc-sub" + (problema.get(id) ? " alerta" : "") }, sub));
  return el("div", { class: "passos", role: "group", "aria-label": "Passo" },
    cartao("", "", "Todas", plano.length, "no plano do mês", "todas"),
    ...M.PASSOS_PREV.map(x => cartao(x.id, String(x.n), x.nome, conta.get(x.id),
      problema.get(x.id) ? `${problema.get(x.id)} com problema` : quemDoPasso(x))),
    cartao("feita", "✓", NOME_PASSO.feita, conta.get("feita"), plano.length ? `${Math.round(conta.get("feita") * 100 / plano.length)}% do plano` : "", "feita"),
    conta.get("fora") ? cartao("fora", "", "Adiadas", conta.get("fora"), "ou canceladas", "fora") : null);
}

/** A lista do mês, por passo, na ordem do fluxo. Dentro do passo, o que está
 *  com problema primeiro, depois o que vence antes. */
function listaPrev(itens, ref, ctx, { agrupar = true } = {}) {
  const sug = sugestoesDeParada(itens, ref);
  const ordem = (a, b) => M.passoAtrasado(b, ref) - M.passoAtrasado(a, ref) ||
    String(M.venceEfetivo(a) || "9").localeCompare(String(M.venceEfetivo(b) || "9")) || natural(a.frota, b.frota);
  const grupos = ORDEM_PASSO.map(id => ({ id, itens: itens.filter(p => M.passoPreventiva(p) === id).sort(id === "feita"
    ? (a, b) => String(b.realizada_em || "").localeCompare(String(a.realizada_em || "")) || natural(a.frota, b.frota) : ordem) }))
    .filter(g => g.itens.length);
  const cab = g => {
    const x = PASSO.get(g.id);
    return el("div", { class: "pv-grupo", dataset: { passo: g.id } },
      x ? el("span", { class: "pc-n" }, String(x.n)) : null,
      el("b", {}, x ? x.nome : NOME_PASSO[g.id]),
      el("span", { class: "n" }, String(g.itens.length)),
      x ? el("span", { class: "pv-faz" }, x.faz) : null);
  };
  return el("div", { class: "pv-lista" }, grupos.flatMap(g => [agrupar ? cab(g) : null,
    ...g.itens.map(p => linhaPrev(p, ref, ctx, sug.get(p.id) || ""))].filter(Boolean)));
}

/** O passo a passo da ficha: cada passo com a sua data. */
function passoAPasso(p, ref) {
  const passo = M.passoPreventiva(p);
  const i = ORDEM_PASSO.indexOf(passo);
  const alerta = M.passoAtrasado(p, ref);
  const datas = {
    liberar: p.disponivel_agora ? "agora" : p.disponivel_em ? brCurto(p.disponivel_em) : "",
    parada: p.dia_parada ? brCurto(p.dia_parada) : "",
    chegada: p.entregue_em ? brCurto(p.entregue_em) : p.em_andamento ? "na oficina" : "",
    baixa: p.realizada_em ? brCurto(p.realizada_em) : p.realizada_sem_data ? "sem data" : "",
  };
  return el("ol", { class: "passo-a-passo" + (passo === "fora" ? " fora" : "") }, M.PASSOS_PREV.map((x, k) => {
    const feito = passo === "feita" || (passo !== "fora" && k < i);
    const agora = k === i;
    return el("li", { class: feito ? "feito" : agora ? "agora" + (alerta ? " alerta" : "") : "" },
      el("span", { class: "pp-n" }, feito ? "✓" : String(x.n)),
      el("span", { class: "pp-txt" }, el("b", {}, x.nome), el("small", {}, datas[x.id] || (agora ? "falta" : "—"))),
      el("small", { class: "pp-quem" }, x.quem));
  }));
}

/** A linha do mês: quanto saiu, quanto venceu, e quanto do mês já passou. */
export function linhaDoMes(r, mes, ref) {
  const [ano, m] = mesDoPlano(mes).split("-").map(Number);
  const noMes = ano && ref.slice(0, 7) === mesDoPlano(mes);
  const diasMes = ano ? new Date(Date.UTC(ano, m, 0)).getUTCDate() : 30;
  const hojeNoMes = Number(ref.slice(8, 10));
  const pctFeito = Math.round(r.pct_realizadas * 100);
  const pctMes = noMes ? Math.round(hojeNoMes * 100 / diasMes) : null;
  return el("div", { class: "mes-linha" },
    el("div", { class: "ml-texto" },
      el("b", {}, `${r.realizadas} de ${r.preventivas}`), " realizadas",
      r.vencidas ? [" · ", el("span", { class: "ml-venc" }, el("b", {}, String(r.vencidas)), ` vencida${r.vencidas === 1 ? "" : "s"}`)] : null,
      " · ", `${r.frotas} frota${r.frotas === 1 ? "" : "s"}`, " · ", `${String(r.hh).replace(".", ",")} HH previstos`,
      noMes ? el("span", { class: "seg" }, ` · ${diasMes - hojeNoMes} dia${diasMes - hojeNoMes === 1 ? "" : "s"} para acabar o mês`) : null),
    el("div", { class: "ml-trilho", title: noMes ? `${pctFeito}% realizadas · ${pctMes}% do mês passou` : `${pctFeito}% realizadas` },
      el("span", { class: "ml-cheio", style: `width:${pctFeito}%` }),
      noMes ? el("i", { class: "ml-hoje", style: `left:${pctMes}%` }) : null));
}

export function tabelaFora(itens, ctx) {
  return el("div", { class: "rolagem" }, el("table", { class: "tabela fora" },
    el("thead", {}, el("tr", {},
      ["Frota", "Equipamento", "Local", "Preventivas", "Qtd.", "Por que está fora", "Observação"]
        .map((t, i) => el("th", { class: i === 4 ? "num" : "" }, t)))),
    el("tbody", {}, itens.map(p => el("tr", {
      style: "cursor:pointer", onclick: cliqueLimpo(() => abrirFichaPrev(p.id, ctx)) },
      el("td", {}, el("b", {}, p.frota)),
      el("td", {}, p.equipamento || "—"),
      el("td", {}, p.local || "—"),
      el("td", {}, p.plano || "—"),
      el("td", { class: "num" }, String(p.qtd || 1)),
      el("td", {}, p.por_que_fora || "—"),
      el("td", { class: "seg" }, p.obs || ""))))));
}

// ── a tela ──────────────────────────────────────────────────────────────────

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "Out-26" → 202610, para ordenar os meses. */
export const ordemMes = m => {
  const [nome, aa] = String(m || "").split("-");
  const i = MESES.indexOf(String(nome || "").toLowerCase().slice(0, 3));
  return i < 0 ? 0 : (2000 + Number(aa || 0)) * 100 + i + 1;
};
export const rotuloMes = m => {
  const [nome, aa] = String(m || "").split("-");
  const i = MESES.indexOf(String(nome || "").toLowerCase().slice(0, 3));
  return i < 0 ? (m || "sem mês") : `${NOME_MES[i]}/20${aa}`;
};

// O passo de cada situação da planilha (para ir do Painel à lista).
const PASSO_DA_SIT = { "Sem data da Operação": "liberar", "Disponível: marcar a parada": "parada",
  "Com data: marcar a parada": "parada", "Conflito: Operação depois do prazo": "parada", "Programada": "chegada",
  "Programada depois do prazo": "chegada", "Parada passou, sem baixa": "chegada", "Em andamento": "baixa",
  "Realizada": "feita", "Passa para o mês seguinte": "fora", "Cancelada": "fora" };

const estado = { mes: "", busca: "", passo: "", foraAberto: false, vista: "planilha", tipoMud: "", dia: "",
  // a vista Planilha: o filtro, a ordem e os registros abertos
  plFiltro: "", plOrdem: "agenda", plAbertos: new Set() };

// As etiquetas do calendário das preventivas, e o que cada cor quer dizer.
const LEGENDA_PREV = [["aberta", "Parada marcada"], ["hoje", "Parada hoje"], ["atrasada", "Não chegou"],
  ["aprovar", "Na oficina"], ["feita", "Realizada"], ["libera", "Liberação prevista"]];

export async function montar(raiz, ctx, params = new URLSearchParams()) {
  if (["planilha", "plano", "calendario", "painel", "mudancas"].includes(params.get("v"))) estado.vista = params.get("v");
  if (params.get("passo") != null) estado.passo = ORDEM_PASSO.includes(params.get("passo")) ? params.get("passo") : "";
  const fBusca = el("input", { class: "busca", type: "search", value: estado.busca,
    placeholder: "frota, equipamento, local, OS…",
    oninput: () => { estado.busca = fBusca.value; pintar(); } });
  // O mês: ‹ e › andam um mês; o campo pula para qualquer um.
  const irMes = m => { if (!m) return; estado.mes = m; estado.dia = ""; pintar(); };
  const fMes = el("input", { type: "month", class: "nav-mes-in", "aria-label": "Mês do plano",
    onchange: () => { if (fMes.value) irMes(mesDeISO(fMes.value)); } });
  const navMes = el("div", { class: "nav-mes" },
    el("button", { type: "button", class: "nav-mes-b", title: "Mês anterior", "aria-label": "Mês anterior",
      onclick: () => irMes(somaMes(estado.mes, -1)) }, "‹"),
    fMes,
    el("button", { type: "button", class: "nav-mes-b", title: "Próximo mês", "aria-label": "Próximo mês",
      onclick: () => irMes(somaMes(estado.mes, 1)) }, "›"));
  const titulo = el("span", { class: "sub" });
  const corpo = el("div", {});

  // Cinco jeitos de olhar o mesmo mês: a planilha em blocos (a de entrada,
  // desde 29/10/2026), a lista de trabalho (o passo a passo), as paradas no
  // calendário, o painel com os números e as decisões, e o registro do que mudou.
  const vistas = el("div", { class: "segmentos" }, [["planilha", "Planilha"], ["plano", "Passo a passo"], ["calendario", "Calendário"],
    ["painel", "Painel"], ["mudancas", "Mudanças"]]
    .map(([v, t]) => el("button", { class: "seg-op", dataset: { v },
      onclick: () => { estado.vista = v; pintar(); } }, t)));
  raiz.append(
    el("div", { class: "cabec" }, el("h1", {}, "Preventivas"), navMes, vistas,
      el("div", { class: "espaco" }),
      pessoas.pode("parada") ? el("button", { class: "primario",
        onclick: async () => {
          const id = await incluirPreventiva(estado.mes);
          if (id) { const p = ev.porId(id, "preventiva"); if (p && p.mes) estado.mes = p.mes; if (estado.vista !== "planilha") estado.vista = "plano"; pintar(); }
        } }, "+ Incluir frota") : null),
    el("div", { class: "filtros" }, fBusca, titulo),
    corpo);

  const kpi = (rot, val, det, cls = "") =>
    el("div", { class: "kpi " + cls },
      el("div", { class: "k-rot" }, rot),
      el("div", { class: "k-val" }, String(val)),
      det ? el("div", { class: "k-det" }, det) : null);

  function pintar() {
    limpar(corpo);
    const ref = M.hoje();
    const todas = ev.lista("preventiva");

    // O mês: o corrente, se tem plano; senão o mais recente com plano. O que
    // a pessoa escolheu fica, mesmo vazio — é assim que se monta um mês novo.
    const meses = mesesComPlano();
    if (!ordemMes(estado.mes)) estado.mes = meses.includes(mesDaData(ref)) ? mesDaData(ref) : meses[0] || mesDaData(ref);
    fMes.value = mesDoPlano(estado.mes);
    const doMes = todas.filter(p => (p.mes || "") === estado.mes);
    const nPlano = doMes.filter(p => !p.fora && !p.excluida).length;
    titulo.textContent = nPlano ? `${nPlano} frota${nPlano === 1 ? "" : "s"} no plano de ${rotuloMes(estado.mes)}` : "";
    for (const b of vistas.querySelectorAll("[data-v]")) b.classList.toggle("on", b.dataset.v === estado.vista);
    if (!doMes.length) return pintarMesVazio(meses);
    if (estado.vista === "painel") return pintarPainel(doMes, ref);
    if (estado.vista === "mudancas") return pintarMudancas(doMes);
    if (estado.vista === "planilha") return pintarPlanilha(corpo, { doMes, ref, ctx, estado, repintar: pintar });
    const plano = doMes.filter(p => !p.fora && !p.excluida);
    const fora = doMes.filter(p => p.fora && !p.excluida).sort((a, b) => natural(a.frota, b.frota));
    const r = M.resumoPreventivas(doMes, ref);

    const q = semAcento(estado.busca.trim());
    const achou = p => !q || semAcento([p.frota, p.equipamento, p.local, p.plano, p.os, p.obs].join(" ")).includes(q);

    // ── a linha do mês, no lugar das oito caixas (que continuam no Painel)
    corpo.append(linhaDoMes(r, estado.mes, ref));

    // ── o que dá para ligar à Programação (o que existia antes da ligação)
    if (OFICINA && pessoas.pode("parada")) {
      const lig = conciliacao(doMes).filter(it => it.passos.length);
      if (lig.length) corpo.append(el("div", { class: "faixa-ligar" },
        el("span", {}, el("b", {}, `${lig.length} preventiva${lig.length === 1 ? "" : "s"}`),
          " deste mês ainda não conversa" + (lig.length === 1 ? "" : "m") + " com a Programação " +
          "(OS anotada nos dois lados, ou parada marcada sem a OS no dia)."),
        el("button", { class: "primario-leve", onclick: () => ligarAProgramacao(doMes) }, "Ver e ligar")));
    }
    if (estado.vista === "calendario") return pintarCalendario(plano.filter(achou), ref);

    // ── os passos: quantas frotas em cada um; tocar filtra
    const buscadas = plano.filter(achou);
    corpo.append(quadroPassos(buscadas, ref, estado.passo, id => { estado.passo = id; pintar(); }));
    const x = PASSO.get(estado.passo);
    const semLib = buscadas.filter(p => M.passoPreventiva(p) === "liberar");
    if (x || (estado.passo === "" && semLib.length && pessoas.pode("parada"))) {
      corpo.append(el("div", { class: "passo-explica" },
        x ? el("span", {}, el("b", {}, `Passo ${x.n} · ${x.nome}. `), x.faz,
          el("span", { class: "seg" }, ` ${x.quem === "PCM" ? "É com o PCM." : "É com a operação."}`)) : el("span", { class: "seg" },
          `${semLib.length} frota${semLib.length === 1 ? "" : "s"} ainda sem a liberação da operação.`),
        el("div", { class: "espaco" }),
        (estado.passo === "liberar" || !x) && semLib.length && pessoas.pode("parada")
          ? el("button", { type: "button", class: "mini", title: "A lista, pronta para colar no grupo",
            onclick: () => copiar(textoCobranca(semLib, ref), "Cobrança") }, "Copiar a cobrança") : null));
    }
    const visiveis = estado.passo ? buscadas.filter(p => M.passoPreventiva(p) === estado.passo) : buscadas;
    corpo.append(visiveis.length ? listaPrev(visiveis, ref, ctx, { agrupar: !estado.passo })
      : vazio(estado.passo ? `Nenhuma frota no passo ${(x || {}).nome || NOME_PASSO[estado.passo] || ""}.` : "Nada com esta busca."));

    if (fora.length && !estado.passo) {
      const det = el("details", { class: "outros", open: estado.foraAberto },
        el("summary", {}, `Fora do plano de ${rotuloMes(estado.mes).split("/")[0]} · ` +
          `${fora.length} frota${fora.length === 1 ? "" : "s"} · não entram na contagem acima`),
        tabelaFora(fora.filter(p => !q ||
          semAcento([p.frota, p.equipamento, p.local, p.plano, p.obs, p.por_que_fora].join(" ")).includes(q)), ctx));
      det.addEventListener("toggle", () => { estado.foraAberto = det.open; });
      corpo.append(det);
    }
  }

  // ── o calendário das paradas ─────────────────────────────────────────────
  // Cada frota no dia da parada (a realizada, no dia em que saiu; a liberada
  // sem parada, no dia em que a operação disse que libera). Do lado: o dia
  // tocado, o que não chegou, as liberadas esperando a parada e o andamento.
  function pintarCalendario(plano, ref) {
    const mesISO = mesDoPlano(estado.mes) || ref.slice(0, 7);
    const sug = sugestoesDeParada(plano, ref);
    const itens = [];
    const diaDe = new Map();
    for (const p of plano) {
      const passo = M.passoPreventiva(p);
      const t = textoPasso(p, ref).texto;
      const rot = (fim = "") => [el("b", {}, p.frota || "—"), " ", fim || p.plano || "preventiva"];
      let dia = "", classe = "";
      if (passo === "feita" && p.realizada_em) { dia = p.realizada_em; classe = "feita"; }
      else if (passo === "baixa") { dia = p.entregue_em || p.dia_parada; classe = "aprovar"; }
      else if (passo === "chegada") { dia = p.dia_parada; classe = p.dia_parada < ref ? "atrasada" : p.dia_parada === ref ? "hoje" : "aberta"; }
      // a liberação que já passou não diz mais nada no calendário: está na lista do lado
      else if (passo === "parada" && p.disponivel_em >= ref) { dia = p.disponivel_em; classe = "libera"; }
      if (!dia) continue;
      diaDe.set(p.id, dia);
      itens.push({ dia, id: p.id, classe, titulo: `${p.frota} · ${p.plano || "preventiva"} — ${t}`,
        rotulo: rot(classe === "libera" ? "libera" : "") });
    }
    const dia = estado.dia || (ref.startsWith(mesISO) ? ref : "");
    const presentes = new Set(itens.map(i => i.classe));
    const cal = el("div", { class: "cal-cartao" },
      calendarioMes({ mes: mesISO, itens, ref, selecionado: dia,
        aoDia: d => { estado.dia = d; pintar(); if (matchMedia("(max-width: 1100px)").matches) {
          const c = corpo.querySelector(".tr-card.dia"); if (c) c.scrollIntoView({ block: "nearest", behavior: "smooth" }); } },
        aoItem: it => abrirFichaPrev(it.id, ctx) }),
      presentes.size ? el("div", { class: "cal-leg" }, LEGENDA_PREV.filter(([c]) => presentes.has(c))
        .map(([c, rot]) => el("span", { class: "leg-item" }, el("i", { class: "ev-cor " + c }), rot))) : null);

    const linha = p => {
      const it = itens.find(i => i.id === p.id);
      const b = botaoPasso(p, ref, sug.get(p.id) || "");
      return itemAgenda({ classe: it ? it.classe : "fila", id: p.id,
        titulo: [el("b", {}, p.frota || "—"), " · ", p.plano || "preventiva"], sub: textoPasso(p, ref).texto,
        acoes: b ? [b] : [], aoClicar: cliqueLimpo(() => abrirFichaPrev(p.id, ctx)) });
    };
    const lista = (l, max = 0) => el("div", { class: "ag-lista" }, (max ? l.slice(0, max) : l).map(linha));
    const porVenc = (a, b) => String(M.venceEfetivo(a) || "9").localeCompare(String(M.venceEfetivo(b) || "9")) || natural(a.frota, b.frota);

    const doDia = dia ? plano.filter(p => diaDe.get(p.id) === dia).sort(porVenc) : [];
    const cartaoDia = cartaoTrilho(dia === ref ? "Hoje" : dia ? "Dia selecionado" : "Escolha um dia",
      dia ? (doDia.length ? lista(doDia) : el("p", { class: "tr-vazio" }, "Nenhuma parada neste dia."))
        : el("p", { class: "tr-vazio" }, "Toque num dia do calendário para ver as paradas dele."),
      { classe: "dia", sub: dia ? diaPorExtenso(dia) : "",
        acao: dia && dia !== ref ? el("button", { type: "button", class: "discreto mini", onclick: () => { estado.dia = ""; irMes(mesDaData(ref)); } },
          "Voltar para hoje") : null });

    const naoChegou = plano.filter(p => M.passoPreventiva(p) === "chegada" && p.dia_parada < ref)
      .sort((a, b) => String(a.dia_parada).localeCompare(String(b.dia_parada)));
    const vencidas = plano.filter(p => M.preventivaVencida(p, ref)).length;
    const alerta = naoChegou.length || vencidas ? cartaoTrilho(naoChegou.length
      ? `${naoChegou.length} não chegou${naoChegou.length === 1 ? "" : "ram"}` : `${vencidas} vencida${vencidas === 1 ? "" : "s"}`,
      el("div", {}, naoChegou.length ? lista(naoChegou, 4) : null,
        naoChegou.length && vencidas ? el("p", { class: "tr-nota" }, `${vencidas} preventiva${vencidas === 1 ? "" : "s"} com o vencimento passado.`) : null),
      { classe: "alerta", sub: naoChegou.length ? "a parada passou e a frota não chegou na oficina" : "o vencimento passou e não foi realizada",
        acao: el("div", { class: "tr-acoes" }, naoChegou.length > 4 ? el("button", { type: "button", class: "mini", onclick: () => {
          estado.vista = "plano"; estado.passo = "chegada"; pintar(); } }, `Ver as ${naoChegou.length}`) : null) }) : null;

    const liberadas = plano.filter(p => M.passoPreventiva(p) === "parada").sort(porVenc);
    const semParada = liberadas.length ? cartaoTrilho(`Liberadas, sem parada · ${liberadas.length}`, lista(liberadas, 5),
      { classe: "sem-prazo", sub: "a operação liberou; falta o dia",
        acao: liberadas.length > 5 ? el("button", { type: "button", class: "mini", onclick: () => {
          estado.vista = "plano"; estado.passo = "parada"; pintar(); } }, `Ver as ${liberadas.length}`) : null }) : null;

    const valem = plano.filter(p => !p.adiada && !p.cancelada);
    const feitas = valem.filter(M.preventivaFeita).length;
    const andamento = cartaoTrilho(`Realizadas · ${rotuloMes(estado.mes).split("/")[0]}`,
      valem.length ? anel([{ rotulo: "Realizadas", valor: feitas, cor: "var(--s1)" },
        { rotulo: "Faltam", valor: valem.length - feitas, cor: "var(--ctx)" }], { rotuloCentro: "realizadas" })
        : el("p", { class: "tr-vazio" }, "Nada no plano."),
      { classe: "pontual", sub: `${valem.length} frota${valem.length === 1 ? "" : "s"} no plano`,
        acao: el("button", { type: "button", class: "mini", onclick: () => { estado.vista = "painel"; pintar(); } }, "Ver o painel") });

    const semLib = plano.filter(p => M.passoPreventiva(p) === "liberar").sort(porVenc);
    const aguardando = semLib.length ? cartaoTrilho(`Sem liberação · ${semLib.length}`,
      pessoas.pode("disponibilidade") ? lista(semLib, 5) : el("p", { class: "tr-nota" }, "A operação ainda não disse quando estas frotas ficam livres."),
      { classe: "sem-prazo", sub: "esperando a operação",
        acao: el("div", { class: "tr-acoes" },
          pessoas.pode("parada") ? el("button", { type: "button", class: "mini", title: "A lista, pronta para colar no grupo",
            onclick: () => copiar(textoCobranca(semLib, ref), "Cobrança") }, "Copiar a cobrança") : null,
          el("button", { type: "button", class: "mini", onclick: () => { estado.vista = "plano"; estado.passo = "liberar"; pintar(); } }, "Ver na lista")) }) : null;

    corpo.append(agenda(cal, cartaoDia, alerta, pessoas.pode("parada") ? semParada : aguardando,
      andamento, pessoas.pode("parada") ? aguardando : semParada));
  }

  // ── o mês sem plano ──────────────────────────────────────────────────────
  function pintarMesVazio(meses) {
    const pode = pessoas.pode("parada");
    const nome = rotuloMes(estado.mes);
    const outros = meses.filter(m => m !== estado.mes);
    corpo.append(el("div", { class: "mes-vazio" },
      el("h2", {}, `Ainda não há plano de preventivas em ${nome}`),
      el("p", {}, pode
        ? "Monte o plano aqui: inclua as frotas uma a uma, ou traga as frotas de um mês que já tem plano e confira o plano de cada uma. " +
          "A planilha também serve: a aba Preventivas do mês, em Importar."
        : "Quando o PCM montar o plano deste mês, as frotas aparecem aqui."),
      pode ? el("div", { class: "acoes-mes" },
        el("button", { class: "primario", onclick: async () => { if (await incluirPreventiva(estado.mes)) pintar(); } }, "+ Incluir frota"),
        outros.length ? el("button", { onclick: async () => { if (await trazerDeOutroMes(estado.mes)) pintar(); } },
          "Trazer frotas de outro mês") : null) : null,
      outros.length ? el("p", { class: "meses-com-plano" }, "Meses com plano: ",
        ...outros.map(m => el("button", { type: "button", class: "chip-mes", onclick: () => irMes(m) }, rotuloMes(m)))) : null));
  }

  // ── o painel ─────────────────────────────────────────────────────────────
  function pintarPainel(doMes, ref) {
    const plano = doMes.filter(p => !p.fora && !p.excluida);
    const r = M.resumoPreventivas(doMes, ref);
    const valem = plano.filter(p => !p.adiada && !p.cancelada);
    const feitas = valem.filter(M.preventivaFeita);
    const comData = feitas.filter(p => p.realizada_em && M.venceEfetivo(p));
    const noPrazo = comData.filter(p => p.realizada_em <= M.venceEfetivo(p));
    const esperaOp = plano.filter(p => M.esperandoQuem(p, ref) === "Operação");
    const esperaPCM = plano.filter(p => M.esperandoQuem(p, ref) === "PCM");
    const reprog = plano.reduce((n, p) => n + (p.reprog_parada || 0), 0);
    const adiadas = plano.filter(p => p.adiada).length;
    const hhFeito = Math.round(feitas.reduce((t, p) => t + (Number(p.hh) || 0), 0) * 10) / 10;
    const pc = v => v == null ? "—" : Math.round(v * 100) + "%";
    const irPara = passo => () => { estado.vista = "plano"; estado.passo = passo; pintar(); };

    const kpiClic = (rot, val, det, cls, fazer) => {
      const k = kpi(rot, val, det, cls);
      if (fazer) { k.classList.add("clicavel"); k.title = "Ver na lista"; k.addEventListener("click", fazer); }
      return k;
    };
    corpo.append(el("div", { class: "kpis" },
      kpiClic("Plano do mês", r.preventivas, (() => {
        const n = plano.filter(p => p.fonte === "").length;
        return `${r.frotas} frotas` + (n ? ` · ${n} incluída${n === 1 ? "" : "s"} no site` : "");
      })(), ""),
      kpiClic("Realizadas", pc(r.pct_realizadas), `${r.realizadas} de ${r.preventivas}`, r.realizadas ? "ok" : "", irPara("feita")),
      kpiClic("No prazo", pc(comData.length ? noPrazo.length / comData.length : null),
        comData.length ? `${noPrazo.length} de ${comData.length} realizadas até o vencimento` : "nenhuma realizada com data", ""),
      kpiClic("Vencidas", r.vencidas, "abertas com o vencimento passado", r.vencidas ? "vencida" : ""),
      kpiClic("Aguardando a operação", esperaOp.length, "sem a liberação da frota", esperaOp.length ? "hoje" : "", irPara("liberar")),
      kpiClic("Aguardando o PCM", esperaPCM.length, "liberadas, sem parada", esperaPCM.length ? "andando" : "",
        irPara("parada")),
      kpiClic("Reprogra\u00admações", reprog + adiadas, `${reprog} de parada · ${adiadas} adiada${adiadas === 1 ? "" : "s"}`, reprog + adiadas ? "hoje" : "",
        () => { estado.vista = "mudancas"; estado.tipoMud = "reprogramacao"; pintar(); }),
      kpiClic("HH", String(r.hh).replace(".", ","), `previstos · ${String(hhFeito).replace(".", ",")} realizados`, "")));

    // O ritmo: quanto saiu contra quanto do mês já passou — só no mês corrente.
    const mesISO = mesDoPlano(estado.mes);
    if (mesISO === ref.slice(0, 7)) {
      const [a, m] = mesISO.split("-").map(Number);
      const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
      const passou = Number(ref.slice(8, 10)) / diasMes;
      corpo.append(el("div", { class: "ritmo" },
        el("div", { class: "ritmo-tit" }, "Ritmo do mês"),
        medidor(Math.round(r.pct_realizadas * 100), `realizadas · ${r.realizadas} de ${r.preventivas}`),
        // o mês que passou é tempo, não nota: barra neutra
        Object.assign(medidor(Math.round(passou * 100), `do mês passado · faltam ${diasMes - Number(ref.slice(8, 10))} dias`),
          { className: "medidor neutro" })));
    }

    // ── o que decidir
    const ds = decisoesPreventivas(doMes, OFICINA ? ev.lista() : [], ref);
    corpo.append(el("div", { class: "titulo-secao" }, "O que decidir agora",
      el("span", { class: "n" }, `· ${ds.length} ${ds.length === 1 ? "item" : "itens"}, do mais urgente para a oportunidade`)),
      listaDecisoes(ds, ctx));

    // ── os gráficos
    const grade = el("div", { class: "bi-grade" });
    corpo.append(el("div", { class: "titulo-secao" }, "Os números do mês"), grade);
    const pendurar = (card, desenhar, larga = false) => {
      if (larga) card.classList.add("larga");
      grade.append(card);
      card.querySelector(".g-corpo").append(desenhar(Math.max(280, (card.clientWidth || 600) - 28)));
    };

    // 1. onde está cada preventiva
    // conta pela quantidade de cada linha, como o "Plano do mês" lá em cima
    const qtdDe = p => Number(p.qtd) || 1;
    // e sem as adiadas e canceladas, que saem da contagem do mês — o centro da
    // rosca é o mesmo número do "Plano do mês"
    const conta = new Map();
    for (const p of plano) {
      if (p.adiada || p.cancelada) continue;
      const x = M.passoPreventiva(p); conta.set(x, (conta.get(x) || 0) + qtdDe(p));
    }
    const foraDoMes = plano.filter(p => p.adiada || p.cancelada).length;
    // Uma cor por passo, na ordem fixa das séries; a realizada no verde de feito.
    const COR_PASSO = { liberar: "var(--s4)", parada: "var(--s2)", chegada: "var(--s1)", baixa: "var(--s5)", feita: "var(--ok)" };
    const itensSit = ORDEM_PASSO.filter(x => conta.get(x)).map(x => ({ rotulo: (PASSO.get(x) || {}).nome || NOME_PASSO[x], chave: x,
      valor: conta.get(x), cor: COR_PASSO[x] }));
    // Rosca: como o plano do mês se divide pelos passos — a lista de cada um
    // está a um clique, na vista Plano.
    pendurar(cartaoGrafico("Em que passo está cada preventiva", "liberação, parada, chegada, baixa ou realizada" +
      (foraDoMes ? ` · ${foraDoMes} adiada${foraDoMes === 1 ? "" : "s"} ou cancelada${foraDoMes === 1 ? "" : "s"} fora` : "") +
      " · clique para ver a lista",
      el("div", { class: "g-corpo" })),
    w => itensSit.length ? graficoRosca({ largura: w, itens: itensSit, aoClicar: it => irPara(it.chave)(),
      centro: { valor: [...conta.values()].reduce((t, n) => t + n, 0), rotulo: "no plano" } })
      : el("p", { class: "nada" }, "Nada no plano."));

    // 2. os vencimentos de cada semana, e se estão cobertos
    const semanaDe = iso => { const w = M.semanaISO(iso); return w.ano * 100 + w.semana; };
    const inicioMes = mesISO ? mesISO + "-01" : ref;
    const comVenc = valem.filter(p => M.venceEfetivo(p));
    const chaves = [...new Set(comVenc.map(p => M.venceEfetivo(p) < inicioMes ? 0 : semanaDe(M.venceEfetivo(p))))].sort((x, y) => x - y);
    const xs = chaves.map(k => k === 0 ? "Antes" : "S" + (k % 100));
    const serieDe = f => chaves.map(k => comVenc.filter(p => (M.venceEfetivo(p) < inicioMes ? 0 : semanaDe(M.venceEfetivo(p))) === k && f(p)).length);
    const series = [
      { nome: "Realizada", cor: "var(--s3)", valores: serieDe(M.preventivaFeita) },
      { nome: "Com parada programada", cor: "var(--s1)", valores: serieDe(p => !M.preventivaFeita(p) && (p.dia_parada || p.em_andamento)) },
      { nome: "Sem parada", cor: "var(--ctx)", valores: serieDe(p => !M.preventivaFeita(p) && !p.dia_parada && !p.em_andamento) },
    ];
    pendurar(cartaoGrafico("Vencimentos por semana", "quantas vencem em cada semana, e se já estão cobertas · \"Antes\" = vencidas antes do mês",
      el("div", { class: "g-corpo" }), { forma: "caixa", legendaDe: series.map(x => ({ nome: x.nome, cor: x.cor })) }),
    w => xs.length ? graficoColunas({ largura: w, xs, series }) : el("p", { class: "nada" }, "Sem vencimentos no plano."));

    // 3. as paradas dos próximos dez dias úteis
    const dias = [];
    for (let d = ref; dias.length < 10; d = M.somaDias(d, 1)) { const w = M.data(d).getUTCDay(); if (w >= 1 && w <= 5) dias.push(d); }
    const paradas = dias.map(d => plano.filter(p => p.dia_parada === d && M.preventivaAberta(p)).length);
    pendurar(cartaoGrafico("Paradas nos próximos dez dias úteis", "quantas frotas param em cada dia — dia com três ou mais pede conferir a oficina",
      el("div", { class: "g-corpo" })),
    w => paradas.some(Boolean) ? graficoColunas({ largura: w, xs: dias.map(d => brCurto(d)),
      series: [{ nome: "Paradas", cor: "var(--s1)", valores: paradas }] })
      : el("p", { class: "nada" }, "Nenhuma parada programada nos próximos dez dias úteis."));

    // 4. por que foi reprogramada, adiada ou cancelada
    const motivos = new Map();
    const TIPOS_M = { parada: ["Parada reprogramada", "var(--s2)"], adiada: ["Adiada", "var(--s4)"],
      cancelada: ["Cancelada", "var(--ctx)"], liberacao: ["Liberação alterada", "var(--s5)"] };
    const ids = new Set(plano.map(p => p.id));
    for (const e of ev.log) {
      if (e.alvo_tipo !== "preventiva" || !ids.has(e.alvo)) continue;
      const d = e.dados || {};
      const t = e.tipo === "prev_parada" && d.de && d.de !== d.dia ? "parada"
        : e.tipo === "prev_adiada" ? "adiada" : e.tipo === "prev_cancelada" ? "cancelada"
        : e.tipo === "prev_disponivel" && d.de && d.de !== d.quando ? "liberacao" : "";
      if (!t) continue;
      const k = String(e.motivo || "sem motivo informado").trim();
      const chave = k.toLowerCase();
      if (!motivos.has(chave)) motivos.set(chave, { rotulo: k, n: {} });
      motivos.get(chave).n[t] = (motivos.get(chave).n[t] || 0) + 1;
    }
    const itensMot = [...motivos.values()].map(x => ({ rotulo: x.rotulo,
      partes: Object.entries(TIPOS_M).map(([t, [nome, cor]]) => ({ nome, cor, valor: x.n[t] || 0 })) }))
      .sort((a, b) => b.partes.reduce((t, x) => t + x.valor, 0) - a.partes.reduce((t, x) => t + x.valor, 0)).slice(0, 10);
    pendurar(cartaoGrafico("Por que mudou", "motivos das reprogramações, adiamentos e cancelamentos do mês",
      el("div", { class: "g-corpo" }), { forma: "caixa",
        legendaDe: Object.values(TIPOS_M).map(([nome, cor]) => ({ nome, cor })) }),
    w => itensMot.length ? graficoBarras({ largura: w, itens: itensMot })
      : el("p", { class: "nada" }, "Nenhuma reprogramação, adiamento ou cancelamento neste mês."));

    // 5. onde se faz
    const ondes = [["Interna", "var(--s1)"], ["Terceiro", "var(--s2)"], ["", "var(--ctx)"]];
    const itensOnde = ondes.map(([o, cor]) => {
      const daqui = valem.filter(p => (p.onde_fazer || "") === o);
      const soma = l => l.reduce((t, p) => t + qtdDe(p), 0);
      const feitas = soma(daqui.filter(M.preventivaFeita));
      return { rotulo: o || "A definir", cor, valor: soma(daqui),
        extra: [{ valor: String(feitas), rotulo: "realizadas" }, { valor: String(soma(daqui) - feitas), rotulo: "em aberto" }] };
    }).filter(x => x.valor);
    pendurar(cartaoGrafico("Onde se faz", "oficina interna, terceiro ou ainda a definir · a dica mostra quantas já saíram",
      el("div", { class: "g-corpo" })),
    w => itensOnde.length ? graficoRosca({ largura: w, itens: itensOnde,
      centro: { valor: itensOnde.reduce((t, it) => t + it.valor, 0), rotulo: "a fazer" } })
      : el("p", { class: "nada" }, "—"));

    // 6. mês a mês, quando já há mais de um
    const meses = [...new Set(ev.lista("preventiva").map(p => p.mes).filter(Boolean))].sort((a, b) => ordemMes(a) - ordemMes(b));
    if (meses.length > 1) {
      const valores = meses.map(mm => M.resumoPreventivas(ev.lista("preventiva").filter(p => p.mes === mm), ref).pct_realizadas);
      pendurar(cartaoGrafico("Realizadas mês a mês", "parte do plano de cada mês que foi realizada", el("div", { class: "g-corpo" })),
      w => graficoLinhas({ largura: w, xs: meses.map(rotuloMes), series: [{ nome: "Realizadas", cor: "var(--s1)", valores }],
        marcado: meses.indexOf(estado.mes) }), true);
    }
  }

  // ── as mudanças do mês ───────────────────────────────────────────────────
  function pintarMudancas(doMes) {
    const todas = [];
    for (const p of doMes) {
      for (const m of ev.mudancasDe(p.id, "preventiva")) {
        const d = descreverMudancaPrev(m);
        if (d) todas.push(d);
      }
    }
    todas.sort((a, b) => b.e.ts.localeCompare(a.e.ts) || String(b.e.id).localeCompare(String(a.e.id)));
    const conta = t => todas.filter(x => x.tipo === t).length;
    const reprogParada = todas.filter(x => x.tipo === "reprogramacao" && x.e.tipo === "prev_parada").length;
    corpo.append(el("p", { class: "nota", style: "margin-top:0" },
      `Neste mês: ${reprogParada} reprogramaç${reprogParada === 1 ? "ão" : "ões"} de parada · ` +
      // as adiadas contam pelo estado, como no painel: a planilha também adia
      // (o Status "Reprogramada"), sem lançamento de adiar no site
      `${doMes.filter(p => p.adiada && !p.excluida && !p.fora).length} adiada(s) · ` +
      `${todas.filter(x => x.tipo === "reprogramacao" && x.e.tipo === "prev_disponivel").length} liberação(ões) alterada(s) · ` +
      `${todas.filter(x => x.e.tipo === "criada").length} frota(s) incluída(s) no site.`));
    const tipos = [["", "Todas"], ["reprogramacao", "Reprogramações"], ["parada", "Paradas"], ["liberacao", "Liberações"],
      ["entrega", "Chegadas"], ["realizacao", "Realizações"], ["inclusao", "Inclusões"], ["edicao", "Edições"], ["cancelamento", "Cancelamentos"]];
    corpo.append(el("div", { class: "faixa-sit" }, tipos.filter(([t]) => !t || conta(t)).map(([t, rot]) =>
      el("button", { class: "fsit" + (estado.tipoMud === t ? " on" : ""),
        onclick: () => { estado.tipoMud = t; pintar(); } },
        el("b", {}, String(t ? conta(t) : todas.length)), " ", rot))));
    const q = semAcento(estado.busca.trim());
    const visiveis = todas.filter(x => (!estado.tipoMud || x.tipo === estado.tipoMud) &&
      (!q || semAcento([x.depois && x.depois.frota, x.e.autor, x.texto, x.e.motivo, x.detalhes.join(" ")].join(" ")).includes(q)));
    if (!visiveis.length) { corpo.append(vazio("Nenhuma mudança com estes filtros.")); return; }
    corpo.append(el("div", { class: "lista-mudancas" }, visiveis.slice(0, 300).map(m => {
      const n = linhaMudanca(m, true);
      n.style.cursor = "pointer";
      n.addEventListener("click", cliqueLimpo(() => abrirFichaPrev(m.e.alvo, ctx)));
      return n;
    })));
    if (visiveis.length > 300) corpo.append(el("p", { class: "nota" }, `Mostrando as 300 mais recentes de ${visiveis.length}.`));
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
