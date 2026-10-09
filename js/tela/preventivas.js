// Preventivas — a aba "Preventivas" da planilha, no site.
//
// Uma linha por frota, os mesmos números no alto (preventivas a fazer, frotas,
// com e sem data da operação, parada marcada, conflitos, vencidas, realizadas,
// HH) e a mesma Situação colorida, calculada pela mesma fórmula
// (`M.situacaoPreventiva`, conferida linha a linha em testes/resultados.mjs).
//
// O que o site acrescenta é a separação: uma preventiva só anda quando duas
// áreas respondem coisas diferentes — a operação diz QUANDO o caminhão fica
// livre, o PCM diz QUE DIA ele para. Por isso a tela é dividida por de quem é
// a bola, e não por frota: a pergunta que destrava é "o que está parado
// esperando mim?". O que já saiu (realizada, mês seguinte, cancelada) e o
// quadro "fora do plano" ficam em seções próprias, fora do caminho.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, br, brCurto, chip, caixa, campo, selecao,
  avisar, erro, vazio, cliqueLimpo } from "../ui.js";
import { busca as semAcento } from "../texto.js";
import { natural } from "./grade.js";
import { botaoMais } from "./comum.js";

// ── o cartão (celular, e a tela Para você) ──────────────────────────────────

export function cartaoPrev(p, ctx, { acoes = [] } = {}) {
  const s = M.situacaoPreventiva(p);
  const esperando = M.esperandoQuem(p);
  const tags = [chip(s, M.corDe(s))];
  if (esperando) tags.push(chip("bola com " + esperando, esperando === "Operação" ? "hoje" : "andando"));
  if (M.preventivaVencida(p)) tags.push(chip("vencida", "vencida"));
  if (p.os) tags.push(chip("OS " + p.os, "os"));
  if (p.pendencias > 0) tags.push(chip(`${p.pendencias} pendência${p.pendencias === 1 ? "" : "s"} na carteira`));
  if (p.onde_fazer === "Terceiro") tags.push(chip("terceiro"));

  const sub = [];
  if (p.plano) sub.push(p.plano + (p.qtd > 1 ? ` (${p.qtd})` : ""));
  if (p.equipamento) sub.push(p.equipamento);
  if (p.local) sub.push(p.local);
  if (M.venceEfetivo(p)) sub.push("vence " + brCurto(M.venceEfetivo(p)));
  if (p.disponivel_agora) sub.push("livre agora");
  else if (p.disponivel_em) sub.push("livre " + brCurto(p.disponivel_em));
  if (p.dia_parada) sub.push("para " + brCurto(p.dia_parada));

  return el("div", { class: `at ${M.corDe(s)}${M.preventivaFeita(p) ? " feito" : ""}` },
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
  const bAgora = el("button", {}, "Já está livre");
  const bData = el("button", {}, "Fica livre em…");
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
  const r = await caixa({
    titulo: "Quando esta frota pode parar?",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : "",
        lim ? ` · vence ${br(lim)}` : ""),
      el("p", { class: "nada" },
        "A manutenção só marca a parada depois desta resposta."),
      el("div", { style: "display:flex;gap:8px;margin-bottom:12px" }, bAgora, bData),
      linhaData),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Responder", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  const quando = escolha === "agora" ? "agora" : eQuando.value;
  if (!quando) { erro("Falta a data."); return false; }
  try {
    await ev.aplicar(ev.informarDisponibilidade(p, quando));
    avisar(`${p.frota}: ${quando === "agora" ? "livre agora" : "livre em " + br(quando)}.`);
    return true;
  } catch (e) { erro(e.message); return false; }
}

export async function marcarParada(p) {
  const eDia = el("input", { type: "date", value: p.dia_parada ||
    (p.disponivel_agora ? M.hoje() : p.disponivel_em || M.hoje()) });
  const eOnde = selecao([{ v: "", t: "— onde —" }, "Interna", "Terceiro"], p.onde_fazer || "");
  const livre = p.disponivel_agora ? "agora" : (p.disponivel_em ? br(p.disponivel_em) : null);
  const lim = M.venceEfetivo(p);

  const r = await caixa({
    titulo: "Marcar a parada",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), p.plano ? ` · ${p.plano}` : "",
        lim ? ` · vence ${br(lim)}` : ""),
      livre
        ? el("p", { class: "nada" }, `A operação disse que fica livre ${livre}.`)
        : el("p", { style: "color:var(--hoje)" },
          "⚠ A operação ainda não informou quando esta frota fica livre. " +
          "Marcar sem isso é marcar no escuro."),
      p.pendencias > 0
        ? el("p", { class: "nada" },
          `Tem ${p.pendencias} pendência(s) na carteira desta frota — dá para ` +
          "aproveitar a parada e fazer junto.")
        : null,
      campo("Dia da parada", eDia),
      campo("Onde fazer", eOnde)),
    acoes: [{ rotulo: "Cancelar", valor: false },
      { rotulo: "Marcar", classe: "primario", valor: true }],
  });
  if (r !== true) return false;
  try {
    await ev.aplicar(ev.marcarParada(p, eDia.value, eOnde.value));
    avisar(`${p.frota} para em ${br(eDia.value)}.`);
    return true;
  } catch (e) { erro(e.message); return false; }
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
      { rotulo: "Confirmar", classe: "primario", valor: true }],
  });
  if (r !== true) return;
  try {
    const os = eOS.value.replace(/\D+/g, "");
    await ev.aplicar(ev.preventivaFeita(p, eData.value, os ? os.padStart(6, "0") : ""));
    avisar(`${p.frota}: preventiva realizada.`);
  } catch (e) { erro(e.message); }
}

