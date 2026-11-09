"""Build the original research release and approved supplemental additions without converting unknowns into terms."""
import argparse
import collections, copy, datetime, json, re
from urllib.parse import urlsplit
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
read = lambda p: json.loads((ROOT/p).read_text())
def utc_instant(value):
    instant=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
    if instant.tzinfo is None: raise argparse.ArgumentTypeError(f'{value!r} needs a UTC offset, e.g. 2026-10-30T05:14:23Z')
    return instant.astimezone(datetime.timezone.utc)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--as-of',type=utc_instant,help="Judge deadlines as of this ISO 8601 instant instead of now. A catalog's compiledAt reproduces that catalog.")
args=parser.parse_args()
snapshot=read('research/source-funders.json')
directory_themes={t for f in snapshot['funds'] for t in f['sectors']}
expected=read('research/source-record-ids.json')
pilot=[r for p in sorted((ROOT/'research').glob('pilot-*.json')) for r in json.loads(p.read_text())]
expanded=[r for p in sorted((ROOT/'research').glob('expanded-[0-9].json')) for r in json.loads(p.read_text())]
if len(pilot)!=30 or len({r['sourceRecordId'] for r in pilot})!=30: raise ValueError('Original pilot identities must remain intact.')
records=pilot+expanded
if len(records)!=593 or sorted(r['sourceRecordId'] for r in records)!=sorted(expected): raise ValueError(f'Full research release requires all593 unique source IDs; found {len(records)} records.')
supplemental_manifest=read('research/supplemental-funders.json')
supplemental=supplemental_manifest['funds']
extra_ids=[row['fund']['id'] for row in supplemental]
if len(set(extra_ids))!=len(extra_ids) or set(extra_ids)&set(expected) or any(not re.fullmatch(r'local-[a-z0-9][a-z0-9-]*',i) for i in extra_ids):
    raise ValueError('Supplemental identities must be unique local IDs outside the baseline.')
for row in supplemental:
    if row['fund']['id']!=row['enrichment']['sourceRecordId'] or row['fund']['name']!=row['enrichment']['name']:
        raise ValueError('Supplemental identity mismatch.')
    snapshot['funds'].append(row['fund'])
    records.append(row['enrichment'])
catalog_ids=expected+extra_ids
lookup={r['sourceRecordId']:r for r in records}
for addition in supplemental_manifest.get('programAdditions',[]):
    target=lookup.get(addition['sourceRecordId'])
    if addition['sourceRecordId'] not in expected or target is None:
        raise ValueError('Program additions must target an original funder.')
    if any(p['id']==addition['program']['id'] for p in target['programs']):
        raise ValueError('Program additions cannot overwrite an existing program.')
    target['programs'].append(addition['program'])
    urls={s['url'] for s in target['sources']}
    for source in addition['sources']:
        if source['url'] not in urls:
            target['sources'].append(source)
            urls.add(source['url'])
pilot_ids={r['sourceRecordId'] for r in pilot}
warnings=[w for r in records for w in r.get('sourceWarnings',[])]
counts=collections.Counter()
coverage=[]
as_of=args.as_of or datetime.datetime.now(datetime.timezone.utc)
baseline_path=ROOT/'research/deepening-targets.json'
baseline=read('research/deepening-targets.json') if baseline_path.exists() else None
followups=[]
if baseline:
    audit_files=sorted((ROOT/'research').glob('deepening-review-[0-9].json'))
    audits=[json.loads(path.read_text()) for path in audit_files]
    if any(a['passId']!=baseline['passId'] or a['checkedOn']!=baseline['checkedOn'] for a in audits):
        raise ValueError('Follow-up audit belongs to another research pass.')
    followups=[row for audit in audits for row in audit['records']]
    target_ids=sorted(r['sourceRecordId'] for r in baseline['records'])
    if sorted(r['sourceRecordId'] for r in followups)!=target_ids:
        raise ValueError('Complete every targeted follow-up audit before generating a release.')
historical_followups={}
followup_history=[]
for directory in sorted((ROOT/'research/followup-history').glob('round-*')):
    historical=json.loads((directory/'research-followup.json').read_text())
    report_name=f'research-followup-{directory.name}.json'
    (ROOT/'dist/data'/report_name).write_bytes((directory/'research-followup.json').read_bytes())
    summary_keys=('passId','checkedOn','targetCount','previousResearchCounts','previousFieldCoverage','programReviewsAdded','sourcesRecovered','outcomes')
    followup_history.append({**{k:historical[k] for k in summary_keys},'reportUrl':'./data/'+report_name})
    for row in historical['records']:
        historical_followups[row['sourceRecordId']]=row
