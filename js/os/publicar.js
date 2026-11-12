// A publicação do painel de OS por versão (12/11/2026).
//
// Antes, gravar a atualização eram cinco envios soltos (a base histórica, a lista de frotas, a cópia do dia, o
// painel e o índice), um depois do outro: se um falhasse no meio, o bucket ficava com pedaços de versões
// diferentes — a lista de frotas nova com o painel velho, a cópia de um dia que nunca foi publicado na
// comparação, o índice sem a linha. O painel em si nunca misturava (ele lê um arquivo só, o atual.json.gz,
// e a troca de um arquivo no Storage é inteira), mas o que vinha em volta, sim.
//
// Agora uma atualização é UM pacote que leva tudo o que vale junto: as OS (D), a lista de frotas usada, a
// referência da base histórica usada e o índice das atualizações. Publicar é, em ordem:
//   1. conferir o pacote (sem gravar nada);
//   2. reservar a gravação (a trava: um arquivo criado só se não existir — o Storage recusa o segundo);
//   3. conferir que o painel no ar ainda é o que estava aberto (ninguém publicou no meio);
//   4. guardar a base histórica nova, se veio (historicos/<sha>.json.gz, pelo conteúdo: a mesma não duplica);
//   5. gravar a versão (versoes/<id>.json.gz — nunca sobrescrita);
//   6. baixar o que gravou e conferir byte a byte (sha-256);
//   7. publicar: trocar o atual.json.gz pelo mesmo conteúdo, e conferir de novo;
//   8. soltar a trava.
// Até o passo 7, nada do que o painel mostra mudou: uma falha (ou a janela fechada no meio) deixa o painel
// na versão anterior, inteira, e o que sobrou (uma versão não publicada, a base guardada) não é lido por
// ninguém. A versão anterior continua em versoes/, e dá para voltar a ela (`voltarPara`).
//
// O acesso ao bucket vem de fora (`io`), para o teste (testes/rodar.js) simular cada falha sem rede.

export const ATUAL = "atual.json.gz";
export const TRAVA = "trava.json.gz";
export const VALIDADE_TRAVA_MIN = 15;                  // a trava de uma tentativa que não terminou vence depois disto
export const arquivoDaVersao = (id) => `versoes/${id}.json.gz`;
export const arquivoDoHistorico = (sha) => `historicos/${sha.slice(0, 24)}.json.gz`;

const semZeros = (s) => String(s ?? "").trim().replace(/^0+(?=\d)/, "");
const chaveOS = (filial, os) => semZeros(filial) + "|" + semZeros(os);
const hhmm = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const br = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");

// ── compactar e conferir ─────────────────────────────────────────────────────