export async function passarParaOMesSeguinte(p) {
  const livre = el("input", { placeholder: "por que não sai este mês" });
  const r = await caixa({
    titulo: "Passa para o mês seguinte",
    corpo: el("div", {},
      el("p", {}, el("b", {}, p.frota), " sai da conta deste mês (é o Status ",
        el("b", {}, "Reprogramada"), " da planilha) e fica registrado por quê."),
      campo("Motivo", livre)),
    acoes: [{ rotulo: "Voltar", valor: false },
      { rotulo: "Passar", classe: "perigo", valor: true }],
  });
  if (r !== true) return;
  try {
    await ev.aplicar(ev.adiarPreventiva(p, livre.value.trim()));
    avisar(`${p.frota}: passa para o mês seguinte.`);
  } catch (x) { erro(x.message); }
}

export async function cancelarPrev(p) {
  const motivo = el("input", { placeholder: "por que não vai ser feita" });
  const r = await caixa({
    titulo: "Cancelar a preventiva",
    corpo: el("div", {}, el("p", {}, el("b", {}, p.frota), " sai da conta do mês."),
      campo("Motivo", motivo)),
    acoes: [{ rotulo: "Voltar", valor: false },
      { rotulo: "Cancelar a preventiva", classe: "perigo", valor: true }],
  });
  if (r !== true) return;
  try {
    await ev.aplicar(ev.cancelarPreventiva(p, motivo.value.trim()));
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
    avisar(`${p.frota} voltou para o mapa.`);
  } catch (x) { erro(x.message); }
}

const ROTULO_EVENTO = e => {
  const d = e.dados || {};
  return ({
    criada: "criou", importada: "veio da planilha",
    prev_disponivel: `informou disponibilidade: ${d.quando === "agora" ? "agora" : br(d.quando)}`,
    prev_parada: `marcou a parada para ${br(d.dia)}`,
    prev_andamento: d.sim === false ? "tirou de em andamento" : "marcou em andamento",
    prev_realizada: `deu por realizada em ${br(d.em)}`,
    prev_adiada: "passou para o mês seguinte",
    prev_cancelada: "cancelou",
    prev_reaberta: "reabriu",
    excluida: "tirou do mapa",
    editada: "editou",
  })[e.tipo] || ev.TIPOS[e.tipo] || e.tipo;
};

