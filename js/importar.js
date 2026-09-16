// Trazer dados de fora: a planilha que roda hoje, e a base do Protheus.
//
// A regra que manda em tudo aqui é uma só: **não inventar associação**. O
// importador casa por número de OS e por identidade de atividade; quando as
// duas fontes discordam, ele mostra a divergência e não escolhe sozinho. Nada
// é gravado antes da prévia.

import { acharCabecalho, texto, numero, paraISO } from "./planilha.js";
import { chave, indexarPorChave } from "./texto.js";
import { molde, DIAS, semanaISO } from "./modelo.js";

/** OS do Protheus é campo de seis dígitos. A planilha acumulou OS digitadas
 *  com quatro e cinco — é a mesma ordem, escrita curta. Comparar sem completar
 *  os zeros trataria "7157" e "007157" como duas ordens diferentes. */
export function normalizarOS(v) {
  const d = texto(v).replace(/\D+/g, "");
  if (!d) return "";
  return d.length < 6 ? d.padStart(6, "0") : d;
}

/** Uma célula de OS nem sempre traz uma OS só: há atividade que cobre três
 *  ordens ("007381,007382,007383"). Juntar os dígitos daria a OS inventada
 *  007381007382007383, que não existe em lugar nenhum. */
export function normalizarOSLista(v) {
  const s = texto(v);
  if (!s) return [];
  return [...new Set(s.split(/[^\d]+/).filter(Boolean).map(normalizarOS))];
}

/** A célula tem texto mas nenhum número: é recado, não ordem. "ABRIR OS" e
 *  "PENDENTE ABRIR OS" aparecem 25 vezes na planilha de hoje — e o indicador
 *  de cobertura de OS as contava como OS aberta, inflando o número. Aqui elas
 *  não viram OS, mas também não somem: o recado vai para a observação. */
export function recadoDeOS(v) {
  const s = texto(v);
  return (s && !/\d/.test(s)) ? s : "";
}

// ── a planilha da programação ───────────────────────────────────────────────

/** Acha a coluna pelo título, tolerando prefixo. O cabeçalho cresceu com o
 *  tempo — "Motivo" virou "Motivo do atraso / da mudança" — e a busca exata
 *  devolvia vazio calado, apagando a coluna inteira sem avisar. */
function localizador(cab) {
  const ix = new Map();
  cab.forEach((t, i) => {
    const s = texto(t);
    if (s && !ix.has(s)) ix.set(s, i);
  });
  return titulo => {
    if (ix.has(titulo)) return ix.get(titulo);
    for (const [t, i] of ix) if (t.startsWith(titulo)) return i;
    return -1;
  };
}

export function ehPlanilhaMakro(abas) {
  return abas.some(a => a.nome === "Programação");
}

/** Lê a aba Programação e devolve { atividades, avisos, clientes }. */
export function lerPlanilhaMakro(abas, ano) {
  const aba = abas.find(a => a.nome === "Programação");
  if (!aba) throw new Error("Não achei a aba Programação neste arquivo.");
  const iCab = acharCabecalho(aba.linhas);
  const achar = localizador(aba.linhas[iCab] || []);
  const col = {};
  for (const t of ["OS", "Frota", "Serviço", "Atividade", "Tipo", "Origem",
    "Executante 1", "Executante 2", "Executante 3", "Semana", "Dia",
    "Dias prev.", "Concluída em", "Marcar", "Semana orig.", "Motivo",
    "Obs.", "Prioridade", "Cliente"]) col[t] = achar(t);

  const clientes = clientesPorFrota(abas);
  const atividades = [], avisos = [];

  for (let r = iCab + 1; r < aba.linhas.length; r++) {
    const L = aba.linhas[r] || [];
    const v = t => (col[t] >= 0 ? L[col[t]] : null);
    const ativ = texto(v("Atividade"));
    const frota = texto(v("Frota"));
    // Linha reservada — frota lançada, serviço ainda por escrever — também
    // conta. Só se descarta a que não tem nem uma coisa nem outra.
    if (!ativ && !frota) continue;

    const marcar = texto(v("Marcar"));
    const concluida = paraISO(v("Concluída em"));
    const semana = numero(v("Semana"));
    const semOrig = numero(v("Semana orig."));

    // "Marcar não é datar." Linha marcada como concluída sem data ficaria
    // concluída na tela e invisível na aderência, que conta por data. Entra
    // como ABERTA e sai na lista de avisos para ele datar — o sistema não
    // inventa o dia em que o serviço saiu.
    if (marcar === "Concluída" && !concluida) {
      avisos.push({ tipo: "marcada_sem_data", frota, atividade: ativ, linha: r + 1 });
    }

    const oss = normalizarOSLista(v("OS"));
    const recado = recadoDeOS(v("OS"));
    if (recado) avisos.push({ tipo: "os_a_abrir", frota, atividade: ativ, texto: recado, linha: r + 1 });

    const a = {
      ...molde(),
      os: oss[0] || "",
      os_outras: oss.slice(1),
      frota,
      cliente: clientes.get(frota) || texto(v("Cliente")),
      servico: texto(v("Serviço")),
      atividade: ativ,
      tipo: texto(v("Tipo")) || "Corretiva",
      origem: texto(v("Origem")) || "Programada",
      prioridade: texto(v("Prioridade")).toUpperCase(),
      obs: texto(v("Obs.")),
      ano: semana ? ano : (concluida ? Number(concluida.slice(0, 4)) : null),
      semana: semana || null,
      dia: DIAS.includes(texto(v("Dia"))) ? texto(v("Dia")) : "",
      dias: numero(v("Dias prev.")),
      executantes: ["Executante 1", "Executante 2", "Executante 3"]
        .map(t => texto(v(t))).filter(Boolean),
      concluida_em: concluida,
      cancelada: marcar === "Cancelada",
      motivo: texto(v("Motivo")),
      // Semana original igual à semana não é reprogramação nenhuma; escrita,
      // só faz parecer que tudo foi empurrado.
      semana_orig: (semOrig && semOrig !== semana) ? semOrig : null,
      reprogramacoes: (semOrig && semOrig !== semana) ? 1 : 0,
    };
    if (a.concluida_em && !a.ano) a.ano = Number(a.concluida_em.slice(0, 4));
    atividades.push(a);
  }
  return { atividades, avisos, clientes };
}

