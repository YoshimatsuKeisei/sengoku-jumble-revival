import json, csv, os, re, ast, math, sys
from collections import Counter, defaultdict
sys.path.insert(0,'/mnt/data/tmp_sgj')
from decompile_avm1_regs import decompile

SRC='/mnt/data/tmp_sgj/avm1_regs.json'
D=json.load(open(SRC,encoding='utf-8'))
OUT='/mnt/data/sengoku_jumble_stage_data_full_work'
os.makedirs(OUT,exist_ok=True)
for sub in ['map','formations','famous','generation','validation','raw']:
    os.makedirs(os.path.join(OUT,sub),exist_ok=True)

CLASS={1:'足軽',2:'弓兵',3:'武将',4:'猛者',5:'軍師',6:'鉄砲',7:'忍者',8:'騎馬'}
STRATEGY_RAW={0:'乱戦',1:'突撃',3:'守備',4:'待機',8:'迎撃'}
TECH={1:'槍撃',2:'弓矢',3:'遠射',4:'射撃',5:'狙撃',6:'火遊',7:'火攻',8:'火計',9:'業火',10:'炎術',11:'旋風',12:'忍術',13:'影走',14:'号令',15:'火矢',16:'焙烙',17:'砲撃',18:'妖術',19:'虚報',20:'幻術',21:'槍術',22:'豪傑',23:'無双',24:'治癒',25:'鬼神',26:'騎突',27:'結界',28:'奮迅'}

# ---------- locate functions ----------
def find_fn(name):
    for b in D['blocks']:
        for f in b.get('functions',[]):
            if f.get('function_name')==name:
                return b,f
    raise KeyError(name)

# ---------- fmdt exact execution ----------
_,fmdt=find_fn('fmdt')
actions=fmdt['actions']; byoff={a['offset']:i for i,a in enumerate(actions)}
def av(v,regs):
    if isinstance(v,dict):
        if 'register' in v:return regs.get(v['register'])
        if 'undefined' in v:return None
        return v.get('value')
    return v

def run_fmdt(efm):
    regs={1:{'efm':efm}}; stack=[]; ip=0
    while ip<len(actions):
        a=actions[ip]; n=a['name']; nxt=ip+1
        if n=='Push': stack += [av(v,regs) for v in a.get('values',[])]
        elif n=='Pop':
            if stack: stack.pop()
        elif n=='GetMember':
            key=stack.pop();obj=stack.pop();stack.append(obj.get(key) if isinstance(obj,dict) else None)
        elif n=='StoreRegister': regs[a['register']]=stack[-1] if stack else None
        elif n=='CallFunction':
            fn=stack.pop();argc=int(stack.pop());args=[stack.pop() for _ in range(argc)][::-1]
            if fn=='parseFloat':
                try:r=float(args[0])
                except:r=float('nan')
            else: raise RuntimeError((fn,a['offset']))
            stack.append(r)
        elif n=='StrictEquals':
            b=stack.pop();aa=stack.pop();stack.append(aa==b)
        elif n=='If':
            if stack.pop(): nxt=byoff[a['target']]
        elif n=='Jump': nxt=byoff[a['target']]
        elif n=='Return': return stack.pop() if stack else None
        elif n=='End': return None
        else: raise RuntimeError((n,a['offset']))
        ip=nxt
    return None

formation_ids=list(range(1,39))+list(range(98,131))
raw_fmdt={str(i):run_fmdt(i) for i in formation_ids}
with open(os.path.join(OUT,'raw','fmdt_strings.json'),'w',encoding='utf-8') as f:
    json.dump(raw_fmdt,f,ensure_ascii=False,indent=2)

formations=[]
formation_by_id={}
for fid in formation_ids:
    s=raw_fmdt[str(fid)]
    assert isinstance(s,str) and len(s)==180 and s.isdigit(), (fid,len(s) if s else None)
    units=[]
    comp=Counter(); strats=Counter()
    for idx in range(30):
        g=s[idx*6:(idx+1)*6]
        xx=int(g[:2]); yy=int(g[2:4]); ch=int(g[4]); rawp=int(g[5])
        slot=30+idx
        rec={
            'index':idx,'slot':f'm{slot}','raw_record':g,
            'x_code':xx,'y_code':yy,
            'world_x':1833-xx*36,'world_y':yy*36,
            'class_code':ch,'class_name':CLASS.get(ch,f'unknown:{ch}'),
            'strategy_raw':rawp,'strategy_name':STRATEGY_RAW.get(rawp,f'unknown:{rawp}')
        }
        units.append(rec);comp[rec['class_name']]+=1;strats[rec['strategy_name']]+=1
    fo={'formation_id':fid,'raw_length':len(s),'units':units,
        'composition':{CLASS[i]:comp[CLASS[i]] for i in range(1,9)},
        'strategy_counts':dict(strats)}
    formations.append(fo);formation_by_id[fid]=fo
with open(os.path.join(OUT,'formations','formations_all.json'),'w',encoding='utf-8') as f:
    json.dump(formations,f,ensure_ascii=False,indent=2)
