// A identidade de uma atividade: o serviço, e onde na frota ele acontece.
//
// Porte do `planilha/texto.py`, que é o que já roda na planilha hoje. O motivo
// de ele existir está medido: um comparador por parecença acha 182 pares
// suspeitos nas atividades da planilha e erra em quase todos, porque manutenção
// escreve serviços que só diferem pelo lugar da peça — "lona de freio dianteira
// LD" e "lona de freio dianteira LE" são duas rodas, duas peças, dois serviços.
// O mesmo comparador, ensinado a separar POSIÇÃO de SERVIÇO, acha 4 e acerta os 4.
//
//     esqueleto  = o serviço, sem o onde     ("substitu lona freio")
//     posicao    = o onde                    ({dianteiro, ld})
//
// Mesmo esqueleto + mesma posição = a mesma atividade.
// Mesmo esqueleto + posição diferente = irmãs, e não se alerta nada.

// Tokens que dizem ONDE, não O QUÊ.
const POSICAO = /\b(ld|le|lda|lea|dianteir[oa]s?|traseir[oa]s?|frontal|superior(?:es)?|inferior(?:es)?|esquerd[oa]s?|direit[oa]s?|lado|eixo|eixos|[1-9]|[1-9]o|[1-9]a|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa])\b/g;

// Palavras que não distinguem nada.
const VAZIAS = new Set(
  ("de da do das dos e a o as os no na nos nas em com para por um uma " +
   "ao aos que se sua seu suas seus mesmo mesma mesmos mesmas").split(" "));

// Sufixos que só mudam a forma da palavra, não a peça nem o serviço. Sem isto,
// "Trocar pneus" e "Realizar troca dos pneus" passam por atividades diferentes —
// e são a mesma, escrita por duas pessoas.
const SUFIXOS = ["issimos", "issimas", "amento", "imento", "mentos", "ssao",
  "coes", "cao", "agem", "ncia", "ados", "adas", "idos", "idas", "ado", "ada",
  "ido", "ida", "ar", "er", "ir", "es", "ns", "s"];

// Radicais que são a mesma coisa na oficina. Só entra aqui o que um mecânico
// usaria um pelo outro sem mudar o serviço. "Recuperar", "corrigir" e "repor"
// ficam de fora de propósito: recuperar é reformar a peça, repor é pôr a que
// sumiu, e tratá-los como sinônimo esconderia serviço de verdade.
const SINONIMOS = { troc: "substitu" };

/** Texto cru para comparação: sem acento, sem caixa, sem pontuação, sem o que
 *  está entre parênteses e sem código de peça ou OS grudado no meio.
 *
 *  Os parênteses saem porque é onde o relatório de inspeção despeja número de
 *  peça, "OS ABRIR OS" e nome de oficina — nada disso identifica a atividade. */
export function base(t) {
  let s = String(t == null ? "" : t);
  s = s.replace(/\([^()]*\)/g, " ");
  s = s.replace(/\([^)]*\)?/g, " ");            // sobra de parêntese aberto
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/\b\d{4,}\b/g, " ");            // 20855371, 007011: código, não serviço
  s = s.toLowerCase().replace(/\bos\b/g, " ");  // "OS 7185" já perdeu o número acima
  return s.replace(/[^a-z0-9]+/g, " ").trim();
}

/** Onde a atividade acontece. Set porque é metade de uma chave. */
export function posicao(t) {
  return new Set(base(t).match(POSICAO) || []);
}

/** Radical grosseiro: corta o sufixo mais longo que couber, sem deixar a
 *  palavra com menos de 4 letras. "trocar", "troca" e "trocadas" viram "troc". */
export function raiz(p) {
  for (const s of SUFIXOS) {
    if (p.endsWith(s) && p.length - s.length >= 4) { p = p.slice(0, -s.length); break; }
  }
  return SINONIMOS[p] || p;
}

// A cauda explicativa. Diz por que o serviço existe, não o que fazer — e é ela
// que faz o texto passar de 130 caracteres e não caber na tela do tablet.
const CAUDA = /[,;:]?\s*\b(devido|para melhor|para evitar|evitando|visando|pois|ja que|já que|conforme|uma vez que|a fim de|sob pena|por conta d[oae]|em razao d[oae]|em razão d[oae])\b[\s\S]*$/i;

