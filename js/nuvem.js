// O lugar comum: a fita de eventos no Supabase.
//
// Fala com o PostgREST por `fetch` direto, sem a biblioteca oficial. São quatro
// chamadas — ler desde um ponto, enviar, contar e testar — e a biblioteca pesa
// mais do que o site inteiro.
//
// **Como as telas dos quatro se atualizam.** Por consulta repetida, de poucos
// em poucos segundos, e não por WebSocket. O realtime do Supabase fala um
// protocolo de canais com batimento, numeração de mensagem e reconexão — umas
// duzentas linhas que quebram justamente onde este site vai viver: celular que
// dorme, sinal que cai, aba que fica em segundo plano. Uma consulta a cada dez
// segundos, pedindo só o que é mais novo que o último número que eu já tenho,
// resolve o mesmo problema em cinco linhas e volta sozinha de qualquer queda.
// Para quatro pessoas, dez segundos de atraso ninguém percebe.

import * as dados from "./dados.js";

const TABELA = "eventos";

let url = "";
let chave = "";
let ligadoEm = 0;

// Quem precisa saber que a nuvem acabou de ser ligada ou desligada. Sem isto,
// configurar pela tela gravava o endereço mas ninguém começava a escutar: o
// apontamento do Pedro subia e só aparecia no PCM depois de recarregar a
// página — exatamente o que esta tela existe para evitar.
const aoMudar = new Set();
export function aoLigar(fn) { aoMudar.add(fn); return () => aoMudar.delete(fn); }
function anunciar() { for (const fn of aoMudar) { try { fn(ligada()); } catch (e) { /* segue */ } } }

export function ligada() { return !!(url && chave); }
export function endereco() { return url; }

export async function carregarConfig() {
  const c = await dados.lerMeta("nuvem", null);
  if (c && c.url && c.chave) { url = c.url; chave = c.chave; }
  return ligada();
}

export async function configurar(novaUrl, novaChave) {
  const u = String(novaUrl || "").trim().replace(/\/+$/, "");
  const k = String(novaChave || "").trim();
  // Supabase hospedado é o caso normal. http só é aceito na própria máquina,
  // que é onde um PostgREST rodando local (ou um teste) vive — mandar dado de
  // manutenção por http pela rede não.
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(u);
  if (!local && !/^https:\/\/[a-z0-9-]+\.[a-z0-9.-]+$/i.test(u)) {
    throw new Error("O endereço tem de ser o do projeto, assim: https://xxxx.supabase.co");
  }
  if (k.length < 30) throw new Error("Essa chave parece curta demais.");
  const antes = [url, chave];
  url = u; chave = k;
  try {
    await contar();                       // só grava o que respondeu
  } catch (e) {
    [url, chave] = antes;
    throw new Error("Não consegui falar com esse projeto: " + e.message);
  }
  await dados.gravarMeta("nuvem", { url, chave });
  anunciar();
  return true;
}

export async function desligar() {
  url = ""; chave = "";
  await dados.gravarMeta("nuvem", null);
  anunciar();
}

function cabecalhos(extra = {}) {
  return { apikey: chave, Authorization: "Bearer " + chave,
    "Content-Type": "application/json", ...extra };
}

async function chamar(caminho, opcoes = {}) {
  const r = await fetch(`${url}/rest/v1/${caminho}`, opcoes);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText}${t ? " — " + t.slice(0, 200) : ""}`);
  }
  return r;
}

export async function contar() {
  const r = await chamar(`${TABELA}?select=seq&limit=1`,
    { headers: cabecalhos({ Prefer: "count=exact" }), method: "GET" });
  const faixa = r.headers.get("content-range") || "";
  return Number(faixa.split("/")[1]) || 0;
}

/** Tudo que entrou depois do número que eu já tenho. Em páginas, porque a
 *  primeira carga de uma planilha inteira passa de mil eventos. */
export async function baixarDesde(seq = 0, pagina = 1000) {
  const tudo = [];
  let de = Number(seq) || 0;
  for (let volta = 0; volta < 200; volta++) {
    const r = await chamar(
      `${TABELA}?select=*&seq=gt.${de}&order=seq.asc&limit=${pagina}`,
      { headers: cabecalhos(), method: "GET" });
    const lote = await r.json();
    tudo.push(...lote);
    if (lote.length < pagina) break;
    de = lote[lote.length - 1].seq;
  }
  return tudo;
}

/** Envia e devolve quantos foram aceitos.
 *
 *  `resolution=ignore-duplicates` sobre o `id` é o que torna o reenvio seguro:
 *  o celular que ficou sem sinal manda tudo de novo e o banco ignora o que já
 *  tinha, em vez de criar lançamento repetido ou estourar erro. */
export async function enviar(eventos) {
  if (!eventos.length) return 0;
  const limpos = eventos.map(({ seq, ...resto }) => resto);
  for (let i = 0; i < limpos.length; i += 500) {
    await chamar(`${TABELA}?on_conflict=id`, {
      method: "POST",
      headers: cabecalhos({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
      body: JSON.stringify(limpos.slice(i, i + 500)),
    });
  }
  return limpos.length;
}

/** Pergunta de tempos em tempos o que há de novo. Devolve a função que para.
 *
 *  Não consulta com a aba escondida — celular no bolso não precisa gastar
 *  bateria e dados perguntando o que ninguém está olhando; ao voltar para a
 *  tela, pergunta na hora. */
export function observar(aoChegar, { intervalo = 10000 } = {}) {
  let parado = false;
  let rodando = false;

  async function volta() {
    if (parado || rodando || !ligada()) return;
    if (typeof document !== "undefined" && document.hidden) return;
    rodando = true;
    try {
      const desde = await dados.lerMeta("nuvem_seq", 0);
      const novos = await baixarDesde(desde);
      if (novos.length) {
        await dados.gravarMeta("nuvem_seq", novos[novos.length - 1].seq);
        await aoChegar(novos);
      }
      ligadoEm = Date.now();
    } catch (e) {
      // Sem rede é o estado normal no pátio, não um erro para assustar
      // ninguém: a fila local continua guardando e a próxima volta tenta.
      console.debug("nuvem: não respondeu —", e.message);
    } finally { rodando = false; }
  }

  const t = setInterval(volta, intervalo);
  const aoVoltar = () => { if (!document.hidden) volta(); };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", aoVoltar);
  }
  if (typeof window !== "undefined") window.addEventListener("online", volta);
  volta();

  return () => {
    parado = true;
    clearInterval(t);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", aoVoltar);
    }
    if (typeof window !== "undefined") window.removeEventListener("online", volta);
  };
}

export function ultimaConversa() { return ligadoEm; }
