// O que se pode saber de uma atividade sem perguntar a ninguém.
//
// Tudo aqui é função pura sobre o estado: situação, datas, aderência. Nada
// grava, nada lê do banco. Isso é de propósito — é o que permite conferir os
// indicadores com uma conta na mão e descobrir qual dos dois está errado.

export const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const TIPOS = ["Corretiva", "Preventiva", "Inspeção", "Borracharia",
  "Preditiva", "Melhoria", "Não classificado"];
export const ORIGENS = ["Programada", "Extra"];
export const PRIORIDADES = ["", "P1", "P2", "P3"];

// Os motivos que a planilha já usa. Texto livre continua valendo — esta lista
// existe para que o motivo mais comum seja um toque, não uma digitação.
export const MOTIVOS = [
  "Falta de peça",
  "Falta de mão de obra",
  "Frota em viagem",
  "Frota não chegou",
  "Aguardando fornecedor",
  "Aguardando orçamento",
  "Serviço maior que o previsto",
  "Prioridade da operação",
  "Oficina externa atrasou",
  "Reprogramado pelo PCM",
  "Outro",
];

// ── datas ───────────────────────────────────────────────────────────────────
// Data é texto "AAAA-MM-DD" o tempo inteiro. Vira Date só para contar dias, e
// sempre em UTC: Date local com hora zero pula um dia para trás em fuso
// negativo, que é o nosso, e a semana inteira sai deslocada.

