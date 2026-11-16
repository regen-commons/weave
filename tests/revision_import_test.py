"""Synthetic local revisions replay archived examples; no source verification is claimed."""
import copy
import datetime
import hashlib
import json
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / 'scripts'))
from revision_import import INDEX, digest, encoded, load_history, read
from importlib.util import spec_from_file_location, module_from_spec
spec = spec_from_file_location('revise_program', REPO / 'scripts/revise-program.py')
cli = module_from_spec(spec)
spec.loader.exec_module(cli)


class Revisions(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='funding-revision-test-')
        self.root = Path(self.directory.name)
        for path in ['research', 'scripts', 'dist']:
            shutil.copytree(REPO / path, self.root / path,
                            ignore=shutil.ignore_patterns('models', 'assets', 'fund-vectors.*', '__pycache__'))

    def tearDown(self):
        self.directory.cleanup()

    def funds(self):
        return read(self.root, 'dist/data/funders.json')['funds']

    def bytes(self):
        return {p.relative_to(self.root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                for folder in ['research', 'dist/data'] for p in (self.root / folder).rglob('*') if p.is_file()}

    def proposal(self, example=0, id='test-revision'):
        old = read(self.root, 'research/maintenance-history/manual-thursday-2026-10-29/proposals.json')['proposals'][example]
        fund = next(f for f in self.funds() if f['id'] == old['fundId'])
        program = copy.deepcopy(next(p for p in fund['enrichment']['programs'] if p['id'] == old['programId']))
        program.update(copy.deepcopy(old['after']))
        url = old['sourceEvidence'][-1]['url']
        program['evidence'].append({'url':url, 'fields':['application','unknowns'],
                                    'note':'Synthetic test replay of archived proposal; not a live review.', 'checkedOn':'2026-10-30'})
        return {'version':1,'id':id,'fundId':fund['id'],'programId':old['programId'],
                'expectedFundSha256':digest(fund),'afterProgram':program,'reviewedOn':'2026-10-30',
                'reason':'Synthetic integration replay; no production change or source verification.',
                'sources':[{'url':url,'title':'Synthetic review fixture','checkedOn':'2026-10-30'}]}

    def test_dry_run_and_two_archived_examples(self):
        before = self.bytes()
        p = self.proposal()
        report = cli.stage(self.root,p)
        self.assertFalse(report['appliedToLocalCheckout'])
        self.assertEqual(before,self.bytes())
        original = copy.deepcopy(self.funds())
        cli.stage(self.root,p,True)
        cli.stage(self.root,self.proposal(1,'test-keeling'),True)
        _,history = load_history(self.root)
        self.assertEqual(len(history),2)
        for r in history:
            self.assertEqual(r['priorFundRecord'],next(f for f in original if f['id']==r['fundId']))
            current=next(f for f in self.funds() if f['id']==r['fundId'])
            self.assertEqual(current['verifiedOn'],r['priorFundRecord']['verifiedOn'])
            self.assertEqual(current['enrichment']['researchedOn'],r['priorFundRecord']['enrichment']['researchedOn'])
            for s in r['priorFundRecord']['enrichment']['sources']:
                self.assertIn(s,current['enrichment']['sources'])
        emergent=next(f for f in self.funds() if f['id']==p['fundId'])
        self.assertEqual(emergent['access'],'future')
        self.assertEqual(emergent['deadlineDate'],None)
        keeling=next(f for f in self.funds() if f['id']=='local-climate-curve')
        self.assertEqual(keeling['access'],'closed')
        self.assertIsNone(keeling['deadlineDate'])
        subprocess.run(['python3','scripts/import-data.py'],cwd=self.root,check=True,capture_output=True)
        cli.validate(self.root)
        # The immutable audit view recovers both previous full records after updates.
        code="import {beforeProgramRevisions} from './scripts/revision-history.mjs';import fs from 'node:fs'; const d=JSON.parse(fs.readFileSync('dist/data/funders.json'));console.log(JSON.stringify(beforeProgramRevisions(d,new URL('./',import.meta.url)).funds));"
        recovered=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=self.root))
        self.assertEqual(recovered,original)
        shutil.copytree(REPO/'tests',self.root/'tests',ignore=shutil.ignore_patterns('__pycache__'))
        historical=['manual-discovery','manual-freshness','history-import','history-verification','region-tags']
        result=subprocess.run(['node','--test']+['tests/'+name+'.test.mjs' for name in historical],
                              cwd=self.root,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)


    def test_rejected_proposals_leave_all_data_unchanged(self):
        before=self.bytes()
        for kind in ['stale','identity','noop','evidence','bad-date','invalid-route','screening','missing-source','backdated-review','malformed-evidence','malformed-source']:
            with self.subTest(kind=kind):
                p=self.proposal()
                if kind=='stale':p['expectedFundSha256']='0'*64
                elif kind=='identity':p['afterProgram']['id']='another-program'
                elif kind=='noop':p['afterProgram']=next(f for f in self.funds() if f['id']==p['fundId'])['enrichment']['programs'][0]
                elif kind=='evidence':p['afterProgram']['evidence']=[]
                elif kind=='bad-date':p['reviewedOn']='2026-02-30'
                elif kind=='invalid-route':p['afterProgram']['application']['route']='invented'
                elif kind=='screening':p['afterProgram']['applicants']['requirements'].append('Synthetic changed eligibility')
                elif kind=='missing-source':p['sources']=[]
                elif kind=='backdated-review':
                    p['reviewedOn']='2020-01-01';p['sources'][0]['checkedOn']='2020-01-01';p['afterProgram']['evidence'][-1]['checkedOn']='2020-01-01'
                elif kind=='malformed-evidence':p['afterProgram']['evidence']=['invalid']
                elif kind=='malformed-source':p['sources']=['invalid']
                with self.assertRaises((ValueError,subprocess.CalledProcessError)):
                    cli.stage(self.root,p,True)
                self.assertEqual(self.bytes(),before)

    def test_duplicate_stale_and_sequential_revisions(self):
        p=self.proposal()
        cli.stage(self.root,p,True)
        before=self.bytes()
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            cli.stage(self.root,p,True)
        stale=copy.deepcopy(p);stale['id']='stale-second'
        with self.assertRaisesRegex(ValueError,'Stale'):
            cli.stage(self.root,stale,True)
        self.assertEqual(self.bytes(),before)
        second=self.proposal(id='test-second')
        second['afterProgram']['application']['note']+=' Synthetic second review.'
        cli.stage(self.root,second,True)
        _,history=load_history(self.root)
        self.assertEqual(history[1]['priorFundRecord']['enrichment']['programs'][0],history[0]['afterProgram'])

    def test_appended_program_target_retains_all_source_versions(self):
        fund=next(f for f in self.funds() if f['id']=='recOExYwWRXF9whgo')
        program=copy.deepcopy(next(p for p in fund['enrichment']['programs'] if p['id']=='isoc-ccc-catalyst'))
        program['application']['note']+=' Synthetic review fixture.'
        url=program['application']['url']
        program['evidence'].append({'url':url,'fields':['application'],'checkedOn':'2026-10-30','note':'Synthetic fixture'})
        p={'version':1,'id':'test-appended','fundId':fund['id'],'programId':program['id'],
           'expectedFundSha256':digest(fund),'reviewedOn':'2026-10-30','reason':'Synthetic fixture',
           'afterProgram':program,'sources':[{'url':url,'title':'Synthetic version','checkedOn':'2026-10-30'}]}
        cli.stage(self.root,p,True)
        after=next(f for f in self.funds() if f['id']==fund['id'])
        for source in fund['enrichment']['sources']:self.assertIn(source,after['enrichment']['sources'])
        cli.validate(self.root)

    def test_screening_replacement_and_same_day_answer_invalidation(self):
        p=self.proposal()
        p['afterProgram']['applicants']['requirements'].append('Synthetic new eligibility requirement')
        p['afterProgram']['evidence'][-1]['fields'].append('applicants')
        url=p['sources'][0]['url']
        p['screening']={'conditions':[{'fundId':p['fundId'],'programId':p['programId'],'id':'new-rule',
                        'category':'legal','kind':'prerequisite','requirement':'Synthetic eligibility requirement',
                        'sourceUrl':url,'checkedOn':'2026-10-30'}], 'rules':[]}
        old_conditions=read(self.root,'research/program-conditions.json')['conditions']
        cli.stage(self.root,p,True)
        current=read(self.root,'research/program-conditions.json')['conditions']
        self.assertEqual([c['id'] for c in current if c['fundId']==p['fundId']],['new-rule'])
        _,history=load_history(self.root)
        old_edit=next(e for e in history[0]['edits'] if e['path']=='research/program-conditions.json')
        self.assertEqual(old_edit['before'],old_conditions)
        second=self.proposal(id='same-day-change')
        second['screening']=copy.deepcopy(p['screening'])
        second['screening']['conditions'][0]['requirement']='Different condition on the same day'
        with self.assertRaisesRegex(ValueError,'new ID'):
            cli.stage(self.root,second,True)
        second['screening']['conditions'][0]['id']='replacement-rule'
        cli.stage(self.root,second,True)

    def test_invalid_screening_and_archive_tampering(self):
        p=self.proposal()
        p['screening']={'conditions':[], 'rules':[{'fundId':p['fundId'],'programId':p['programId'],'checkedOn':'2026-10-30','field':'invented'}]}
        before=self.bytes()
        with self.assertRaises(subprocess.CalledProcessError):cli.stage(self.root,p,True)
        self.assertEqual(before,self.bytes())
        p=self.proposal();cli.stage(self.root,p,True)
        index=read(self.root,INDEX);path=self.root/index['revisions'][0]['path']
        path.write_bytes(path.read_bytes()+b' ')
        with self.assertRaisesRegex(ValueError,'checksum'):load_history(self.root)
        with self.assertRaises(subprocess.CalledProcessError):cli.validate(self.root)

    def test_screening_in_multi_digit_source_file_is_retired_and_generated(self):
        rule=read(self.root,'research/expanded-eligibility-10.json')['rules'][0]
        fund=next(f for f in self.funds() if f['id']==rule['fundId'])
        program=copy.deepcopy(next(p for p in fund['enrichment']['programs'] if p['id']==rule['programId']))
        program['applicants']['requirements'].append('Synthetic replacement eligibility for integration testing')
        url=rule['sourceUrl']
        program['evidence'].append({'url':url,'fields':['applicants'],'checkedOn':'2026-10-30','note':'Synthetic fixture'})
        proposal={'version':1,'id':'multi-digit-screening','fundId':fund['id'],'programId':program['id'],
                  'expectedFundSha256':digest(fund),'reviewedOn':'2026-10-30','reason':'Synthetic fixture',
                  'afterProgram':program,'sources':[{'url':url,'title':'Synthetic fixture','checkedOn':'2026-10-30'}],
                  'screening':{'conditions':[],'rules':[]}}
        cli.stage(self.root,proposal,True)
        for path in ['research/expanded-eligibility-10.json','dist/data/eligibility-rules.json']:
            self.assertFalse(any(r['fundId']==fund['id'] and r['programId']==program['id'] for r in read(self.root,path)['rules']))
        self.assertFalse(any(r['fundId']==fund['id'] and r['programId']==program['id'] for r in read(self.root,'dist/data/program-conditions.json')['conditions']))
        _,history=load_history(self.root)
        self.assertTrue(any(e['path']=='research/expanded-eligibility-10.json' for e in history[0]['edits']))

    def test_write_failure_rolls_back_local_files(self):
        before=self.bytes();real_replace=cli.os.replace;calls=[]
        def fail_once(a,b):
            calls.append(b)
            if len(calls)==2:raise OSError('Synthetic write failure')
            return real_replace(a,b)
        with patch.object(cli.os,'replace',fail_once):
            with self.assertRaisesRegex(OSError,'Synthetic'):cli.stage(self.root,self.proposal(),True)
        self.assertEqual(self.bytes(),before)

    def test_import_does_not_rotate_unchanged_display_programs_with_clock(self):
        before=copy.deepcopy(self.funds())
        real=datetime.datetime
        class Later(real):
            @classmethod
            def now(cls,tz=None):return cls(2030,1,1,tzinfo=datetime.timezone.utc)
        with patch('datetime.datetime',Later):
            runpy.run_path(str(self.root/'scripts/import-data.py'),run_name='__main__')
        self.assertEqual(self.funds(),before)

    def test_ci_rejects_rewriting_committed_history(self):
        subprocess.run(['git','init','-q'],cwd=self.root,check=True)
        subprocess.run(['git','add',INDEX,'dist/data/funders.json'],cwd=self.root,check=True)
        subprocess.run(['git','-c','commit.gpgsign=false','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Empty fixture history'],cwd=self.root,check=True)
        base=subprocess.check_output(['git','rev-parse','HEAD'],cwd=self.root,text=True).strip()
        cli.stage(self.root,self.proposal(),True)
        cli.check_base(self.root,base)
        index_bytes=(self.root/INDEX).read_bytes()
        index=read(self.root,INDEX);entry=index['revisions'][0]
        archive_path=self.root/entry['path'];original_archive=archive_path.read_bytes()
        forged=json.loads(original_archive);forged['priorFundRecord']['description']='Wrong prior revision'
        forged['expectedFundSha256']=digest(forged['priorFundRecord'])
        archive_path.write_bytes(encoded(forged));entry['sha256']=hashlib.sha256(archive_path.read_bytes()).hexdigest()
        (self.root/INDEX).write_bytes(encoded(index))
        with self.assertRaisesRegex(ValueError,'exact base'):cli.check_base(self.root,base)
        archive_path.write_bytes(original_archive);(self.root/INDEX).write_bytes(index_bytes)
        subprocess.run(['git','add','research/revisions'],cwd=self.root,check=True)
        subprocess.run(['git','-c','commit.gpgsign=false','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Fixture revision'],cwd=self.root,check=True)
        committed=subprocess.check_output(['git','rev-parse','HEAD'],cwd=self.root,text=True).strip()
        (self.root/INDEX).write_bytes(encoded({'version':1,'revisions':[]}))
        with self.assertRaisesRegex(ValueError,'append-only'):cli.check_base(self.root,committed)

    def test_cli_requires_review_branch_for_local_apply(self):
        subprocess.run(['git','init','-q','-b','main'],cwd=self.root,check=True)
        proposal=self.root/'proposal.json';proposal.write_bytes(encoded(self.proposal()))
        before=self.bytes()
        args=['python3','scripts/revise-program.py',str(proposal),'--root',str(self.root),'--apply']
        result=subprocess.run(args,cwd=self.root,capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('isolated codex/',result.stderr)
        self.assertEqual(self.bytes(),before)
        subprocess.run(['git','checkout','-qb','codex/fixture'],cwd=self.root,check=True)
        result=subprocess.run(args,cwd=self.root,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertTrue(json.loads(result.stdout)['appliedToLocalCheckout'])


if __name__=='__main__':unittest.main()
