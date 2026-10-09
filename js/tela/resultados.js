// Resultados — a aba Resultados da planilha.
//
// Os dois números grandes da reunião (aderência à programação e cumprimento
// geral), a tabela de indicadores com o "como é medido" de cada um, e o
// fechamento semana a semana. As contas são as MESMAS fórmulas da planilha
// (`M.resultados`), conferidas linha a linha em `testes/resultados.mjs` —
// número diferente entre o site e a planilha para a mesma pergunta é o jeito
// mais rápido de ninguém confiar em nenhum dos dois.

import * as ev from "../eventos.js";
import * as M from "../modelo.js";
import { el, limpar, br, brCurto } from "../ui.js";
import { outrosIndicadores } from "./indicadores.js";

const pc = v => v == null ? "—" : (Math.round(v * 1000) / 10).toLocaleString("pt-BR") + "%";
const n1 = v => v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString("pt-BR");
const cor = v => v == null ? "" : v >= 0.9 ? "ok" : v >= 0.7 ? "hoje" : "vencida";

export async function montar(raiz, ctx, params) {
  const agora = M.semanaAtual();
  let ano = Number(params.get("a")) || agora.ano;
  let semana = Number(params.get("s")) || agora.semana;

  const rotulo = el("b", {});
  const corpo = el("div", {});
  raiz.append(
    el("div", { class: "cabec" },
      el("h1", {}, "Resultados"),
      el("span", { class: "navsem" },
        el("button", { onclick: () => andar(-1), title: "Semana anterior" }, "‹"), rotulo,
        el("button", { onclick: () => andar(1), title: "Próxima semana" }, "›")),
      el("button", { onclick: () => { ano = agora.ano; semana = agora.semana; pintar(); } }, "Semana atual")),
    corpo);

  function andar(n) {
    semana += n;
    if (semana > 53) { semana = 1; ano++; }
    if (semana < 1) { semana = 52; ano--; }
    pintar();
  }

  function grande(titulo, valor, texto) {
    return el("div", { class: "grande " + cor(valor) },
      el("div", { class: "g-tit" }, titulo),
      el("div", { class: "g-val" }, valor == null ? "—" : Math.round(valor * 100) + "%"),
      el("div", { class: "g-txt" }, texto));
  }

  function pintar() {
    limpar(corpo);
    const r = M.resultados(ev.lista(), ano, semana);
    rotulo.textContent = `${semana}/${ano} · ${br(r.datas[0])} a ${br(r.datas[6])}`;

    corpo.append(el("p", { class: "nota", style: "margin-top:0" },
      "A semana escolhida, só a oficina interna — extra programação, serviço de terceiro e " +
      "cancelada ficam fora dos dois lados, como na planilha."));

    corpo.append(el("div", { class: "grandes" },
      grande("Aderência à programação", r.aderencia,
        `do plano da semana, ${r.concluidas_plano} de ${r.plano} atividades foram concluídas.`),
      grande("Cumprimento geral", r.cumprimento,
        `contando o extra, a oficina fez ${r.concluidas} das ${r.total} atividades que teve. ` +
        "A distância entre os dois números é o tamanho do imprevisto na semana.")));

    const sec = t => el("tr", { class: "sec" }, el("td", { colspan: 3 }, t));
    const lin = (rot, val, como = "", forte = false, cls = "") =>
      el("tr", { class: forte ? "forte" : "" },
        el("td", {}, rot), el("td", { class: "num " + cls }, val), el("td", { class: "como" }, como));

    corpo.append(el("div", { class: "rolagem" }, el("table", { class: "tabela indicadores" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Indicador"), el("th", { class: "num" }, "Valor"), el("th", {}, "Como é medido"))),
      el("tbody", {},
        sec("O que a oficina interna tinha para fazer"),
        lin("Atividades do plano", r.plano, "estavam programadas para a semana"),
        lin("Extra programação", r.extra, "entraram depois: quebra, urgência, pedido da operação", false, "c-extra"),
        lin("Concluídas do plano", r.concluidas_plano, "do que estava programado, quanto saiu"),
        lin("Total interno", r.total, "plano + extra"),
        lin("Extras concluídas", r.extras_concluidas),
        lin("Total concluído", r.concluidas, "plano + extra"),
        sec("Os números"),
        lin("Aderência à programação", pc(r.aderencia),
          "concluídas do plano ÷ atividades do plano — o indicador principal", true, cor(r.aderencia)),
        lin("Cumprimento geral", pc(r.cumprimento),
          "total concluído ÷ total interno — inclui o extra", true, cor(r.cumprimento)),
        lin("Quanto da semana foi extra", pc(r.parte_extra), "extra ÷ total interno", false, "c-extra"),
        lin("Concluídas no prazo", r.no_prazo, "saíram no próprio dia programado"),
        lin("Pontualidade", pc(r.pontualidade), "no prazo ÷ concluídas"),
        lin("Aderência ao plano original", pc(r.aderencia_original),
          "contra a semana da 1ª programação — não melhora quando se empurra para a frente"),
        lin("Saíram desta semana", r.sairam,
          "estavam programadas para esta semana e foram empurradas para outra"),
        lin("Vencidas", r.vencidas, "a janela de execução fechou e a atividade não saiu", false,
          r.vencidas ? "vencida" : ""),
        lin("Atividades reprogramadas", r.reprogramadas, "mudaram de semana"),
        lin("Atraso médio, quando atrasa", n1(r.atraso_medio), "dias entre o dia programado e a conclusão"),
        sec("Dias de serviço"),
        lin("Diária — atividades por dia útil", n1(r.por_dia), "total interno ÷ 5 dias — quantas a semana pede por dia"),
        lin("Diária do que saiu", n1(r.saiu_por_dia), "total concluído ÷ 5 dias — o que a oficina entrega por dia"),
        lin("Soma das estimativas", n1(r.hh), "soma do HH previsto das atividades da semana"),
        sec("Fora da conta interna"),
        lin("Em empresa terceirizada", r.terceirizada, "serviço de fora: não mede a oficina da Makro"),
        lin("Canceladas", r.canceladas, "saem dos dois lados"),
        lin("Na carteira, sem dia", r.carteira, "não depende da semana — é o que ainda espera encaixe"),
        sec("Mix de manutenção · é aqui que se vê se o PCM está saindo da corretiva"),
        lin("Corretiva na semana", r.corretiva, "quebrou e teve de consertar"),
        lin("Preventiva na semana", r.preventiva, "foi feita antes de quebrar"),
        lin("Inspeção na semana", r.inspecao, "olhar para achar o que vai quebrar"),
        lin("% preventiva na semana", pc(r.pct_preventiva), "preventiva ÷ total interno da semana"),
        lin("Corretiva no acervo", r.corretiva_acervo, "todas as semanas somadas"),
        lin("Preventiva no acervo", r.preventiva_acervo),
        lin("% preventiva no acervo", pc(r.pct_preventiva_acervo), "o retrato acumulado — mostra a tendência"),
        sec("Cobertura de OS · o que a oficina fez e o Protheus registrou"),
        lin("Com OS na semana", r.com_os, "atividades da semana com OS aberta no Protheus"),
        lin("Sem OS na semana", r.sem_os, "aparecem em âmbar na coluna OS da Programação", false, r.sem_os ? "c-semos" : ""),
        lin("Cobertura na semana", pc(r.cobertura_os), "com OS ÷ total interno da semana"),
        lin("Com OS no acervo", r.com_os_acervo,
          "uma célula escrita \"ABRIR OS\" é recado, não OS — a planilha conta, o site não"),
        lin("Sem OS no acervo", r.sem_os_acervo, "a fila do que falta lançar"),
        lin("Cobertura no acervo", pc(r.cobertura_os_acervo), "com OS ÷ todas as atividades")))));

    corpo.append(el("div", { class: "titulo-secao" }, "Fechamento das semanas",
      el("span", { class: "n" }, "· calculado pelas mesmas contas, semana a semana")));
    corpo.append(fechamento());

    // Aberto continua aberto quando a tela se repinta por uma atualização que
    // chegou do banco — fechar sozinho na cara de quem está lendo é o mesmo
    // defeito do "recarrega".
    const outros = el("details", { class: "outros", open: outrosAberto },
      el("summary", {}, "Outros indicadores — o que saiu nos sete dias, backlog, de quem é o atraso, pontualidade da operação"));
    if (outrosAberto) outros.append(outrosIndicadores(ano, semana));
    outros.addEventListener("toggle", () => {
      outrosAberto = outros.open;
      if (outros.open && outros.children.length === 1) outros.append(outrosIndicadores(ano, semana));
    });
    corpo.append(outros);
  }
  let outrosAberto = false;

  function fechamento() {
    const todas = ev.lista();
    const linhas = [];
    for (let i = 9; i >= 0; i--) {
      let s = semana - i, a = ano;
      if (s < 1) { s += 52; a--; }
      const r = M.resultados(todas, a, s);
      if (!r.plano && !r.extra) continue;
      linhas.push(r);
    }
    if (!linhas.length) return el("p", { class: "nada" }, "Sem semanas com programação.");
    return el("div", { class: "rolagem" }, el("table", { class: "tabela indicadores" },
      el("thead", {}, el("tr", {},
        ["Semana", "De", "A", "Plano", "Concluídas", "Aderência", "Cumprimento", "Extra", "Vencidas"]
          .map((t, i) => el("th", { class: i > 2 ? "num" : "" }, t)))),
      el("tbody", {}, linhas.map(r => el("tr", { class: r.semana === semana ? "forte" : "" },
        el("td", {}, `${r.semana}/${r.ano}`),
        el("td", {}, brCurto(r.datas[0])),
        el("td", {}, brCurto(r.datas[4])),
        el("td", { class: "num" }, String(r.plano)),
        el("td", { class: "num" }, String(r.concluidas_plano)),
        el("td", { class: "num " + cor(r.aderencia) }, pc(r.aderencia)),
        el("td", { class: "num " + cor(r.cumprimento) }, pc(r.cumprimento)),
        el("td", { class: "num c-extra" }, String(r.extra)),
        el("td", { class: "num" + (r.vencidas ? " vencida" : "") }, String(r.vencidas)))))));
  }

  pintar();
  return { desmontar: ev.ouvir(pintar) };
}
