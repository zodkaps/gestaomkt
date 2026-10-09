// Diagnóstico: tudo que falta, de uma vez.
//
// Esta tela existe por um erro meu de método. A instalação tem seis coisas que
// podem faltar — endereço, provedor de e-mail, confirmação de e-mail, duas
// tabelas e o cadastro da pessoa — e eu fui descobrindo uma por vez, cada uma
// por um erro em inglês na cara de quem só queria entrar. Uma rodada de
// mensagem minha, uma tentativa dele, outro erro.
//
// Aqui tudo é conferido numa passada e cada ✗ já vem com o passo exato e o SQL
// pronto para copiar. O SQL não está escrito neste arquivo de propósito: é
// buscado de `sql/` na hora, para a instrução nunca divergir do que está
// versionado.

import * as nuvem from "../nuvem.js";
import * as pessoas from "../pessoas.js";
import { el, limpar, caixa, avisar, erro } from "../ui.js";

const MARCA = {
  ok:     { sinal: "✓", classe: "bom",    rotulo: "em ordem" },
  falta:  { sinal: "✗", classe: "ruim",   rotulo: "falta" },
  aviso:  { sinal: "⚠", classe: "morno",  rotulo: "atenção" },
  naosei: { sinal: "?", classe: "neutro", rotulo: "não deu para conferir" },
};

export async function montar(raiz, ctx) {
  // Esta tela é alcançável de fora: sem ela, quem não consegue entrar não tem
  // onde ver por quê. Sem ninguém dentro, ela se desenha como a porta.
  const porta = !pessoas.quem();
  if (porta) document.body.classList.add("entrando");

  const lista = el("div", { class: "diag" });
  const resumo = el("p", { class: "diag-resumo" }, "Conferindo…");
  const botao = el("button", { class: "primario", onclick: () => conferir() },
    "Conferir de novo");

  const miolo = el("div", {},
    el("p", { style: "font-size:13px;color:var(--fraco);margin-bottom:14px" },
      "O que precisa estar de pé para os quatro verem a mesma coisa. ",
      "Cada item que falta mostra onde mexer."),
    resumo, lista,
    el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:16px" },
      botao,
      porta ? el("button", { onclick: () => ctx.ir("entrar") }, "Voltar para entrar") : null),
    rodape());

  if (porta) {
    raiz.append(el("div", { id: "entrar-tela" },
      el("div", { class: "cartao-entrar larga" },
        el("div", { class: "logo" }, el("i", {}, "M"), "Diagnóstico"),
        el("p", { class: "dica" }, "o que falta para o site funcionar em equipe"),
        miolo)));
  } else {
    raiz.append(el("div", { class: "cabec" }, el("h1", {}, "Diagnóstico")), miolo);
  }

  async function conferir() {
    botao.disabled = true;
    limpar(lista);
    resumo.textContent = "Conferindo…";
    resumo.className = "diag-resumo";
    let itens = [];
    try { itens = await nuvem.diagnostico(); }
    catch (e) {
      resumo.textContent = "Não consegui conferir: " + e.message;
      resumo.className = "diag-resumo ruim";
      botao.disabled = false;
      return;
    }
    for (const it of itens) lista.append(linha(it));
    const faltando = itens.filter(i => i.estado === "falta").length;
    const avisos = itens.filter(i => i.estado === "aviso").length;
    resumo.className = "diag-resumo " + (faltando ? "ruim" : avisos ? "morno" : "bom");
    resumo.textContent = faltando
      ? (faltando === 1 ? "Falta uma coisa." : `Faltam ${faltando} coisas.`)
      : avisos ? "Funciona, mas tem um ponto de atenção." : "Tudo em ordem.";
    botao.disabled = false;
  }

  await conferir();
  return { desmontar: () => document.body.classList.remove("entrando") };
}

function linha(it) {
  const m = MARCA[it.estado] || MARCA.naosei;
  return el("div", { class: "diag-item " + m.classe },
    el("span", { class: "sinal", title: m.rotulo }, m.sinal),
    el("div", { class: "oq" },
      el("div", { class: "tit" }, it.titulo),
      it.detalhe ? el("div", { class: "det" }, it.detalhe) : null,
      it.resolver ? el("div", { class: "passo" }, it.resolver) : null,
      it.arquivo ? el("div", { class: "sql-botoes" },
        el("button", { class: "discreto", onclick: () => verSql(it.arquivo) },
          "Ver o SQL de " + it.arquivo.replace(/^sql\//, "")),
        el("button", { class: "discreto", onclick: () => copiarSql(it.arquivo) },
          "Copiar")) : null));
}

/** O rodapé mostra o que o site está usando, sem interpretação: é o que
 *  responde "mas eu digitei certo" sem ninguém abrir o console. */
function rodape() {
  const p = pessoas.quem();
  const linhas = [
    ["Endereço", nuvem.endereco() || "— nenhum"],
    ["Sessão no banco", nuvem.autenticado() ? "entrou como " + nuvem.emailAtual() : "nenhuma"],
  ];
  if (p) linhas.push(["Quem está usando", p.nome + (p.local ? " (só neste aparelho)" : "")]);
  return el("div", { class: "diag-rodape" },
    linhas.map(([r, v]) => el("div", {}, el("span", {}, r), el("b", {}, v))));
}

// ── os arquivos SQL ─────────────────────────────────────────────────────────

async function lerSql(arquivo) {
  const r = await fetch(arquivo, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.text();
}

async function copiarSql(arquivo) {
  let texto;
  try { texto = await lerSql(arquivo); }
  catch (e) { return erro(`Não consegui ler ${arquivo} daqui — abra o arquivo no repositório.`); }
  if (await paraAreaDeTransferencia(texto)) {
    avisar(`${arquivo} copiado. Cole no SQL Editor do Supabase e rode.`);
  } else {
    verSql(arquivo, texto);
  }
}

async function verSql(arquivo, jaLido = null) {
  let texto = jaLido;
  if (texto == null) {
    try { texto = await lerSql(arquivo); }
    catch (e) { return erro(`Não consegui ler ${arquivo} daqui — abra o arquivo no repositório.`); }
  }
  const area = el("textarea", { class: "sql", readonly: true, spellcheck: "false",
    value: texto });
  // O botão de copiar fica no CORPO, não no pé: lá ele fecharia a caixa, e
  // quando a área de transferência não está disponível o que resolve é o
  // texto selecionado na tela — que não serve de nada se a caixa some.
  const copiar = el("button", { class: "primario", onclick: async () => {
    if (await paraAreaDeTransferencia(texto)) avisar("Copiado.");
    else { area.focus(); area.select(); avisar("Selecionei o texto — use Ctrl+C."); }
  } }, "Copiar tudo");
  await caixa({
    titulo: arquivo,
    largura: "860px",
    corpo: el("div", {},
      el("p", { style: "font-size:13px;color:var(--fraco)" },
        "Cole isto no SQL Editor do Supabase e rode. Pode rodar mais de uma vez: ",
        "o arquivo foi escrito para não repetir nada."),
      el("div", { style: "margin-bottom:10px" }, copiar),
      area),
    acoes: [{ rotulo: "Fechar", valor: false }],
  });
}

/** `navigator.clipboard` não existe em http sem TLS nem em alguns navegadores
 *  de celular. Quando não dá, o `select()` do campo resolve do mesmo jeito. */
async function paraAreaDeTransferencia(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch (e) { return false; }
}
