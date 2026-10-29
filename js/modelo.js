// O que se pode saber sem perguntar a ninguém.
//
// Tudo aqui é função pura sobre o estado: situação, datas, carga, aderência,
// pontualidade. Nada grava, nada lê do banco. Isso é de propósito — é o que
// permite conferir um indicador com uma conta na mão e descobrir qual dos dois
// está errado.

export const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const TIPOS = ["Corretiva", "Preventiva", "Preditiva", "Melhoria",
  "Inspeção", "Borracharia", "Mecânica", "Não classificado"];
export const ORIGENS = ["Programada", "Extra"];
export const OFICINAS = ["Interna", "Terceirizada"];
export const PRIORIDADES = ["", "P1", "P2", "P3"];

// Os motivos da planilha, com o dono de cada um. É o que transforma "atrasou"
// em "atrasou por culpa de quem": hoje 56 atividades esperam peça (Suprimentos)
// e 19 esperam o caminhão chegar (Operação), e são conversas diferentes.
export const MOTIVOS_AREA = {
  "Frota não chegou na oficina": "Operação",
  "Frota em viagem": "Operação",
  "Peça não chegou": "Suprimentos",
  "Aguardando terceiro": "Terceiro",
  "Falta de mão de obra": "Manutenção",
  "Serviço maior que o previsto": "Manutenção",
  "Oficina cheia": "Manutenção",
  "Box bloqueado": "Manutenção",
  "Faltou ferramenta": "Manutenção",
  "Mudou a prioridade": "Gestão / prioridade",
  "Serviço extra entrou na frente": "Gestão / prioridade",
};

export function areaDoMotivo(m) {
  return MOTIVOS_AREA[String(m || "").trim()] || "";
}

// ── datas ───────────────────────────────────────────────────────────────────
// Data é texto "AAAA-MM-DD" o tempo inteiro. Vira Date só para contar dias, e
// sempre em UTC: Date local com hora zero pula um dia para trás em fuso
// negativo, que é o nosso, e a semana inteira sai deslocada.