export async function gz(obj) {
  const s = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(s).arrayBuffer()], { type: "application/gzip" });
}
export async function deGz(blob) {
  const s = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(s).text());
}
/** sha-256 em hexadecimal de um Blob, ArrayBuffer, Uint8Array ou texto. */
export async function sha256(x) {
  const bytes = typeof x === "string" ? new TextEncoder().encode(x) : x instanceof Blob ? await x.arrayBuffer() : x;
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** A impressão digital das OS de um pacote: duas atualizações com os mesmos dados têm a mesma. */
export const shaDosDados = (D) => sha256(JSON.stringify(D));

/** O nome de uma versão: a data do export, a hora em que foi preparada e quatro letras ao acaso
 *  (duas preparadas no mesmo segundo não colidem). Ex.: 2026-11-12_140312_k3fz. */
export function idDaVersao(base, agora = new Date(), sorte = Math.random) {
  const p = (n) => String(n).padStart(2, "0");
  const letras = Array.from({ length: 4 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(sorte() * 32)]).join("");
  return `${base}_${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}_${letras}`;
}
/** "12/11 14:03" a partir do nome da versão (para a tela). */
export function rotuloDaVersao(id) {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/.exec(id || "");
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : id || "";
}

/** O que impede publicar o pacote (vazio: pode). Só o que é certo — o resto a conferência mostra antes. */
export function conferirPacote(p) {
  const prob = [];
  if (!p || !p.D || !Array.isArray(p.D.os) || !p.meta) return ["o pacote não tem as OS"];
  const { D, meta } = p;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.base || "") || meta.base !== D.base) prob.push("a data do export não é válida");
  if (!D.os.length) prob.push("nenhuma OS no painel montado");
  if (!Array.isArray(D.frotas_lista) || !D.frotas_lista.length) prob.push("a lista de frotas está vazia");
  if (!Array.isArray(meta.frotas) || !meta.frotas.length) prob.push("o pacote não diz que lista de frotas usou");
  let semNumero = 0, semFrota = 0, repetidas = 0, sitErrada = 0;
  const vistas = new Set(), conta = { A: 0, P: 0, F: 0 };
  for (const a of D.os) {
    if (!semZeros(a[0])) semNumero++;
    if (!a[2]) semFrota++;
    const k = chaveOS(a[1], a[0]);
    if (vistas.has(k)) repetidas++;
    vistas.add(k);
    if (a[6] in conta) conta[a[6]]++; else sitErrada++;
  }
  if (semNumero) prob.push(`${semNumero} OS sem número`);
  if (semFrota) prob.push(`${semFrota} OS sem frota`);
  if (repetidas) prob.push(`${repetidas} OS repetida(s) no pacote`);
  if (sitErrada) prob.push(`${sitErrada} OS com situação desconhecida`);
  const r = meta.resumo;
  if (r && (r.n !== D.os.length || r.A !== conta.A || r.P !== conta.P || r.F !== conta.F)) prob.push("o resumo do pacote não bate com as OS dele");
  if (!meta.sha_dados) prob.push("o pacote não tem a impressão digital das OS");
  return prob;
}

// ── o bucket ─────────────────────────────────────────────────────────────────

const duplicado = (e) => /409|duplicate|already exists/i.test(String((e && e.message) || e));
function falha(etapa, texto, causa) {
  const e = new Error(texto);
  e.etapa = etapa;
  if (causa) e.causa = String((causa && causa.message) || causa);
  return e;
}
async function lerJSON(io, caminho) {
  const b = await io.baixar(caminho);
  return b ? deGz(b) : null;
}

/** Reserva a gravação. A trava é um arquivo criado só se não existir: duas pessoas ao mesmo tempo, o Storage
 *  aceita uma e recusa a outra. A trava de uma tentativa que não terminou (a janela fechou no meio) vence em
 *  VALIDADE_TRAVA_MIN minutos; a de quem está publicando agora (a mesma pessoa) é dela, e ela segue. */
export async function travar(io, { quem, id, agora = () => new Date() }) {
  const minha = { quem, id, desde: agora().toISOString() };
  try { await io.subir(TRAVA, await gz(minha), { substituir: false }); return minha; }
  catch (e) {
    if (!duplicado(e)) throw falha("trava", "Não deu para reservar a gravação: " + ((e && e.message) || e), e);
    const outra = await lerJSON(io, TRAVA).catch(() => null);
    const idade = outra ? agora().getTime() - Date.parse(outra.desde) : Infinity;
    if (outra && outra.quem !== quem && idade < VALIDADE_TRAVA_MIN * 60e3) {
      const resta = Math.max(1, Math.ceil((VALIDADE_TRAVA_MIN * 60e3 - idade) / 60e3));
      throw falha("trava", `Outra atualização está sendo gravada por ${outra.quem} desde ${hhmm(outra.desde)}. Espere ela terminar ` +
        `(se ela não terminar, a reserva vence em ${resta} min).`);
    }
    await io.subir(TRAVA, await gz(minha), { substituir: true });
    return minha;
  }
}
export async function destravar(io, trava) {
  const agora = await lerJSON(io, TRAVA).catch(() => null);
  if (agora && trava && agora.id !== trava.id) return false;          // já é de outra tentativa: não é minha para soltar
  await io.apagar(TRAVA);
  return true;
}

