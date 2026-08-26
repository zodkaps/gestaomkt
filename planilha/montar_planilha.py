# -*- coding: utf-8 -*-
"""
Programação de Serviços — Makro Transportes
============================================
Gera a planilha que substitui o módulo de programação do site.

A unidade da planilha é a ATIVIDADE (o que antes era "pendência" dentro de
uma tarefa). É por atividade que se programa, se executa e se mede — a
aderência é atividades concluídas ÷ atividades programadas no período.

Rode:  python3 montar_planilha.py
"""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, DataBarRule
from openpyxl.comments import Comment

SAIDA="/home/user/gestaomkt/planilha/Programacao_Servicos_Makro.xlsx"

# Cores da marca, lidas do logotipo oficial da Makro
NAVY="FF13164E"; NAVY2="FF2A3170"; RED="FFE4002A"
CINZA="FFD9DEE8"; CINZA_C="FFEEF1F7"; AMARELO="FFFFF3CF"
BORDA="FFC8D0DE"; BRANCO="FFFFFFFF"; TINTA="FF14181F"; T2="FF4A5464"
OK_V="FFE3F5EA"; OK_T="FF116B3E"; AL_V="FFFDF0D8"; AL_T="FF8A5A05"
RU_V="FFFDE4E7"; RU_T="FFB00020"

F=lambda **k: Font(name="Arial", **k)
fina=Side(style="thin", color=BORDA)
box=Border(left=fina,right=fina,top=fina,bottom=fina)
def fill(c): return PatternFill("solid", fgColor=c)

PRIM=4      # primeira linha de dados da aba Programação
ULT=1003    # última linha de dados (1000 linhas)
LIN_LISTA=44

wb=Workbook()

# ══════════════════════════════════════════════════════ LISTAS
ls=wb.active; ls.title="Listas"
LISTAS=[
 ("Executantes",["João Batista","Marcos Vinícius","Pedro Alves","Carlos Lima",
                 "Washington Souza","Anderson Reis","Fábio Nunes","Rogério Dias"]),
 ("Frotas",["C-100","C-101","C-102","C-103","C-104","F-400","F-403","F-406","F-409"]),
 ("Tipo de serviço",["Corretiva","Preventiva","Preditiva","Melhoria","Inspeção"]),
 ("Situação",["Programada","Em execução","Concluída","Cancelada"]),
 ("Oficina",["Interna","Terceirizada"]),
 ("Motivo da reprogramação",["Peça não chegou","Frota em viagem","Falta de mão de obra",
   "Serviço maior que o previsto","Mudou a prioridade","Oficina cheia","Aguardando terceiro"]),
]
ls["A1"]="LISTAS DE APOIO"
ls["A1"].font=F(bold=True,size=11,color=BRANCO); ls["A1"].fill=fill(NAVY)
ls.merge_cells("A1:F1"); ls.row_dimensions[1].height=24
ls["A1"].alignment=Alignment(vertical="center",indent=1)
ls["A2"]=("Estas listas alimentam as caixas de seleção da aba Programação. "
          "Acrescente ou troque nomes aqui e as caixas acompanham. "
          "Não deixe linha em branco no meio de uma lista.")
ls["A2"].font=F(size=9,italic=True,color=T2); ls.merge_cells("A2:F2")
for j,(tit,vals) in enumerate(LISTAS,start=1):
    c=ls.cell(row=4,column=j,value=tit)
    c.font=F(bold=True,size=10,color=BRANCO); c.fill=fill(NAVY2)
    c.alignment=Alignment(horizontal="center"); c.border=box
    for i in range(5,LIN_LISTA+1):
        cc=ls.cell(row=i,column=j)
        if i-5 < len(vals): cc.value=vals[i-5]
        cc.font=F(size=10); cc.border=box
for j,w in enumerate([22,12,17,14,15,28],start=1):
    ls.column_dimensions[get_column_letter(j)].width=w
ls.sheet_view.showGridLines=False
ls.freeze_panes="A5"

# ══════════════════════════════════════════════════════ PROGRAMAÇÃO
pg=wb.create_sheet("Programação")
COLS=[
 # (letra, título, largura, grupo)   grupo: 'i'=digitar  'c'=calculado
 ("A","Nº",6,"c"),
 ("B","OS Protheus",13,"i"),
 ("C","Frota",10,"i"),
 ("D","Serviço",30,"i"),
 ("E","Atividade",42,"i"),
 ("F","Tipo",13,"i"),
 ("G","Executante",18,"i"),
 ("H","Oficina",13,"i"),
 ("I","Fornecedor",18,"i"),
 ("J","Data programada",15,"i"),
 ("K","1ª data programada",16,"i"),
 ("L","Reprog.",9,"i"),
 ("M","Motivo da reprogramação",26,"i"),
 ("N","Situação",14,"i"),
 ("O","Concluída em",14,"i"),
 ("P","Semana",12,"c"),
 ("Q","Plano",12,"c"),
 ("R","No prazo",9,"c"),
 ("S","No plano",9,"c"),
 ("T","Atraso (dias)",11,"c"),
 ("U","Situação real",14,"c"),
]
pg["A1"]="PROGRAMAÇÃO DE SERVIÇOS  ·  MAKRO TRANSPORTES"
pg["A1"].font=F(bold=True,size=13,color=BRANCO); pg["A1"].fill=fill(NAVY)
pg["A1"].alignment=Alignment(vertical="center",indent=1)
pg.merge_cells("A1:U1"); pg.row_dimensions[1].height=30