/** A aba Listas guarda o cliente de cada frota em duas colunas paralelas. */
function clientesPorFrota(abas) {
  const m = new Map();
  const aba = abas.find(a => a.nome === "Listas");
  if (!aba) return m;
  const iCab = acharCabecalho(aba.linhas);
  const cab = aba.linhas[iCab] || [];
  let cf = -1, cc = -1;
  cab.forEach((t, i) => {
    const s = texto(t);
    if (s === "Frotas") cf = i;
    if (s.startsWith("Cliente")) cc = i;
  });
  if (cf < 0 || cc < 0) return m;
  for (let r = iCab + 1; r < aba.linhas.length; r++) {
    const L = aba.linhas[r] || [];
    const f = texto(L[cf]), c = texto(L[cc]);
    if (f && c) m.set(f, c);
  }
  return m;
}

// ── a base do Protheus ──────────────────────────────────────────────────────

/** Os campos que o sistema entende. O export do Protheus chama cada um de um
 *  jeito; a tela de mapeamento liga um ao outro e guarda a ligação. */
export const CAMPOS_PROTHEUS = [
  { k: "os", rotulo: "Número da OS", obrigatorio: true,
    pistas: ["os", "ordem", "numero os", "num os", "ordem de servico", "ordem servico"] },
  { k: "frota", rotulo: "Frota / equipamento", obrigatorio: true,
    pistas: ["frota", "equipamento", "bem", "veiculo", "placa", "tag"] },
  { k: "atividade", rotulo: "Descrição do serviço", obrigatorio: true,
    pistas: ["descricao", "servico", "atividade", "ocorrencia", "observacao"] },
  { k: "servico", rotulo: "Grupo / sistema", obrigatorio: false,
    pistas: ["grupo", "sistema", "conjunto", "familia", "classe"] },
  { k: "tipo", rotulo: "Tipo de manutenção", obrigatorio: false,
    pistas: ["tipo", "natureza", "manutencao"] },
  { k: "situacao", rotulo: "Situação no Protheus", obrigatorio: false,
    pistas: ["situacao", "status", "estado"] },
  { k: "abertura", rotulo: "Data de abertura", obrigatorio: false,
    pistas: ["abertura", "emissao", "data abertura", "dt abertura", "inicio"] },
  { k: "fechamento", rotulo: "Data de encerramento", obrigatorio: false,
    pistas: ["fechamento", "encerramento", "conclusao", "termino", "fim", "baixa"] },
];

const SEM_ACENTO = s => texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Chute inicial do mapeamento, olhando o cabeçalho. É sugestão: a tela mostra
 *  cada ligação e ele confirma. */
export function sugerirMapa(cab) {
  const nomes = cab.map(SEM_ACENTO);
  const mapa = {};
  for (const campo of CAMPOS_PROTHEUS) {
    let achou = -1;
    for (const pista of campo.pistas) {
      achou = nomes.findIndex(n => n && (n === pista || n.includes(pista)));
      if (achou >= 0) break;
    }
    if (achou >= 0 && !Object.values(mapa).includes(achou)) mapa[campo.k] = achou;
  }
  return mapa;
}

// Palavras com que um export costuma dizer que a ordem acabou. Fica curta de
// propósito: na dúvida a OS entra como ABERTA, porque propor baixa de serviço
// que não saiu é pior do que deixar de propor.
const ENCERRADA = /\b(encerrad|fechad|conclu|finalizad|baixad|realizad)/i;