/**
 * Publica um pacote. `io`: { subir(caminho, blob, { substituir }), baixar(caminho) → Blob | null, apagar(caminho),
 * versaoNoAr() → texto que muda quando o atual.json.gz muda }. `versaoAberta`: a versaoNoAr() de quando a
 * conferência foi feita (o painel aberto). `historico`: { blob, sha } da base histórica nova, se veio.
 * `etapa(nome, estado, texto)` avisa a tela de cada passo ("faz", "ok", "erro", "aviso").
 * Devolve { id, avisos }; se não publicar, lança um Error com `.etapa` — e o painel no ar não mudou.
 */
export async function publicar({ io, pacote, historico = null, quem = "", versaoAberta = "", agora = () => new Date(), etapa = () => {} }) {
  const avisos = [];
  const passo = async (nome, texto, fn) => {
    etapa(nome, "faz", texto);
    try { const r = await fn(); etapa(nome, "ok", texto); return r; }
    catch (e) { etapa(nome, "erro", texto, e); throw e.etapa ? e : falha(nome, `${texto}: ${(e && e.message) || e}`, e); }
  };
  const id = pacote.meta.versao_id;
  await passo("conferir", "Conferir os dados", async () => {
    const prob = conferirPacote(pacote);
    if (prob.length) throw falha("conferir", "O pacote não passou na conferência: " + prob.join("; ") + ".");
    if (!id) throw falha("conferir", "O pacote não tem o nome da versão.");
  });
  const trava = await passo("trava", "Reservar a gravação", () => travar(io, { quem, id, agora }));
  let publicou = false;
  try {
    await passo("no-ar", "Conferir a versão no ar", async () => {
      const noAr = await io.versaoNoAr();
      if (noAr !== versaoAberta) throw falha("no-ar", "O painel foi atualizado depois que você abriu esta conferência (outra publicação). " +
        "Feche, abra o painel de novo e confira com a versão nova.");
    });
    if (historico) await passo("historico", "Guardar a base histórica", async () => {
      try { await io.subir(arquivoDoHistorico(historico.sha), historico.blob, { substituir: false }); }
      catch (e) { if (!duplicado(e)) throw e; }                       // a mesma base já estava guardada: o conteúdo é o mesmo
      const volta = await io.baixar(arquivoDoHistorico(historico.sha));
      if (!volta || await sha256(volta) !== historico.sha) throw falha("historico", "A base histórica gravada não confere com a enviada.");
    });
    const blob = await gz(pacote), sha = await sha256(blob);
    await passo("versao", "Gravar a versão nova", () => io.subir(arquivoDaVersao(id), blob, { substituir: false }));
    await passo("copia", "Conferir a cópia gravada", async () => {
      const volta = await io.baixar(arquivoDaVersao(id));
      if (!volta || await sha256(volta) !== sha) throw falha("copia", "A cópia gravada não confere com a preparada (o arquivo chegou diferente).");
    });
    await passo("publicar", "Publicar no painel", async () => {
      let erroAoSubir = null;
      try { await io.subir(ATUAL, blob, { substituir: true }); } catch (e) { erroAoSubir = e; }
      // confere o que ficou no ar, tenha o envio dado erro ou não (a resposta pode se perder depois de gravar)
      const noAr = await io.baixar(ATUAL).catch(() => null);
      if (noAr && await sha256(noAr) === sha) {
        publicou = true;
        if (erroAoSubir) avisos.push("O envio respondeu com erro, mas a conferência achou a versão nova no ar: ela está publicada.");
        return;
      }
      throw falha("publicar", "A troca do painel não aconteceu" + (erroAoSubir ? `: ${erroAoSubir.message || erroAoSubir}` : "") + ".", erroAoSubir);
    });
  } finally {
    // soltar a trava sempre; se não der, ela vence sozinha
    try { await destravar(io, trava); }
    catch (e) { avisos.push(`A reserva da gravação não foi solta (${(e && e.message) || e}); ela vence sozinha em ${VALIDADE_TRAVA_MIN} min.`); }
  }
  if (!publicou) throw falha("publicar", "A troca do painel não aconteceu.");
  etapa("fim", "ok", "Publicada");
  return { id, avisos };
}

