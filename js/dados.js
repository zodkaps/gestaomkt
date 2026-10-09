// Onde os dados moram — no aparelho, e na nuvem quando ela está ligada.
//
// Só duas coisas são gravadas: a fita de eventos e um punhado de preferências.
// As atividades, movimentações e preventivas NÃO são gravadas — elas são o
// resultado de tocar a fita, e guardar o resultado ao lado da causa é como as
// duas versões se separam sem ninguém perceber. Ler é sempre reconstruir.
//
// Com quatro pessoas, o aparelho deixa de ser o dono do dado e passa a ser
// **cache e fila de saída**: o que é lançado aqui fica marcado como não
// enviado até o Supabase confirmar, e o que vem de lá entra misturado pela
// chave `id`. É por isso que o celular do pátio pode ficar sem sinal a manhã
// inteira sem perder um apontamento nem criar um repetido.
//
// IndexedDB é o lugar certo: aguenta dezenas de milhares de eventos e não
// tranca a aba. Quando o navegador nega (aba anônima, política de
// privacidade), cai para localStorage; se nem isso, segue só na memória — e
// diz isso em voz alta na tela.

const BANCO = "mkt";
// 3 porque a chave da fita mudou de `seq` para `id`, e isso é migração. Ver
// `abrirIndexedDB()`: a chave velha perdia lançamento feito offline.
const VERSAO = 3;

let db = null;
export let modo = "indisponível";