export async function abrirFichaPrev(id, ctx) {
  const p = ev.porId(id, "preventiva");
  if (!p) return;
  const s = M.situacaoPreventiva(p);
  const linha = (r, v) => v ? el("tr", {}, el("th", {}, r), el("td", {}, v)) : null;
  const hist = ev.historicoDe(id);

  const corpo = el("div", {},
    el("table", { class: "tabela" },
      linha("Situação", el("span", {}, chip(s, M.corDe(s)),
        M.preventivaVencida(p) ? chip("vencida", "vencida") : null)),
      linha("Bola com", M.esperandoQuem(p)),
      linha("Frota", p.frota),
      linha("Equipamento", [p.equipamento, p.local].filter(Boolean).join(" · ")),
      linha("Preventivas", p.plano ? `${p.plano}${p.qtd > 1 ? ` (${p.qtd})` : ""}` : null),
      linha("Vence (mapa)", p.vence ? br(p.vence) : null),
      linha("Prazo do Service", p.prazo_service ? br(p.prazo_service) : p.prazo_service_texto),
      linha("Disponível em (operação)", p.disponivel_agora ? "agora" : (p.disponivel_em ? br(p.disponivel_em) : null)),
      linha("Dia da parada (PCM)", p.dia_parada ? br(p.dia_parada) : null),
      linha("Onde fazer", p.onde_fazer),
      linha("OS", p.os),
      linha("HH previsto", p.hh ? String(p.hh).replace(".", ",") : null),
      linha("Pendências na carteira", p.pendencias ? String(p.pendencias) : null),
      linha("Realizada em", p.realizada_em ? br(p.realizada_em)
        : p.realizada_sem_data ? "marcada Realizada na planilha, sem a data" : null),
      linha("Por que está fora", p.por_que_fora),
      linha("Se não sair, por quê", p.motivo),
      linha("Observação", p.obs)),
    el("h2", { class: "mini" }, `Registro · ${hist.length}`),
    el("div", {}, hist.map(e => el("div", { class: "evento" },
      el("div", { class: "qdo" }, e.ts.slice(8, 10) + "/" + e.ts.slice(5, 7)),
      el("div", { class: "oq" },
        el("b", {}, e.autor || "—"), " — ", ROTULO_EVENTO(e),
        e.motivo ? el("div", { class: "mot" }, "motivo: " + e.motivo) : null)))));

  const acoes = [];
  const pcm = pessoas.pode("parada");
  if (M.preventivaAberta(p)) {
    if (pessoas.pode("disponibilidade")) {
      acoes.push({ rotulo: "Disponibilidade", acao: async () => { await informarDisponibilidade(p); } });
    }
    if (pcm) {
      acoes.push({ rotulo: "Marcar parada", classe: "primario", acao: async () => { await marcarParada(p); } });
      acoes.push(p.em_andamento
        ? { rotulo: "Não está em andamento", acao: async () => { await andamento(p, false); } }
        : { rotulo: "Em andamento", acao: async () => { await andamento(p, true); } });
      acoes.push({ rotulo: "Realizada", acao: async () => { await darPorFeita(p); } });
      acoes.push({ rotulo: "Mês seguinte", acao: async () => { await passarParaOMesSeguinte(p); } });
      acoes.push({ rotulo: "Cancelar", classe: "perigo", acao: async () => { await cancelarPrev(p); } });
    }
  } else if (pcm && !p.fora) {
    if (p.realizada_sem_data) {
      acoes.push({ rotulo: "Dar a data", classe: "primario", acao: async () => { await darPorFeita(p); } });
    }
    acoes.push({ rotulo: "Reabrir", acao: async () => { await reabrirPrev(p); } });
  }
  await caixa({ titulo: p.frota || "Preventiva", corpo, acoes, largura: "640px" });
}

// ── a tabela de uma seção ───────────────────────────────────────────────────

const data = (iso, cls = "") => iso
  ? el("span", { class: cls }, brCurto(iso)) : el("span", { class: "seg" }, "—");