latest_followups={**historical_followups,**{r['sourceRecordId']:{'checkedOn':baseline['checkedOn'],**r} for r in followups}}
def upcoming_deadline(program):
    application=program['application']
    if application['route'] not in ('open','rolling','inquiry','restricted') or not application['closesOn']:
        return False
    if application['opensOn'] and application['opensOn']>as_of.date().isoformat():
        return False
    if application['deadlineInstant']:
        return datetime.datetime.fromisoformat(application['deadlineInstant'].replace('Z','+00:00'))>=as_of
    return application['closesOn']>=as_of.date().isoformat()
def award_note(p):
    a=p['award']
    if a['note']:return a['note']
    if a['min'] is None and a['max'] is None:return 'Award size not established'
    prefix='Historical ' if a['basis']=='historical' else ''
    if a['min'] is not None and a['max'] is not None:
        values=str(a['min']) if a['min']==a['max'] else str(a['min'])+'–'+str(a['max'])
    elif a['max'] is not None: values='up to '+str(a['max'])
    else: values='from '+str(a['min'])
    return prefix+(a['currency'] or '')+' '+values+(' · '+str(a['durationMonths'])+' months' if a['durationMonths'] is not None else '')

for fund in snapshot['funds']:
    for key in ['matches','screens','screenReasons','excludedProfiles']: fund.pop(key,None)
    r=copy.deepcopy(lookup[fund['id']])
    if r['name']!=fund['name']: raise ValueError('Research identity differs from original source: '+fund['id'])
    r.setdefault('reviewStatus','program_reviewed')
    r.setdefault('focus',[])
    r.setdefault('evidence',[])
    counts[r['reviewStatus']]+=1
    fund['enrichment']=r
    host=(urlsplit(fund.get('website','')).hostname or '').removeprefix('www.')
    fund['sourceWarnings']=[w for w in warnings if (urlsplit(w['url']).hostname or '').removeprefix('www.')==host] + r.get('sourceWarnings',[])
    fund['sourceWarnings']=list({w['url']:w for w in fund['sourceWarnings']}.values())
    fund['isPilot']=fund['id'] in pilot_ids
    if fund['access']=='mismatch': fund.update(access='unconfirmed',accessDetail='Current application access is unconfirmed. Review documented geographic focus.')
    reviewed=r['reviewStatus'] in ('program_reviewed','source_reviewed','not_a_funder') and bool(r['sources'])
    if reviewed:
        fund.update(description=r['summary'],descriptionBasis='primary',verifiedOn=r['researchedOn'],evidenceUrl=r['sources'][0]['url'],additionalSources=[s['url'] for s in r['sources'][1:]])
        if not fund['website']: fund['website']=r['sources'][0]['url']
    if r['programs']:
        access_order={'open':0,'rolling':1,'inquiry':2,'restricted':3,'relationship':4,'directory':5,'future':6,'unconfirmed':7,'unverified':8,'closed':9}
        def route_rank(p):
            route=p['application']['route']
            application=p['application']
            expired=(datetime.datetime.fromisoformat(application['deadlineInstant'].replace('Z','+00:00'))<as_of if application['deadlineInstant'] else bool(application['closesOn'] and application['closesOn']<as_of.date().isoformat()))
            if route in ('open','restricted','inquiry','rolling') and expired: route='closed'
            return access_order.get(route,8)
        p=min(r['programs'],key=route_rank)
        fund['displayProgramId']=p['id']
        fund.update(program=p['name'],access=p['application']['route'],accessDetail=p['application']['note'],amount=award_note(p),timing=p['application']['note'],deadlineDate=p['application']['closesOn'],deadlineInstant=p['application']['deadlineInstant'])
    elif reviewed:
        fund.update(program='',access='unconfirmed',accessDetail='Other funding resource; external grant route not verified.' if r['reviewStatus']=='not_a_funder' else 'Official overview checked; current application route and terms need confirmation.',amount='Award size not established',timing='No verified application deadline',deadlineDate=None,deadlineInstant=None)
    # Keep navigation at the established directory taxonomy; granular research
    # topics remain searchable in enrichment and feed the semantic corpus.
    fund['sectors']=list(dict.fromkeys(fund['sectors']+[t for t in r['themes'] if t in directory_themes]))
    fund['regions']=list(dict.fromkeys(fund['regions']+r['regions']))
    fields={
        'focus':bool(r['focus'] or any(p['focus'] for p in r['programs'])),
        'eligibility':any(p['applicants']['requirements'] or p['applicants']['types'] or p['applicants']['exclusions'] or (p['geography']['scope'] and not re.search(r'not (established|verified|published|stated)|unknown',p['geography']['scope'],re.I)) for p in r['programs']),
        'numericAward':any(p['award']['min'] is not None or p['award']['max'] is not None for p in r['programs']),
        'currentNumericAward':any(p['award']['basis']=='current_offer' and (p['award']['min'] is not None or p['award']['max'] is not None) for p in r['programs']),
        'datedDeadline':any(p['application']['closesOn'] for p in r['programs']),
        'upcomingDatedDeadline':any(upcoming_deadline(p) for p in r['programs']),
        'applicationRoute':any(p['application']['route'] not in ('unverified','unconfirmed') for p in r['programs'])}
    cached=ROOT/'.cache/enrichment'/(fund['id']+'.json')
    crawl=json.loads(cached.read_text()) if cached.exists() else None
    coverage.append({'sourceRecordId':fund['id'],'name':fund['name'],'reviewStatus':r['reviewStatus'],'checkedOn':r['researchedOn'],'sourceCount':len(r['sources']),'programCount':len(r['programs']),'fields':fields,'sources':[s['url'] for s in r['sources']], 'retrievals':[{k:a[k] for k in ('url','finalUrl','checkedOn','status','outcome','sha256') if k in a} for a in (crawl or {}).get('attempts',[])]})
    if fund['id'] in latest_followups:
        coverage[-1]['followUp']=copy.deepcopy(latest_followups[fund['id']])
        fund['followUp']=copy.deepcopy(coverage[-1]['followUp'])