# faixa de grupos
pg["A2"]="CALC."; pg["B2"]="PREENCHER  —  uma linha por atividade"; pg["P2"]="CALCULADO AUTOMATICAMENTE  —  não digite nada aqui"
pg.merge_cells("B2:O2"); pg.merge_cells("P2:U2")
for ref,cor in (("A2",CINZA),("B2",AMARELO),("P2",CINZA)):
    c=pg[ref]; c.font=F(bold=True,size=9,color=T2)
    c.fill=fill(cor); c.alignment=Alignment(horizontal="center",vertical="center"); c.border=box
pg.row_dimensions[2].height=17

for letra,tit,larg,grp in COLS:
    c=pg[letra+"3"]; c.value=tit
    c.font=F(bold=True,size=9.5,color=BRANCO)
    c.fill=fill(NAVY if grp=="i" else NAVY2)
    c.alignment=Alignment(horizontal="center",vertical="center",wrap_text=True)
    c.border=box
    pg.column_dimensions[letra].width=larg
pg.row_dimensions[3].height=32

pg["E3"].comment=Comment(
 "A ATIVIDADE é a unidade desta planilha.\n\n"
 "É o que antes era uma pendência dentro da tarefa: 'trocar as lonas', "
 "'regular a catraca', 'conferir a folga do tambor'.\n\n"
 "Uma linha por atividade. Um serviço com três atividades ocupa três linhas, "
 "todas com o mesmo número de OS e o mesmo texto na coluna Serviço.\n\n"
 "A aderência é medida por aqui: atividades concluídas ÷ atividades programadas.","PCM")
pg["K3"].comment=Comment(
 "A data para a qual a atividade foi programada da PRIMEIRA vez.\n\n"
 "Deixe em branco quando programar; só preencha ao REPROGRAMAR, "
 "guardando aqui a data que estava antes.\n\n"
 "É contra ela que sai a 'Aderência ao plano original' — o indicador que "
 "não melhora quando se empurra o serviço para a frente.","PCM")
pg["J3"].comment=Comment(
 "Deixe em branco enquanto a atividade ainda não tem dia: "
 "ela fica na carteira e aparece no indicador 'Na carteira'.","PCM")

# ── exemplo: uma semana de trabalho ────────────────────────────────────
EX=[
 # OS, frota, serviço, atividade, tipo, exec, ofic, forn, prog, 1ª, reprog, motivo, situação, concl.
 ("OS1000","F-400","Revisão de freios","Trocar lonas do eixo traseiro","Preventiva","João Batista","Interna","","2026-08-24","","","","Concluída","2026-08-24"),
 ("OS1000","F-400","Revisão de freios","Regular a catraca","Preventiva","João Batista","Interna","","2026-08-24","","","","Concluída","2026-08-24"),
 ("OS1000","F-400","Revisão de freios","Conferir folga do tambor","Preventiva","João Batista","Interna","","2026-08-24","","","","Programada",""),
 ("OS1001","C-100","Sistema elétrico","Refazer chicote do farol","Corretiva","Marcos Vinícius","Interna","","2026-08-24","2026-08-21","1","Peça não chegou","Concluída","2026-08-25"),
 ("OS1001","C-100","Sistema elétrico","Trocar lâmpadas da traseira","Corretiva","Marcos Vinícius","Interna","","2026-08-25","","","","Concluída","2026-08-25"),
 ("OS1002","C-101","Suspensão","Trocar feixe de molas","Corretiva","Pedro Alves","Terceirizada","Molas Oeste","2026-08-25","","","","Em execução",""),
 ("OS1002","C-101","Suspensão","Conferir aperto dos grampos","Corretiva","Pedro Alves","Interna","","2026-08-26","","","","Programada",""),
 ("OS1003","F-403","Inspeção de saída","Calibrar pneus do eixo tandem","Inspeção","Carlos Lima","Interna","","2026-08-25","","","","Concluída","2026-08-27"),
 ("OS1003","F-403","Inspeção de saída","Conferir nível de óleo","Inspeção","Carlos Lima","Interna","","2026-08-26","","","","Programada",""),
 ("OS1004","C-102","Troca de óleo","Drenar cárter e trocar filtro","Preventiva","Washington Souza","Interna","","2026-08-26","","","","Programada",""),
 ("OS1004","C-102","Troca de óleo","Registrar hodômetro","Preventiva","Washington Souza","Interna","","2026-08-26","","","","Programada",""),
 ("OS1005","F-406","Ar-condicionado","Recarregar gás","Corretiva","Anderson Reis","Terceirizada","Retífica Sul","2026-08-27","","","","Programada",""),
 ("OS1006","C-103","Revisão de freios","Trocar pastilhas dianteiras","Preventiva","Fábio Nunes","Interna","","2026-08-28","","","","Programada",""),
 ("OS1007","C-104","Motor","Investigar perda de potência","Corretiva","","Interna","","","","","","Programada",""),
]
from datetime import date
def d(s): 
    if not s: return None
    a,b,c=s.split("-"); return date(int(a),int(b),int(c))

for i,linha in enumerate(EX):
    r=PRIM+i
    vals=[linha[0],linha[1],linha[2],linha[3],linha[4],linha[5],linha[6],linha[7],
          d(linha[8]),d(linha[9]),(int(linha[10]) if linha[10] else None),linha[11],
          linha[12],d(linha[13])]
    for j,v in enumerate(vals,start=2):
        if v not in (None,""): pg.cell(row=r,column=j,value=v)