// Verbo de enchimento: "Realizar troca de X" não diz mais que "Trocar X".
//
// O conector "de/do/da" é opcional porque às vezes se escreve "substituição
// lona de freio", sem o "da". Mas o que vem depois NÃO pode ser o objeto em
// duas famílias de palavra: conjunção e preposição, que quebrariam a frase
// ("Realizar troca OU calibração" viraria "Trocar ou calibração"); e adjetivo
// que qualifica o substantivo em vez de ser qualificado por ele — "lubrificação
// GERAL" viraria "Lubrificar geral", que não é ordem de serviço nenhuma.
const NAO_OBJETO = "(?:ou|e|no|na|nos|nas|em|com|para|por|ao|aos|a|o|se|que" +
  "|geral|gerais|complet[oa]s?|total|parcial|peri[óo]dic[oa]" +
  "|preventiv[oa]|corretiv[oa]|simples)";
const D = "(?:\\s+d[oaeu]s?)?\\s+(?!" + NAO_OBJETO + "\\b)";
const V = "^(?:realizar|efetuar|fazer|executar|programar)(?:\\s+a|\\s+o)?\\s+";

const ENCHIMENTO = [
  [/^\s*[*\-–·•]+\s*/, ""],
  [new RegExp("^(?:realizar|efetuar|fazer|executar|proceder\\s+a?o?|programar)(?:\\s+a|\\s+o)?\\s+troca" + D, "i"), "Trocar "],
  [new RegExp(V + "substitui[çc][ãa]o" + D, "i"), "Substituir "],
  [new RegExp(V + "recupera[çc][ãa]o" + D, "i"), "Recuperar "],
  [new RegExp(V + "limpeza" + D, "i"), "Limpar "],
  [new RegExp(V + "repara[çc][ãa]o" + D, "i"), "Reparar "],
  [new RegExp(V + "revis[ãa]o" + D, "i"), "Revisar "],
  [new RegExp(V + "regulagem" + D, "i"), "Regular "],
  [new RegExp(V + "instala[çc][ãa]o" + D, "i"), "Instalar "],
  [new RegExp(V + "lubrifica[çc][ãa]o" + D, "i"), "Lubrificar "],
];
// Não existe regra que apague "Realizar" sozinho. "Realizar alinhamento"
// viraria "Alinhamento", que é um substantivo: deixa de ser uma ordem de
// serviço e vira um assunto. Só se dissolve o verbo quando há outro para pôr
// no lugar.

/** A redução do texto, com o que estava entre parênteses e a cauda explicativa
 *  devolvidos à parte como observação. Devolve { texto, obs: [] }. */
export function nucleo(t) {
  const orig = String(t == null ? "" : t);
  const obs = [];
  for (const m of orig.matchAll(/\(([^()]*)\)/g)) {
    const p = m[1].replace(/^[\s·.,;]+|[\s·.,;]+$/g, "");
    if (p) obs.push(p);
  }
  let novo = orig.replace(/\([^()]*\)/g, " ").replace(/\([^)]*$/, " ");

  const m = CAUDA.exec(novo);
  if (m) {
    const c = m[0].replace(/^[\s,;:]+|[\s,;:]+$/g, "");
    if (c) obs.push(c);
    novo = novo.replace(CAUDA, "");
  }

  for (const [rx, rep] of ENCHIMENTO) {
    const n2 = novo.replace(rx, rep);
    if (n2 !== novo) { novo = n2; break; }
  }

  novo = novo.replace(/\s+/g, " ").replace(/^[\s.,;:\-·/]+|[\s.,;:\-·/]+$/g, "");
  if (novo) novo = novo[0].toUpperCase() + novo.slice(1);
  return { texto: novo, obs };
}

/** O serviço sem o onde e sem a forma da palavra.
 *
 *  Reduz ANTES de comparar: é o que faz "Realizar troca dos pneus" e "Trocar
 *  pneus" caírem no mesmo lugar. */
export function esqueleto(t) {
  const s = base(nucleo(t).texto).replace(POSICAO, " ");
  return s.split(/\s+/).filter(p => p && !VAZIAS.has(p) && p.length > 2)
    .map(raiz).join(" ");
}

/** A identidade completa: quem, o quê, onde — como uma string comparável. */
export function chave(frota, t) {
  const p = [...posicao(t)].sort().join(",");
  return String(frota || "").trim() + "|" + esqueleto(t) + "|" + p;
}

export function mesmaAtividade(frotaA, ta, frotaB, tb) {
  return chave(frotaA, ta) === chave(frotaB, tb);
}

/** Índice de chave → atividades, para o importador perguntar "isto já existe?"
 *  em tempo constante em vez de comparar todas contra todas. */
export function indexarPorChave(atividades) {
  const ix = new Map();
  for (const a of atividades) {
    const k = chave(a.frota, a.atividade);
    if (!ix.has(k)) ix.set(k, []);
    ix.get(k).push(a);
  }
  return ix;
}

/** Texto sem acento e em minúsculas, para busca livre na tela. */
export function busca(t) {
  return String(t == null ? "" : t).normalize("NFD")
    .replace(/[̀-ͯ]/g, "").toLowerCase();
}
