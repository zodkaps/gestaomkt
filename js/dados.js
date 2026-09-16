// Onde os dados moram.
//
// Só duas coisas são gravadas: a fita de eventos e um punhado de preferências.
// As atividades NÃO são gravadas — elas são o resultado de tocar a fita, e
// guardar o resultado ao lado da causa é como as duas versões se separam sem
// ninguém perceber. Ler é sempre reconstruir.
//
// IndexedDB é o lugar certo: aguenta dezenas de milhares de eventos e não
// tranca a aba. Quando o navegador nega (aba anônima, política de privacidade),
// cai para localStorage em vez de quebrar — com menos espaço, e dizendo isso
// em voz alta na tela.

const BANCO = "mkt";
const VERSAO = 1;

let db = null;
export let modo = "indisponível";

function pedido(req) {
  return new Promise((ok, erro) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

async function abrirIndexedDB() {
  if (!globalThis.indexedDB) throw new Error("sem IndexedDB");
  const req = indexedDB.open(BANCO, VERSAO);
  req.onupgradeneeded = () => {
    const d = req.result;
    if (!d.objectStoreNames.contains("eventos")) {
      d.createObjectStore("eventos", { keyPath: "seq", autoIncrement: true });
    }
    if (!d.objectStoreNames.contains("meta")) {
      d.createObjectStore("meta", { keyPath: "k" });
    }
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
// até fechar a aba. Melhor do que uma tela branca — e a faixa de aviso diz
// exatamente isso para ninguém trabalhar meio dia achando que gravou.
const memoria = { eventos: [], meta: new Map() };

// ── eventos ─────────────────────────────────────────────────────────────────

export async function lerEventos() {
  if (modo === "indexeddb") {
    const tx = db.transaction("eventos", "readonly");
    return await pedido(tx.objectStore("eventos").getAll());
  }
  if (modo === "localstorage") {
    try { return JSON.parse(localStorage.getItem("mkt:eventos") || "[]"); }
    catch (e) { return []; }
  }
  return memoria.eventos.slice();
}

/** Grava eventos novos. Devolve-os com o `seq` que receberam. */
export async function gravarEventos(evs) {
  if (!evs.length) return evs;
  if (modo === "indexeddb") {
    const tx = db.transaction("eventos", "readwrite");
    const st = tx.objectStore("eventos");
    for (const ev of evs) {
      const { seq, ...resto } = ev;
      ev.seq = await pedido(st.add(resto));
    }
    await new Promise((ok, erro) => {
      tx.oncomplete = ok;
      tx.onerror = () => erro(tx.error);
      tx.onabort = () => erro(tx.error);
    });
    return evs;
  }
  const todos = await lerEventos();
  let n = todos.length ? todos[todos.length - 1].seq : 0;
  for (const ev of evs) ev.seq = ++n;
  const juntos = todos.concat(evs);
  if (modo === "localstorage") {
    localStorage.setItem("mkt:eventos", JSON.stringify(juntos));
  } else {
    memoria.eventos = juntos;
  }
  return evs;
}

/** Substitui a fita inteira. Só a restauração de backup usa isto. */
export async function trocarEventos(evs) {
  const limpos = evs.map((e, i) => ({ ...e, seq: i + 1 }));
  if (modo === "indexeddb") {
    const tx = db.transaction("eventos", "readwrite");
    const st = tx.objectStore("eventos");
    st.clear();
    for (const ev of limpos) st.add(ev);
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
  if (modo === "indexeddb") {
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").clear();
    await new Promise(ok => { tx.oncomplete = ok; });
  } else if (modo === "localstorage") {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("mkt:meta:")) localStorage.removeItem(k);
    }
  } else {
    memoria.meta.clear();
  }
}

// ── preferências ────────────────────────────────────────────────────────────
// Mapa de colunas do Protheus, data do último backup, tema. Nada aqui é dado
// de manutenção: tudo pode ser perdido sem perder trabalho.

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