# ── formatação e fórmulas de todas as linhas ──────────────────────────
DATA_FMT="dd/mm/yyyy"
for r in range(PRIM,ULT+1):
    pg[f"A{r}"]=f'=IF($E{r}="","",COUNTA($E${PRIM}:$E{r}))'
    pg[f"P{r}"]=f'=IF($J{r}="","",$J{r}-WEEKDAY($J{r},3))'
    pg[f"Q{r}"]=f'=IF($J{r}="","",IF($K{r}="",$J{r},$K{r}))'
    pg[f"R{r}"]=(f'=IF($E{r}="","",IF(OR($N{r}<>"Concluída",$O{r}="",$J{r}=""),0,'
                 f'IF($O{r}<=$J{r},1,0)))')
    pg[f"S{r}"]=(f'=IF($E{r}="","",IF(OR($N{r}<>"Concluída",$O{r}="",$Q{r}=""),0,'
                 f'IF($O{r}<=$Q{r},1,0)))')
    pg[f"T{r}"]=f'=IF(OR($J{r}="",$N{r}<>"Concluída",$O{r}=""),"",MAX(0,$O{r}-$J{r}))'
    pg[f"U{r}"]=(f'=IF($E{r}="","",'
      f'IF($N{r}="Cancelada","Cancelada",'
      f'IF($N{r}="Concluída",IF($R{r}=1,"No prazo","Concluída com atraso"),'
      f'IF($J{r}="","Na carteira",'
      f'IF($J{r}<TODAY(),"VENCIDA",IF($J{r}=TODAY(),"Hoje","Programada"))))))')
    for letra,tit,larg,grp in COLS:
        c=pg[letra+str(r)]
        c.font=F(size=10, color=TINTA if grp=="i" else T2)
        c.border=box
        if grp=="c": c.fill=fill(CINZA_C)
        if letra in ("J","K","O"): c.number_format=DATA_FMT
        if letra in ("P","Q"): c.number_format=DATA_FMT
        if letra in ("A","L","R","S","T"): c.alignment=Alignment(horizontal="center")
        if letra in ("F","H","N","U"): c.alignment=Alignment(horizontal="center")
    pg.row_dimensions[r].height=16

# zebra discreta nas linhas de digitação
for r in range(PRIM,ULT+1):
    if (r-PRIM)%2==1:
        for letra,tit,larg,grp in COLS:
            if grp=="i": pg[letra+str(r)].fill=fill("FFF8FAFD")

# ── caixas de seleção ─────────────────────────────────────────────────
def dv(col, formula, titulo, msg):
    v=DataValidation(type="list", formula1=formula, allow_blank=True, showDropDown=False)
    v.error=msg; v.errorTitle=titulo; v.showErrorMessage=True
    pg.add_data_validation(v)
    v.add(f"{col}{PRIM}:{col}{ULT}")
dv("C", f"=Listas!$B$5:$B${LIN_LISTA}", "Frota", "Escolha uma frota da lista (aba Listas).")
dv("F", f"=Listas!$C$5:$C${LIN_LISTA}", "Tipo", "Escolha um tipo de serviço da lista (aba Listas).")
dv("G", f"=Listas!$A$5:$A${LIN_LISTA}", "Executante", "Escolha um executante da lista (aba Listas).")
dv("H", f"=Listas!$E$5:$E${LIN_LISTA}", "Oficina", "Interna ou Terceirizada.")
dv("M", f"=Listas!$F$5:$F${LIN_LISTA}", "Motivo", "Escolha um motivo da lista (aba Listas) ou escreva o seu.")
dvn=DataValidation(type="list", formula1='"Programada,Em execução,Concluída,Cancelada"',
                   allow_blank=True, showDropDown=False)
dvn.error="Use: Programada, Em execução, Concluída ou Cancelada."
dvn.errorTitle="Situação"; dvn.showErrorMessage=True
pg.add_data_validation(dvn); dvn.add(f"N{PRIM}:N{ULT}")

# ── cores por situação real ───────────────────────────────────────────
faixa=f"U{PRIM}:U{ULT}"
pg.conditional_formatting.add(faixa, CellIsRule(operator="equal", formula=['"VENCIDA"'],
    fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))
pg.conditional_formatting.add(faixa, CellIsRule(operator="equal", formula=['"No prazo"'],
    fill=fill(OK_V), font=F(bold=True,size=10,color=OK_T)))
pg.conditional_formatting.add(faixa, CellIsRule(operator="equal", formula=['"Concluída com atraso"'],
    fill=fill(AL_V), font=F(bold=True,size=10,color=AL_T)))
pg.conditional_formatting.add(faixa, CellIsRule(operator="equal", formula=['"Hoje"'],
    fill=fill("FFE7EEFB"), font=F(bold=True,size=10,color="FF1749C4")))
pg.conditional_formatting.add(f"T{PRIM}:T{ULT}", CellIsRule(operator="greaterThan",
    formula=["0"], font=F(bold=True,size=10,color=RU_T)))

pg.freeze_panes="F4"
pg.auto_filter.ref=f"A3:U{ULT}"
pg.sheet_view.showGridLines=False

# ══════════════════════════════════════════════════════ SEMANA
PROG="Programação"
G=f"{PROG}!$G${PRIM}:$G${ULT}"   # executante
J=f"{PROG}!$J${PRIM}:$J${ULT}"   # data programada
N=f"{PROG}!$N${PRIM}:$N${ULT}"   # situação
C_=f"{PROG}!$C${PRIM}:$C${ULT}"  # frota
FT=f"{PROG}!$F${PRIM}:$F${ULT}"  # tipo
Q_=f"{PROG}!$Q${PRIM}:$Q${ULT}"  # plano
R_=f"{PROG}!$R${PRIM}:$R${ULT}"  # no prazo
S_=f"{PROG}!$S${PRIM}:$S${ULT}"  # no plano
T_=f"{PROG}!$T${PRIM}:$T${ULT}"  # atraso
L_=f"{PROG}!$L${PRIM}:$L${ULT}"  # reprogramações
E_=f"{PROG}!$E${PRIM}:$E${ULT}"  # atividade

