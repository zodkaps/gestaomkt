# -*- coding: utf-8 -*-
"""
Programação do dia vinda do WhatsApp — 02/09/2026
=================================================
Transforma as mensagens do grupo em registros da planilha, seguindo as regras
do PCM:

  · PENDENTE por padrão. CONCLUÍDO só com evidência explícita na mensagem.
  · OS só se vincula quando a mensagem liga o número ao serviço. Sem isso,
    o número fica na observação e a coluna OS continua vazia — que nesta
    planilha já quer dizer "aguardando OS", e pinta a célula de laranja.
  · Nada se inventa. O que a mensagem não diz vira "Não informado" ou ⚠️.
  · Uma atividade por serviço, mesmo na mesma frota.
  · Mensagens repetidas do mesmo dia se consolidam numa linha só.

    python3 whatsapp_0209.py entrada.json > saida.json
"""
import sys, json, io

DIA="2026-09-02"; SEM=36; DSEM="Qua"
FONTE="WhatsApp 02/09"

# frota, tipo, serviço, atividade, [quem], origem, obs, concluída?
A=[
 # ── 08:29 · bloco "02/09 - Prog" ──
 ("F-331","Corretiva","Programação 02/09",
  "Verificar fechamento das portas LD e LE",
  ["Adilton","Júnior","Gabriel"],"Programada","",False),
 # 08:29 "814 - Realizar troca de pneu" + 09:25 "F814 trocar pneus da inspeção"
 # são a mesma atividade do mesmo dia: consolidadas numa linha.
 ("F-814","Borracharia","Borracharia 02/09",
  "Realizar troca de pneus da inspeção",
  ["Luiz Paulo","Airton"],"Programada",
  "⚠️ VERIFICAR se é a mesma da linha 'revisar pneus dianteiros' (OS 7288), "
  "que já está na semana 36",False),
 ("F-815","Mecânica","Programação 02/09",
  "Montagem de diferencial",
  ["Heliton"],"Programada",
  "⚠️ VERIFICAR se conflita com 'Corrigir vazamento no diferencial do segundo "
  "eixo' (OS 07344), já lançada",False),

 # ── 13:18 · segunda atividade da F-815, linha própria ──
 ("F-815","Mecânica","Programação 02/09",
  "Realizar troca dos amortecedores da cabine",
  ["Adilton","Gabriel"],"Programada",
  "⚠️ VERIFICAR se é a mesma de 'Substituir amortecedor dianteiro da cabine LD' "
  "(OS 7160), já lançada e vencida",False),

 # ── Alexandre · frota corrigida para F-580 pelo próprio PCM ──
 ("F-580","Não classificado","Rentaf",
  "Atuação / manutenção na frota F-580",
  ["Alexandre"],"Programada","Local: Externo / Rentaf",False),

 # ── recursos extras: o nome vai colado na atividade, não solto ──
 ("F-424","Corretiva","Extra 02/09",
  "Verificar painel queimado",
  ["Júnior"],"Extra","EXTRA PROGRAMADO · ⚠️ VERIFICAR a frota: a mensagem diz "
  "424 e a lista tem F-425",False),
 ("F-617","Corretiva","Extra 02/09",
  "Verificar falha na embreagem ativa",
  ["Thawan"],"Extra","EXTRA PROGRAMADO",False),

 # ── 09:25 · bloco borracharia ──
 ("Não informada","Borracharia","Borracharia 02/09",
  "Ferrar pneus do bitrem",
  ["Luiz Paulo","Airton"],"Programada",
  "⚠️ VERIFICAR qual bitrem: a mensagem diz só 'Bitrem'",False),
 # 09:25 "F848 trocar pneus" + 13:36 "F848 - Realizar troca dos pneus"
 ("F-848","Borracharia","Borracharia 02/09",
  "Realizar troca dos pneus",
  ["Airton","Luiz Paulo"],"Programada","",False),
 ("F-618","Borracharia","Borracharia 02/09",
  "Trocar pneus dianteiros",
  ["Luiz Paulo","Airton"],"Programada","",False),

 # ── 09:32 · "Realizado" é conclusão explícita ──
 ("Não informada","Borracharia","Borracharia 02/09",
  "Ferragem de pneus — verificar TAG",
  ["Luiz Paulo","Airton"],"Programada",
  "⚠️ VERIFICAR a frota: a mensagem não diz qual",True),
]

# ── 11:45 · preventiva F-425 "para programar" ──
# As três OS vieram soltas, sem dizer qual é de qual serviço. Pela regra, elas
# ficam registradas na observação e a coluna OS continua vazia.
PREV=("F-425","Preventiva","Preventiva",
      "Realizar preventiva da frota F-425",
      [],"Programada",
      "Local: Matriz · Para programar · OS informadas: 007011, 007012, 007013 "
      "· ⚠️ Aguardando identificação da OS correspondente")

d=json.load(io.open(sys.argv[1],encoding="utf-8"))

def novo(frota,tipo,serv,ativ,quem,origem,obs,concl,com_data):
    return dict(os="", frota=frota, servico=serv, atividade=ativ,
                tipo=tipo, origem=origem, equipe=quem,
                semana=(SEM if com_data else None), dia=(DSEM if com_data else ""),
                dias=(1 if com_data else None),
                data=(DIA if com_data else None), prazo=(DIA if com_data else None),
                concluida=(DIA if concl else ""),
                marcar=("Concluída" if concl else ""),
                semorig=None, orig="", motivo="",
                obs=" · ".join(t for t in (obs,f"Origem: {FONTE}") if t),
                oficina="")

for frota,tipo,serv,ativ,quem,origem,obs,concl in A:
    d["linhas"].append(novo(frota,tipo,serv,ativ,quem,origem,obs,concl,True))
d["linhas"].append(novo(*PREV,False,False))

L=d.setdefault("listas",{})
for f in ("F-424","F-580","F-618","F-848"):
    if f not in L.setdefault("Frotas",[]): L["Frotas"].append(f)
for t in ("Borracharia","Mecânica","Não classificado"):
    if t not in L.setdefault("Tipo de serviço",[]): L["Tipo de serviço"].append(t)

sys.stderr.write(f"atividades lançadas: {len(A)+1}\n")
sys.stderr.write(f"  com data 02/09: {len(A)}   |   sem data (para programar): 1\n")
sys.stderr.write(f"  concluídas: {sum(1 for x in A if x[7])}\n")
json.dump(d, sys.stdout, ensure_ascii=False)