function pedido(req) {
  return new Promise((ok, erro) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

/** A chave da fita é o `id`, e isso não é detalhe.
 *
 *  Era `seq`, e `seq` significa duas coisas diferentes: no evento nascido aqui
 *  é um contador local (o maior que existe, mais um); no evento que desce da
 *  nuvem é o número da sequência do Postgres. São duas numerações que se
 *  cruzam — e, sendo `seq` a chave, baixar o evento número 7 da nuvem
 *  SUBSTITUÍA o lançamento local que por acaso tinha ficado com o 7. O
 *  apontamento feito sem sinal desaparecia: não ficava na fila e não chegava
 *  ao servidor. Some, calado, exatamente no caso para o qual a fila existe.
 *
 *  O `id` nasce no aparelho, é único, e já é por ele que o Postgres descarta
 *  repetido (`on_conflict=id`). É a chave certa desde o começo — o comentário
 *  no alto deste arquivo sempre disse isso; era o código que discordava. */
async function abrirIndexedDB() {
  if (!globalThis.indexedDB) throw new Error("sem IndexedDB");
  const req = indexedDB.open(BANCO, VERSAO);
  req.onupgradeneeded = () => {
    const d = req.result;
    const tx = req.transaction;
    if (!d.objectStoreNames.contains("meta")) {
      d.createObjectStore("meta", { keyPath: "k" });
    }
    if (!d.objectStoreNames.contains("eventos")) {
      d.createObjectStore("eventos", { keyPath: "id" });
      return;
    }
    if (tx.objectStore("eventos").keyPath === "id") return;
    // Troca a chave sem perder a fita de quem já estava usando: lê tudo,
    // refaz o armazém com a chave certa e devolve os eventos.
    const tudo = tx.objectStore("eventos").getAll();
    tudo.onsuccess = () => {
      d.deleteObjectStore("eventos");
      const novo = d.createObjectStore("eventos", { keyPath: "id" });
      for (const ev of tudo.result || []) if (ev && ev.id) novo.put(ev);
    };
  };
  return pedido(req);
}

export async function abrir() {
  if (modo !== "indisponível") return modo;
  try {
    db = await abrirIndexedDB();
    modo = "indexeddb";
  } catch (e) {
    db = null;
    modo = localStorageVivo() ? "localstorage" : "memória";
  }
  return modo;
}

function localStorageVivo() {
  try {
    localStorage.setItem("mkt:teste", "1");
    localStorage.removeItem("mkt:teste");
    return true;
  } catch (e) { return false; }
}

// Último recurso: se nem localStorage responde, o site ainda abre e funciona
// até fechar a aba. Melhor do que tela branca — e a faixa de aviso diz
// exatamente isso, para ninguém trabalhar meio dia achando que gravou.
const memoria = { eventos: [], meta: new Map() };

// ── ordem ───────────────────────────────────────────────────────────────────
// A fita é dobrada nesta ordem, e ela não pode depender de quem gravou
// primeiro: o `seq` do banco só existe depois que o evento sobe, e o celular
// offline não tem nenhum. Ordenar por instante, com o `id` desempatando, dá o
// MESMO resultado nos quatro aparelhos, estejam eles sincronizados ou não.
export function ordem(a, b) {
  return String(a.ts).localeCompare(String(b.ts)) ||
    String(a.id).localeCompare(String(b.id));
}

// ── eventos ─────────────────────────────────────────────────────────────────

export async function lerEventos() {
  let evs;
  if (modo === "indexeddb") {
    const tx = db.transaction("eventos", "readonly");
    evs = await pedido(tx.objectStore("eventos").getAll());
  } else if (modo === "localstorage") {
    try { evs = JSON.parse(localStorage.getItem("mkt:eventos") || "[]"); }
    catch (e) { evs = []; }
  } else {
    evs = memoria.eventos.slice();
  }
  return evs.sort(ordem);
}

async function escrever(evs) {
  if (modo === "indexeddb") {
    const tx = db.transaction("eventos", "readwrite");
    const st = tx.objectStore("eventos");
    for (const ev of evs) st.put(ev);
    return new Promise((ok, erro) => {
      tx.oncomplete = ok;
      tx.onerror = () => erro(tx.error);
      tx.onabort = () => erro(tx.error);
    });
  }
  const todos = await lerEventos();
  const porId = new Map(todos.map(e => [e.id, e]));
  for (const ev of evs) porId.set(ev.id, ev);
  const juntos = [...porId.values()].sort(ordem);
  if (modo === "localstorage") localStorage.setItem("mkt:eventos", JSON.stringify(juntos));
  else memoria.eventos = juntos;
}

/** Grava eventos novos, nascidos aqui. Entram na fila de saída. */
export async function gravarEventos(evs) {
  if (!evs.length) return evs;
  const todos = await lerEventos();
  let n = todos.reduce((m, e) => Math.max(m, e.seq || 0), 0);
  for (const ev of evs) {
    if (ev.seq == null) ev.seq = ++n;
    ev.enviado = false;
  }
  await escrever(evs);
  return evs;
}

/** Mistura o que veio da nuvem. O `id` manda: o que já existe não entra duas
 *  vezes, e o que eu mesmo mandei volta marcado como enviado. */
export async function mesclarDaNuvem(evs) {
  if (!evs.length) return 0;
  const todos = await lerEventos();
  const conhecidos = new Set(todos.map(e => e.id));
  // O banco devolve o instante no formato dele ("…+00:00", sem os zeros do
  // fim), e a fita é ordenada pelo texto do instante: sem normalizar, o mesmo
  // evento ordenaria diferente aqui e num aparelho que ainda tem a cópia local.
  const paraGravar = evs.map(e => {
    const d = new Date(e.ts);
    return { ...e, ts: isNaN(d) ? e.ts : d.toISOString(), enviado: true };
  });
  await escrever(paraGravar);
  return paraGravar.filter(e => !conhecidos.has(e.id)).length;
}

/** O que ainda não subiu. */
export async function pendentes() {
  return (await lerEventos()).filter(e => e.enviado === false);
}

export async function marcarEnviados(ids) {
  if (!ids.length) return;
  const alvo = new Set(ids);
  const todos = await lerEventos();
  await escrever(todos.filter(e => alvo.has(e.id)).map(e => ({ ...e, enviado: true })));
}

/** Substitui a fita inteira. Só a restauração de backup usa isto. */
export async function trocarEventos(evs) {
  const limpos = evs.map((e, i) => ({ ...e, seq: e.seq ?? i + 1 })).sort(ordem);
  if (modo === "indexeddb") {
    const tx = db.transaction("eventos", "readwrite");
    const st = tx.objectStore("eventos");
    st.clear();
    for (const ev of limpos) st.put(ev);
    await new Promise((ok, erro) => {
      tx.oncomplete = ok;
      tx.onerror = () => erro(tx.error);
      tx.onabort = () => erro(tx.error);
    });
  } else if (modo === "localstorage") {
    localStorage.setItem("mkt:eventos", JSON.stringify(limpos));
  } else {
    memoria.eventos = limpos;
  }
  return limpos;
}

export async function apagarTudo() {
  await trocarEventos([]);
  await gravarMeta("nuvem_seq", 0);
  if (modo === "indexeddb") {
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").delete("nuvem_seq");
    await new Promise(ok => { tx.oncomplete = ok; });
  }
}

// ── preferências ────────────────────────────────────────────────────────────
// Quem está usando, endereço da nuvem, mapa de colunas do Protheus, tema. Nada
// aqui é dado de manutenção: tudo pode ser perdido sem perder trabalho.

export async function lerMeta(k, padrao = null) {
  if (modo === "indexeddb") {
    const tx = db.transaction("meta", "readonly");
    const r = await pedido(tx.objectStore("meta").get(k));
    return r ? r.v : padrao;
  }
  if (modo === "localstorage") {
    const s = localStorage.getItem("mkt:meta:" + k);
    if (s == null) return padrao;
    try { return JSON.parse(s); } catch (e) { return padrao; }
  }
  return memoria.meta.has(k) ? memoria.meta.get(k) : padrao;
}

export async function gravarMeta(k, v) {
  if (modo === "indexeddb") {
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ k, v });
    return new Promise(ok => { tx.oncomplete = ok; });
  }
  if (modo === "localstorage") {
    localStorage.setItem("mkt:meta:" + k, JSON.stringify(v));
    return;
  }
  memoria.meta.set(k, v);
}

/** Quanto espaço o navegador ainda promete. Serve para avisar antes de encher,
 *  não para decidir nada. */
export async function espaco() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      return { usado: e.usage || 0, total: e.quota || 0 };
    }
  } catch (e) { /* navegador sem a API: segue sem o aviso */ }
  return null;
}