def titulo(ws, texto, ate, altura=30, tam=13):
    ws["A1"]=texto
    ws["A1"].font=F(bold=True,size=tam,color=BRANCO); ws["A1"].fill=fill(NAVY)
    ws["A1"].alignment=Alignment(vertical="center",indent=1)
    ws.merge_cells(f"A1:{ate}1"); ws.row_dimensions[1].height=altura

def cabec(ws, linha, itens, cor=NAVY2):
    for col,txt in itens:
        c=ws[f"{col}{linha}"]; c.value=txt
        c.font=F(bold=True,size=9.5,color=BRANCO); c.fill=fill(cor)
        c.alignment=Alignment(horizontal="center",vertical="center",wrap_text=True)
        c.border=box

sm=wb.create_sheet("Semana")
titulo(sm,"GRADE DA SEMANA  ·  atividades por executante e por dia","L")
sm["A3"]="Semana começando na segunda-feira:"
sm["A3"].font=F(bold=True,size=10); sm.merge_cells("A3:B3")
sm["C3"]="=TODAY()-WEEKDAY(TODAY(),3)"
sm["C3"].font=F(bold=True,size=11); sm["C3"].fill=fill(AMARELO)
sm["C3"].number_format="dd/mm/yyyy"; sm["C3"].border=box
sm["C3"].alignment=Alignment(horizontal="center")
sm["C3"].comment=Comment("Digite a segunda-feira da semana que quer ver.\n\n"
  "Ela já vem na semana atual. Para voltar à semana atual, apague e digite "
  "de novo:  =HOJE()-DIA.DA.SEMANA(HOJE();3)","PCM")
sm["D3"]="←  troque esta data para ver outra semana"
sm["D3"].font=F(size=9,italic=True,color=T2); sm.merge_cells("D3:H3")

DIAS_SEM=["B","C","D","E","F","G","H"]
cabec(sm,5,[("A","Executante")]+[(c,"") for c in DIAS_SEM]+
        [("I","Programadas"),("J","Concluídas"),("K","Aderência"),("L","Vencidas")])
for i,col in enumerate(DIAS_SEM):
    c=sm[f"{col}5"]; c.value=f"=$C$3+{i}" if i else "=$C$3"
    # [$-416] = português do Brasil: sem isso o Excel escreve "Mon" em vez de "seg"
    c.number_format='[$-416]ddd\\ dd/mm;@'
sm.row_dimensions[5].height=30

LIN_EXEC=20
P0,P1=6,6+LIN_EXEC-1        # linhas de executantes
LIN_SEM=P1+1                # linha "sem executante"
LIN_TOT=P1+2                # linha total
for k in range(LIN_EXEC):
    r=P0+k
    sm[f"A{r}"]=f'=IF(Listas!A{5+k}="","",Listas!A{5+k})'
    for i,col in enumerate(DIAS_SEM):
        sm[f"{col}{r}"]=(f'=IF($A{r}="","",COUNTIFS({G},$A{r},{J},{col}$5,{N},"<>Cancelada"))')
    sm[f"I{r}"]=f'=IF($A{r}="","",SUM($B{r}:$H{r}))'
    sm[f"J{r}"]=(f'=IF($A{r}="","",COUNTIFS({G},$A{r},{J},">="&$C$3,{J},"<="&$C$3+6,{N},"Concluída"))')
    sm[f"K{r}"]=f'=IF(OR($A{r}="",$I{r}=0),"",$J{r}/$I{r})'
    sm[f"L{r}"]=(f'=IF($A{r}="","",COUNTIFS({G},$A{r},{J},">="&$C$3,{J},"<="&$C$3+6,'
                 f'{J},"<"&TODAY(),{N},"<>Concluída",{N},"<>Cancelada"))')

sm[f"A{LIN_SEM}"]="— sem executante definido —"
sm[f"A{LIN_SEM}"].font=F(size=10,italic=True,color=T2)
for i,col in enumerate(DIAS_SEM):
    sm[f"{col}{LIN_SEM}"]=f'=COUNTIFS({G},"",{J},{col}$5,{N},"<>Cancelada")'
sm[f"I{LIN_SEM}"]=f'=SUM($B{LIN_SEM}:$H{LIN_SEM})'
sm[f"J{LIN_SEM}"]=f'=COUNTIFS({G},"",{J},">="&$C$3,{J},"<="&$C$3+6,{N},"Concluída")'
sm[f"K{LIN_SEM}"]=f'=IF($I{LIN_SEM}=0,"",$J{LIN_SEM}/$I{LIN_SEM})'
sm[f"L{LIN_SEM}"]=(f'=COUNTIFS({G},"",{J},">="&$C$3,{J},"<="&$C$3+6,{J},"<"&TODAY(),'
                   f'{N},"<>Concluída",{N},"<>Cancelada")')

sm[f"A{LIN_TOT}"]="TOTAL DA SEMANA"
for col in DIAS_SEM+["I","J","L"]:
    sm[f"{col}{LIN_TOT}"]=f"=SUM({col}{P0}:{col}{LIN_SEM})"