export function hoje() {
  const d = new Date();
  return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

export function iso(d) { return d.toISOString().slice(0, 10); }

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

/** Segunda-feira da semana ISO. Ancora no dia 4 de janeiro, que a norma
 *  garante estar na semana 1. */
export function segundaISO(ano, semana) {
  const q = new Date(Date.UTC(ano, 0, 4));
  const dow = (q.getUTCDay() + 6) % 7;
  q.setUTCDate(q.getUTCDate() - dow + (semana - 1) * 7);
  return q;
}

export function semanaISO(s) {
  const d = data(s);
  if (!d) return null;
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const ano = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(ano, 0, 4));
  const semana = 1 + Math.round(((t - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { ano, semana };
}

export function semanaAtual() { return semanaISO(hoje()); }

export function datasDaSemana(ano, semana) {
  const seg = segundaISO(ano, semana);
  return DIAS.map((_, i) => {
    const d = new Date(seg);
    d.setUTCDate(d.getUTCDate() + i);
    return iso(d);
  });
}


// ── atividade ───────────────────────────────────────────────────────────────

export function molde() {
  return {
    id: "", os: "", os_outras: [], frota: "", cliente: "",
    servico: "", atividade: "", tipo: "Corretiva", origem: "Programada",
    oficina: "Interna", categoria_hh: "", prioridade: "", obs: "",
    ano: null, semana: null, dia: "", dias: null,
    // HH é hora-homem: horas × pessoas. Mede CARGA, não prazo — e por isso vive
    // ao lado de `dias`, não no lugar dele. Na planilha de hoje 548 das 754
    // atividades estão com HH zerado, ou seja, não estimado: somar isso como
    // "zero hora" faria a semana parecer mais leve do que é. Zero aqui quer
    // dizer "ninguém estimou ainda".
    hh: 0,
    executantes: [],
    concluida_em: "", cancelada: false, excluida: false,
    // Marcada "Concluída" na planilha sem a data de quando saiu. É feita — a
    // marca é do PCM, não suposição —, mas a data falta e o site não inventa
    // uma: a linha mostra "sem data" até alguém dar a baixa com o dia.
    feita_sem_data: false,
    semana_orig: null, motivo: "", reprogramacoes: 0,
    // A justificativa: o porquê fica em `motivo` (é a coluna SE NÃO FOI, POR
    // QUÊ da planilha); quem atrasou e o detalhe ficam ao lado.
    quem_atrasou: "", justificativa: "",
    // A OS preventiva da oficina aponta para a preventiva do plano de que ela
    // é a execução (ver eventos.js, "a preventiva do plano e a OS preventiva").
    preventiva_id: "",
    criada_em: "", fonte: "",
  };
}

export function inicioDe(a) {
  if (!a.semana || !a.ano) return "";
  const i = DIAS.indexOf(a.dia);
  const d = segundaISO(a.ano, a.semana);
  d.setUTCDate(d.getUTCDate() + (i < 0 ? 0 : i));
  return iso(d);
}

/** Último dia de execução. Duração de 1 dia termina no mesmo dia em que começa
 *  — sem o menos um, todo serviço de um dia "vence" no dia seguinte e a
 *  aderência mente. */
export function prazoDe(a) {
  const ini = inicioDe(a);
  if (!ini) return "";
  const n = Math.max(1, Number(a.dias) || 1);
  return somaDias(ini, n - 1);
}

/** Está feita? Com data, ou marcada Concluída na planilha sem data — que é
 *  como a planilha conta (coluna "Concl."), e o número tem de bater com ela. */
export function feita(a) {
  return !a.cancelada && (!!a.concluida_em || !!a.feita_sem_data);
}

export function situacaoDe(a, ref) {
  const ho = ref || hoje();
  if (!a.atividade && !a.frota) return "";
  if (a.cancelada) return "Cancelada";
  if (feita(a)) {
    const p = prazoDe(a);
    return (p && a.concluida_em && a.concluida_em > p) ? "Concluída com atraso" : "Concluída";
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

export function corDe(s) {
  switch (s) {
    case "Concluída": case "Realizada": return "ok";
    case "Concluída com atraso": return "ok-tarde";
    case "VENCIDA": case "Atrasada": case "Parada passou, sem baixa":
    case "Programada depois do prazo": case "Conflito: Operação depois do prazo": return "vencida";
    case "Fecha hoje": case "Vence hoje":
    case "Disponível: marcar a parada": case "Com data: marcar a parada": return "hoje";
    case "Em execução": case "Em andamento": case "Aguardando aprovação": return "andando";
    case "Programada": case "Em aberto": return "programada";
    case "Na carteira": case "Sem prazo": case "Sem data da Operação": return "carteira";
    case "Cancelada": case "Passa para o mês seguinte": return "cancelada";
    default: return "falta";
  }
}

// O nome que a tela mostra para cada situação. Por dentro a situação continua
// com o texto da fórmula da planilha — é ele que os testes comparam com a
// planilha e que filtros, cores e endereços usam; aqui muda só o que se lê.
const ROTULOS = {
  "VENCIDA": "Vencida",
  "Fecha hoje": "Vence hoje",
  "Falta o dia": "Dia a definir",
  "Falta a atividade": "Atividade a definir",
  "Na carteira": "Em carteira",
  "Parada passou, sem baixa": "Baixa pendente",
  "Programada depois do prazo": "Programada após o prazo",
  "Conflito: Operação depois do prazo": "Liberação após o prazo",
  "Com data: marcar a parada": "Liberação prevista: programar parada",
  "Disponível: marcar a parada": "Disponível: programar parada",
  "Sem data da Operação": "Aguardando liberação",
  "Passa para o mês seguinte": "Adiada para o próximo mês",
};
export const rotulo = s => ROTULOS[s] || s;

export function aberta(a) {
  return !a.excluida && !a.cancelada && !feita(a);
}

/** Sugestão de HH para uma categoria, tirada do que já foi estimado nela.
 *  Mediana e não média: um serviço de 8 HH no meio de dez de 1 HH puxaria a
 *  média para cima e a estimativa junto. */

// ── movimentação ────────────────────────────────────────────────────────────
// A frota sai do pátio e tem de voltar. O PCM pede, a operação promete, a
// operação CONCLUI — e o PCM confere e aprova. Quem faz não é quem aprova: é
// o mesmo princípio da baixa de OS, e é o que deixa o número de pontualidade
// da operação valer na reunião.

export function moldeMovimentacao() {
  return {
    id: "", frota: "", destino: "", para_que: "",
    // O que fazer (coletar, levar, realizar TOP…) e a prioridade de quem pede.
    // `destino` é o "onde": para onde a frota vai, ou onde ela está; `para_que`
    // virou os detalhes. As que vieram da planilha não têm ação nem prioridade.
    acao: "", prioridade: "",
    // A categoria (ver CATEGORIAS_MOV). Vazia nas antigas: aí vale a que o
    // texto indica (categoriaMov), sem regravar nada.
    categoria: "",
    pedida_em: "", prometida_para: "", chegou_em: "",
    quem_prometeu: "Operação", obs: "",
    // Conclusão e aprovação. `chegou_em` é a data em que a movimentação foi
    // feita; `aprovada` diz se o PCM já conferiu.
    concluida_por: "", aprovada: false, aprovada_por: "", aprovada_em: "",
    devolvida: false, motivo_devolucao: "",
    // Por que atrasou ou não saiu, e quem atrasou. `motivo_cat` é o motivo
    // pronto (MOTIVOS_ATRASO); `motivo_atraso`, o que foi escrito.
    motivo_atraso: "", quem_atrasou: "", justificativa: "", motivo_cat: "",
    // Sequência de etapas para a mesma frota (lavar → levar ao fornecedor):
    // as etapas têm o mesmo `roteiro` e `etapa` 1, 2, 3… Cada uma é uma
    // movimentação inteira — prazo, baixa e atraso próprios.
    roteiro: "", etapa: 0,
    cancelada: false, excluida: false, motivo: "",
    criada_em: "", fonte: "",
  };
}
// ── as categorias da movimentação ───────────────────────────────────────────
//
// Tiradas do que a equipe já escrevia no destino e no "o que fazer" ("REALIZAR
// TOP", "Cardan Service — coletar", "Box de lavagem", "Operação — disponibilizar
// para a preventiva"…). Cada uma traz o texto que vai no "O que fazer" quando é
// escolhida, e as palavras pelas quais as antigas são reconhecidas — a ordem
// importa: a primeira que casar vale ("Cardan — coletar" é buscar, não levar).

export const CATEGORIAS_MOV = [
  { id: "top", nome: "Realizar TOP", acao: "Realizar TOP", icone: "✔",
    reconhece: /\btop\b/ },
  { id: "teste", nome: "Teste e aferição", acao: "Realizar teste", icone: "◎",
    reconhece: /teste de carga|\bteste\b|aferi|tacograf/ },
  { id: "lavagem", nome: "Lavagem", acao: "Lavar", icone: "≈",
    reconhece: /lavag|\blavar\b|lava.?jato/ },
  { id: "desocupar", nome: "Desocupar box e pátio", acao: "Desocupar box", icone: "⇠",
    reconhece: /liberar (os |o )?box|desocupar|ocupando|retirar frotas? que/ },
  { id: "liberar", nome: "Liberar para manutenção", acao: "Disponibilizar para a manutenção", icone: "⚑",
    reconhece: /disponibiliz|descarreg|liberar .*(manuten|prevent)|para (a )?preventiva/ },
  { id: "buscar", nome: "Buscar no fornecedor", acao: "Buscar", icone: "⇦",
    reconhece: /buscar|coletar|trazer|retirar (no|na|do|da)\b|\bpegar\b/ },
  { id: "box", nome: "Levar ao box ou à matriz", acao: "Levar para o box", icone: "▣",
    reconhece: /\bbox\b|borracharia|soldagem|oficina|\bmatriz\b|\binterno\b/ },
  { id: "fornecedor", nome: "Levar ao fornecedor", acao: "Levar", icone: "⇨",
    reconhece: /enviar|\blevar\b|mandar|cardan|\bdaf\b|molas?\b|fortmola|rodo ceara|tacoeletrica|tecnoq|via autos|diesel|amadeu|deassis|service/ },
  { id: "outro", nome: "Outras", acao: "", icone: "•", reconhece: null },
];
const POR_ID_CAT = new Map(CATEGORIAS_MOV.map(c => [c.id, c]));

const semAcentoMin = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** A categoria de uma movimentação: a escolhida, ou — nas antigas, sem
 *  categoria — a que o "o que fazer" e o "onde" indicam. Os detalhes só
 *  contam quando os dois não dizem nada: "Cardan Service — buscar", com
 *  "depois fazer o TOP" nos detalhes, é buscar. */
export function categoriaMov(m) {
  if (m && m.categoria && POR_ID_CAT.has(m.categoria)) return m.categoria;
  const principal = categoriaDoTexto([m && m.acao, m && m.destino].join(" "));
  return principal !== "outro" ? principal : categoriaDoTexto(m && m.para_que);
}
export function categoriaDoTexto(texto) {
  const t = semAcentoMin(texto);
  for (const c of CATEGORIAS_MOV) if (c.reconhece && c.reconhece.test(t)) return c.id;
  return "outro";
}
export const nomeCategoriaMov = id => (POR_ID_CAT.get(id) || POR_ID_CAT.get("outro")).nome;
export const categoriaMovPorId = id => POR_ID_CAT.get(id) || POR_ID_CAT.get("outro");

/** Na planilha a situação é DIGITADA, então pode discordar das datas na mesma
 *  linha. Aqui ela é calculada — a data é o fato, a palavra era opinião. */
export function situacaoMovimentacao(m, ref) {
  const ho = ref || hoje();
  if (m.cancelada) return "Cancelada";
  if (m.chegou_em) {
    if (!m.aprovada) return "Aguardando aprovação";
    return m.prometida_para && m.chegou_em > m.prometida_para
      ? "Concluída com atraso" : "Concluída";
  }
  if (!m.prometida_para) return "Sem prazo";
  if (m.prometida_para < ho) return "Atrasada";
  if (m.prometida_para === ho) return "Vence hoje";
  return "Em aberto";
}

/** Os nomes antigos da planilha, para comparar o que está escrito lá com o
 *  que as datas dizem sem acusar divergência só porque o nome mudou. */
export function situacaoMovNova(escrita) {
  const s = String(escrita || "").trim().toLowerCase();
  const de = {
    "entregue no prazo": "Concluída", "entregue": "Concluída",
    "entregue com atraso": "Concluída com atraso",
    "atrasada": "Atrasada", "chega hoje": "Vence hoje", "aguardando": "Em aberto",
    "sem data prometida": "Sem prazo", "cancelada": "Cancelada",
  };
  return de[s] || String(escrita || "").trim();
}

/** Dias de atraso. Enquanto não conclui, conta contra hoje — é o que mostra o
 *  buraco crescendo em vez de esperar o fim para contabilizar. */
export function atrasoMovimentacao(m, ref) {
  if (!m.prometida_para || m.cancelada) return 0;
  const fim = m.chegou_em || (ref || hoje());
  return Math.max(0, difDias(m.prometida_para, fim) || 0);
}

/** Ainda não foi feita. A que espera aprovação já foi feita — sai da lista
 *  da operação e entra na fila do PCM. */
export function movimentacaoAberta(m) {
  return !m.excluida && !m.cancelada && !m.chegou_em;
}

// ── a sequência de etapas ───────────────────────────────────────────────────

/** As etapas da sequência desta movimentação, em ordem (ela sozinha, se não
 *  é de sequência). As canceladas e excluídas saem. */
export function etapasDe(m, movs) {
  if (!m || !m.roteiro) return m ? [m] : [];
  return movs.filter(x => x.roteiro === m.roteiro && !x.excluida && !x.cancelada)
    .sort((a, b) => (a.etapa || 0) - (b.etapa || 0));
}

/** A etapa anterior que ainda não foi feita: enquanto ela existir, esta
 *  espera a vez. */
export function etapaAnteriorAberta(m, movs) {
  if (!m || !m.roteiro) return null;
  return etapasDe(m, movs).find(x => (x.etapa || 0) < (m.etapa || 0) && movimentacaoAberta(x)) || null;
}

// ── o porquê do atraso ──────────────────────────────────────────────────────
// Os motivos prontos saíram do que a equipe já escrevia (21–23/10/2026):
// "Prioridade entrou na frente", "frota foi para operação", "bate e volta no
// Pecém", "vai junto com o 621", "por conta de operação e lavagem". As
// justificativas antigas, em texto livre, se reconhecem pelas palavras — sem
// regravar nada.

export const MOTIVOS_ATRASO = [
  { id: "prioridade", nome: "Outra prioridade entrou na frente", reconhece: /prioridade|na frente/ },
  { id: "operacao", nome: "Frota em viagem ou em uso", reconhece: /viagem|operac|utilizad|carreg|bate e volta|vai (pra|para)|desceu|buscar|retorna|em uso|rodando/ },
  { id: "conjunto", nome: "Esperando outra frota", reconhece: /junto com|conjunto|outra frota/ },
  { id: "etapa", nome: "Esperando outra etapa (lavagem, TOP…)", reconhece: /lavag|lavar|\btop\b|etapa/ },
  { id: "motorista", nome: "Sem motorista", reconhece: /motorista/ },
  { id: "fornecedor", nome: "Fornecedor ou oficina sem vaga", reconhece: /fornecedor|oficina|\bbox\b|vaga/ },
  { id: "peca", nome: "Falta de peça ou material", reconhece: /\bpeca|material/ },
  { id: "outro", nome: "Outro motivo", reconhece: null },
];
const POR_ID_MOTIVO = new Map(MOTIVOS_ATRASO.map(m => [m.id, m]));
/** Quem atrasou, para tocar (o campo continua livre). */
export const RESPONSAVEIS_ATRASO = ["Operação", "Motorista", "Fornecedor", "Oficina", "PCM"];

/** O motivo pronto de uma justificativa: o escolhido; sem ele, o que o texto
 *  indica; sem texto, vazio. */
export function categoriaDoMotivo(texto, cat = "") {
  if (cat && POR_ID_MOTIVO.has(cat)) return cat;
  const t = semAcentoMin(texto);
  if (!t.trim()) return "";
  for (const m of MOTIVOS_ATRASO) if (m.reconhece && m.reconhece.test(t)) return m.id;
  return "outro";
}
export const nomeMotivo = id => (POR_ID_MOTIVO.get(id) || {}).nome || "Sem motivo informado";

/** Atrasou (ou está atrasando) e ninguém disse por quê. */
export function movimentacaoSemJustificativa(m, ref) {
  const s = situacaoMovimentacao(m, ref);
  return (s === "Atrasada" || s === "Concluída com atraso" ||
    (s === "Aguardando aprovação" && atrasoMovimentacao(m, ref) > 0)) &&
    !m.motivo_atraso && !m.justificativa;
}

export function movimentacaoParaAprovar(m) {
  return !m.excluida && !m.cancelada && !!m.chegou_em && !m.aprovada;
}

/** Os números do alto da aba Movimentações, com as mesmas contas da planilha:
 *  concluída é a que tem data de conclusão; atraso só existe quando houve
 *  data prometida, e chegar antes conta zero, não crédito. A que concluiu sem
 *  ninguém ter prometido data conta como no prazo — como a planilha conta.
 *
 *  O que a planilha não tem, e o site mostra ao lado: os dias que as atrasadas
 *  em aberto já estão acumulando, e quantas esperam a aprovação do PCM. */
export function pontualidade(movs, ref) {
  const vivas = movs.filter(m => !m.excluida && !m.cancelada);
  const concluidas = vivas.filter(m => m.chegou_em);
  const atrasoDe = m => m.prometida_para && m.chegou_em
    ? Math.max(0, difDias(m.prometida_para, m.chegou_em) || 0) : 0;
  const comAtraso = concluidas.filter(m => atrasoDe(m) > 0);
  const abertas = vivas.filter(m => !m.chegou_em);
  const atrasadas = abertas.filter(m => situacaoMovimentacao(m, ref) === "Atrasada");
  const dias = comAtraso.reduce((s, m) => s + atrasoDe(m), 0);
  return {
    total: vivas.length,
    concluidas: concluidas.length,
    entregues: concluidas.length,
    para_aprovar: concluidas.filter(m => !m.aprovada).length,
    no_prazo: concluidas.length - comAtraso.length,
    com_atraso: comAtraso.length,
    sem_promessa: concluidas.filter(m => !m.prometida_para).length,
    pct: concluidas.length ? (concluidas.length - comAtraso.length) / concluidas.length : null,
    atraso_medio: comAtraso.length ? dias / comAtraso.length : 0,
    dias_perdidos: dias,
    em_aberto: abertas.length,
    aguardando: abertas.length - atrasadas.length,
    atrasadas: atrasadas.length,
    // O buraco que ainda está crescendo: cada dia além do prometido das que
    // não concluíram.
    dias_correndo: atrasadas.reduce((s, m) => s + atrasoMovimentacao(m, ref), 0),
  };
}

// ── preventiva ──────────────────────────────────────────────────────────────
// O aperto de mão: a operação diz quando o caminhão fica livre, o PCM marca o
// dia da parada. Sem os dois lados, preventiva vira corretiva.

export function moldePreventiva() {
  return {
    id: "", frota: "", equipamento: "", local: "", plano: "", qtd: 1,
    vence: "", prazo_service: "", prazo_service_texto: "", mes: "",
    disponivel_agora: false, disponivel_em: "",
    dia_parada: "", onde_fazer: "", os: "", hh: 0,
    // A parada mudou de dia: a primeira data fica guardada, e cada troca conta
    // — com o motivo da última. A liberação da operação também se conta.
    parada_orig: "", reprog_parada: 0, motivo_parada: "", reprog_liberacao: 0,
    pendencias: 0, realizada_em: "", realizada_sem_data: false,
    // O fechamento: o dia em que a OS da preventiva foi encerrada no Protheus.
    fechada_em: "",
    em_andamento: false, adiada: false, cancelada: false,
    // A entrega da frota na oficina para a parada (ver `prev_entregue`): o dia
    // em que chegou, o dia combinado naquele momento e, quando chegou depois
    // do combinado, o porquê e quem atrasou. É o que avalia a operação.
    entregue_em: "", entrega_combinada: "", motivo_entrega: "", quem_atrasou_entrega: "", motivo_entrega_cat: "",
    // O quadro do pé da aba: frota que está no mapa mas não entra na conta do
    // mês (já realizada, sem preventiva, vence no mês seguinte…).
    fora: false, por_que_fora: "",
    motivo: "", obs: "", excluida: false,
    criada_em: "", fonte: "",
  };
}


/** "Vence efetivo" da planilha: o prazo do Service, quando há; senão o
 *  vencimento do mapa. */
export function venceEfetivo(p) {
  return p.prazo_service || p.vence || "";
}

export function preventivaFeita(p) {
  return !!(p.realizada_em || p.realizada_sem_data);
}

/** A coluna Situação da aba Preventivas, com a MESMA fórmula da planilha, na
 *  mesma ordem de perguntas: primeiro o Status que alguém marcou, depois o dia
 *  da parada, depois a data da operação. */
export function situacaoPreventiva(p, ref) {
  const ho = ref || hoje();
  if (preventivaFeita(p)) return "Realizada";
  if (p.cancelada) return "Cancelada";
  if (p.adiada) return "Passa para o mês seguinte";
  if (p.em_andamento) return "Em andamento";
  const temPrazo = !!(p.prazo_service || p.prazo_service_texto);
  const limite = venceEfetivo(p);
  if (p.dia_parada) {
    if (p.dia_parada < ho) return "Parada passou, sem baixa";
    if (temPrazo && limite && p.dia_parada > limite) return "Programada depois do prazo";
    return "Programada";
  }
  if (p.disponivel_em) {
    if (temPrazo && limite && p.disponivel_em > limite) return "Conflito: Operação depois do prazo";
    return "Com data: marcar a parada";
  }
  if (p.disponivel_agora) return "Disponível: marcar a parada";
  return "Sem data da Operação";
}

/** Vencida, como a coluna Vence fica vermelha na planilha: o vencimento
 *  efetivo passou e ela não foi feita nem cancelada. É marca, não situação —
 *  uma preventiva pode estar "Programada" e vencida ao mesmo tempo. */
export function preventivaVencida(p, ref) {
  const lim = venceEfetivo(p);
  if (!lim || lim >= (ref || hoje())) return false;
  const s = situacaoPreventiva(p, ref);
  return s !== "Realizada" && s !== "Cancelada";
}

/** O que falta para esta preventiva andar, e de quem é a bola. */
export function esperandoQuem(p, ref) {
  if (p.fora || preventivaFeita(p) || p.adiada || p.cancelada || p.em_andamento) return "";
  if (p.dia_parada) return p.dia_parada < (ref || hoje()) ? "PCM" : "";
  if (!p.disponivel_agora && !p.disponivel_em) return "Operação";
  return "PCM";
}

export function preventivaAberta(p) {
  return !p.excluida && !p.fora && !preventivaFeita(p) && !p.adiada && !p.cancelada;
}

// ── o passo a passo da preventiva ──────────────────────────────────────────
// Quatro passos, sempre na mesma ordem, e cada um é de alguém: a operação
// libera a frota, o PCM marca a parada, a frota chega na oficina, o PCM dá a
// baixa. A Situação da planilha continua por baixo (é ela que os números
// conferem); o passo é o jeito de dizer, numa palavra, o que falta.

export const PASSOS_PREV = [
  { id: "liberar", n: 1, nome: "Liberação", quem: "Operação", faz: "A operação informa quando a frota fica livre." },
  { id: "parada", n: 2, nome: "Parada", quem: "PCM", faz: "O PCM marca o dia da parada." },
  { id: "chegada", n: 3, nome: "Chegada", quem: "Operação", faz: "A frota chega na oficina no dia da parada." },
  { id: "baixa", n: 4, nome: "Baixa", quem: "PCM", faz: "Terminado o serviço, o PCM dá a baixa." },
];

/** Em que passo a preventiva está: o primeiro que falta. "feita" e "fora"
 *  (adiada ou cancelada) ficam depois dos quatro. */
export function passoPreventiva(p) {
  if (preventivaFeita(p)) return "feita";
  if (p.cancelada || p.adiada) return "fora";
  if (p.em_andamento || p.entregue_em) return "baixa";
  if (p.dia_parada) return "chegada";
  if (p.disponivel_agora || p.disponivel_em) return "parada";
  return "liberar";
}

/** O passo está com problema: a liberação ou a parada ficou depois do
 *  vencimento, ou a parada passou e a frota não chegou. */
export function passoAtrasado(p, ref) {
  const s = situacaoPreventiva(p, ref);
  return s === "Conflito: Operação depois do prazo" || s === "Programada depois do prazo" ||
    (s === "Parada passou, sem baixa" && !p.entregue_em);
}

// ── a entrega da frota para a preventiva ───────────────────────────────────
// A operação libera a frota, o PCM marca a parada — e no dia combinado a
// frota tem de estar na oficina. Chegar depois é o atraso de entrega que a
// Avaliação da operação conta.

/** O dia combinado para a frota chegar: a parada que o PCM marcou. Sem
 *  parada não há dia combinado — a frota liberada está esperando o PCM, não
 *  atrasando a entrega. */
export function combinadoEntrega(p) {
  return p.dia_parada || "";
}

/** A frota ainda não chegou e o dia combinado já passou. A que está em
 *  andamento chegou — só não teve o dia anotado. */
export function entregaAtrasando(p, ref) {
  const c = combinadoEntrega(p);
  return preventivaAberta(p) && !p.entregue_em && !p.em_andamento && !!c && c < (ref || hoje());
}

/** Dias de atraso da entrega. Chegou: contra o combinado daquele dia. Ainda
 *  não chegou e passou do combinado: conta contra hoje, como na movimentação. */
export function atrasoEntrega(p, ref) {
  if (p.entregue_em) {
    return p.entrega_combinada ? Math.max(0, difDias(p.entrega_combinada, p.entregue_em) || 0) : 0;
  }
  return entregaAtrasando(p, ref) ? Math.max(0, difDias(combinadoEntrega(p), ref || hoje()) || 0) : 0;
}

// ── os blocos da planilha do PCM ───────────────────────────────────────────
// O Excel do mês (`js/tela/prevexcel.js`) põe cada frota numa linha, com as
// datas em quatro blocos — disponibilidade, parada, realização do serviço e
// fechamento. Aqui só as contas de cada bloco.

/** Dias de oficina: da entrada da frota até a realização (ou até hoje, se
 *  ainda está lá). Sem a entrada anotada, não há conta. */
export function diasNaOficina(p, ref) {
  if (!p.entregue_em) return null;
  const fim = p.realizada_em || (preventivaFeita(p) || p.adiada || p.cancelada ? "" : ref || hoje());
  return fim ? Math.max(0, difDias(p.entregue_em, fim) || 0) : null;
}

/** Como a preventiva terminou, ou como está, contra o vencimento: a coluna
 *  Resultado do bloco Fechamento. `classe` é a cor do chip. */
export function resultadoPreventiva(p, ref) {
  const lim = venceEfetivo(p);
  if (p.cancelada) return { texto: "Cancelada", classe: "cancelada", motivo: p.motivo || "" };
  if (p.adiada) return { texto: "Adiada para o mês seguinte", classe: "hoje", motivo: p.motivo || "" };
  if (preventivaFeita(p)) {
    if (!p.realizada_em) return { texto: "Realizada, sem a data", classe: "programada" };
    if (!lim) return { texto: "Realizada", classe: "ok" };
    const n = difDias(lim, p.realizada_em);
    return n > 0 ? { texto: `${n} dia${n === 1 ? "" : "s"} depois do vencimento`, classe: "ok-tarde" }
      : { texto: "No prazo", classe: "ok" };
  }
  if (preventivaVencida(p, ref)) {
    const n = difDias(lim, ref || hoje());
    return { texto: `Vencida há ${n} dia${n === 1 ? "" : "s"}`, classe: "vencida" };
  }
  if (lim) {
    const n = difDias(ref || hoje(), lim);
    return { texto: n === 0 ? "Vence hoje" : `Vence em ${n} dia${n === 1 ? "" : "s"}`, classe: n <= 3 ? "hoje" : "andando" };
  }
  return { texto: "Em aberto", classe: "programada" };
}

/** Os números do alto da aba Preventivas, com as mesmas contas. */
export function resumoPreventivas(prevs, ref) {
  const plano = prevs.filter(p => !p.excluida && !p.fora);
  const sit = p => situacaoPreventiva(p, ref);
  const qtd = l => l.reduce((s, p) => s + (Number(p.qtd) || 1), 0);
  const valem = plano.filter(p => !p.adiada && !p.cancelada);
  const realizadas = qtd(plano.filter(p => sit(p) === "Realizada"));
  const total = qtd(valem);
  return {
    preventivas: total,
    frotas: valem.filter(p => p.frota).length,
    com_data: plano.filter(p => p.disponivel_em || p.disponivel_agora).length,
    sem_data: plano.filter(p => sit(p) === "Sem data da Operação").length,
    parada_marcada: plano.filter(p => sit(p).startsWith("Programada")).length,
    conflitos: plano.filter(p => sit(p).startsWith("Conflito") ||
      sit(p) === "Programada depois do prazo").length,
    vencidas: plano.filter(p => preventivaVencida(p, ref)).length,
    realizadas,
    pct_realizadas: total ? realizadas / total : 0,
    hh: Math.round(plano.reduce((s, p) => s + (Number(p.hh) || 0), 0) * 10) / 10,
    em_andamento: plano.filter(p => sit(p) === "Em andamento").length,
    reprogramadas: qtd(plano.filter(p => p.adiada)),
    fora: prevs.filter(p => !p.excluida && p.fora).length,
  };
}

// ── indicadores ─────────────────────────────────────────────────────────────
//
// Aderência é quanto do que foi PROGRAMADO saiu. Extra não entra na conta e
// aparece do lado: contar o extra dentro dela premiaria a oficina por trabalho
// que ninguém planejou, e é justamente o planejamento que o número mede.

/** Quanto a oficina FECHOU durante a semana, venha de onde vier.
 *
 *  É pergunta diferente de aderência, e as duas precisam existir. Aderência
 *  responde "do que planejei para esta semana, quanto saiu?" e pune o que ficou
 *  para trás. Esta responde "quanto trabalho saiu nestes sete dias?" e inclui o
 *  que estava atrasado de semanas anteriores e o que entrou de extra. Uma
 *  semana pode ter 0% de aderência e muito serviço entregue — e o contrário
 *  também. Mostrar só uma das duas deixa metade da conversa de fora. */
export function fechadasNaSemana(ats, ano, semana) {
  const d = datasDaSemana(ano, semana);
  const dentro = ats.filter(a => !a.excluida && !a.cancelada && a.concluida_em &&
    a.concluida_em >= d[0] && a.concluida_em <= d[6]);
  return {
    total: dentro.length,
    programadas: dentro.filter(a => a.origem !== "Extra").length,
    extras: dentro.filter(a => a.origem === "Extra").length,
    de_outras_semanas: dentro.filter(a => a.semana !== semana).length,
    hh: Math.round(dentro.reduce((s, a) => s + (Number(a.hh) || 0), 0) * 10) / 10,
  };
}

export function aderencia(ats, ano, semana) {
  const daSemana = ats.filter(a => !a.excluida && !a.cancelada &&
    a.semana === semana && a.ano === ano);
  const prog = daSemana.filter(a => a.origem !== "Extra");
  const feitas = prog.filter(feita);
  const noPrazo = feitas.filter(a => a.concluida_em && a.concluida_em <= (prazoDe(a) || "9999"));
  const extras = daSemana.filter(a => a.origem === "Extra");
  return {
    programadas: prog.length,
    concluidas: feitas.length,
    no_prazo: noPrazo.length,
    com_atraso: feitas.length - noPrazo.length,
    pendentes: prog.length - feitas.length,
    extras: extras.length,
    extras_feitos: extras.filter(feita).length,
    pct: prog.length ? Math.round(feitas.length * 100 / prog.length) : null,
  };
}

/** Carga de mão de obra da semana, em hora-homem. Só conta oficina interna: a
 *  terceirizada não disputa a equipe, e somar as duas faria a oficina parecer
 *  lotada por serviço que nem está nas mãos dela. */
export function cargaHH(ats, ano, semana) {
  const daSemana = ats.filter(a => !a.excluida && !a.cancelada &&
    a.semana === semana && a.ano === ano);
  const internas = daSemana.filter(a => a.oficina !== "Terceirizada");
  const soma = l => l.reduce((s, a) => s + (Number(a.hh) || 0), 0);
  return {
    total: Math.round(soma(internas) * 10) / 10,
    feito: Math.round(soma(internas.filter(feita)) * 10) / 10,
    aberto: Math.round(soma(internas.filter(a => !feita(a))) * 10) / 10,
    terceirizada: Math.round(soma(daSemana.filter(a => a.oficina === "Terceirizada")) * 10) / 10,
    sem_estimativa: internas.filter(a => !Number(a.hh)).length,
    atividades: internas.length,
  };
}

// ── a semana como a planilha conta ──────────────────────────────────────────
//
// As abas Semana e Resultados da planilha são o número que vai para a reunião.
// Estas funções repetem as fórmulas delas, uma a uma, para o site dar o MESMO
// número: dois números diferentes para a mesma pergunta é o jeito mais rápido
// de ninguém confiar em nenhum dos dois. `testes/resultados.mjs` confere cada
// linha contra o valor que a própria planilha calculou.

/** Interna ou terceirizada — como a coluna Oficina da planilha decide: algum
 *  executante "(externo)" ou "Terceirizad…" manda para fora da conta. Sem
 *  executante, vale o que a atividade trouxe. */
/** Desde quando a pendência espera, e de onde veio a data: a abertura no
 *  Protheus ("Aberta no Protheus em 12/09/2026"), o dia do TOP ("[06/10] TOP:
 *  …") ou, sem nenhuma das duas, o primeiro registro dela no site — a planilha
 *  não tem data de abertura, e o site não inventa uma. */
export function desdeQuando(a, ref = hoje()) {
  const obs = String(a.obs || "");
  let m = obs.match(/Aberta no Protheus em (\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return { data: `${m[3]}-${m[2]}-${m[1]}`, fonte: "abertura no Protheus" };
  m = obs.match(/^\s*\[(\d{1,2})\/(\d{1,2})\]\s*(\S*)/);
  if (m) {
    let ano = Number(ref.slice(0, 4));
    const d = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    // "[14/10] Inspeção" vem do Colar inspeção/TOP; o resto, da planilha ("[06/10] TOP: …")
    const fonte = /^inspe/i.test(m[3]) ? "dia da inspeção" : "dia do TOP";
    return { data: d > ref ? `${ano - 1}${d.slice(4)}` : d, fonte };
  }
  if (a.criada_em) return { data: String(a.criada_em).slice(0, 10), fonte: "primeiro registro no site" };
  return null;
}

/** Há quantos dias a pendência espera (ver `desdeQuando`). */
export function idadeDias(a, ref = hoje()) {
  const d = desdeQuando(a, ref);
  return d ? Math.max(0, difDias(d.data, ref)) : null;
}

const PESO_PRIORIDADE = { P1: 0, P2: 1, P3: 2 };
/** Ordem da carteira: preventiva primeiro, depois P1, P2, P3, sem prioridade,
 *  e dentro de cada uma a mais velha primeiro. */
export function ordemCarteira(ref = hoje()) {
  return (x, y) => (ehPreventiva(y) ? 1 : 0) - (ehPreventiva(x) ? 1 : 0) ||
    (PESO_PRIORIDADE[x.prioridade] ?? 3) - (PESO_PRIORIDADE[y.prioridade] ?? 3) ||
    (idadeDias(y, ref) ?? -1) - (idadeDias(x, ref) ?? -1) ||
    String(x.frota || "").localeCompare(String(y.frota || ""), "pt-BR", { numeric: true });
}

/** É uma OS preventiva? Pelo tipo, ou por executar uma preventiva do plano.
 *  Preventiva tem prioridade de leitura: vem primeiro e com selo próprio. */
export function ehPreventiva(a) {
  return !!a && (a.tipo === "Preventiva" || !!a.preventiva_id);
}

export function oficinaDe(a) {
  const quem = (a.executantes || []).join(" ");
  if (/\(externo\)|terceirizad/i.test(quem)) return "Terceirizada";
  if (!quem.trim() && a.oficina === "Terceirizada") return "Terceirizada";
  return "Interna";
}

/** Está na semana? Pela data de início, como a planilha — e sem dia não há
 *  início, então semana marcada sem dia ainda conta como carteira. */
export function naSemana(a, ano, semana) {
  if (!a.dia || !a.semana) return false;
  const d = datasDaSemana(ano, semana);
  const i = inicioDe(a);
  return i >= d[0] && i <= d[6];
}

export function resultados(ats, ano, semana, ref) {
  const vivas = ats.filter(a => !a.excluida && (a.atividade || a.frota));
  const daSemana = vivas.filter(a => naSemana(a, ano, semana));
  const interna = daSemana.filter(a => oficinaDe(a) === "Interna");
  const total = interna.filter(a => !a.cancelada);              // Total interno
  const plano = total.filter(a => a.origem !== "Extra");         // Atividades do plano
  const extra = total.filter(a => a.origem === "Extra");         // Extra programação
  const concPlano = plano.filter(feita);
  const concExtra = extra.filter(feita);
  const concTotal = total.filter(feita);
  const pct = (n, d) => d ? n / d : null;
  const soma = l => Math.round(l.reduce((s, a) => s + (Number(a.hh) || 0), 0) * 10) / 10;

  // "No prazo" na planilha é sair no PRÓPRIO dia programado (até o início),
  // não até o fim da janela.
  const noPrazo = concPlano.filter(a => a.concluida_em && a.concluida_em <= inicioDe(a));
  // O plano original: a semana em que a atividade foi programada pela primeira
  // vez. Empurrar para a frente não melhora este número.
  const orig = a => ({ ...a, semana: a.semana_orig || a.semana });
  const daOriginal = vivas.filter(a => !a.cancelada && oficinaDe(a) === "Interna" &&
    a.origem !== "Extra" && naSemana(orig(a), ano, semana));
  const noPlanoOrig = daOriginal.filter(a => a.concluida_em && a.concluida_em <= inicioDe(orig(a)));
  const atrasos = concTotal.filter(a => a.concluida_em)
    .map(a => difDias(inicioDe(a), a.concluida_em)).filter(n => n > 0);
  const todasVivas = vivas.filter(a => !a.cancelada);
  const tipo = (l, t) => l.filter(a => a.tipo === t).length;

  return {
    semana, ano, datas: datasDaSemana(ano, semana),
    plano: plano.length,
    extra: extra.length,
    concluidas_plano: concPlano.length,
    total: total.length,
    extras_concluidas: concExtra.length,
    concluidas: concTotal.length,
    aderencia: pct(concPlano.length, plano.length),
    cumprimento: pct(concTotal.length, total.length),
    parte_extra: pct(extra.length, total.length),
    no_prazo: noPrazo.length,
    pontualidade: pct(noPrazo.length, concPlano.length),
    aderencia_original: concPlano.length ? pct(noPlanoOrig.length, daOriginal.length) : null,
    sairam: vivas.filter(a => !a.cancelada && a.semana_orig === semana &&
      a.semana != null && a.semana !== semana).length,
    vencidas: interna.filter(a => situacaoDe(a, ref) === "VENCIDA").length,
    reprogramadas: interna.filter(a => a.semana_orig && a.semana && a.semana_orig !== a.semana).length,
    atraso_medio: atrasos.length ? atrasos.reduce((s, n) => s + n, 0) / atrasos.length : 0,
    por_dia: total.length / 5,
    saiu_por_dia: concTotal.length / 5,
    hh: soma(total),
    terceirizada: daSemana.filter(a => !a.cancelada && oficinaDe(a) === "Terceirizada").length,
    canceladas: daSemana.filter(a => a.cancelada).length,
    carteira: todasVivas.filter(a => !a.dia || !a.semana).length,
    corretiva: tipo(total, "Corretiva"),
    preventiva: tipo(total, "Preventiva"),
    inspecao: tipo(total, "Inspeção"),
    pct_preventiva: pct(tipo(total, "Preventiva"), total.length),
    corretiva_acervo: tipo(todasVivas, "Corretiva"),
    preventiva_acervo: tipo(todasVivas, "Preventiva"),
    pct_preventiva_acervo: pct(tipo(todasVivas, "Preventiva"), todasVivas.length),
    com_os: total.filter(a => a.os).length,
    sem_os: total.filter(a => !a.os).length,
    cobertura_os: pct(total.filter(a => a.os).length, total.length),
    com_os_acervo: todasVivas.filter(a => a.os).length,
    sem_os_acervo: todasVivas.filter(a => !a.os).length,
    cobertura_os_acervo: pct(todasVivas.filter(a => a.os).length, todasVivas.length),
  };
}

// ── o fechamento da semana ──────────────────────────────────────────────────
//
// O número calculado ao vivo muda depois que a semana acaba: a baixa dada na
// segunda e a atividade empurrada para a semana seguinte fazem a semana velha
// subir sozinha até 100%. Na planilha, o remédio era a coluna amarela — na
// sexta o PCM digitava o número, e ele não mudava mais. Aqui é o mesmo, com
// duas diferenças: o site congela sozinho na sexta às 23h59 se ninguém fechar,
// e o calculado de hoje fica do lado, para ver o quanto se afastou.

/** O instante em que a semana fecha: sexta às 23h59 em Mossoró (UTC−3), ou
 *  seja, sábado às 03h00 em UTC. */
export function corteDaSemana(ano, semana) {
  return datasDaSemana(ano, semana)[5] + "T03:00:00.000Z";
}

/** Os números que ficam registrados — o que a reunião usa. */
export const CAMPOS_FECHAMENTO = ["plano", "concluidas_plano", "aderencia", "total", "concluidas",
  "cumprimento", "extra", "extras_concluidas", "no_prazo", "pontualidade", "aderencia_original",
  "sairam", "vencidas", "canceladas", "terceirizada"];

export function numerosDoFechamento(r) {
  const o = {};
  for (const k of CAMPOS_FECHAMENTO) o[k] = r[k] ?? null;
  return o;
}

/** Horas programáveis por pessoa por dia, como a aba Semana da planilha: 8,8 h
 *  de jornada com 75% de aproveitamento. */
export const HORAS_DIA = 6.6;

const util = d => { const w = data(d).getUTCDay(); return w >= 1 && w <= 5; };

/** HH e carga por pessoa na semana, como a aba Semana.
 *
 *  O HH de uma atividade se divide entre quem faz (até três) e se espalha pelos
 *  dias úteis da janela dela. Executante "(externo)" não entra: é empresa de
 *  fora, não disputa a equipe. */
export function semanaEmHH(ats, ano, semana) {
  const datas = datasDaSemana(ano, semana).slice(0, 5);
  const vivas = ats.filter(a => !a.excluida && !a.cancelada);
  const interna = vivas.filter(a => naSemana(a, ano, semana) && oficinaDe(a) === "Interna");
  const soma = l => Math.round(l.reduce((s, a) => s + (Number(a.hh) || 0), 0) * 10) / 10;
  const plano = interna.filter(a => a.origem !== "Extra");
  const extra = interna.filter(a => a.origem === "Extra");

  const pessoas = new Map();
  for (const a of vivas) {
    const quem = (a.executantes || []).filter(n => n && !/\(externo\)|terceirizad/i.test(n));
    if (!quem.length || !Number(a.hh)) continue;
    const ini = inicioDe(a), fim = prazoDe(a);
    if (!ini || !a.dia) continue;
    const janela = [];
    for (let d = ini; d <= fim; d = somaDias(d, 1)) if (util(d)) janela.push(d);
    if (!janela.length) continue;
    const porDia = Number(a.hh) / quem.length / janela.length;
    for (const n of quem) {
      if (!pessoas.has(n)) pessoas.set(n, datas.map(() => 0));
      const linha = pessoas.get(n);
      janela.forEach(d => { const i = datas.indexOf(d); if (i >= 0) linha[i] += porDia; });
    }
  }
  const capacidade = HORAS_DIA * 5;
  const carga = [...pessoas.entries()]
    .map(([nome, dias]) => {
      const total = dias.reduce((s, h) => s + h, 0);
      return { nome, dias, total, capacidade, ocupacao: total / capacidade };
    })
    .filter(p => p.total > 0)
    .sort((x, y) => y.total - x.total);
  const cap = capacidade * carga.length;
  const carteira = soma(vivas.filter(a => !feita(a) && (!a.dia || !a.semana)));

  return {
    datas, carga,
    hh_plano: soma(plano),
    hh_extra: soma(extra),
    hh_plano_feito: soma(plano.filter(feita)),
    aderencia_hh: soma(plano) ? soma(plano.filter(feita)) / soma(plano) : null,
    capacidade: cap,
    ocupacao: cap ? (soma(plano) + soma(extra)) / cap : null,
    hh_carteira: carteira,
    backlog_semanas: cap ? carteira / cap : null,
  };
}

export function mix(ats) {
  const vivos = ats.filter(a => !a.excluida && !a.cancelada);
  const por = {};
  for (const a of vivos) por[a.tipo || "Não classificado"] = (por[a.tipo || "Não classificado"] || 0) + 1;
  const total = vivos.length;
  return { total, por, pct: t => total ? Math.round((por[t] || 0) * 100 / total) : 0 };
}


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

/** De quem é o atraso. Lê o motivo escrito na atividade e devolve a área dona.
 *  É o indicador que tira a conversa do "a manutenção não entrega". */
export function atrasoPorArea(ats) {
  const por = {};
  let semMotivo = 0;
  for (const a of ats) {
    if (a.excluida || a.cancelada || feita(a)) continue;
    if (!a.motivo && !a.quem_atrasou) { semMotivo++; continue; }
    // Quem atrasou, quando alguém disse, vale mais que o deduzido do motivo.
    const area = a.quem_atrasou || areaDoMotivo(a.motivo) || "Outro";
    por[area] = por[area] || { total: 0, motivos: {} };
    por[area].total++;
    const m = a.motivo || a.justificativa || "sem motivo escrito";
    por[area].motivos[m] = (por[area].motivos[m] || 0) + 1;
  }
  return { por, sem_motivo: semMotivo };
}