if sorted(f['id'] for f in snapshot['funds'])!=sorted(catalog_ids):raise ValueError('Catalog IDs changed.')
field_counts={k:sum(bool(r['fields'][k]) for r in coverage) for k in coverage[0]['fields']}
snapshot.update(schemaVersion=2,pilotCount=30,recordCount=len(catalog_ids),baselineCount=len(expected),supplementalCount=len(extra_ids),enrichedCount=len(catalog_ids),reviewedCount=sum(bool(f['verifiedOn']) for f in snapshot['funds']),researchCounts=dict(counts),fieldCoverage=field_counts,enrichmentSchema='./enrichment.schema.json',researchCheckedOn=max(r['researchedOn'] for r in records),sourceWarningCount=sum(bool(f['sourceWarnings']) for f in snapshot['funds']))
snapshot['compiledAt']=as_of.isoformat()
snapshot['followUpHistory']=followup_history
if baseline:
    previous_by_id={r['sourceRecordId']:r for r in baseline['records']}
    recovered=sum(previous_by_id[row['sourceRecordId']]['previousStatus'] in ('unresolved','unreachable') and lookup[row['sourceRecordId']]['reviewStatus'] in ('source_reviewed','program_reviewed','not_a_funder') for row in followups)
    followup_summary={
        'passId':baseline['passId'],
        'checkedOn':baseline['checkedOn'],
        'targetCount':len(followups),
        'previousResearchCounts':baseline['researchCounts'],
        'previousFieldCoverage':baseline['fieldCoverage'],
        'programReviewsAdded':sum(row['outcome']=='program_terms_added' for row in followups),
        'sourcesRecovered':recovered,
        'outcomes':dict(collections.Counter(row['outcome'] for row in followups)),
    }
    snapshot['followUpSummary']=followup_summary
    # The pre-supplemental published audit report is frozen evidence, not a live metric.
    completed=read('research/deepening-result.json')
    if any(completed.get(k)!=v for k,v in followup_summary.items()):
        raise ValueError('Completed follow-up result belongs to another audit.')
    followup_report={**followup_summary,'fieldCoverage':completed['fieldCoverage'],'records':[{'checkedOn':baseline['checkedOn'],**row} for row in followups],
        'notes':'Each target received a policy follow-up. A reviewed policy may be invitation-only, closed or historical. No current date or amount is inferred from an older award, and remaining gaps are not eligibility rejections.'}
    (ROOT/'dist/data/research-followup.json').write_text(json.dumps(followup_report,ensure_ascii=False,indent=2)+'\n')
(ROOT/'dist/data/funders.json').write_text(json.dumps(snapshot,ensure_ascii=False,separators=(',',':')))
report={'version':1,'checkedOn':snapshot['researchCheckedOn'],'recordCount':len(catalog_ids),'baselineCount':len(expected),'researchCounts':dict(counts),'fieldCoverage':field_counts,'sourceWarningCount':sum(bool(f['sourceWarnings']) for f in snapshot['funds']),'records':coverage,'notes':'All original and supplemental records have a research disposition. Source overviews, program terms and failed/unresolved checks are distinct. Unknown terms remain unknown. Retrieval entries describe collection, not a claim that terms were verified. Original30 pilot reviews were retained from October14; expanded research was checked October15.'}
report['compiledAt']=as_of.isoformat()
report['fieldDefinitions']={'currentNumericAward':'A numeric amount in published program terms, even if that intake is closed; not a promise of current availability.','datedDeadline':'At least one source closing date, including historical or closed calls.','upcomingDatedDeadline':'An intake with a dated cutoff still upcoming when compiled; excludes closed, future/not-yet-open, unconfirmed and expired exact timestamps. A date without a time remains date-qualified.'}
report['followUpHistory']=followup_history
if baseline:report['followUpSummary']=followup_summary
(ROOT/'dist/data/research-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'records':len(catalog_ids),'researchCounts':dict(counts),'fieldCoverage':field_counts}))