sm[f"K{LIN_TOT}"]=f'=IF($I{LIN_TOT}=0,"",$J{LIN_TOT}/$I{LIN_TOT})'

for r in range(P0,LIN_TOT+1):
    for col in ["A"]+DIAS_SEM+["I","J","K","L"]:
        c=sm[f"{col}{r}"]; c.border=box; c.font=F(size=10)
        if col!="A": c.alignment=Alignment(horizontal="center")
        if col=="K": c.number_format="0%"
        if r==LIN_TOT:
            c.font=F(size=10,bold=True,color=BRANCO); c.fill=fill(NAVY)
        elif r==LIN_SEM: c.fill=fill(CINZA_C)
        elif col in ("I","J","K","L"): c.fill=fill(CINZA_C)
    sm.row_dimensions[r].height=17

sm.column_dimensions["A"].width=24
for col in DIAS_SEM: sm.column_dimensions[col].width=11
for col,w in (("I",12),("J",11),("K",11),("L",10)): sm.column_dimensions[col].width=w

sm.conditional_formatting.add(f"B{P0}:H{LIN_SEM}",
    DataBarRule(start_type="num", start_value=0, end_type="num", end_value=6,
                color="FF9DB4DE", showValue=True))
sm.conditional_formatting.add(f"K{P0}:K{P1}", CellIsRule(operator="greaterThanOrEqual",
    formula=["0.85"], fill=fill(OK_V), font=F(bold=True,size=10,color=OK_T)))
sm.conditional_formatting.add(f"K{P0}:K{P1}", CellIsRule(operator="lessThan",
    formula=["0.6"], fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))
sm.conditional_formatting.add(f"L{P0}:L{LIN_SEM}", CellIsRule(operator="greaterThan",
    formula=["0"], fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))

LC=LIN_TOT+2
sm[f"A{LC}"]="Na carteira, ainda sem dia definido:"
sm[f"A{LC}"].font=F(bold=True,size=10); sm.merge_cells(f"A{LC}:C{LC}")
sm[f"D{LC}"]=f'=COUNTIFS({J},"",{E_},"<>",{N},"<>Cancelada")'
sm[f"D{LC}"].font=F(bold=True,size=12,color=RED); sm[f"D{LC}"].alignment=Alignment(horizontal="center")
sm[f"D{LC}"].border=box; sm[f"D{LC}"].fill=fill(CINZA_C)
sm[f"E{LC}"]="atividade(s) esperando encaixe — filtre a coluna Situação real por “Na carteira” na aba Programação"
sm[f"E{LC}"].font=F(size=9,italic=True,color=T2); sm.merge_cells(f"E{LC}:L{LC}")
sm.freeze_panes="B6"; sm.sheet_view.showGridLines=False

# ══════════════════════════════════════════════════════ ADERÊNCIA
ad=wb.create_sheet("Aderência")
titulo(ad,"ADERÊNCIA DA PROGRAMAÇÃO  ·  medida por atividade","K")
ad["A3"]="De:"; ad["A4"]="Até:"
for ref in ("A3","A4"): ad[ref].font=F(bold=True,size=10)
ad["B3"]="=TODAY()-WEEKDAY(TODAY(),3)"; ad["B4"]="=B3+6"
for ref in ("B3","B4"):
    c=ad[ref]; c.font=F(bold=True,size=11); c.fill=fill(AMARELO)
    c.number_format="dd/mm/yyyy"; c.border=box; c.alignment=Alignment(horizontal="center")
ad["B3"].comment=Comment("Período analisado. Vem na semana atual; troque para "
  "ver o mês, o trimestre ou qualquer intervalo.","PCM")
ad["C3"]="←  troque as duas datas para analisar outro período"
ad["C3"].font=F(size=9,italic=True,color=T2); ad.merge_cells("C3:H3")
ad["C4"]="As atividades entram pelo dia para o qual foram PROGRAMADAS."
ad["C4"].font=F(size=9,italic=True,color=T2); ad.merge_cells("C4:H4")

jan=f'{J},">="&$B$3,{J},"<="&$B$4'          # janela pela data programada
janQ=f'{Q_},">="&$B$3,{Q_},"<="&$B$4'       # janela pela 1ª data programada

# ── destaque ──
ad.merge_cells("A6:B9")
ad["A6"]='=IFERROR(B14,"—")'
ad["A6"].font=F(bold=True,size=40,color=NAVY)
ad["A6"].alignment=Alignment(horizontal="center",vertical="center")
ad["A6"].number_format="0%"
ad["A6"].fill=fill(CINZA_C)
ad.merge_cells("C6:K9")
ad["C6"]=('="ADERÊNCIA POR ATIVIDADE"&CHAR(10)&B13&" de "&B12&'
          '" atividades programadas no período foram concluídas."&CHAR(10)&'
          '"Cada linha da aba Programação é uma atividade — é ela que conta, não o serviço inteiro."')
ad["C6"].font=F(size=12,color=TINTA)
ad["C6"].alignment=Alignment(horizontal="left",vertical="center",wrap_text=True,indent=2)
ad["C6"].fill=fill(CINZA_C)
for r in range(6,10):
    for col in "ABCDEFGHIJK": ad[f"{col}{r}"].border=box
ad.row_dimensions[6].height=22; ad.row_dimensions[7].height=22
ad.row_dimensions[8].height=22; ad.row_dimensions[9].height=22

# ── tabela de indicadores ──
cabec(ad,11,[("A","Indicador"),("B","Valor"),("C","Como é medido")],NAVY)
for _c in "DEFGHIJK":
    _x=ad[f"{_c}11"]; _x.fill=fill(NAVY); _x.border=box