export function hoje() {
  const d = new Date();
  return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

export function iso(d) {
  return d.toISOString().slice(0, 10);
}

export function data(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

export function somaDias(s, n) {
  const d = data(s);
  if (!d) return "";
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function difDias(a, b) {
  const x = data(a), y = data(b);
  if (!x || !y) return null;
  return Math.round((y - x) / 86400000);
}

/** Segunda-feira da semana ISO. Mesma conta do `montar_planilha.py`: ancora no
 *  dia 4 de janeiro, que a norma garante estar na semana 1. */
export function segundaISO(ano, semana) {
  const q = new Date(Date.UTC(ano, 0, 4));
  const dow = (q.getUTCDay() + 6) % 7;          // segunda = 0
  q.setUTCDate(q.getUTCDate() - dow + (semana - 1) * 7);
  return q;
}

/** { ano, semana } ISO de uma data. */
export function semanaISO(s) {
  const d = data(s);
  if (!d) return null;
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));   // quinta da semana
  const ano = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(ano, 0, 4));
  const semana = 1 + Math.round(((t - jan4) / 86400000 -
    3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { ano, semana };
}

export function semanaAtual() {
  return semanaISO(hoje());
}

/** As sete datas de uma semana, de segunda a domingo. */
export function datasDaSemana(ano, semana) {
  const seg = segundaISO(ano, semana);
  return DIAS.map((_, i) => {
    const d = new Date(seg);
    d.setUTCDate(d.getUTCDate() + i);
    return iso(d);
  });
}

// ── a atividade ─────────────────────────────────────────────────────────────

/** O molde. Toda atividade tem estes campos, mesmo vazios — assim nenhuma tela
 *  precisa checar se o campo existe antes de ler. */
export function molde() {
  return {
    id: "", os: "", os_outras: [], frota: "", cliente: "",
    servico: "", atividade: "", tipo: "Corretiva", origem: "Programada",
    prioridade: "", obs: "",
    ano: null, semana: null, dia: "", dias: null,
    executantes: [],
    concluida_em: "", cancelada: false, excluida: false,
    semana_orig: null, motivo: "", reprogramacoes: 0,
    criada_em: "", fonte: "",
  };
}

/** Primeiro dia de execução: a semana diz qual semana, o dia diz qual dia. */
export function inicioDe(a) {
  if (!a.semana || !a.ano) return "";
  const i = DIAS.indexOf(a.dia);
  const d = segundaISO(a.ano, a.semana);
  d.setUTCDate(d.getUTCDate() + (i < 0 ? 0 : i));
  return iso(d);
}

/** Último dia de execução. Duração de 1 dia termina no mesmo dia em que começa
 *  — por isso o menos um; sem ele todo serviço de um dia "vence" no dia
 *  seguinte e a aderência mente. */
export function prazoDe(a) {
  const ini = inicioDe(a);
  if (!ini) return "";
  const n = Math.max(1, Number(a.dias) || 1);
  return somaDias(ini, n - 1);
}

export function situacaoDe(a, ref) {
  const ho = ref || hoje();
  if (!a.atividade && !a.frota) return "";
  if (a.cancelada) return "Cancelada";
  if (a.concluida_em) {
    const p = prazoDe(a);
    return (p && a.concluida_em > p) ? "Concluída com atraso" : "Concluída";
  }
  if (!a.atividade) return "Falta a atividade";
  if (!a.semana) return "Na carteira";
  const ini = inicioDe(a), pz = prazoDe(a);
  if (!ini) return "Falta o dia";
  if (ini > ho) return "Programada";
  if (pz < ho) return "VENCIDA";
  if (pz === ho) return "Fecha hoje";
  return "Em execução";
}

/** A cor que a situação vale na tela. Uma palavra, para o CSS resolver. */
export function corDe(s) {
  switch (s) {
    case "Concluída": return "ok";
    case "Concluída com atraso": return "ok-tarde";
    case "VENCIDA": return "vencida";
    case "Fecha hoje": return "hoje";
    case "Em execução": return "andando";
    case "Programada": return "programada";
    case "Cancelada": return "cancelada";
    case "Na carteira": return "carteira";
    default: return "falta";
  }
}

export function aberta(a) {
  return !a.excluida && !a.cancelada && !a.concluida_em;
}

// ── indicadores ─────────────────────────────────────────────────────────────
//
// Aderência é quanto do que foi PROGRAMADO saiu. Extra não entra na conta e
// aparece do lado: contar o extra dentro dela premiaria a oficina por trabalho
// que ninguém planejou, e é justamente o planejamento que o número mede.

export function aderencia(ats, ano, semana) {
  const daSemana = ats.filter(a => !a.excluida && !a.cancelada &&
    a.semana === semana && a.ano === ano);
  const prog = daSemana.filter(a => a.origem !== "Extra");
  const feitas = prog.filter(a => a.concluida_em);
  const noPrazo = feitas.filter(a => a.concluida_em <= (prazoDe(a) || "9999"));
  const extras = daSemana.filter(a => a.origem === "Extra");
  return {
    programadas: prog.length,
    concluidas: feitas.length,
    no_prazo: noPrazo.length,
    com_atraso: feitas.length - noPrazo.length,
    pendentes: prog.length - feitas.length,
    extras: extras.length,
    extras_feitos: extras.filter(a => a.concluida_em).length,
    pct: prog.length ? Math.round(feitas.length * 100 / prog.length) : null,
  };
}

/** Corretiva × preventiva, que é o indicador pelo qual PCM é medido. */
export function mix(ats) {
  const vivos = ats.filter(a => !a.excluida && !a.cancelada);
  const por = {};
  for (const a of vivos) por[a.tipo || "Não classificado"] = (por[a.tipo || "Não classificado"] || 0) + 1;
  const total = vivos.length;
  return { total, por, pct: t => total ? Math.round((por[t] || 0) * 100 / total) : 0 };
}

/** Quantas atividades têm OS aberta no Protheus. A régua mostra linha a linha;
 *  aqui vira número. */
export function coberturaOS(ats) {
  const vivos = ats.filter(a => !a.excluida && !a.cancelada);
  const com = vivos.filter(a => a.os).length;
  return { com, sem: vivos.length - com, total: vivos.length,
    pct: vivos.length ? Math.round(com * 100 / vivos.length) : 0 };
}

/** Backlog em semanas: o que está em aberto dividido pelo que a oficina fecha
 *  por semana. Responde "em quanto tempo eu zero a carteira se nada entrar". */
export function backlogEmSemanas(ats, ano, semana, janela = 4) {
  const abertos = ats.filter(aberta).length;
  let feitas = 0, semanas = 0;
  for (let i = 1; i <= janela; i++) {
    const w = semana - i;
    if (w < 1) break;
    semanas++;
    feitas += ats.filter(a => !a.excluida && a.concluida_em &&
      a.semana === w && a.ano === ano).length;
  }
  const ritmo = semanas ? feitas / semanas : 0;
  return { abertos, ritmo: Math.round(ritmo * 10) / 10,
    semanas: ritmo ? Math.round(abertos / ritmo * 10) / 10 : null };
}
