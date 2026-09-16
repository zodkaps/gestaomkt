// Trazer dados de fora, e levar embora.
//
// Três caminhos: a planilha da programação (a carga inicial), a base do
// Protheus (o que vai acontecer toda semana) e o backup. Os dois primeiros
// SEMPRE passam por uma prévia: nada é gravado antes de ele ver o que vai
// entrar, o que vai ser ligado e o que está em contradição.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import * as pl from "../planilha.js";
import * as imp from "../importar.js";
import * as dados from "../dados.js";
import * as bk from "../backup.js";
import { el, limpar, br, campo, selecao, avisar, erro, confirmar, caixa,
  cartaoNumero, vazio, chip } from "../ui.js";
import { valoresDe } from "./comum.js";

export async function montar(raiz, ctx) {
  const corpo = el("div", {});
  raiz.append(el("div", { class: "cabec" }, el("h1", {}, "Importar e salvar")), corpo);

  function pintar() {
    limpar(corpo);
    const total = ev.lista().length;

    corpo.append(
      total
        ? el("p", { style: "color:var(--fraco);font-size:13px" },
          `${total} atividades no sistema, ${ev.log.length} lançamentos no registro.`)
        : el("p", { style: "color:var(--fraco);font-size:13px" },
          "O sistema está vazio. Comece pela planilha da programação — " +
          "ela traz o acervo inteiro, com as reprogramações que já existem."),
      areaArquivo(),
      el("div", { style: "height:18px" }),
      painelBackup());
  }

  // ── soltar arquivo ────────────────────────────────────────────────────────

  function areaArquivo() {
    const entrada = el("input", { type: "file", accept: ".xlsx,.xlsm,.csv,.txt,.tsv",
      style: "display:none", onchange: () => { if (entrada.files[0]) abrir(entrada.files[0]); } });
    const area = el("div", { class: "solta", onclick: () => entrada.click() },
      el("p", { style: "font-size:15px;margin-bottom:4px" },
        el("b", {}, "Solte aqui a planilha ou o export do Protheus")),
      el("p", { style: "font-size:13px;margin:0" }, "XLSX ou CSV · ou toque para escolher"),
      entrada);
    area.addEventListener("dragover", e => { e.preventDefault(); area.classList.add("sobre"); });
    area.addEventListener("dragleave", () => area.classList.remove("sobre"));
    area.addEventListener("drop", e => {
      e.preventDefault(); area.classList.remove("sobre");
      const f = e.dataTransfer.files[0];
      if (f) abrir(f);
    });
    return area;
  }

  async function abrir(arquivo) {
    let abas;
    try { abas = await pl.ler(arquivo); }
    catch (e) { return erro("Não consegui ler o arquivo: " + e.message); }
    if (!abas.length) return erro("O arquivo não tem nenhuma aba com dados.");

    if (imp.ehPlanilhaMakro(abas)) return planilhaMakro(abas, arquivo.name);
    return protheus(abas, arquivo.name);
  }

  // ── a planilha da programação ─────────────────────────────────────────────

  async function planilhaMakro(abas, nome) {
    const agora = M.semanaAtual();
    const eAno = el("input", { type: "number", min: 2020, max: 2100, value: agora.ano });

    const r = await caixa({
      titulo: "Planilha da programação",
      corpo: el("div", {},
        el("p", {}, "Reconheci a aba ", el("b", {}, "Programação"), " em ", el("b", {}, nome), "."),
        campo("Ano da programação", eAno,
          "A planilha guarda o número da semana, mas não o ano. É esse ano que " +
          "transforma 'semana 37' em datas — e eu não vou adivinhá-lo."),
        ev.lista().length
          ? el("p", { style: "color:var(--vencida)" },
            `⚠ Já existem ${ev.lista().length} atividades aqui. Importar de novo ` +
            "criaria cópias de tudo. Se a ideia é recomeçar, apague antes, no fim desta tela.")
          : null),
      acoes: [{ rotulo: "Cancelar", valor: false },
        { rotulo: "Ler a planilha", classe: "primario", valor: true }],
    });
    if (r !== true) return;

    let lido;
    try { lido = imp.lerPlanilhaMakro(abas, Number(eAno.value) || agora.ano); }
    catch (e) { return erro(e.message); }

    const { atividades, avisos } = lido;
    const semData = avisos.filter(a => a.tipo === "marcada_sem_data");
    const semOS = avisos.filter(a => a.tipo === "os_a_abrir");

    const conf = await caixa({
      titulo: "O que vai entrar",
      largura: "640px",
      corpo: el("div", { class: "previa" },
        el("div", { class: "numeros" },
          cartaoNumero(atividades.length, "atividades"),
          cartaoNumero(atividades.filter(a => !a.semana && !a.concluida_em).length, "na carteira"),
          cartaoNumero(atividades.filter(a => a.concluida_em).length, "já fechadas"),
          cartaoNumero(atividades.filter(a => a.os).length, "com OS"),
          cartaoNumero(atividades.filter(a => a.semana_orig).length, "reprogramadas")),

        semData.length ? grupo(
          `${semData.length} marcada${semData.length === 1 ? "" : "s"} como concluída, sem data`,
          semData.map(a => el("div", { style: "font-size:13px;padding:3px 0" },
            el("b", {}, a.frota), " · ", a.atividade)),
          "Entram ABERTAS. Marcar não é datar: a aderência conta por data, e " +
          "inventar o dia em que o serviço saiu seria inventar o número. Date-as " +
          "depois, pela tela Hoje ou pela ficha.", true) : null,

        semOS.length ? grupo(
          `${semOS.length} com recado no lugar da OS`,
          semOS.slice(0, 40).map(a => el("div", { style: "font-size:13px;padding:3px 0" },
            el("b", {}, a.frota), " · ", a.atividade, " ", chip(a.texto, "semos"))),
          "Células que dizem \"ABRIR OS\" em vez de um número. Entram SEM OS — " +
          "e é por isso que a cobertura de OS aqui vai dar menor que na planilha: " +
          "lá esse recado contava como ordem aberta.", true) : null),
      acoes: [{ rotulo: "Cancelar", valor: false },
        { rotulo: `Importar ${atividades.length}`, classe: "primario", valor: true }],
    });
    if (conf !== true) return;

    await ev.aplicar(atividades.map(a => ev.criar(a, "planilha", nome)), { silencioso: true });
    ev.forcarAviso();
    avisar(`${atividades.length} atividades importadas.`);
    ctx.ir("carteira");
  }

  // ── a base do Protheus ────────────────────────────────────────────────────

  async function protheus(abas, nome) {
    const eAba = selecao(abas.map((a, i) => ({ v: String(i), t: a.nome })), "0");
    const eLinha = el("input", { type: "number", min: 1, value: 1 });
    const mapaSalvo = await dados.lerMeta("mapa_protheus", null);

    // Primeiro passo: qual aba e onde está o cabeçalho. Errar isso faz todo o
    // resto sair torto, e é a única coisa que uma máquina não consegue garantir.
    const escolhido = await caixa({
      titulo: "Export do Protheus",
      corpo: ({ fechar }) => {
        const previa = el("div", { class: "rolagem", style: "margin-top:10px" });
        const atualizar = () => {
          const aba = abas[Number(eAba.value)];
          const i = Math.max(0, Number(eLinha.value) - 1);
          limpar(previa).append(el("table", { class: "tabela" },
            el("tbody", {}, aba.linhas.slice(0, 6).map((L, n) =>
              el("tr", { style: n === i ? "background:var(--marca-clara);font-weight:650" : "" },
                el("td", { style: "color:var(--muito-fraco)" }, String(n + 1)),
                (L || []).slice(0, 8).map(c => el("td", {}, pl.texto(c).slice(0, 22))))))));
        };
        eAba.addEventListener("change", () => {
          eLinha.value = pl.acharCabecalho(abas[Number(eAba.value)].linhas) + 1;
          atualizar();
        });
        eLinha.addEventListener("input", atualizar);
        eLinha.value = pl.acharCabecalho(abas[0].linhas) + 1;
        setTimeout(atualizar, 0);
        return el("div", {},
          el("p", {}, "Não é a planilha da programação, então vou tratar como ",
            el("b", {}, "base do Protheus"), "."),
          el("div", { class: "dupla" },
            campo("Aba", eAba), campo("Linha do cabeçalho", eLinha)),
          el("p", { style: "font-size:12px;color:var(--fraco);margin:0" },
            "A linha destacada é a que vou usar como nome das colunas."),
          previa);
      },
      largura: "700px",
      acoes: [{ rotulo: "Cancelar", valor: false },
        { rotulo: "Continuar", classe: "primario", valor: true }],
    });
    if (escolhido !== true) return;

    const aba = abas[Number(eAba.value)];
    const iCab = Math.max(0, Number(eLinha.value) - 1);
    const cab = (aba.linhas[iCab] || []).map(c => pl.texto(c));
    const sugerido = imp.sugerirMapa(cab);
    const inicial = (mapaSalvo && casaCabecalho(mapaSalvo, cab)) ? mapaSalvo.mapa : sugerido;

    const selects = {};
    const mapaOK = await caixa({
      titulo: "De que coluna vem cada coisa",
      largura: "620px",
      corpo: el("div", {},
        mapaSalvo && casaCabecalho(mapaSalvo, cab)
          ? el("p", { style: "color:var(--ok)" }, "✓ Reaproveitei o mapeamento da última vez.")
          : el("p", {}, "Confira as ligações abaixo. Elas ficam salvas para a próxima."),
        el("div", { class: "mapa" }, imp.CAMPOS_PROTHEUS.flatMap(c => {
          const s = selecao(
            [{ v: "-1", t: "— nenhuma —" },
              ...cab.map((t, i) => ({ v: String(i), t: t || `coluna ${i + 1}` }))],
            String(inicial[c.k] ?? -1));
          selects[c.k] = s;
          return [el("span", {}, c.rotulo, c.obrigatorio ? el("b", {}, " *") : null), s];
        })),
        el("p", { style: "font-size:12px;color:var(--fraco);margin-top:10px" },
          "* obrigatório. Sem OS, frota e descrição não dá para cruzar com o que já existe aqui.")),
      acoes: [{ rotulo: "Cancelar", valor: false },
        { rotulo: "Ver o que vai acontecer", classe: "primario", valor: true }],
    });
    if (mapaOK !== true) return;

    const mapa = {};
    for (const [k, s] of Object.entries(selects)) {
      const i = Number(s.value);
      if (i >= 0) mapa[k] = i;
    }
    for (const c of imp.CAMPOS_PROTHEUS) {
      if (c.obrigatorio && mapa[c.k] == null) return erro(`Falta dizer qual coluna tem: ${c.rotulo}.`);
    }
    await dados.gravarMeta("mapa_protheus", { mapa, cabecalho: cab });

    const registros = imp.lerProtheus(aba.linhas, iCab, mapa);
    if (!registros.length) return erro("Não achei nenhuma linha de dados abaixo do cabeçalho.");
    const rec = imp.reconciliar(registros, ev.lista());
    await previaProtheus(rec, registros, nome);
  }

  function casaCabecalho(salvo, cab) {
    return salvo && Array.isArray(salvo.cabecalho) &&
      salvo.cabecalho.length === cab.length &&
      salvo.cabecalho.every((t, i) => t === cab[i]);
  }

  async function previaProtheus(rec, registros, nome) {
    // Cada grupo tem sua própria caixinha de "aplicar": ele pode querer as
    // novas e não querer as baixas, e obrigar tudo ou nada faria a importação
    // virar um risco em vez de uma ferramenta.
    const marcas = {
      novas: el("input", { type: "checkbox", checked: true }),
      vincular: el("input", { type: "checkbox", checked: true }),
      baixas: el("input", { type: "checkbox", checked: true }),
    };
    const linha = (t, sub) => el("div", { style: "font-size:13px;padding:3px 0" },
      el("b", {}, t), sub ? el("span", { style: "color:var(--fraco)" }, " · " + sub) : null);

    const conf = await caixa({
      titulo: "O que a importação vai fazer",
      largura: "660px",
      corpo: el("div", { class: "previa" },
        el("div", { class: "numeros" },
          cartaoNumero(registros.length, "linhas lidas"),
          cartaoNumero(rec.novas.length, "OS novas"),
          cartaoNumero(rec.vincular.length, "para ligar"),
          cartaoNumero(rec.baixas.length, "baixas propostas"),
          cartaoNumero(rec.divergentes.length, "divergências", "", rec.divergentes.length ? "alerta" : "")),

        rec.novas.length ? grupo(
          [marcas.novas, ` Criar ${rec.novas.length} atividade(s) nova(s) na carteira`],
          rec.novas.slice(0, 60).map(r => linha(`${r.frota} · OS ${r.os}`, r.atividade)),
          "OS que o Protheus tem e este sistema não conhece. Entram sem semana " +
          "e sem executante — programar é decisão sua, não do arquivo.") : null,

        rec.vincular.length ? grupo(
          [marcas.vincular, ` Ligar ${rec.vincular.length} OS a atividade(s) que já existem`],
          rec.vincular.slice(0, 60).map(v => linha(`${v.atividade.frota} · OS ${v.reg.os}`,
            v.atividade.atividade + (v.candidatas.length > 1
              ? ` ⚠ ${v.candidatas.length} candidatas, vou ligar na primeira` : ""))),
          "Mesma frota e mesmo serviço, já anotados aqui sem OS. Em vez de criar " +
          "linha repetida, a OS entra na atividade que já existe.") : null,

        rec.baixas.length ? grupo(
          [marcas.baixas, ` Dar baixa em ${rec.baixas.length} atividade(s)`],
          rec.baixas.slice(0, 60).map(b => linha(`${b.atividade.frota} · OS ${b.reg.os}`,
            `${b.atividade.atividade} — fechada em ${b.em ? br(b.em) : "data não informada"}`)),
          "Encerradas no Protheus e ainda abertas aqui. Sem data de encerramento " +
          "no arquivo, entra a data de hoje — e fica no registro que veio da importação.") : null,

        rec.divergentes.length ? grupo(
          `${rec.divergentes.length} contradição(ões) — nada será alterado`,
          rec.divergentes.map(d => linha(`OS ${d.reg.os}`,
            `aqui é ${d.aqui}, no arquivo é ${d.la}`)),
          "A mesma OS aponta para frotas diferentes nas duas pontas. Escolher uma " +
          "seria inventar: confira no Protheus e corrija o lado errado à mão.", true) : null,

        rec.sem_os.length ? grupo(
          `${rec.sem_os.length} linha(s) sem número de OS — ignoradas`,
          rec.sem_os.slice(0, 30).map(r => linha(r.frota || "—", r.atividade)),
          "Sem OS não há como cruzar com segurança.", true) : null,

        rec.conhecidas.length ? grupo(
          `${rec.conhecidas.length} OS já conhecidas e em dia`,
          rec.conhecidas.slice(0, 30).map(c => linha(`OS ${c.reg.os}`,
            c.atividades.map(a => a.atividade).join(" · ")),
          ), "Nada a fazer com elas.") : null),
      acoes: [{ rotulo: "Cancelar", valor: false },
        { rotulo: "Aplicar", classe: "primario", valor: true }],
    });
    if (conf !== true) return;

    const clientes = new Map();
    for (const a of ev.lista()) if (a.frota && a.cliente) clientes.set(a.frota, a.cliente);

    const eventos = [];
    if (marcas.novas.checked) {
      for (const r of rec.novas) {
        eventos.push(ev.criar(imp.registroParaAtividade(r, clientes), "protheus", nome));
      }
    }
    if (marcas.vincular.checked) {
      for (const v of rec.vincular) {
        const e = ev.editar(v.atividade, { os: v.reg.os });
        if (e) { e.origem = "protheus"; eventos.push(e); }
      }
    }
    if (marcas.baixas.checked) {
      for (const b of rec.baixas) {
        const e = ev.concluir(b.atividade, b.em || M.hoje());
        e.origem = "protheus";
        e.motivo = "encerrada no Protheus";
        eventos.push(e);
      }
    }
    if (!eventos.length) { avisar("Nada marcado para aplicar."); return; }

    await ev.aplicar(eventos, { silencioso: true });
    ev.forcarAviso();
    avisar(`${eventos.length} lançamentos aplicados.`);
    pintar();
  }

  function grupo(titulo, itens, obs, alerta = false) {
    return el("details", { class: "grupo" + (alerta ? " aviso-grupo" : ""), open: !alerta },
      el("summary", {}, titulo),
      obs ? el("p", { style: "font-size:12.5px;color:var(--fraco);margin:8px 0 0" }, obs) : null,
      el("div", { class: "corpo" }, itens.length ? itens : vazio("—")));
  }

  // ── backup ────────────────────────────────────────────────────────────────

  function painelBackup() {
    const entrada = el("input", { type: "file", accept: ".json", style: "display:none",
      onchange: () => { if (entrada.files[0]) restaurar(entrada.files[0]); } });

    return el("div", { class: "painel" },
      el("h2", {}, "Cópia de segurança"),
      el("p", { style: "font-size:13px;color:var(--fraco)" },
        "Os dados ficam neste navegador e em mais lugar nenhum. Limpar os dados " +
        "do site apaga tudo, e o backup é a única coisa que traz de volta — " +
        "ele guarda a fita inteira, então volta com o histórico e não só com o resumo."),
      el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px" },
        el("button", { class: "primario", onclick: async () => {
          bk.baixar(await bk.exportar(), bk.nomeDoArquivo());
          await bk.marcarFeito();
          avisar("Cópia salva.");
        } }, "Salvar cópia"),
        el("button", { onclick: () => entrada.click() }, "Restaurar de um arquivo"),
        el("button", { onclick: exportarCSV }, "Exportar CSV"),
        el("button", { class: "perigo", onclick: apagar }, "Apagar tudo"),
        entrada),
      el("p", { class: "obs" },
        `Guardando em: ${({ indexeddb: "banco do navegador", localstorage: "armazenamento local (espaço menor)", memória: "⚠ só na memória desta aba" })[dados.modo] || dados.modo}.`));
  }

  async function restaurar(arquivo) {
    let obj;
    try { obj = JSON.parse(await arquivo.text()); }
    catch (e) { return erro("Não é um arquivo JSON válido."); }
    if (!await confirmar("Restaurar",
      `Isto substitui tudo que está aqui (${ev.lista().length} atividades) pelo conteúdo do arquivo ` +
      `(${(obj.eventos || []).length} lançamentos). Não dá para desfazer.`, "Restaurar")) return;
    try {
      const n = await bk.restaurar(obj);
      avisar(`Restaurado: ${n} atividades.`);
      pintar();
    } catch (e) { erro(e.message); }
  }

  function exportarCSV() {
    const texto = bk.csv(ev.lista(), M.situacaoDe, M.prazoDe);
    const blob = new Blob([texto], { type: "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob),
      download: "programacao-makro.csv" });
    a.click();
    avisar("CSV gerado. É uma fotografia: não traz o histórico e não volta para cá.");
  }

  async function apagar() {
    if (!await confirmar("Apagar tudo",
      `Vão embora ${ev.lista().length} atividades e ${ev.log.length} lançamentos do registro. ` +
      "Salve uma cópia antes se ainda não salvou — isto não tem volta.", "Apagar tudo")) return;
    await dados.apagarTudo();
    await ev.carregar();
    avisar("Apagado.");
    pintar();
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