ad.merge_cells("C11:K11")
ad["C11"].alignment=Alignment(horizontal="left",vertical="center",indent=1)
IND=[
 ("Atividades programadas", f'=COUNTIFS({jan},{N},"<>Cancelada")', "0",
  "com data programada dentro do período, exceto as canceladas"),
 ("Concluídas", f'=COUNTIFS({jan},{N},"Concluída")', "0",
  "situação Concluída"),
 ("Aderência por atividade", '=IFERROR(B13/B12,"")', "0%",
  "concluídas ÷ programadas — o indicador principal"),
 ("Concluídas no prazo", f'=SUMIFS({R_},{jan})', "0",
  "concluídas até o próprio dia programado"),
 ("Pontualidade", '=IFERROR(B15/B13,"")', "0%",
  "concluídas no prazo ÷ concluídas"),
 ("Programadas no plano original", f'=COUNTIFS({janQ},{N},"<>Cancelada")', "0",
  "pela 1ª data programada, e não pela data de hoje"),
 ("Concluídas até a 1ª data", f'=SUMIFS({S_},{janQ})', "0",
  "entregues sem precisar empurrar o dia"),
 ("Aderência ao plano original", '=IFERROR(B18/B17,"")', "0%",
  "não melhora quando se reprograma — mostra se a semana combinada foi cumprida"),
 ("Vencidas", f'=COUNTIFS({jan},{J},"<"&TODAY(),{N},"<>Concluída",{N},"<>Cancelada")', "0",
  "o dia passou e a atividade não foi concluída nem cancelada"),
 ("Canceladas", f'=COUNTIFS({jan},{N},"Cancelada")', "0",
  "fora do cálculo da aderência"),
 ("Atividades reprogramadas", f'=COUNTIFS({jan},{L_},">0")', "0",
  "mudaram de dia pelo menos uma vez"),
 ("Total de reprogramações", f'=SUMIFS({L_},{jan})', "0",
  "soma da coluna Reprog."),
 ("Atraso médio, quando atrasa", f'=IFERROR(SUMIFS({T_},{jan})/COUNTIFS({jan},{T_},">0"),0)', "0.0",
  "dias entre o programado e o concluído, só das que passaram do dia"),
 ("Na carteira, sem dia", f'=COUNTIFS({J},"",{E_},"<>",{N},"<>Cancelada")', "0",
  "não depende do período — é o que ainda espera encaixe"),
]
for i,(rot,fml,fmt,expl) in enumerate(IND):
    r=12+i
    ad[f"A{r}"]=rot; ad[f"B{r}"]=fml; ad[f"C{r}"]=expl
    destaque=rot.startswith("Aderência")
    ad[f"A{r}"].font=F(size=10,bold=destaque)
    ad[f"B{r}"].font=F(size=11,bold=True,color=NAVY if destaque else TINTA)
    ad[f"B{r}"].number_format=fmt
    ad[f"B{r}"].alignment=Alignment(horizontal="center")
    ad[f"C{r}"].font=F(size=9,color=T2)
    for col in "ABC": ad[f"{col}{r}"].border=box
    if destaque:
        for col in "ABC": ad[f"{col}{r}"].fill=fill("FFEDF1F9")
    ad.merge_cells(f"C{r}:K{r}")
    ad.row_dimensions[r].height=17
ad.conditional_formatting.add("B20:B20", CellIsRule(operator="greaterThan",
    formula=["0"], fill=fill(RU_V), font=F(bold=True,size=11,color=RU_T)))
for ref in ("B14","B16","B19","A6"):
    ad.conditional_formatting.add(ref, CellIsRule(operator="greaterThanOrEqual",
        formula=["0.85"], font=F(bold=True,size=40 if ref=="A6" else 11, color=OK_T)))
    ad.conditional_formatting.add(ref, CellIsRule(operator="lessThan",
        formula=["0.6"], font=F(bold=True,size=40 if ref=="A6" else 11, color=RU_T)))

# ── recortes ──
def recorte(lin, col0, titulo_txt, origem_lista, coluna_prog, n=20):
    cols=[get_column_letter(col0+i) for i in range(5)]
    a,b,c,d,e=cols
    ad[f"{a}{lin}"]=titulo_txt
    ad[f"{a}{lin}"].font=F(bold=True,size=11,color=NAVY)
    ad.merge_cells(f"{a}{lin}:{e}{lin}")
    cabec(ad,lin+1,[(a,"Nome"),(b,"Progr."),(c,"Concl."),(d,"Aderência"),(e,"Vencidas")])
    for k in range(n):
        r=lin+2+k
        ad[f"{a}{r}"]=f'=IF(Listas!{origem_lista}{5+k}="","",Listas!{origem_lista}{5+k})'
        crit=f'{coluna_prog},${a}{r}'
        ad[f"{b}{r}"]=f'=IF(${a}{r}="","",COUNTIFS({crit},{jan},{N},"<>Cancelada"))'
        ad[f"{c}{r}"]=f'=IF(${a}{r}="","",COUNTIFS({crit},{jan},{N},"Concluída"))'
        ad[f"{d}{r}"]=f'=IF(OR(${a}{r}="",${b}{r}=0),"",${c}{r}/${b}{r})'
        ad[f"{e}{r}"]=(f'=IF(${a}{r}="","",COUNTIFS({crit},{jan},{J},"<"&TODAY(),'
                       f'{N},"<>Concluída",{N},"<>Cancelada"))')
        for col in cols:
            cc=ad[f"{col}{r}"]; cc.border=box; cc.font=F(size=10)
            if col!=a: cc.alignment=Alignment(horizontal="center")
            if col==d: cc.number_format="0%"
            if col in (b,c,d,e): cc.fill=fill(CINZA_C)
        ad.row_dimensions[r].height=16
    faixa=f"{d}{lin+2}:{d}{lin+1+n}"
    ad.conditional_formatting.add(faixa, CellIsRule(operator="greaterThanOrEqual",
        formula=["0.85"], fill=fill(OK_V), font=F(bold=True,size=10,color=OK_T)))
    ad.conditional_formatting.add(faixa, CellIsRule(operator="lessThan",
        formula=["0.6"], fill=fill(RU_V), font=F(bold=True,size=10,color=RU_T)))
    ad.conditional_formatting.add(f"{e}{lin+2}:{e}{lin+1+n}", CellIsRule(
        operator="greaterThan", formula=["0"], font=F(bold=True,size=10,color=RU_T)))

