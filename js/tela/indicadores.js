// Os números.
//
// Todo indicador aqui é conta sobre as atividades, feita no `modelo.js`, e
// nenhum deles guarda valor próprio: número que se guarda é número que um dia
// discorda da lista que ele deveria resumir. Cada painel diz de onde saiu, para
// ser possível conferir na mão e descobrir qual dos dois está errado.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, br, medidor, barras, cartaoNumero, vazio } from "../ui.js";

export async function montar(raiz, ctx, params) {
  const agora = M.semanaAtual();
  let ano = Number(params.get("a")) || agora.ano;
  let semana = Number(params.get("s")) || agora.semana;

  const rotulo = el("b", {});
  const corpo = el("div", {});

  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Números"),
      el("span", { class: "navsem" },
        el("button", { onclick: () => andar(-1) }, "‹"), rotulo,
        el("button", { onclick: () => andar(1) }, "›")),
      el("div", { class: "espaco" }),
      el("button", { onclick: () => { ano = agora.ano; semana = agora.semana; pintar(); } }, "Semana atual")),
    corpo);

  function andar(n) {
    semana += n;
    if (semana > 53) { semana = 1; ano++; }
    if (semana < 1) { semana = 53; ano--; }
    pintar();
  }

  function painel(titulo, conteudo, obs) {
    return el("div", { class: "painel" },
      el("h2", {}, titulo), conteudo,
      obs ? el("p", { class: "obs" }, obs) : null);
  }

  function pintar() {
    limpar(corpo);
    rotulo.textContent = `${semana}/${ano}`;
    const todas = ev.lista();
    if (!todas.length) { corpo.append(vazio("Sem atividades ainda. Comece pela aba Importar.")); return; }

    const ad = M.aderencia(todas, ano, semana);
    const mx = M.mix(todas);
    const os = M.coberturaOS(todas);
    const bl = M.backlogEmSemanas(todas, ano, semana);
    const abertas = todas.filter(M.aberta);
    const vencidas = abertas.filter(a => M.situacaoDe(a) === "VENCIDA");

    // Reprogramações lançadas NESTA semana — contadas no log, que é onde elas
    // existem. O campo na atividade só guarda o total acumulado.
    const datas = M.datasDaSemana(ano, semana);
    const reprogSemana = ev.log.filter(e => e.tipo === "reprogramada" &&
      e.ts.slice(0, 10) >= datas[0] && e.ts.slice(0, 10) <= datas[6]);
    const porMotivo = new Map();
    for (const e of reprogSemana) {
      const m = e.motivo || "sem motivo escrito";
      porMotivo.set(m, (porMotivo.get(m) || 0) + 1);
    }

    corpo.append(el("div", { class: "numeros", style: "margin-bottom:14px" },
      cartaoNumero(abertas.length, "em aberto no total"),
      cartaoNumero(vencidas.length, "passaram do prazo", "", vencidas.length ? "alerta" : ""),
      cartaoNumero(ad.programadas, `programadas na semana ${semana}`),
      cartaoNumero(ad.concluidas, "fechadas na semana", "", ad.concluidas ? "bom" : "")));

    corpo.append(el("div", { class: "paineis" },
      painel("Aderência da semana",
        el("div", {},
          medidor(ad.pct, `${ad.concluidas} de ${ad.programadas} programadas`),
          el("div", { class: "numeros", style: "margin-top:12px" },
            cartaoNumero(ad.no_prazo, "no prazo"),
            cartaoNumero(ad.com_atraso, "com atraso"),
            cartaoNumero(ad.pendentes, "em aberto"))),
        `Extra fica fora da conta: ${ad.extras} lançada${ad.extras === 1 ? "" : "s"}` +
        `${ad.extras ? `, ${ad.extras_feitos} fechada${ad.extras_feitos === 1 ? "" : "s"}` : ""}. ` +
        "Contar o que ninguém planejou premiaria a oficina justamente onde o número mede o planejamento."),

      painel("Corretiva × preventiva",
        // A cor é do tipo, não da posição na lista: amarrar ao índice faria a
        // corretiva mudar de cor sempre que um tipo sumisse da semana.
        barras(Object.entries({ Corretiva: "d", Preventiva: "b", Inspeção: "c",
          Preditiva: "b", Borracharia: "", Melhoria: "e", "Não classificado": "e" })
          .filter(([t]) => mx.por[t])
          .map(([t, cor]) => ({ rotulo: t, valor: mx.por[t], cor }))),
        `Sobre as ${mx.total} atividades vivas. Corretiva em ${mx.pct("Corretiva")}% ` +
        "é o retrato de uma frota que ainda quebra antes de ser cuidada."),

      painel("Cobertura de OS",
        el("div", {},
          medidor(os.pct, `${os.com} de ${os.total} com OS aberta`),
          el("div", { class: "numeros", style: "margin-top:12px" },
            cartaoNumero(os.sem, "sem OS", "", os.sem ? "alerta" : ""))),
        "Serviço sem OS é serviço que o Protheus não conhece: não vira custo, " +
        "não vira histórico do equipamento e não aparece em relatório nenhum."),

      painel("Backlog",
        el("div", {},
          el("div", { class: "medidor neutro" },
            el("div", { class: "num" }, bl.semanas == null ? "—" : String(bl.semanas).replace(".", ",")),
            el("div", { class: "rot" }, "semanas para zerar a carteira")),
          el("div", { class: "numeros", style: "margin-top:12px" },
            cartaoNumero(bl.abertos, "em aberto"),
            cartaoNumero(String(bl.ritmo).replace(".", ","), "fechadas por semana"))),
        "Ritmo medido nas quatro semanas anteriores. Se nada novo entrasse, " +
        "é o tempo que a oficina levaria para acabar o que já tem."),

      painel(`Reprogramações da semana ${semana}`,
        porMotivo.size
          ? barras([...porMotivo.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([m, n]) => ({ rotulo: m, valor: n, cor: "c" })))
          : vazio("Nenhuma nesta semana."),
        `${reprogSemana.length} lançamento${reprogSemana.length === 1 ? "" : "s"} no registro. ` +
        "É por aqui que se responde por que a semana não fechou."),

      painel("Onde está o trabalho em aberto",
        barras(["VENCIDA", "Fecha hoje", "Em execução", "Programada", "Na carteira"]
          .map(s => ({ rotulo: s, valor: abertas.filter(a => M.situacaoDe(a) === s).length,
            cor: { VENCIDA: "d", "Fecha hoje": "c", "Em execução": "", Programada: "", "Na carteira": "e" }[s] }))
          .filter(i => i.valor)),
        "Carteira grande não é problema; carteira grande com vencidas em cima é.")));

    corpo.append(el("h2", { style: "font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--fraco);margin:20px 0 8px" },
      "Aderência das últimas semanas"),
      historico(todas));
  }

  function historico(todas) {
    const linhas = [];
    for (let i = 7; i >= 0; i--) {
      let s = semana - i, a = ano;
      if (s < 1) { s += 52; a--; }
      const ad = M.aderencia(todas, a, s);
      if (!ad.programadas && !ad.extras) continue;
      linhas.push({ s, a, ad });
    }
    if (!linhas.length) return vazio("Sem semanas com programação.");
    return el("div", { class: "rolagem" }, el("table", { class: "tabela" },
      el("thead", {}, el("tr", {},
        ["Semana", "Programadas", "Fechadas", "No prazo", "Com atraso", "Em aberto", "Extras", "Aderência"]
          .map(t => el("th", {}, t)))),
      el("tbody", {}, linhas.map(({ s, a, ad }) =>
        el("tr", { style: s === semana ? "font-weight:650" : "" },
          el("td", {}, `${s}/${a}`),
          el("td", {}, String(ad.programadas)),
          el("td", {}, String(ad.concluidas)),
          el("td", {}, String(ad.no_prazo)),
          el("td", {}, String(ad.com_atraso)),
          el("td", {}, String(ad.pendentes)),
          el("td", {}, String(ad.extras)),
          el("td", {}, ad.pct == null ? "—" : ad.pct + "%"))))));
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