function botaoDaLinha(p, ref) {
  const quem = M.esperandoQuem(p, ref);
  const s = M.situacaoPreventiva(p, ref);
  const parar = fn => e => { e.stopPropagation(); fn(); };
  if (quem === "Operação" && pessoas.pode("disponibilidade")) {
    return el("button", { class: "mini acao-op", onclick: parar(() => informarDisponibilidade(p)) }, "Informar");
  }
  if (!pessoas.pode("parada")) return "";
  if (s === "Disponível: marcar a parada" || s === "Com data: marcar a parada" ||
    s.startsWith("Conflito")) {
    return el("button", { class: "mini acao-pcm", onclick: parar(() => marcarParada(p)) }, "Marcar parada");
  }
  if (s === "Programada" || s === "Programada depois do prazo" ||
    s === "Em andamento" || s === "Parada passou, sem baixa") {
    return el("button", { class: "mini baixa", onclick: parar(() => darPorFeita(p)) }, "Realizada");
  }
  if (p.realizada_sem_data) {
    return el("button", { class: "mini sem-data", onclick: parar(() => darPorFeita(p)) }, "✓ sem data");
  }
  if (p.realizada_em) return el("span", { class: "feito-em" }, "✓ " + brCurto(p.realizada_em));
  return "";
}

function tabelaPrev(itens, ctx, ref) {
  const cab = el("tr", {},
    el("th", { class: "c-sit" }, "Situação"),
    el("th", { class: "c-fr" }, "Frota"),
    el("th", { class: "c-plano" }, "Preventivas"),
    el("th", { class: "c-dt num" }, "Vence"),
    el("th", { class: "c-dt num", title: "Disponível em — a data da operação" }, "Livre em"),
    el("th", { class: "c-dt num", title: "Dia da parada — o dia que o PCM programa" }, "Parada"),
    el("th", { class: "c-onde" }, "Onde"),
    el("th", { class: "c-os" }, "OS"),
    el("th", { class: "c-hh num" }, "HH"),
    el("th", { class: "c-feito" }, ""));
  const corpo = el("tbody", {}, itens.map(p => {
    const s = M.situacaoPreventiva(p, ref);
    const cor = M.corDe(s);
    const venc = M.preventivaVencida(p, ref);
    const lim = M.venceEfetivo(p);
    const conflito = s.startsWith("Conflito");
    const tr = el("tr", {
      class: `lin ${cor}${M.preventivaFeita(p) ? " feita" : ""}` +
        (p.cancelada ? " cancel" : p.adiada ? " adiada" : ""),
      dataset: { id: p.id },
    },
      el("td", { class: "c-sit" }, el("span", { class: "sit " + cor, title: s }, s)),
      el("td", { class: "c-fr" },
        el("div", { class: "fr" }, p.frota),
        el("div", { class: "seg" }, [p.equipamento, p.local].filter(Boolean).join(" · "))),
      el("td", { class: "c-plano" },
        el("div", { class: "t" }, p.plano || el("span", { class: "seg" }, "—"),
          p.qtd > 1 ? el("span", { class: "tag" }, `${p.qtd}×`) : null),
        (p.motivo && !M.preventivaFeita(p)) ? el("div", { class: "porque" }, p.motivo) : null),
      el("td", { class: "c-dt num", title: p.prazo_service ? "prazo do Service" : "vencimento no mapa" },
        data(lim, venc ? "venceu" : ""),
        p.prazo_service ? el("div", { class: "seg" }, "Service") : null),
      el("td", { class: "c-dt num" }, p.disponivel_agora
        ? el("span", { class: "agora" }, "Agora")
        : data(p.disponivel_em, conflito ? "venceu" : "")),
      el("td", { class: "c-dt num" }, data(p.dia_parada,
        s === "Parada passou, sem baixa" || s === "Programada depois do prazo" ? "venceu" : "")),
      el("td", { class: "c-onde" }, p.onde_fazer || el("span", { class: "seg" }, "—")),
      el("td", { class: "c-os" }, p.os ? el("span", { class: "os" }, p.os) : el("span", { class: "seg" }, "—")),
      el("td", { class: "c-hh num" }, p.hh ? String(p.hh).replace(".", ",") : el("span", { class: "seg" }, "—")),
      el("td", { class: "c-feito" }, botaoDaLinha(p, ref), botaoMais("preventiva", p.id, ctx)));
    tr.addEventListener("click", cliqueLimpo(() => abrirFichaPrev(p.id, ctx)));
    return tr;
  }));
  const tabela = el("table", { class: "grade prev" }, el("thead", {}, cab), corpo);
  const cartoes = el("div", { class: "lista" }, itens.map(p => {
    const b = botaoDaLinha(p, ref);
    return cartaoPrev(p, ctx, { acoes: b ? [b] : [] });
  }));
  return el("div", { class: "grade-caixa" },
    el("div", { class: "so-tabela" }, tabela),
    el("div", { class: "so-cartao" }, cartoes));
}