recorte(28, 1, "POR EXECUTANTE", "A", G, 20)
recorte(28, 7, "POR FROTA", "B", C_, 20)
recorte(51, 1, "POR TIPO DE SERVIÇO", "C", FT, 8)

ad.column_dimensions["A"].width=30
for col,w in (("B",10),("C",11),("D",11),("E",10),("F",3),
              ("G",16),("H",10),("I",11),("J",11),("K",10)):
    ad.column_dimensions[col].width=w
ad.sheet_view.showGridLines=False
ad.freeze_panes="A5"

# ══════════════════════════════════════════════════════ INSTRUÇÕES
ins=wb.create_sheet("Instruções", 0)
titulo(ins,"PROGRAMAÇÃO DE SERVIÇOS  ·  MAKRO TRANSPORTES","H",36,15)
ins["A2"]="Planejamento e Controle de Manutenção  ·  aderência medida por atividade"
ins["A2"].font=F(size=10,color=BRANCO); ins["A2"].fill=fill(NAVY2)
ins["A2"].alignment=Alignment(vertical="center",indent=1)
ins.merge_cells("A2:H2"); ins.row_dimensions[2].height=20

def sec(r, txt):
    ins[f"A{r}"]=txt
    ins[f"A{r}"].font=F(bold=True,size=11,color=NAVY)
    ins.merge_cells(f"A{r}:H{r}"); ins.row_dimensions[r].height=24
def par(r, txt, negrito=False, cor=TINTA, alt=None):
    ins[f"A{r}"]=txt
    ins[f"A{r}"].font=F(size=10,bold=negrito,color=cor)
    ins[f"A{r}"].alignment=Alignment(vertical="top",wrap_text=True,indent=1)
    ins.merge_cells(f"A{r}:H{r}")
    if alt: ins.row_dimensions[r].height=alt

L=4
sec(L,"A ATIVIDADE É A UNIDADE"); L+=1
par(L,"Cada linha da aba Programação é uma ATIVIDADE: “trocar as lonas”, “regular a catraca”, "
      "“conferir a folga do tambor”. É o que antes era uma pendência dentro da tarefa.",alt=30); L+=1
par(L,"Um serviço com três atividades ocupa três linhas — mesma OS, mesmo texto na coluna Serviço, "
      "uma linha para cada coisa a fazer. É assim que a aderência mede trabalho feito, e não "
      "serviço fechado pela metade.",alt=30); L+=2

sec(L,"COMO A ADERÊNCIA É CALCULADA"); L+=1
ins[f"A{L}"]="Aderência  =  atividades concluídas  ÷  atividades programadas no período"
ins[f"A{L}"].font=F(bold=True,size=12,color=NAVY); ins[f"A{L}"].fill=fill("FFEDF1F9")
ins[f"A{L}"].alignment=Alignment(vertical="center",indent=1)
ins.merge_cells(f"A{L}:H{L}"); ins.row_dimensions[L].height=26
for col in "ABCDEFGH": ins[f"{col}{L}"].border=box
L+=1
par(L,"A atividade entra na conta pelo dia para o qual foi PROGRAMADA. Canceladas ficam de fora "
      "dos dois lados da divisão.",alt=28); L+=1
par(L,"A aba Aderência traz ainda dois recortes que a conta principal não mostra:",alt=16); L+=1
par(L,"    •  Pontualidade — das que foram concluídas, quantas saíram até o próprio dia programado.",alt=16); L+=1
par(L,"    •  Aderência ao plano original — mede contra a 1ª data programada. É a única que não "
      "melhora quando se empurra o serviço para a frente, e por isso é a que diz se a semana "
      "combinada foi cumprida.",alt=30); L+=2

sec(L,"O QUE FAZER EM CADA ABA"); L+=1
ABAS=[("Programação","Onde se trabalha. Uma linha por atividade. Digite nas colunas de fundo claro; "
        "as cinzas se calculam sozinhas."),
      ("Semana","Quantas atividades cada executante tem em cada dia da semana. Troque a data da "
        "segunda-feira para ver outra semana."),
      ("Aderência","Os indicadores do período, com recortes por executante, por frota e por tipo "
        "de serviço. Troque as datas De e Até."),
      ("Listas","Os nomes que aparecem nas caixas de seleção. Acrescente executantes e frotas aqui.")]