/** A linha do índice de uma publicação (o índice vai dentro do pacote: publica junto, sem arquivo à parte). */
export function linhaDaVersao(p, { tipo = "atualização", de = "" } = {}) {
  const n = { A: 0, P: 0, F: 0 };
  for (const a of p.D.os) n[a[6]]++;
  return { id: p.meta.versao_id, tipo, ...(de ? { de } : {}), base: p.meta.base, publicado_em: p.meta.publicado_em, quem: p.meta.publicado_por || "",
    total: p.D.os.length, abertas: n.A + n.P, liberadas: n.A, aguardando: n.P, encerradas: n.F, canceladas: (p.D.canceladas || []).length };
}

/** O índice das publicações: o do pacote publicado (novo) e as linhas antigas (do importacoes.json.gz de antes de
 *  12/11/2026), sem repetir, em ordem. */
export function mesclarIndice(doPacote = [], antigas = []) {
  const ids = new Set(doPacote.map((l) => l.id).filter(Boolean));
  const cobertos = new Set(doPacote.filter((l) => !l.id).map((l) => l.base + "|" + l.gerado_em));
  const velhas = antigas.filter((l) => !(l.id && ids.has(l.id)) && !cobertos.has(l.base + "|" + l.gerado_em));
  return [...velhas, ...doPacote].sort((a, b) => String(a.publicado_em || a.gerado_em || a.base).localeCompare(String(b.publicado_em || b.gerado_em || b.base)));
}

/**
 * Volta o painel para uma versão publicada antes: baixa a cópia dela (versoes/<id>), confere a impressão digital
 * das OS e publica de novo, como uma versão nova (o nome termina em "-volta") — o índice ganha a linha da volta.
 * `publicada`: o pacote no ar agora (para o índice e a versão anterior).
 */
export async function voltarPara({ io, id, publicada, quem = "", versaoAberta = "", agora = () => new Date(), etapa = () => {}, sorte = Math.random }) {
  etapa("buscar", "faz", "Buscar a versão");
  const velho = await lerJSON(io, arquivoDaVersao(id)).catch((e) => { throw falha("buscar", "Não deu para baixar a versão: " + ((e && e.message) || e), e); });
  if (!velho || !velho.D || !velho.meta) throw falha("buscar", `A versão ${id} não está guardada.`);
  if (velho.meta.sha_dados && await shaDosDados(velho.D) !== velho.meta.sha_dados) throw falha("buscar", "A cópia guardada dessa versão não confere: não volto para ela.");
  etapa("buscar", "ok", "Buscar a versão");
  const novoId = idDaVersao(velho.meta.base, agora(), sorte) + "-volta";
  const meta = { ...velho.meta, versao_id: novoId, publicado_em: agora().toISOString(), publicado_por: quem, volta_de: id,
    anterior: publicada && publicada.meta ? { id: publicada.meta.versao_id || "", base: publicada.meta.base } : null };
  const pacote = { ...velho, meta };
  const indice = mesclarIndice((publicada && publicada.meta && publicada.meta.importacoes) || []);
  pacote.meta.importacoes = [...indice, linhaDaVersao(pacote, { tipo: "volta", de: id })];
  return publicar({ io, pacote, quem, versaoAberta, agora, etapa });
}

/** O texto de uma falha para a tela: o que falhou e que o painel continua como estava. */
export function textoDaFalha(e, publicada) {
  const onde = publicada && publicada.meta ? ` O painel continua na versão de ${rotuloDaVersao(publicada.meta.versao_id) || br(publicada.meta.base)}` +
    ` (Protheus de ${br(publicada.meta.base)}).` : " O painel continua como estava.";
  return `Não publicou: ${(e && e.message) || e}${onde} Nada do que foi enviado nesta tentativa passou a valer.`;
}
