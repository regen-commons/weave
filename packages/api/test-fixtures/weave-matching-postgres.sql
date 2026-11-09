-- psql behavioral proof against PostgreSQL with synthetic Auth claims and real role grants.
-- Supply document via \set, then concatenate setup, baseline, Certified predicate,
-- seed, matching migration, optional index migration, and this file in that order.
\set a '03000000-0000-4000-8000-000000000001'
\set b '03000000-0000-4000-8000-000000000002'
\set a_need 'b4000000-0000-4000-8000-000000000001'
\set b_offer 'b4000000-0000-4000-8000-000000000002'
\set a_second 'b4000000-0000-4000-8000-000000000003'
create function pg_temp.matching_ref(state jsonb, k text, id uuid) returns jsonb language sql as $$
  select e-'{status,sharing,confirmedAt,expiresAt}'::text[] from jsonb_array_elements(state->'entries') e
  where e->>'kind'=k and e->>'entryId'=id::text
$$;
set role authenticated;
select pg_temp.matching_actor(1);
select pg_temp.check_matching(weave.load_initiative(:'a')=:'legacy_a'::jsonb,'version-1 legacy round trip');
select pg_temp.check_matching(not exists(select from jsonb_array_elements(weave.matching_state(:'a')->'entries') e
  where e->>'sharing'<>'private'),'preexisting entries start private');
select pg_temp.check_matching(weave.save_initiative(:'a',0,
  '04000000-0000-4000-8000-000000000001', :'document'::jsonb)=:'legacy_a'::jsonb,'pre-migration request retry');

select pg_temp.matching_actor(2);
select pg_temp.check_matching(not exists(select from weave.initiatives where id=:'a'),'cross-owner raw initiative denied');
select pg_temp.check_matching(not exists(select from weave.needs where initiative_id=:'a'),'cross-owner raw needs denied');
select pg_temp.matching_reject('42501','select * from private.weave_matching_entries');
select pg_temp.matching_reject('42501','select * from private.weave_matching_leads');
select pg_temp.matching_reject('PT404',format('select weave.load_initiative(%L)',:'a'));
select pg_temp.matching_reject('PT404',format('select weave.matching_shortlist(%L,null)',:'a'));
select pg_temp.matching_reject('PT404',format('select weave.matching_leads(%L)',:'a'));
select pg_temp.matching_reject('PT404',format('select weave.matching_preview(%L,1,null,null)',:'a'));
select pg_temp.matching_reject('PT404',format('select weave.matching_change(%L,%L,%L,null,null)',:'a','share',
  '04000000-0000-4000-8000-000000000011'));
select pg_temp.matching_reject('42501',format('update weave.needs set matching_audience=%L where initiative_id=%L','weave_users',:'a'));
select jsonb_set(
  jsonb_set(:'document'::jsonb,'{initiative,name}','"Other owner"'),
  '{offers,0,value,title}','"Seedlings and tools"') as b_doc \gset
select weave.save_initiative(:'b',0,'04000000-0000-4000-8000-000000000002',:'b_doc') as b_saved \gset
select pg_temp.check_matching(weave.matching_shortlist(:'b',null)->'groups'='[]'::jsonb,'Save alone does not join');
select pg_temp.matching_ref(weave.matching_state(:'b'),'offer',:'b_offer') as b_ref \gset
select weave.matching_preview(:'b',1,jsonb_build_array(:'b_ref'::jsonb),null)->>'reviewId' as b_review \gset
select weave.matching_change(:'b','share','04000000-0000-4000-8000-000000000003',:'b_review',null) as b_shared \gset
select pg_temp.check_matching(weave.matching_shortlist(:'b',null)#>'{groups,0,candidates}'='[]'::jsonb,
  'counterpart Save and private entries do not publish');
select pg_temp.matching_ref(:'b_shared','offer',:'b_offer') as b_shared_ref \gset