function tabelaFora(itens, ctx) {
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
const ordemMes = m => {
  const [nome, aa] = String(m || "").split("-");
  const i = MESES.indexOf(String(nome || "").toLowerCase().slice(0, 3));
  return i < 0 ? 0 : (2000 + Number(aa || 0)) * 100 + i + 1;
};
const rotuloMes = m => {
  const [nome, aa] = String(m || "").split("-");
  const i = MESES.indexOf(String(nome || "").toLowerCase().slice(0, 3));
  return i < 0 ? (m || "sem mês") : `${NOME_MES[i]}/20${aa}`;
};

// As situações na ordem em que pedem ação.
const ORDEM_SIT = ["Parada passou, sem baixa", "Conflito: Operação depois do prazo",
  "Programada depois do prazo", "Disponível: marcar a parada", "Com data: marcar a parada",
  "Sem data da Operação", "Em andamento", "Programada", "Realizada",
  "Passa para o mês seguinte", "Cancelada"];

const estado = { mes: "", busca: "", situacoes: new Set(), foraAberto: false };

export async function montar(raiz, ctx) {
  const fBusca = el("input", { class: "busca", type: "search", value: estado.busca,
    placeholder: "frota, equipamento, local, OS…",
    oninput: () => { estado.busca = fBusca.value; pintar(); } });
  const fMes = el("select", { onchange: () => { estado.mes = fMes.value; estado.situacoes.clear(); pintar(); } });
  const titulo = el("span", { class: "sub" });
  const corpo = el("div", {});

  raiz.append(
    el("div", { class: "cabec" }, el("h1", {}, "Preventivas"), titulo),
    el("div", { class: "filtros" }, fBusca, fMes),
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
    if (!todas.length) {
      corpo.append(vazio("Nenhuma preventiva. Importe a planilha na aba Importar — a aba Preventivas vem junto."));
      fMes.hidden = true;
      return;
    }

    // O mês: o mais recente, a não ser que ele tenha escolhido outro.
    const meses = [...new Set(todas.map(p => p.mes || ""))].sort((a, b) => ordemMes(b) - ordemMes(a));
    if (!meses.includes(estado.mes)) estado.mes = meses[0];
    limpar(fMes);
    for (const m of meses) fMes.append(el("option", { value: m, selected: m === estado.mes }, rotuloMes(m)));
    fMes.hidden = meses.length < 2;
    titulo.textContent = rotuloMes(estado.mes);

    const doMes = todas.filter(p => (p.mes || "") === estado.mes);
    const plano = doMes.filter(p => !p.fora);
    const fora = doMes.filter(p => p.fora).sort((a, b) => natural(a.frota, b.frota));
    const r = M.resumoPreventivas(doMes, ref);

    // ── os números do alto da aba
    corpo.append(el("div", { class: "kpis" },
      kpi("Preventivas", r.preventivas, `a fazer no mês · ${r.frotas} frotas`),
      kpi("Com data da operação", r.com_data, "Agora ou uma data"),
      kpi("Sem data da operação", r.sem_data, "bola com a operação", r.sem_data ? "hoje" : ""),
      kpi("Parada marcada", r.parada_marcada, "dia programado pelo PCM", r.parada_marcada ? "andando" : ""),
      kpi("Conflitos de data", r.conflitos, "operação libera depois do prazo", r.conflitos ? "vencida" : ""),
      kpi("Vencidas", r.vencidas, "pelo mapa ou pelo prazo", r.vencidas ? "vencida" : ""),
      kpi("Realizadas", r.realizadas, `${Math.round(r.pct_realizadas * 100)}% do mês`, r.realizadas ? "ok" : ""),
      kpi("HH previsto", String(r.hh).replace(".", ","), "tempos padrão por tipo")));

    // ── a faixa de situações: conta e filtra
    const conta = new Map();
    for (const p of plano) {
      const s = M.situacaoPreventiva(p, ref);
      conta.set(s, (conta.get(s) || 0) + 1);
    }
    corpo.append(el("div", { class: "faixa-sit" },
      el("button", { class: "fsit todas" + (estado.situacoes.size ? "" : " on"),
        onclick: () => { estado.situacoes.clear(); pintar(); } },
        el("b", {}, String(plano.length)), " Todas"),
      ORDEM_SIT.filter(s => conta.get(s)).map(s => el("button", {
        class: `fsit ${M.corDe(s)}${estado.situacoes.has(s) ? " on" : ""}`,
        onclick: () => {
          estado.situacoes.has(s) ? estado.situacoes.delete(s) : estado.situacoes.add(s);
          pintar();
        },
      }, el("b", {}, String(conta.get(s))), " ", s))));

    const q = semAcento(estado.busca.trim());
    const passa = p => {
      if (estado.situacoes.size && !estado.situacoes.has(M.situacaoPreventiva(p, ref))) return false;
      if (q && !semAcento([p.frota, p.equipamento, p.local, p.plano, p.os, p.obs].join(" ")).includes(q)) return false;
      return true;
    };
    const ordem = (a, b) =>
      ORDEM_SIT.indexOf(M.situacaoPreventiva(a, ref)) - ORDEM_SIT.indexOf(M.situacaoPreventiva(b, ref)) ||
      String(M.venceEfetivo(a) || "9").localeCompare(String(M.venceEfetivo(b) || "9")) ||
      natural(a.frota, b.frota);
    const visiveis = plano.filter(passa).sort(ordem);

    const comPCM = visiveis.filter(p => M.esperandoQuem(p, ref) === "PCM");
    const comOp = visiveis.filter(p => M.esperandoQuem(p, ref) === "Operação");
    const andando = visiveis.filter(p => M.preventivaAberta(p) && !M.esperandoQuem(p, ref));
    const fechadas = visiveis.filter(p => !M.preventivaAberta(p));

    const qtd = l => l.reduce((s, p) => s + (Number(p.qtd) || 1), 0);
    const secao = (tit, explica, itens, cls = "") => {
      if (!itens.length) return null;
      return el("section", { class: "sec-prev " + cls },
        el("div", { class: "titulo-secao" }, tit,
          el("span", { class: "n" }, `· ${itens.length} frota${itens.length === 1 ? "" : "s"}, ` +
            `${qtd(itens)} preventiva${qtd(itens) === 1 ? "" : "s"}`)),
        explica ? el("p", { class: "nota" }, explica) : null,
        tabelaPrev(itens, ctx, ref));
    };

    if (!visiveis.length) corpo.append(vazio("Nada com estes filtros."));
    corpo.append(
      secao("Bola com o PCM — marcar a parada",
        "A operação já disse quando a frota fica livre (ou a parada passou e falta a baixa). " +
        "Falta o PCM marcar o dia.", comPCM, "pcm"),
      secao("Bola com a operação — dizer quando a frota fica livre",
        "Sem essa data a manutenção não tem como marcar a parada.", comOp, "op"),
      secao("Andando — parada marcada ou em andamento", "", andando),
      secao("Fechadas no mês — realizada, mês seguinte, cancelada",
        "Mês seguinte é o Status Reprogramada da planilha: sai da conta de cima.", fechadas));

    if (fora.length && !estado.situacoes.size) {
      const det = el("details", { class: "outros", open: estado.foraAberto },
        el("summary", {}, `Fora do plano de ${rotuloMes(estado.mes).split("/")[0]} · ` +
          `${fora.length} frota${fora.length === 1 ? "" : "s"} · não entram na conta acima`),
        tabelaFora(fora.filter(p => !q ||
          semAcento([p.frota, p.equipamento, p.local, p.plano, p.obs, p.por_que_fora].join(" ")).includes(q)), ctx));
      det.addEventListener("toggle", () => { estado.foraAberto = det.open; });
      corpo.append(det);
    }
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