cabec(ins,L,[("A","Aba"),("B","Para que serve")]); L+=1
for nome,txt in ABAS:
    ins[f"A{L}"]=nome; ins[f"A{L}"].font=F(bold=True,size=10)
    ins[f"A{L}"].alignment=Alignment(vertical="top",indent=1)
    ins[f"B{L}"]=txt; ins[f"B{L}"].font=F(size=10)
    ins[f"B{L}"].alignment=Alignment(vertical="top",wrap_text=True,indent=1)
    ins.merge_cells(f"B{L}:H{L}")
    for col in "ABCDEFGH": ins[f"{col}{L}"].border=box
    ins.row_dimensions[L].height=30
    L+=1
L+=1

sec(L,"AS TRÊS REGRAS DE PREENCHIMENTO"); L+=1
REGRAS=[
 ("1.","Sem dia ainda?  Deixe a coluna Data programada em branco. A atividade fica na carteira e "
       "aparece no indicador “Na carteira, sem dia”."),
 ("2.","Reprogramou?  Guarde a data que estava antes na coluna 1ª data programada e some 1 na "
       "coluna Reprog. Sem isso a aderência ao plano original não tem contra o que medir."),
 ("3.","Concluiu?  Ponha Concluída na Situação E a data na coluna Concluída em. Faltando a data, "
       "a planilha não sabe se saiu no prazo."),
]
for n,txt in REGRAS:
    ins[f"A{L}"]=n; ins[f"A{L}"].font=F(bold=True,size=11,color=RED)
    ins[f"A{L}"].alignment=Alignment(horizontal="center",vertical="top")
    ins[f"B{L}"]=txt; ins[f"B{L}"].font=F(size=10)
    ins[f"B{L}"].alignment=Alignment(vertical="top",wrap_text=True,indent=1)
    ins.merge_cells(f"B{L}:H{L}"); ins.row_dimensions[L].height=32
    L+=1
L+=1

sec(L,"CORES"); L+=1
CORES=[(AMARELO,"Amarelo","célula de controle — a data da semana, o período da análise"),
       ("FFFFFFFF","Branco","você digita"),
       (CINZA_C,"Cinza","calculado pela planilha — não digite nada"),
       (OK_V,"Verde","dentro do combinado"),
       (RU_V,"Vermelho","fora do combinado: vencida, atrasada, aderência abaixo de 60%")]
for corv,nome,txt in CORES:
    c=ins[f"A{L}"]; c.value=nome; c.fill=fill(corv); c.border=box
    c.font=F(size=10,bold=True); c.alignment=Alignment(horizontal="center")
    ins[f"B{L}"]=txt; ins[f"B{L}"].font=F(size=10)
    ins[f"B{L}"].alignment=Alignment(vertical="center",indent=1)
    ins.merge_cells(f"B{L}:H{L}"); ins.row_dimensions[L].height=18
    L+=1
L+=1

ins[f"A{L}"]=("ATENÇÃO — a aba Programação vem com 14 atividades de exemplo, da semana de "
              "24 a 28 de agosto de 2026, só para você ver os números funcionando. "
              "Apague as linhas 4 a 17 antes de usar de verdade.")
ins[f"A{L}"].font=F(bold=True,size=10,color=RU_T); ins[f"A{L}"].fill=fill(RU_V)
ins[f"A{L}"].alignment=Alignment(vertical="center",wrap_text=True,indent=1)
ins.merge_cells(f"A{L}:H{L}"); ins.row_dimensions[L].height=44
for col in "ABCDEFGH": ins[f"{col}{L}"].border=box
L+=2
par(L,"A planilha traz 1.000 linhas prontas na aba Programação. As fórmulas das colunas cinzas "
      "já estão em todas elas — é só digitar por cima.",cor=T2,alt=28); L+=1
par(L,"Para imprimir a programação de uma semana: filtre a coluna Semana pela data da segunda-feira "
      "e mande imprimir — sai só o que o filtro deixou visível. As abas Semana e Aderência já saem "
      "prontas em uma folha cada.",cor=T2,alt=30)

ins.column_dimensions["A"].width=12
for col,w in (("B",26),("C",16),("D",16),("E",16),("F",16),("G",16),("H",16)):
    ins.column_dimensions[col].width=w
ins.sheet_view.showGridLines=False

# ══════════════════════════════════════════════════════ FECHO
# ── impressão: cada aba sai numa folha que se lê ──
for ws,orient,titulos in ((pg,"landscape",3),(sm,"landscape",5),(ad,"portrait",None),(ins,"portrait",None)):
    ws.page_setup.orientation=orient
    ws.page_setup.paperSize=ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth=1; ws.page_setup.fitToHeight=0
    ws.sheet_properties.pageSetUpPr.fitToPage=True
    ws.print_options.horizontalCentered=True
    ws.page_margins.left=ws.page_margins.right=0.4
    ws.page_margins.top=ws.page_margins.bottom=0.5
    if titulos: ws.print_title_rows=f"1:{titulos}"
# Imprimir as 1.000 linhas daria 11 páginas quase vazias. A área sai nas
# primeiras 60 linhas; para tirar o resto, filtre a coluna Situação real e
# mande imprimir — o Excel imprime só o que o filtro deixou visível.
pg.print_area="A1:U60"
ls.page_setup.orientation="portrait"; ls.page_setup.paperSize=ls.PAPERSIZE_A4
ls.page_setup.fitToWidth=1; ls.page_setup.fitToHeight=0
ls.sheet_properties.pageSetUpPr.fitToPage=True
ls.print_area=f"A1:F{LIN_LISTA}"
sm.print_area=f"A1:L{LIN_TOT+3}"

wb.calculation.fullCalcOnLoad=True
for ws in wb.worksheets:
    ws.sheet_properties.tabColor=NAVY[2:]
wb.active=0
wb.save(SAIDA)
print("planilha montada:", SAIDA)