with open(os.path.join(OUT,'formations','formation_units.csv'),'w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['formation_id','index','slot','raw_record','x_code','y_code','world_x','world_y','class_code','class_name','strategy_raw','strategy_name'])
    for fo in formations:
        for u in fo['units']:
            w.writerow([fo['formation_id'],u['index'],u['slot'],u['raw_record'],u['x_code'],u['y_code'],u['world_x'],u['world_y'],u['class_code'],u['class_name'],u['strategy_raw'],u['strategy_name']])
with open(os.path.join(OUT,'formations','formation_compositions.csv'),'w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['formation_id']+[CLASS[i] for i in range(1,9)]+['total'])
    for fo in formations:
        c=fo['composition'];vals=[c[CLASS[i]] for i in range(1,9)];w.writerow([fo['formation_id'],*vals,sum(vals)])

# ---------- pstch exact direct assignments ----------
_,pstch=find_fn('pstch')
lines=decompile(pstch['actions'],pstch['parameters'])
branch={}
for off,line in lines:
    m=re.match(r'IF \(parseFloat\(r1\.efm\) === (\d+)\) -> (\d+)',line)
    if m: branch[int(m.group(1))]=int(m.group(2))
# parse assignments by branch until branch's terminal jump (or next branch code range doesn't matter due direct range)
all_line_map=lines
famous_by_efm={}
assign_re=re.compile(r'r1\.a\.m(\d+)\.(nm|pw|df|kp|mp|s|ss|ac) = (.+)$')
for efm,start in sorted(branch.items()):
    units=defaultdict(dict)
    anomalies=[]
    for off,line in all_line_map:
        if off<start: continue
        # Branch ends at first jump to common tail 19854 or 19849 after start
        if off>=start and line.startswith('JUMP -> 19854'):
            break
        m=assign_re.match(line)
        if m:
            slot=int(m.group(1));prop=m.group(2);raw=m.group(3)
            try: value=ast.literal_eval(raw)
            except Exception:
                try:value=float(raw) if '.' in raw else int(raw)
                except:value=raw
            units[slot][prop]=value
    outunits=[]
    fo=formation_by_id.get(efm)
    for slot,props in sorted(units.items()):
        idx=slot-30
        base=fo['units'][idx] if fo and 0<=idx<30 else None
        rec={'efm':efm,'slot':f'm{slot}','index':idx,'name_raw':props.get('nm'),'name':props.get('nm','').strip() if isinstance(props.get('nm'),str) else props.get('nm')}
        if base:
            rec.update({k:base[k] for k in ['raw_record','world_x','world_y','class_code','class_name','strategy_raw','strategy_name']})
        rec.update({
            'combat_pw':props.get('pw'),'defense_df':props.get('df'),'skill_kp':props.get('kp'),'hp_mp':props.get('mp'),'foot_s':props.get('s'),
            'technique_code':props.get('ac'),'technique_name':TECH.get(props.get('ac')) if isinstance(props.get('ac'),int) else None,
            'special_codes_raw':props.get('ss')
        })
        missing=[x for x in ['nm','pw','df','kp','mp','s','ac'] if x not in props]
        if missing: rec['missing_direct_assignments']=missing
        outunits.append(rec)
    famous_by_efm[str(efm)]=outunits
with open(os.path.join(OUT,'famous','famous_units_by_efm.json'),'w',encoding='utf-8') as f:
    json.dump(famous_by_efm,f,ensure_ascii=False,indent=2)
with open(os.path.join(OUT,'famous','famous_units.csv'),'w',encoding='utf-8-sig',newline='') as f:
    fields=['efm','slot','index','name','world_x','world_y','class_code','class_name','strategy_raw','strategy_name','combat_pw','defense_df','skill_kp','hp_mp','foot_s','technique_code','technique_name','special_codes_raw','missing_direct_assignments']
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
    for efm,us in famous_by_efm.items():
        for u in us:
            row={k:u.get(k) for k in fields}
            if isinstance(row.get('missing_direct_assignments'),list):row['missing_direct_assignments']='|'.join(row['missing_direct_assignments'])
            w.writerow(row)

# ---------- map topology/stage rules ----------
# Exact strings from mpst constant pool (SWF).
cat_strings={
1:'#x9y5#x6y0#x7y0#x8y0#x9y0#x10y0#x6y1#x7y1#x8y1#x9y1#x7y2#x8y2#x9y6#x8y6#x0y7#x0y8#x0y9#x1y8#x1y9#x3y16#x4y16#x5y16#x6y15#x6y16#x7y16#x9y13#x10y12#x9y14#x10y14#x10y15#x11y15#x10y16#x11y16#x9y16#x8y16#x12y16#x13y16#x14y16#',
2:'#x0y13#x11y4#x5y3#',
3:'#x6y10#x6y11#x16y5#x14y13#x16y16#',
4:'#x4y1#x9y2#x4y5#x15y0#x13y5#x2y9#x0y4#x0y15#x4y14#x9y15#x11y10#x13y14#x16y10#',
5:'#x1y5#x5y8#x8y12#x12y10#x14y14#x15y3#x4y12#x7y3#x16y6#x12y0#',
6:'#x4y10#x1y1#x10y10#x11y1#x16y15#x16y8#x0y12#x12y7#x16y0#x7y14#',
7:'#x9y7#x3y2#x14y1#x13y13#x3y8#x6y7#x16y12#'}
def pts(s):return [(int(x),int(y)) for x,y in re.findall(r'x(\d+)y(\d+)',s)]
cat_pts={k:pts(v) for k,v in cat_strings.items()}
CATEGORY={0:'織田家・雑軍（通常地点）',1:'通常戦闘地点から除外される地形/非通常セル',2:'鉄砲鍛造所',3:'忍の里',4:'繁華街',5:'兵学舎',6:'武家屋敷',7:'攻略目標の敵城'}

# name/efm/lv from exact mpcm decompilation already verified.
named={
(0,13):('雑賀衆',106,6),(5,3):('稲富流砲術隊',107,4),(11,4):('国友鉄砲隊',98,3),
(6,11):('伊賀藤林忍軍',103,2),(6,10):('伊賀百地忍軍',104,5),(14,13):('服部半蔵軍',108,4),(16,16):('風魔忍軍',105,6),(16,5):('透波衆',121,3),
(15,0):('前田慶次郎軍',118,6),(2,9):('堺衆',120,4),(0,4):('宮本武蔵軍',119,5),(9,15):('九鬼水軍',101,2),
(4,12):('松永久秀軍',102,5),(1,5):('宇喜多秀家軍',112,2),(12,0):('一向一揆',122,6),(14,14):('本多正信軍',109,4),(5,8):('足利義昭軍',113,3),(15,3):('姉小路頼綱軍',99,2),(16,6):('真田昌幸軍',116,5),
(16,15):('北条氏政軍',111,3),(16,8):('武田勝頼軍',110,4),(16,0):('上杉景勝軍',114,6),(1,1):('毛利輝元軍',115,5),(4,10):('筒井順慶軍',100,2),
(9,7):('織田信長軍',128,9),(3,2):('羽柴秀吉軍',127,8),(13,13):('徳川家康軍',126,7),(14,1):('柴田勝家軍',125,6),(6,7):('明智光秀軍',124,5),(16,12):('滝川一益軍',117,4),(3,8):('丹羽長秀軍',123,3)
}
# generic level overrides per category, exact from mpcm analysis
cat4_lv={ (0,15):3,(11,10):3,(13,14):3,(16,10):3,(4,5):3,(13,5):4,(4,1):4,(9,2):4,(4,14):2 }
cat5_lv={ (12,10):3,(7,3):4,(8,12):2 }
cat6_lv={ (7,14):1,(12,7):3,(0,12):3,(11,1):4,(10,10):2 }

allcat={p:k for k,ps in cat_pts.items() for p in ps}
map_points=[]
for y in range(17):
    for x in range(17):
        p=(x,y); cat=allcat.get(p,0)
        rec={'x':x,'y':y,'map_key':f'x{x}y{y}','category_code':cat,'category_name':CATEGORY[cat]}
        if cat==1:
            rec.update({'battle_kind':'excluded','selectable_battle':False})
        elif p==(8,8):
            rec.update({'battle_kind':'special_locked','name':'裏戦国','formation_id':129,'level':10,'elv':40,'unlock_condition':'clrmap contains X#9#7X','selectable_battle':True})
        elif p==(8,10):
            rec.update({'battle_kind':'training','name':'修行場','formation_id':24,'level':10,'elv':40,'selectable_battle':False,'special_flag':'skskbt=1'})
        elif p in named:
            nm,efm,lv=named[p];rec.update({'battle_kind':'named','name':nm,'formation_id':efm,'level':lv,'elv':lv*5-10,'selectable_battle':True})
        elif cat==0:
            d=max(abs(y-7),abs(x-9));lv=1 if d>5 else 7-d
            if p==(9,8):lv=7
            rec.update({'battle_kind':'generic','name':'織田家・雑軍','formation_pool':'1..38 (uniform via floor(random*38)+1)','level':lv,'elv':lv*5-10,'selectable_battle':True,'level_rule':'d=max(|y-7|,|x-9|); d>5=>Lv1 else Lv=7-d; x9y8 forced Lv7'})
        elif cat==4:
            lv=cat4_lv.get(p,2);rec.update({'battle_kind':'generic','name':'繁華街','formation_pool':'17..21 (uniform via floor(random*5)+17)','level':lv,'elv':lv*5-10,'selectable_battle':True})
        elif cat==5:
            lv=cat5_lv.get(p,2);rec.update({'battle_kind':'generic','name':'兵学舎','formation_id':38,'level':lv,'elv':lv*5-10,'selectable_battle':True})
        elif cat==6:
            lv=cat6_lv.get(p,2);rec.update({'battle_kind':'generic','name':'武家屋敷','formation_pool':'12..16 (uniform via floor(random*5)+12)','level':lv,'elv':lv*5-10,'selectable_battle':True})
        else:
            # categories 2,3,7 are all named and should have been captured above
            rec.update({'battle_kind':'unresolved','selectable_battle':None})
        map_points.append(rec)
with open(os.path.join(OUT,'map','map_points_all.json'),'w',encoding='utf-8') as f:json.dump(map_points,f,ensure_ascii=False,indent=2)
with open(os.path.join(OUT,'map','map_points_all.csv'),'w',encoding='utf-8-sig',newline='') as f:
    fields=['x','y','map_key','category_code','category_name','battle_kind','name','formation_id','formation_pool','level','elv','selectable_battle','unlock_condition','special_flag','level_rule']
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader();
    for r in map_points:w.writerow({k:r.get(k) for k in fields})

stage_rules={
    'source_functions':['mpst','mpcm'],
    'grid':'17x17 coordinates x=0..16,y=0..16',
    'categories':CATEGORY,
    'category_coordinate_lists':{str(k):[f'x{x}y{y}' for x,y in v] for k,v in cat_pts.items()},
    'generic_rules':{
        'plain':{'label':'織田家・雑軍','formation_pool':[1,38],'level':'Chebyshev distance from (9,7): d>5=>1 else 7-d; x9y8 forced 7'},
        '繁華街':{'formation_pool':[17,21],'default_level':2,'overrides':{f'x{x}y{y}':lv for (x,y),lv in cat4_lv.items()}},
        '兵学舎':{'formation_id':38,'default_level':2,'overrides':{f'x{x}y{y}':lv for (x,y),lv in cat5_lv.items()}},
        '武家屋敷':{'formation_pool':[12,16],'default_level':2,'overrides':{f'x{x}y{y}':lv for (x,y),lv in cat6_lv.items()},'source_note':'mpcm bytecode contains a duplicate x12y7 check; first branch sets Lv3, so later duplicate is unreachable.'}
    },
    'level_adjustment':'elv = level*5 - 10',
    'special_points':{'x8y8':'裏戦国 formation129, internal level10/elv40, unlocked after final-castle progression condition','x8y10':'修行場 formation24, internal level10/elv40, skskbt=1'}
}
with open(os.path.join(OUT,'map','stage_rules.json'),'w',encoding='utf-8') as f:json.dump(stage_rules,f,ensure_ascii=False,indent=2)

# ---------- stage joined package for named points ----------
named_stages=[]
for (x,y),(nm,efm,lv) in sorted(named.items(), key=lambda kv:(kv[1][2],kv[1][1])):
    fo=formation_by_id[efm]
    fam=famous_by_efm.get(str(efm),[])
    named_stages.append({'map_key':f'x{x}y{y}','x':x,'y':y,'name':nm,'formation_id':efm,'level':lv,'elv':lv*5-10,'composition':fo['composition'],'strategy_counts':fo['strategy_counts'],'famous_units':fam,'units':fo['units']})
with open(os.path.join(OUT,'map','named_stages_full.json'),'w',encoding='utf-8') as f:json.dump(named_stages,f,ensure_ascii=False,indent=2)

# Famous joined stage CSV includes stage names
stage_by_efm={v[1]:(f'x{k[0]}y{k[1]}',v[0],v[2]) for k,v in named.items()}
with open(os.path.join(OUT,'famous','famous_units_with_stage.csv'),'w',encoding='utf-8-sig',newline='') as f:
    fields=['stage_name','map_key','level','efm','slot','index','name','class_name','strategy_name','world_x','world_y','combat_pw','defense_df','skill_kp','hp_mp','foot_s','technique_code','technique_name','special_codes_raw','missing_direct_assignments']
    w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
    for efm_s,us in famous_by_efm.items():
        efm=int(efm_s); meta=stage_by_efm.get(efm,(None,None,None))
        for u in us:
            row={'stage_name':meta[1],'map_key':meta[0],'level':meta[2]}
            for k in fields:
                if k in u:row[k]=u[k]
            row['efm']=efm
            if isinstance(row.get('missing_direct_assignments'),list):row['missing_direct_assignments']='|'.join(row['missing_direct_assignments'])
            w.writerow(row)

# anomalies direct assignments
anoms=[]
for efm_s,us in famous_by_efm.items():
    for u in us:
        if u.get('missing_direct_assignments'):
            anoms.append({'efm':int(efm_s),'slot':u['slot'],'name':u.get('name'),'missing':u['missing_direct_assignments'],'note':'Direct pstch assignments missing in recovered SWF; preserve as source anomaly, do not silently invent value.'})
with open(os.path.join(OUT,'validation','pstch_anomalies.json'),'w',encoding='utf-8') as f:json.dump(anoms,f,ensure_ascii=False,indent=2)

# ---------- generation known exact rules ----------
# Extract exact class/tech arrays from SWF root initialisation.
name_prefix=['恒','赤','青','鉄','若','銀','空','朝','明','海','月','金','徳','優','勇','敬','啓','慶','岳','利','峯','芳','家','菊','繁','梵','源','盛','敦','綱','佐','甚','紀','弁','善','常','丞','純','夜','力','豆','河','猛','久','将','枯','冬','秋','夏','春','甲','伊','稲','潤','淳','純','鯨','遼','亮','凌','駿','剣','楽','猿','酒','米','丈','笹','竹','裕','夢','国','官','勘','犬','寅','小','真','知','地','栄','英','良','京','賢','禅','貞','総','岩','和','房','邦','広','幸','俊','成','有','定','弘','昌','実','満','智','武','直','守','秀','宗','行','光','十','万','千','道','泰','義','晴','元','九','重','鬼','景','松','長','信','清','友','馬','虎','又','鶴','才','権','陣','仁','安','与','礼','柳','隆','雷','頼','庸','悠','雄','祐','茂','弥','祭','宝','豊','穂','風','飛','竜','辰','沓','藤','丑','半','忠','保','早','惣','草','政','勝','庄','正','康','孝','喜','亀','喜','午','吾','田']
name_suffix=['郎太','之進','吉郎','之助','兵衛','衛門','千代','九郎','八郎','六郎','五郎','四郎','志郎','三郎','次郎','太郎','之進','兵太','ノ介','平','丸','市','壱','冶','八','三','次','太','介','輔','助','平太','造','吉','蔵','作']
name_rules={'prefix_pool':name_prefix,'suffix_pool':name_suffix,'prefix_count':len(name_prefix),'suffix_count':len(name_suffix),'selection':{
    '武将・軍師・騎馬':{'class_codes':[3,5,8],'suffix':'75% index17..35; else 75% of remainder index0..17; else full0..35','absolute_probabilities':{'17..35_pool':0.75,'0..17_pool':0.1875,'0..35_pool':0.0625}},
    'その他':{'class_codes':[1,2,4,6,7],'suffix':'75% index0..17; else full0..35','absolute_probabilities':{'0..17_pool':0.75,'0..35_pool':0.25}}}}
with open(os.path.join(OUT,'generation','generic_name_generation.json'),'w',encoding='utf-8') as f:json.dump(name_rules,f,ensure_ascii=False,indent=2)

base_ranges={
1:{'class':'足軽','foot':[2,4],'combat':[40,59],'hp':[30,49],'defense':[30,49],'skill':[30,49],'default_technique':1},
2:{'class':'弓兵','foot':[2,4],'combat':[20,39],'hp':[30,49],'defense':[20,39],'skill':[30,49],'default_technique':2},
3:{'class':'武将','foot':[2,4],'combat':[30,49],'hp':[30,49],'defense':[65,79],'skill':[30,49],'default_technique':14},
4:{'class':'猛者','foot':[2,4],'combat':[65,79],'hp':[45,59],'defense':[30,49],'skill':[30,49],'default_technique':11},
5:{'class':'軍師','foot':[2,3],'combat':[10,19],'hp':[20,34],'defense':[30,49],'skill':[30,49],'default_technique':'random 6 or 7'},
6:{'class':'鉄砲','foot':[1,2],'combat':[10,19],'hp':[20,39],'defense':[20,39],'skill':[30,49],'default_technique':4},
7:{'class':'忍者','foot':[4,5],'combat':[65,79],'hp':[15,19],'defense':[65,79],'skill':[30,49],'default_technique':12},
8:{'class':'騎馬','foot':[5,6],'combat':[85,104],'hp':[50,54],'defense':[15,19],'skill':[55,64],'default_technique':26}}
level_table={lv:{'elv':lv*5-10} for lv in range(1,11)}
stat_rules={'source_function':'chpr(u, dfstp)','base_rolls':base_ranges,'level_adjustment':{
    'formula':'elv = level*5 - 10','table':level_table,'applied_to':['combat_pw','defense_df','skill_kp'],'hp':'hp_mp += elv except class 7 (忍者)','caps':{'combat_non_cavalry':110,'combat_cavalry':125,'defense':110,'skill':110,'hp':110},'cavalry_hp_special':'After general adjustments, if class8 hp>90 then hp=80+floor(random*15), i.e. 80..94.'},
    'warning':'Base rolls are BEFORE class-specific random bonus blocks and technique selection. Use chpr bytecode for exact final generation; do not mistake these for final recruit ranges.'}
with open(os.path.join(OUT,'generation','stat_generation_rules.json'),'w',encoding='utf-8') as f:json.dump(stat_rules,f,ensure_ascii=False,indent=2)

tech_rules={
 'source_function':'chpr(u, dfstp)','technique_code_map':TECH,
 'condition_note':'Rare gates below are exact bytecode comparisons, but some are gated by root fmdat != "n". Verify active battle-flow fmdat state before treating these as unconditional encounter probabilities.',
 'class_rules':{
   '足軽':{'default':1,'rare':[{'condition':'fmdat != n and random*400 > 398','set':21}]},
   '弓兵':{'default':2,'rare_gate':'fmdat != n and random*300 > 287','inside':'second random*100 > 30 => ac15, else ac16'},
   '武将':{'default':14,'overrides':[{'condition':'fmdat != n and random*400 > 398','set':22},{'condition':'fmdat != n and random*1800 > 1798','set':24,'note':'later independent override'}]},
   '猛者':{'default':11,'overrides':[{'condition':'random*100 > 75','set':23},{'condition':'fmdat != n and random*500 > 498','set':25,'note':'later override'}]},
   '軍師':{'default':'floor(random*2)+6 => 6 or 7','known_overrides':[{'condition':'fmdat != n and random*100 > 97','set':19},{'condition':'fmdat != n and random*300 > 297','set':18}], 'warning':'Additional later class-5 technique transformations exist in chpr and must be preserved from source when porting; this summary is not a full probability table.'},
   '鉄砲':{'default':4,'known_override':[{'condition':'fmdat != n and random*300 > 298','set':17}], 'warning':'Additional later class-6 assignment exists; source bytecode remains authoritative.'},
   '忍者':{'default':12,'sequential_overrides':[{'condition':'fmdat != n and random*100 > 87','set':13},{'condition':'fmdat != n and random*200 > 198','set':20},{'condition':'fmdat != n and random*200 > 198','set':27}]},
   '騎馬':{'fixed':26}
 }}
with open(os.path.join(OUT,'generation','technique_generation_rules.json'),'w',encoding='utf-8') as f:json.dump(tech_rules,f,ensure_ascii=False,indent=2)

# Arrays proof extracted from root initializer
with open(os.path.join(OUT,'generation','code_maps.json'),'w',encoding='utf-8') as f:
    json.dump({'class_codes':CLASS,'technique_codes':TECH,'strategy_raw_codes':STRATEGY_RAW},f,ensure_ascii=False,indent=2)

# summary stats
n_famous=sum(len(v) for v in famous_by_efm.values())
summary={'formation_ids':len(formations),'formation_id_ranges':['1..38','98..130'],'named_map_stages':len(named),'famous_direct_records':n_famous,'pstch_anomaly_count':len(anoms),'map_cells':len(map_points),'map_battle_kind_counts':dict(Counter(r['battle_kind'] for r in map_points))}
with open(os.path.join(OUT,'validation','extraction_summary.json'),'w',encoding='utf-8') as f:json.dump(summary,f,ensure_ascii=False,indent=2)
print(json.dumps(summary,ensure_ascii=False,indent=2))
print('anomalies',anoms[:10])

# ---------- runtime setup override (shk) ----------
# Exact short-circuit condition decoded from sprite:2456 shk offsets 4012..4248.
runtime_override={
 'source':'sprite:2456 function shk, offsets ~4012..4248',
 'plain_high_level_cavalry_conversion':{
   'condition_all':['skskbt != 1','tklv > 3','mppt == 0','internal p == 2 OR internal p == 11','Math.random()*100 > 90','efm != 129'],
   'raw_strategy_equivalent':['raw P=1 突撃 -> internal p=2','raw P=0 乱戦 -> raw0 converted to10 then incremented -> internal p=11'],
   'effect':['p = 2 (突撃)','ch = 8 (騎馬)'],
   'probability_per_eligible_slot':0.10,
   'scope_note':'Only mppt==0 ordinary/plain battles. Named bases have mppt 2..7, so their fmdt class composition is not altered by this conversion.',
   'important':'fmdt composition is the base formation. Ordinary Lv4+ plain battles can have eligible 突撃/乱戦 slots converted to 騎馬 at runtime.'
 }}
with open(os.path.join(OUT,'generation','battle_setup_overrides.json'),'w',encoding='utf-8') as f:json.dump(runtime_override,f,ensure_ascii=False,indent=2)

# Add eligible counts for formations 1..38
plain_override_rows=[]
for fid in range(1,39):
    fo=formation_by_id[fid]
    eligible=[u for u in fo['units'] if u['strategy_raw'] in (0,1)]
    plain_override_rows.append({'formation_id':fid,'eligible_slots':len(eligible),'eligible_slot_ids':[u['slot'] for u in eligible], 'expected_cavalry_conversions_at_lv4plus':len(eligible)*0.10})
with open(os.path.join(OUT,'formations','plain_lv4plus_cavalry_override.json'),'w',encoding='utf-8') as f:json.dump(plain_override_rows,f,ensure_ascii=False,indent=2)

# ---------- exact overall stat envelopes by level ----------
# Envelope across all random bonus branches, BEFORE/AFTER common level/cap rules.
pre={
1:{'class':'足軽','foot':[2,4],'combat':[40,107],'hp':[30,91],'defense':[30,96],'skill':[30,97]},
2:{'class':'弓兵','foot':[2,4],'combat':[20,156],'hp':[30,97],'defense':[20,87],'skill':[30,97]},
3:{'class':'武将','foot':[2,4],'combat':[30,127],'hp':[30,97],'defense':[65,177],'skill':[30,97]},
4:{'class':'猛者','foot':[2,4],'combat':[65,127],'hp':[45,107],'defense':[30,97],'skill':[30,97]},
5:{'class':'軍師','foot':[2,3],'combat':[10,77],'hp':[20,96],'defense':[30,127],'skill':[30,157]},
6:{'class':'鉄砲','foot':[1,2],'combat':[10,57],'hp':[20,91],'defense':[20,87],'skill':[30,97]},
7:{'class':'忍者','foot':[4,5],'combat':[65,117],'hp':[15,47],'defense':[65,127],'skill':[30,97]},
8:{'class':'騎馬','foot':[5,6],'combat':[85,162],'hp':[50,86],'defense':[15,37],'skill':[55,111]}}

def clamp_hi(lohi,add,cap):return [lohi[0]+add,min(lohi[1]+add,cap)]
def cav_hp_range(lohi,add):
    lo,hi=lohi[0]+add,lohi[1]+add
    hi=min(hi,110)
    candidates=[]
    if lo<=90: candidates.append((lo,min(hi,90)))
    if hi>90: candidates.append((80,94))
    return [min(a for a,b in candidates),max(b for a,b in candidates)]
level_ranges=[]
for lv in range(1,11):
    elv=lv*5-10
    for ch,r in pre.items():
        combat=clamp_hi(r['combat'],elv,125 if ch==8 else 110)
        defense=clamp_hi(r['defense'],elv,110)
        skill=clamp_hi(r['skill'],elv,110)
        if ch==7:hp=r['hp'][:]
        elif ch==8:hp=cav_hp_range(r['hp'],elv)
        else:hp=clamp_hi(r['hp'],elv,110)
        level_ranges.append({'level':lv,'elv':elv,'class_code':ch,'class_name':r['class'],'foot_min':r['foot'][0],'foot_max':r['foot'][1],
                             'combat_min':combat[0],'combat_max':combat[1],'hp_min':hp[0],'hp_max':hp[1],
                             'defense_min':defense[0],'defense_max':defense[1],'skill_min':skill[0],'skill_max':skill[1]})
with open(os.path.join(OUT,'generation','final_stat_envelopes_by_level.json'),'w',encoding='utf-8') as f:json.dump({'definition':'Exact min/max envelope across all chpr random branches; an interval envelope does not assert every integer between min/max has equal/nonzero probability. Famous-unit pstch overrides are separate.', 'pre_level_bonus_envelopes':pre,'rows':level_ranges},f,ensure_ascii=False,indent=2)
with open(os.path.join(OUT,'generation','final_stat_envelopes_by_level.csv'),'w',encoding='utf-8-sig',newline='') as f:
    fields=list(level_ranges[0].keys());w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(level_ranges)

# ---------- exact final generic technique probabilities for normal fmdat != 'n' flow ----------
from collections import defaultdict as DD
probs={}
probs[1]={1:.995,21:.005}
prare=13/300
probs[2]={2:.4*.5 + .6*(1-prare),3:.4*.5,15:.6*prare*.7,16:.6*prare*.3}
p22=2/400;p24=2/1800
probs[3]={24:p24,22:p22*(1-p24),14:(1-p22)*(1-p24)}
p23=25/100;p25=2/500
probs[4]={25:p25,23:p23*(1-p25),11:(1-p23)*(1-p25)}
init={6:0.5*0.97*0.99,7:0.5*0.97*0.99,19:0.03*0.99,18:0.01}
a=2/1800;b=2/1400
cx=DD(float);cx[10]+=b;cx[24]+=(1-b)*a
for ac in [6,7,8,9]:cx[ac]+=(1-b)*(1-a)/4
down=DD(float)
for ac in [6,7,8]:down[ac]+=.85/3
for k,v in cx.items():down[k]+=.15*v
p5=DD(float)
for k,v in init.items():p5[k]+=.94*v
for k,v in down.items():p5[k]+=.06*v
probs[5]=dict(p5)
p17=2/300
probs[6]={4:.4*.5+.6*(1-p17),5:.4*.5,17:.6*p17}
p13=13/100;p20=2/200;p27=2/200
probs[7]={27:p27,20:p20*(1-p27),13:p13*(1-p20)*(1-p27),12:(1-p13)*(1-p20)*(1-p27)}
probs[8]={26:1.0}
prob_rows=[]
for ch,d in probs.items():
    for ac,p in sorted(d.items()):prob_rows.append({'class_code':ch,'class_name':CLASS[ch],'technique_code':ac,'technique_name':TECH[ac],'probability':p,'percent':p*100})
with open(os.path.join(OUT,'generation','technique_probabilities_normal_battle.json'),'w',encoding='utf-8') as f:
    json.dump({'condition':'Final generic technique probabilities derived from chpr control flow when fmdat != "n". Later technique assignments overwrite earlier ones exactly as AVM1 does.','rows':prob_rows},f,ensure_ascii=False,indent=2)
with open(os.path.join(OUT,'generation','technique_probabilities_normal_battle.csv'),'w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=prob_rows[0].keys());w.writeheader();w.writerows(prob_rows)

# Full technique rule document, including the fresh fmdat=="n" sentinel path.
probs_n={
  1:{1:1.0},
  2:{2:0.8,3:0.2},
  3:{14:1.0},
  4:probs[4].copy(),
  5:{6:0.5,7:0.5},
  6:{4:0.8,5:0.2},
  7:{12:1.0},
  8:{26:1.0},
}
def prob_doc(d):
    return {str(ch):[
        {'code':ac,'name':TECH[ac],'probability':pr,'percent':pr*100}
        for ac,pr in sorted(vals.items())
    ] for ch,vals in d.items()}
tech_rules_full={
 'source_function':'chpr(u, dfstp)',
 'technique_code_map':TECH,
 'comparison_note':'Flash Math.random() is treated as [0,1); e.g. random*400 > 398 has probability 2/400 = 0.5%.',
 'normal_battle_condition':'The main probability table assumes fmdat != "n". sttnm() later serializes active unit data into fmdat; a fresh/empty fmdat path suppresses several rare-technique gates.',
 'classes':{
   '1 足軽':['start ac=1 槍撃','if random*400>398 AND fmdat!=n => ac=21 槍術'],
   '2 弓兵':['start ac=2 弓矢','rare gate random*300>287 AND fmdat!=n: second random*100>30 => ac15 火矢, else ac16 焙烙','if main high-stat gate random*100>60 succeeds, later ac=floor(random*2)+2 => ac2 弓矢 or ac3 遠射, overwriting any earlier rare technique'],
   '3 武将':['start ac14 号令','random*400>398 AND fmdat!=n => ac22 豪傑','later independent random*1800>1798 AND fmdat!=n => ac24 治癒, overriding earlier result'],
   '4 猛者':['start ac11 旋風','random*100>75 => ac23 無双','later random*500>498 => ac25 鬼神, overriding earlier result'],
   '5 軍師':['start ac=floor(random*2)+6 => 火遊/ac6 or 火攻/ac7','random*100>97 AND fmdat!=n => ac19 虚報','later random*300>297 AND fmdat!=n => ac18 妖術 (overrides)','if high-stat gate random*100>60 succeeds, then nested random*100>85 AND fmdat!=n => ac=random 6..8','inside that nested branch, another random*100>85 => ac=random 6..9; then random*1800>1798 may set ac24 治癒; then later random*1400>1398 may set ac10 炎術, overriding ac24'],
   '6 鉄砲':['start ac4 射撃','random*300>298 AND fmdat!=n => ac17 砲撃','if high-stat gate random*100>60 succeeds, later ac=floor(random*2)+4 => ac4 射撃 or ac5 狙撃, overwriting the earlier砲撃'],
   '7 忍者':['start ac12 忍術','random*100>87 AND fmdat!=n => ac13 影走','later random*200>198 AND fmdat!=n => ac20 幻術','later random*200>198 AND fmdat!=n => ac27 結界; later assignments override earlier ones'],
   '8 騎馬':['ac26 騎突 fixed']
 },
 'final_probabilities_when_fmdat_active':prob_doc(probs),
 'final_probabilities_when_fmdat_is_n':prob_doc(probs_n)
}
with open(os.path.join(OUT,'generation','technique_generation_rules.json'),'w',encoding='utf-8') as f:
    json.dump(tech_rules_full,f,ensure_ascii=False,indent=2)

# ---------- named-stage technique deterministic/expected counts ----------
tech_expect=[]
for st in named_stages:
    fam_by_slot={u['slot']:u for u in st['famous_units']}
    expected=DD(float);fixed=Counter();random_slots=0
    for u in st['units']:
        fu=fam_by_slot.get(u['slot'])
        if fu and fu.get('technique_code') is not None:
            expected[fu['technique_code']]+=1;fixed[fu['technique_code']]+=1
        else:
            random_slots+=1
            for ac,p in probs[u['class_code']].items():expected[ac]+=p
    for ac in sorted(expected):
        tech_expect.append({'stage_name':st['name'],'map_key':st['map_key'],'level':st['level'],'formation_id':st['formation_id'],
                            'technique_code':ac,'technique_name':TECH[ac],'fixed_famous_count':fixed[ac],
                            'expected_total_count_including_generic':expected[ac],'randomly_generated_slots':random_slots})
with open(os.path.join(OUT,'map','named_stage_technique_expectations.csv'),'w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=tech_expect[0].keys());w.writeheader();w.writerows(tech_expect)
with open(os.path.join(OUT,'map','named_stage_technique_expectations.json'),'w',encoding='utf-8') as f:
    json.dump({'warning':'Generic soldiers receive techniques randomly via chpr, so technique counts are not fixed. expected_total_count is an expectation under normal fmdat != n generation, not an exact per-battle count. fixed_famous_count is deterministic except recovered-SWF assignment anomalies.','rows':tech_expect},f,ensure_ascii=False,indent=2)

# ---------- decompiled chpr evidence ----------
chpr_lines=decompile(find_fn('chpr')[1]['actions'],find_fn('chpr')[1]['parameters'])
with open(os.path.join(OUT,'raw','chpr_decompiled_relevant.txt'),'w',encoding='utf-8') as f:
    f.write('SWF AVM1 chpr(u, dfstp) decompiler output. This is evidence/reference; UNKNOWN/UNHANDLED lines should not be treated as source-level AS syntax.\n\n')
    for off,line in chpr_lines:f.write(f'{off:05d} {line}\n')

# ---------- provenance/readme ----------
readme=f'''# 戦国じゃんぶる 本家SWF 敵軍・兵生成データ抽出（full work）\n\nSource: recovered `sgjbgm.swf` / AVM1.\n\n## 確定した主要構造\n- `mpst()` : 17×17全体マップ上の拠点カテゴリ座標\n- `mpcm()` : 各座標の敵軍名・formation id (`efm`)・Lv、`elv = Lv*5-10`\n- `fmdt()` : formation idごとの180桁固定文字列 = 30人×6桁 `XX YY class strategyRaw`\n- 戦闘セットアップ `shk()` : `worldX=1833-XX*36`, `worldY=YY*36`; raw strategyを内部stateへ変換\n- `chpr()` : 一般兵の名前・技種・能力・特殊能力の乱数生成\n- `pstch()` : 有名兵の固定上書き\n\n## 重要な注意\n### named stageの兵種構成\n拠点カテゴリ2～7（有名軍を含む）は `mppt != 0` のため、今回確認した平地用騎馬差し替えの対象外。`fmdt` の30人兵種構成を固定編成として扱えます。\n\n### 普通の平地 Lv4以上\n`shk()` に後処理があります。`mppt==0 && tklv>3` の通常平地では、raw作戦が突撃(1)または乱戦(0)のslotについて10%で `ch=8` 騎馬、`p=2` 突撃へ変換されます（裏戦国efm129は除外）。したがって平地の最終兵種人数は完全固定ではありません。\n\n### 技種人数\n有名兵の直接指定分は固定。一方、雑兵は `chpr()` で技種を抽選するため、ステージの「技種○人」は通常は固定値ではありません。`named_stage_technique_expectations.*` は期待値です。\n\n### pstchの原版バグ/異常\n`pstch()` には少なくとも2箇所、技種代入先slotが不自然な箇所があります。`validation/pstch_anomalies.json` を参照。値を推測補完せず、Recovered SWFの挙動として保存しています。\n\n## ファイル\n- `map/map_points_all.*` : 全289座標\n- `map/named_stages_full.json` : 31有名ステージ、30slot配置＋有名兵\n- `map/named_stage_technique_expectations.*` : 固定有名技種＋雑兵抽選の期待人数\n- `formations/formations_all.json` : 71 formation IDs\n- `formations/formation_units.csv` : 全slot座標・兵種・作戦\n- `famous/famous_units_with_stage.csv` : 有名兵一覧\n- `generation/generic_name_generation.json` : 雑兵名生成\n- `generation/final_stat_envelopes_by_level.*` : Lv1～10の一般兵最終能力min/max envelope\n- `generation/technique_probabilities_normal_battle.*` : 通常 `fmdat != n` 時の最終技種確率\n- `generation/battle_setup_overrides.json` : 平地高Lv騎馬差し替え\n- `raw/fmdt_strings.json`, `raw/chpr_decompiled_relevant.txt` : 検証用根拠\n\n## 件数\n- formation IDs: {len(formations)}\n- named stages: {len(named_stages)}\n- famous direct records: {n_famous}\n- map cells: 289\n'''
with open(os.path.join(OUT,'README.md'),'w',encoding='utf-8') as f:f.write(readme)

# update summary
summary.update({'technique_probability_rows':len(prob_rows),'stat_level_rows':len(level_ranges),'plain_override_formations':38})
with open(os.path.join(OUT,'validation','extraction_summary.json'),'w',encoding='utf-8') as f:json.dump(summary,f,ensure_ascii=False,indent=2)
print('extended',json.dumps(summary,ensure_ascii=False))

# ---------- resolved named stage 30-slot view ----------
resolved=[]
for st in named_stages:
    fam={u['slot']:u for u in st['famous_units']}
    units=[]
    for base in st['units']:
        u=dict(base)
        fu=fam.get(base['slot'])
        if fu:
            u['unit_kind']='famous'
            u['famous']=fu
            if fu.get('technique_code') is None:
                u['technique_resolution']='No direct ac assignment in pstch; technique remains whatever chpr generated before pstch. See anomaly file.'
            else:
                u['technique_resolution']='fixed_by_pstch'
        else:
            u['unit_kind']='generic'
            u['name_resolution']='generated by chpr name pools'
            u['stats_resolution']='generated by chpr + stage elv'
            u['technique_resolution']='generated by chpr class technique probabilities'
            u['technique_probabilities']=[{'code':ac,'name':TECH[ac],'probability':p} for ac,p in sorted(probs[u['class_code']].items())]
        units.append(u)
    resolved.append({k:st[k] for k in ['map_key','x','y','name','formation_id','level','elv','composition','strategy_counts']} | {'units':units})
with open(os.path.join(OUT,'map','named_stages_resolved_30slots.json'),'w',encoding='utf-8') as f:json.dump(resolved,f,ensure_ascii=False,indent=2)

# ---------- explicit source anomalies ----------
anomaly_md='''# Recovered SWF source anomalies / version-sensitive points\n\n## pstch technique-slot anomalies\n\n### 徳川家康軍 (efm126)\nRecovered v144 bytecode performs:\n1. `m30` 徳川家康 `ac=24` (治癒)\n2. writes `m31` 本多忠勝 stats/ss\n3. then writes **`m30.ac=22` (豪傑)** instead of `m31.ac`\n\nTherefore final source behavior appears to overwrite 家康's technique to 豪傑 and leaves 本多忠勝's technique as the value previously generated by `chpr()`. This package does not silently correct the apparent typo.\n\n### 裏戦国 (efm129)\nFor `m50` 筧十蔵, recovered bytecode assigns name/stats/ss, then writes **`m51.ac=5`** rather than `m50.ac`. Thus 筧十蔵 lacks a direct `pstch` technique assignment and retains its pre-existing `chpr()` technique.\n\n## Archive/wiki differences\nCommunity tables are useful cross-checks but are observational and may represent another revision or corrected expectations. Recovered `sgjbgm.swf` v144 is treated as primary source for implementation.\n'''
with open(os.path.join(OUT,'validation','source_anomalies.md'),'w',encoding='utf-8') as f:f.write(anomaly_md)

# reproducibility helper
import shutil
shutil.copy2('/mnt/data/tmp_sgj/build_stage_full.py',os.path.join(OUT,'raw','build_stage_full.py'))
print('resolved package additions done')