export function lerProtheus(linhas, iCab, mapa) {
  const registros = [];
  for (let r = iCab + 1; r < linhas.length; r++) {
    const L = linhas[r] || [];
    const v = k => (mapa[k] >= 0 && mapa[k] != null ? L[mapa[k]] : null);
    const os = normalizarOS(v("os"));
    const frota = texto(v("frota"));
    const ativ = texto(v("atividade"));
    if (!os && !frota && !ativ) continue;
    const situacao = texto(v("situacao"));
    const fechamento = paraISO(v("fechamento"));
    registros.push({
      linha: r + 1, os, frota, atividade: ativ,
      servico: texto(v("servico")),
      tipo: texto(v("tipo")),
      situacao,
      abertura: paraISO(v("abertura")),
      fechamento,
      encerrada: !!fechamento || ENCERRADA.test(situacao),
    });
  }
  return registros;
}

/** O cruzamento. Não grava nada — devolve o que faria, para a prévia mostrar.
 *
 *  Casa primeiro pela OS, que é o único identificador que as duas pontas
 *  compartilham. Quando a OS é nova, ainda procura a MESMA atividade na mesma
 *  frota sem OS: é o caso real de serviço já anotado aqui e aberto no Protheus
 *  depois, e criar linha nova ali duplicaria o trabalho em vez de completá-lo. */
export function reconciliar(registros, atividades) {
  // Uma OS cobre várias atividades: na planilha de hoje há ordem com três
  // linhas embaixo dela. Por isso o índice guarda lista, e não a primeira que
  // aparecer — pegar só a primeira daria baixa em uma e deixaria as outras
  // abertas sem ninguém notar.
  const porOS = new Map();
  const guardar = (os, a) => {
    if (!os) return;
    if (!porOS.has(os)) porOS.set(os, []);
    porOS.get(os).push(a);
  };
  for (const a of atividades) {
    guardar(a.os, a);
    for (const o of a.os_outras || []) guardar(o, a);
  }
  const porChave = indexarPorChave(atividades.filter(a => !a.os));

  const r = { novas: [], vincular: [], divergentes: [], baixas: [],
    conhecidas: [], sem_os: [] };

  for (const reg of registros) {
    if (!reg.os) { r.sem_os.push(reg); continue; }

    const iguais = porOS.get(reg.os) || [];
    if (iguais.length) {
      // Frota diferente com a mesma OS é contradição entre as duas fontes.
      // Avisa e não sobrescreve: quem decide qual está certa é ele.
      const batem = iguais.filter(a => !reg.frota || !a.frota ||
        SEM_ACENTO(reg.frota) === SEM_ACENTO(a.frota));
      if (!batem.length) {
        r.divergentes.push({ reg, atividades: iguais, campo: "frota",
          aqui: [...new Set(iguais.map(a => a.frota))].join(", "), la: reg.frota });
        continue;
      }
      const abertas = batem.filter(a => !a.concluida_em && !a.cancelada);
      if (reg.encerrada && abertas.length) {
        for (const a of abertas) {
          r.baixas.push({ reg, atividade: a, em: reg.fechamento || "" });
        }
        continue;
      }
      r.conhecidas.push({ reg, atividades: batem });
      continue;
    }

    // OS que não existe aqui, mas cuja atividade talvez exista sem OS: é o
    // serviço anotado antes e aberto no Protheus depois. Criar linha nova
    // duplicaria o trabalho em vez de completá-lo.
    const candidatas = (porChave.get(chave(reg.frota, reg.atividade)) || [])
      .filter(a => !a.concluida_em && !a.cancelada);
    if (candidatas.length) {
      r.vincular.push({ reg, atividade: candidatas[0], candidatas });
      continue;
    }
    r.novas.push(reg);
  }
  return r;
}

/** Os registros novos viram atividades — sem semana, sem executante, sem data.
 *  Entram na carteira, que é onde trabalho não programado tem de estar. */
export function registroParaAtividade(reg, clientes) {
  const a = {
    ...molde(),
    os: reg.os,
    frota: reg.frota,
    cliente: (clientes && clientes.get(reg.frota)) || "",
    servico: reg.servico,
    atividade: reg.atividade,
    tipo: normalizarTipo(reg.tipo),
    origem: "Programada",
    obs: reg.abertura ? `Aberta no Protheus em ${brl(reg.abertura)}` : "",
  };
  if (reg.encerrada && reg.fechamento) {
    a.concluida_em = reg.fechamento;
    const s = semanaISO(reg.fechamento);
    if (s) { a.ano = s.ano; a.semana = s.semana; }
  }
  return a;
}

function normalizarTipo(t) {
  const s = SEM_ACENTO(t);
  if (!s) return "Corretiva";
  if (s.includes("prevent")) return "Preventiva";
  if (s.includes("corret")) return "Corretiva";
  if (s.includes("inspe")) return "Inspeção";
  if (s.includes("predit")) return "Preditiva";
  if (s.includes("borrach") || s.includes("pneu")) return "Borracharia";
  if (s.includes("melhor")) return "Melhoria";
  return "Não classificado";
}

export function brl(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
