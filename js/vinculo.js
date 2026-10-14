// Ligar o que já existia antes da ligação entre a preventiva do plano e a OS
// preventiva da oficina (ver eventos.js, "a preventiva do plano e a OS
// preventiva"): a mesma preventiva anotada nas duas, cada lado com o seu
// estado. Daqui sai a lista do que fazer, preventiva por preventiva — a tela
// mostra e só grava com a confirmação de quem é PCM.
//
// Uma OS já programada em outra semana não é movida sozinha para o dia da
// parada: isso é decisão do PCM, e a lista só avisa.

import * as ev from "./eventos.js";
import * as M from "./modelo.js";

const br = iso => iso ? iso.split("-").reverse().slice(0, 2).join("/") : "";

/** O que fazer em cada preventiva. `passos`: ligar, baixa_os, realizar_prev,
 *  programar_os, criar_os. `aviso`: o que só se avisa. */
export function conciliacao(prevs = ev.lista("preventiva"), mapa = ev.estado.atividade, ref = M.hoje()) {
  const r = [];
  const usadas = new Set();
  for (const p of prevs) {
    if (p.excluida || p.fora || p.cancelada) continue;
    let a = ev.atividadeDaPreventiva(p, mapa);
    const passos = [];
    let aviso = "";
    if (!a) {
      const ex = ev.osPreventivaExistente(p, mapa);
      if (ex && !usadas.has(ex.id)) { a = ex; usadas.add(ex.id); passos.push({ tipo: "ligar" }); }
    }
    if (a) {
      if (M.preventivaFeita(p) && p.realizada_em && M.aberta(a)) passos.push({ tipo: "baixa_os", em: p.realizada_em });
      else if (M.feita(a) && a.concluida_em && !M.preventivaFeita(p) && !p.adiada) passos.push({ tipo: "realizar_prev", em: a.concluida_em });
      else if (M.preventivaAberta(p) && p.dia_parada && M.aberta(a)) {
        const para = ev.programacaoDoDia(p.dia_parada);
        if (para && a.semana == null) passos.push({ tipo: "programar_os", para, dia: p.dia_parada });
        else if (para && (a.semana !== para.semana || a.ano !== para.ano || a.dia !== para.dia)) {
          aviso = `a OS está na semana ${a.semana}${a.dia ? " · " + a.dia : ""}, e a parada é ${br(p.dia_parada)}`;
        }
      }
    } else if (M.preventivaAberta(p) && p.dia_parada && p.dia_parada >= ref) {
      passos.push({ tipo: "criar_os", dia: p.dia_parada });
    }
    if (passos.length || aviso) r.push({ p, a, passos, aviso });
  }
  return r;
}

/** Em palavras, para a lista da tela. */
export function descrever(item) {
  const { a, passos, aviso } = item;
  const t = passos.map(s => {
    switch (s.tipo) {
      case "ligar": return `liga à OS ${a.os || ""} já anotada na Programação (${a.atividade}${a.semana ? ", semana " + a.semana : ", carteira"})`;
      case "baixa_os": return `dá baixa na OS em ${br(s.em)} — a preventiva já foi realizada`;
      case "realizar_prev": return `registra a preventiva como realizada em ${br(s.em)} — a OS já tem baixa`;
      case "programar_os": return `programa a OS no dia da parada, ${br(s.dia)}`;
      case "criar_os": return `cria a OS preventiva no dia da parada, ${br(s.dia)}`;
      default: return "";
    }
  });
  if (aviso) t.push(`só aviso: ${aviso}`);
  return t.join(" · ");
}

/** Os lançamentos, com origem "vinculo" (não derivam outros). */
export function eventosDaConciliacao(itens) {
  const r = [];
  const vinc = e => e && r.push({ ...e, origem: "vinculo" });
  for (const { p, a, passos } of itens) {
    let os = a;
    for (const s of passos) {
      if (s.tipo === "ligar") vinc(ev.editar(a, { preventiva_id: p.id }));
      else if (s.tipo === "baixa_os") vinc(ev.concluir(a, s.em));
      else if (s.tipo === "realizar_prev") vinc(ev.preventivaFeita(p, s.em, a.os || p.os || ""));
      else if (s.tipo === "programar_os") {
        vinc(ev.reprogramar(a, { ...s.para, dias: a.dias || 1, hh: a.hh }, "Parada da preventiva"));
      } else if (s.tipo === "criar_os") {
        const c = ev.novaOSPreventiva(p);
        vinc(c);
        os = { ...M.molde(), ...c.dados, id: c.alvo };
        vinc(ev.reprogramar(os, { ...ev.programacaoDoDia(s.dia), dias: 1, hh: os.hh }, "Parada da preventiva"));
      }
    }
  }
  return r;
}
