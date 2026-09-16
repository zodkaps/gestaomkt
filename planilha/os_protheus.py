# -*- coding: utf-8 -*-
"""
Lançamento de OS do Protheus nas atividades
===========================================
Casa o número da OS com a atividade pelo texto. Atividade que ainda não existe
na planilha é criada — sem data, para ele programar quando quiser.

    python3 os_protheus.py entrada.json > saida.json
"""
import sys, json, io

# (frota, serviço da atividade nova, [(atividade, OS), ...])
LOTES=[
 ("F-938","Pendências de inspeção",[
   ("Desobstruir esguichos dos limpadores de para-brisas","021390"),
   ("Instalar lameiras dianteiras","021394"),
   ("Instalar indicadores de porcas folgadas nas rodas","021396"),
   ("Regular freios do terceiro eixo LE e LD","021397"),
 ]),
 ("F-1038","Pendências de inspeção",[
   ("Substituir pneu 1º eixo LE devido desgaste","007305"),
   ("Lubrificar graxeiros da quinta roda entre os bitrens","007306"),
   ("Corrigir trinca no lastro","007307"),
   ("Reapertar parafusos da tampa do cubo 1º eixo LD","007308"),
   ("Regular freios 1º eixo LD","007310"),
   ("Fixar grade de proteção do ciclista LD","007313"),
   ("Fixar para-lamas folgados 2º eixo LD","007317"),
   ("Fixar para-lamas folgados LE","007318"),
   ("Reposicionar pinos da balança 2º e 3º eixo LD","007316"),
   ("Corrigir travessa avariada ao lado direito da quinta roda","007319"),
 ]),
 ("F-1039","Pendências de inspeção",[
   ("Repor estepe faltante da carreta","007320"),
   ("Repor porca de roda faltante 2º eixo LD","007321"),
   ("Substituir tampa do cubo 3º eixo LE","007322"),
   ("Substituir grade traseira com apoio faltante no LE","007323"),
   ("Corrigir trincas no lastro da carreta","007324"),
   ("Corrigir iluminação meia-luz dianteira LD","007325"),
   ("Corrigir parafusos do para-choque traseiro LD","007326"),
   ("Fixar para-lamas folgados LD e LE","007328"),
   ("Reapertar tirante folgado 3º eixo LE","007330"),
 ]),
 ("F-818","Pendências de inspeção",[
   ("Substituir vareta de nível de óleo avariada","021400"),
   ("Substituir junta da tampa de válvulas devido vazamento","021402"),
   ("Substituir válvula termostática e tampa do reservatório contaminado","021403"),
   ("Substituir amortecedores do 3º eixo LE","021404"),
   ("Substituir amortecedores da cabine (horizontais traseiros e verticais dianteiros)","021405"),
   ("Substituir joystick de mudanças","021406"),
   ("Sanar vazamento no tubo de enchimento / vedação do cárter","021407"),
   ("Completar óleo da direção hidráulica e sanar vazamento do reservatório","021408"),
   ("Fixar retrovisor inferior LD","021409"),
   ("Isolar fiação exposta do sensor de temperatura","021410"),
   ("Fixar caixa do chicote das unidades","021412"),
   ("Fixar módulo do motor","021417"),
   ("Recuperar / fabricar base de proteção das conexões da bomba de ARLA","021416"),
   ("Regular freios 3º eixo","021420"),
   ("Regular freios 1º eixo","021430"),
   ("Corrigir fixação da lameira traseira LE","021431"),
   ("Reposicionar cabo do varão da válvula sensível à carga","021433"),
   ("Fixar tampa superior do catalisador","021435"),
   ("Reposicionar mangueira do dreno do AC","021436"),
   ("Corrigir iluminação interna da cabine","021438"),
   ("Substituir faixa refletiva do para-choque traseiro","021442"),
 ]),
]

def norm(s):
    """Casamento tolerante: acento, caixa e pontuação variam entre o que ele
    escreve no Protheus e o que está na planilha."""
    import unicodedata, re
    s=unicodedata.normalize("NFKD",str(s or "")).encode("ascii","ignore").decode()
    return re.sub(r"[^a-z0-9]+"," ",s.lower()).strip()

d=json.load(io.open(sys.argv[1],encoding="utf-8"))
idx={}
for x in d["linhas"]:
    if x.get("atividade"):
        idx.setdefault((x.get("frota",""),norm(x["atividade"])),[]).append(x)

casadas=criadas=trocadas=0
faltou=[]
for frota,servico,pares in LOTES:
    for ativ,os_ in pares:
        alvo=idx.get((frota,norm(ativ)))
        if alvo:
            for x in alvo:
                antes=str(x.get("os") or "")
                if antes and antes!=os_: trocadas+=1
                x["os"]=os_
            casadas+=1
        else:
            d["linhas"].append(dict(
                os=os_, frota=frota, servico=servico, atividade=ativ,
                tipo="Corretiva", origem="Programada", equipe=[],
                semana=None, dia="", dias=None,   # sem data: ele programa depois
                data=None, prazo=None, concluida="", marcar="",
                semorig=None, orig="", motivo="", obs="", oficina=""))
            criadas+=1; faltou.append(f"{frota} · {ativ}")

sys.stderr.write(f"OS casadas com atividade existente: {casadas}\n")
sys.stderr.write(f"atividades criadas (não existiam):  {criadas}\n")
for t in faltou: sys.stderr.write(f"    + {t}\n")
sys.stderr.write(f"OS que substituíram uma anterior:   {trocadas}\n")
json.dump(d, sys.stdout, ensure_ascii=False)