select pg_temp.matching_actor(1);
select pg_temp.matching_ref(weave.matching_state(:'a'),'need',:'a_need') as a_initial_ref \gset
select weave.matching_preview(:'a',1,jsonb_build_array(:'a_initial_ref'::jsonb),null)->>'reviewId' as stale_review \gset
select jsonb_set(:'document'::jsonb,'{needs}',(:'document'::jsonb->'needs')||jsonb_build_array(
  jsonb_set(:'document'::jsonb#>'{needs,0}','{id}',to_jsonb(:'a_second'::text)))) as a_two \gset
select weave.save_initiative(:'a',1,'04000000-0000-4000-8000-000000000004',:'a_two') as a_saved_two \gset
select pg_temp.matching_reject('PT409',format('select weave.matching_change(%L,%L,%L,%L,null)',:'a','share',
  '04000000-0000-4000-8000-000000000005',:'stale_review'));
select pg_temp.matching_reject('PT409',format('select weave.save_initiative(%L,1,%L,%L)',:'a',
  '04000000-0000-4000-8000-000000000006',:'document'));
select pg_temp.matching_reject('PT400',format('select weave.save_initiative(%L,2,%L,%L)',:'a',
  '04000000-0000-4000-8000-000000000006',jsonb_set(:'a_two','{needs}',jsonb_build_array(
    :'a_two'::jsonb#>'{needs,0}',:'a_two'::jsonb#>'{needs,0}'))));
select weave.matching_preview(:'a',2,jsonb_build_array(:'a_initial_ref'::jsonb),now()+interval '180 days') as a_preview \gset
select pg_temp.check_matching((:'a_preview'::jsonb->>'expiresAt')::timestamptz<=now()+interval '90 days'
  and not (:'a_preview'::jsonb->'summary' ? 'links') and jsonb_array_length(:'a_preview'::jsonb->'entries')=1,
  'preview is capped and shows only selected projection');
select :'a_preview'::jsonb->>'reviewId' as a_review \gset
select weave.matching_change(:'a','share','04000000-0000-4000-8000-000000000007',:'a_review',null) as a_shared \gset
select pg_temp.check_matching(weave.matching_change(:'a','share','04000000-0000-4000-8000-000000000007',:'a_review',null)
  =:'a_shared'::jsonb,'lost share response retries safely');
select pg_temp.matching_reject('PT409',format('select weave.matching_change(%L,%L,%L,%L,null)',:'a','share',
  '04000000-0000-4000-8000-000000000008',:'a_review'));
select pg_temp.matching_reject('PT409',format('select weave.matching_change(%L,%L,%L,null,%L)',:'a','withdraw',
  '04000000-0000-4000-8000-000000000007',jsonb_build_array(:'a_initial_ref'::jsonb)));
select pg_temp.matching_ref(:'a_shared','need',:'a_need') as a_shared_ref \gset
select pg_temp.check_matching(weave.matching_shortlist(:'a',null)#>'{groups,0,candidates,0}'->>'initiativeId'=:'b',
  'owner can match their shared need to the other offer');

select pg_temp.matching_actor(2);
select weave.matching_shortlist(:'b',null)#>'{groups,0,candidates}' as b_candidates \gset
select pg_temp.check_matching(jsonb_array_length(:'b_candidates'::jsonb)=1 and
  :'b_candidates'::jsonb#>>'{0,entryId}'=:'a_need' and
  not (:'b_candidates'::jsonb->0 ?| array['ownerId','document','funding','card']) and
  not (:'b_candidates'::jsonb#>'{0,summary}' ?| array['links','beneficiaries','languages']),
  'shared offer finds exactly the approved need projection');
\if :{?index_fixture}
select pg_temp.check_matching(
  weave.matching_shortlist(:'b',null)#>>'{externalCoverage,status}'='bounded' and
  weave.matching_shortlist(:'b',null)#>>'{groups,0,publicEvidence,0,projectUri}'=:'index_fixture',
  'public evidence is retrieved from the real index using approved query projection');
select pg_temp.matching_reject('42501','select * from private.weave_project_index_evidence');
select pg_temp.matching_reject('42501','select private.weave_public_project_shortlist(''arbitrary private query'',80)');
select weave.matching_set_lead(:'b',:'b_shared_ref','public:'||:'index_fixture','saved',
  '04000000-0000-4000-8000-000000000021') as public_saved \gset
select pg_temp.check_matching(exists(select from jsonb_array_elements(:'public_saved'::jsonb->'leads') l
  where l->>'candidateId'='public:'||:'index_fixture'
    and l->>'evidenceStatus'='current'),'public lead stores reference separately');
select weave.matching_set_lead(:'b',:'b_shared_ref','public:'||:'index_fixture','removed',
  '04000000-0000-4000-8000-000000000022') as public_removed \gset
\endif
select 'weave:'||:'a'||':need:'||:'a_need' as candidate \gset
select weave.matching_set_lead(:'b',:'b_shared_ref',:'candidate','saved',
  '04000000-0000-4000-8000-000000000009') as saved_lead \gset
select pg_temp.check_matching(:'saved_lead'::jsonb#>>'{leads,0,evidenceStatus}'='current','saved lead references live evidence');

select pg_temp.matching_actor(1);
select jsonb_set(:'a_two'::jsonb,'{needs}',jsonb_build_array(:'a_two'::jsonb#>'{needs,1}',:'a_two'::jsonb#>'{needs,0}')) as a_reorder \gset
select weave.save_initiative(:'a',2,'04000000-0000-4000-8000-000000000010',:'a_reorder') as a_reordered \gset
select pg_temp.check_matching(pg_temp.matching_ref(weave.matching_state(:'a'),'need',:'a_need')=:'a_shared_ref'::jsonb and
  weave.load_initiative(:'a')=:'a_reordered'::jsonb,'position swap preserves identity, revision, and sharing');
select pg_temp.matching_reject('PT409',format('select weave.matching_change(%L,%L,%L,null,%L)',:'a','withdraw',
  '04000000-0000-4000-8000-000000000011',jsonb_build_array(:'a_initial_ref'::jsonb)));
select weave.matching_change(:'a','withdraw','04000000-0000-4000-8000-000000000011',null,jsonb_build_array(:'a_shared_ref'::jsonb))
  as a_withdrawn \gset
select pg_temp.check_matching(weave.matching_change(:'a','share','04000000-0000-4000-8000-000000000007',:'a_review',null)
  =:'a_withdrawn'::jsonb,'a late share retry reports current withdrawal without republishing');
select pg_temp.matching_actor(2);
select pg_temp.check_matching(weave.matching_shortlist(:'b',null)#>'{groups,0,candidates}'='[]'::jsonb
  and weave.matching_leads(:'b')#>>'{leads,0,evidenceStatus}'='unavailable','withdrawal immediately hides evidence and preserves lead');
select pg_temp.check_matching(weave.matching_set_lead(:'b',:'b_shared_ref',:'candidate','saved',
  '04000000-0000-4000-8000-000000000009')#>>'{leads,0,evidenceStatus}'='unavailable','retry never returns stale lead evidence');

select pg_temp.matching_actor(1);
select pg_temp.matching_ref(:'a_withdrawn','need',:'a_need') as a_withdrawn_ref \gset
select weave.matching_preview(:'a',3,jsonb_build_array(:'a_withdrawn_ref'::jsonb),null)->>'reviewId' as a_reshare \gset
select weave.matching_change(:'a','share','04000000-0000-4000-8000-000000000012',:'a_reshare',null) as a_reshared \gset
reset role;
update weave.needs set matching_expires_at=now()-interval '1 second' where initiative_id=:'a' and id=:'a_need';
set role authenticated;
select pg_temp.matching_actor(2);
select pg_temp.check_matching(weave.matching_shortlist(:'b',null)#>'{groups,0,candidates}'='[]'::jsonb,'expiry enforced on read');
select pg_temp.matching_actor(1);
select pg_temp.matching_ref(weave.matching_state(:'a'),'need',:'a_need') as a_expired_ref \gset
select weave.matching_preview(:'a',3,jsonb_build_array(:'a_expired_ref'::jsonb),null)->>'reviewId' as a_renew \gset
select weave.matching_change(:'a','renew','04000000-0000-4000-8000-000000000013',:'a_renew',null) as a_renewed \gset
select pg_temp.matching_actor(2);
select pg_temp.check_matching(jsonb_array_length(weave.matching_shortlist(:'b',null)#>'{groups,0,candidates}')=1,
  'unchanged expired entry can be renewed after review');

select pg_temp.matching_actor(1);
select jsonb_set(:'a_reorder'::jsonb,'{initiative,description}','"Updated reviewed summary"') as a_summary \gset
select weave.save_initiative(:'a',3,'04000000-0000-4000-8000-000000000014',:'a_summary') as a_new_summary \gset
select pg_temp.matching_actor(2);
select pg_temp.check_matching(weave.matching_shortlist(:'b',null)#>'{groups,0,candidates}'='[]'::jsonb,
  'unreviewed summary edit makes old projection ineligible');
select pg_temp.matching_actor(1);
select weave.save_initiative(:'a',4,'04000000-0000-4000-8000-000000000015',:'a_reorder') as a_old_summary \gset
select pg_temp.check_matching(weave.matching_shortlist(:'a',null)->'groups'='[]'::jsonb,'reverting summary does not revive share');
select pg_temp.matching_ref(weave.matching_state(:'a'),'need',:'a_need') as a_before_delete \gset
select weave.save_initiative(:'a',5,'04000000-0000-4000-8000-000000000016',:'a_reorder'::jsonb #- '{needs,1}') as a_deleted \gset
select weave.save_initiative(:'a',6,'04000000-0000-4000-8000-000000000017',:'a_reorder') as a_readded \gset
select pg_temp.check_matching(pg_temp.matching_ref(weave.matching_state(:'a'),'need',:'a_need')<>:'a_before_delete'::jsonb
  and weave.matching_shortlist(:'a',null)->'groups'='[]'::jsonb,'deleted/readded ID cannot revive old revision');

select pg_temp.matching_ref(weave.matching_state(:'a'),'need',:'a_need') as a_fresh_ref \gset
select weave.matching_preview(:'a',7,jsonb_build_array(:'a_fresh_ref'::jsonb),null)->>'reviewId' as a_fresh_review \gset
select weave.matching_change(:'a','share','04000000-0000-4000-8000-000000000018',:'a_fresh_review',null) as a_fresh_share \gset
select weave.save_initiative(:'a',7,'04000000-0000-4000-8000-000000000019',
  jsonb_set(:'a_reorder'::jsonb,'{needs,1,value,status}','"met"')) as a_closed \gset
select pg_temp.matching_actor(2);
select pg_temp.check_matching(weave.matching_shortlist(:'b',null)#>'{groups,0,candidates}'='[]'::jsonb,
  'closing a shared entry hides it before the next read');
select pg_temp.matching_actor(1);
select weave.save_initiative(:'a',8,'04000000-0000-4000-8000-000000000020',:'a_reorder') as a_reopened \gset
select pg_temp.check_matching(weave.matching_shortlist(:'a',null)->'groups'='[]'::jsonb,
  'reopening an entry still requires a fresh review');

select jsonb_build_object('kind','offer','entryId',:'b_offer'::uuid) as deleted_lead_key \gset
select pg_temp.matching_reject('PT404',format('select weave.matching_set_lead(%L,%L,%L,%L,%L)',:'b',
  :'deleted_lead_key',:'candidate','removed','04000000-0000-4000-8000-000000000024'));
select pg_temp.matching_actor(2);
select weave.save_initiative(:'b',1,'04000000-0000-4000-8000-000000000023',
  jsonb_set(:'b_doc'::jsonb,'{offers}','[]'::jsonb)) as b_deleted_offer \gset
select pg_temp.check_matching(weave.matching_leads(:'b')#>>'{leads,0,evidenceStatus}'='unavailable',
  'lead history survives deletion of its query entry');
select pg_temp.matching_reject('PT400',format('select weave.matching_set_lead(%L,%L,%L,%L,%L)',:'b',
  :'deleted_lead_key',:'candidate','saved','04000000-0000-4000-8000-000000000024'));
select pg_temp.check_matching(weave.matching_set_lead(:'b',:'deleted_lead_key',:'candidate','removed',
  '04000000-0000-4000-8000-000000000024')->'leads'='[]'::jsonb,
  'owner can remove history with a key after deleting the original entry');
select pg_temp.check_matching(weave.matching_set_lead(:'b',:'b_shared_ref',:'candidate','removed',
  '04000000-0000-4000-8000-000000000024')->'leads'='[]'::jsonb,
  'the full reference and key are equivalent for a remove retry');

select pg_temp.matching_actor(3);
select pg_temp.matching_reject('PT401',format('select weave.matching_state(%L)',:'b'));
reset role;
delete from auth.sessions where id='02000000-0000-4000-8000-000000000002';
set role authenticated;
select pg_temp.matching_actor(2);
select pg_temp.matching_reject('PT401',format('select weave.matching_shortlist(%L,null)',:'b'));
select pg_temp.matching_reject('PT401',format('select weave.matching_leads(%L)',:'b'));
reset role;
set role anon;
select pg_temp.matching_reject('42501',format('select weave.matching_state(%L)',:'a'));
reset role;
\echo Matching PostgreSQL checks passed
