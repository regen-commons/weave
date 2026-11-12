-- Run after the combined matching lifecycle with the vector candidate installed.
-- The earlier fixtures provide two synthetic owners and one indexed public vector.
select ((array[1::real]||array_fill(0::real,array[255]))::extensions.vector)::text as unit_vector \gset
set role authenticated;
select pg_temp.matching_actor(1);
select pg_temp.matching_reject('42501',format('select private.weave_matching_vector_pending(%L,1)',:'model'));
reset role;
set role weave_index_job;
select pg_temp.matching_reject('42501',format('select private.weave_matching_vector_pending(%L,1)',:'model'));
reset role;
set role weave_query_embedding_job;
select pg_temp.matching_reject('42501','select * from weave.needs');
select pg_temp.matching_reject('42501','select * from private.weave_matching_current');
select pg_temp.matching_reject('42501','select * from private.weave_matching_query_vectors');
select pg_temp.matching_reject('42501','update private.weave_matching_retrieval_settings set hybrid_enabled=true');
select pg_temp.matching_reject('42501','select * from private.weave_project_index_evidence');
select pg_temp.check_matching(private.weave_matching_vector_pending(:'model',25)='[]'::jsonb,
  'worker receives no unshared entries');
reset role;

set role authenticated;
select pg_temp.matching_actor(1);
select jsonb_set(jsonb_set(weave.load_initiative(:'a')->'document','{needs,1,value,title}',
  to_jsonb(U&'\00A0Unmapped cartography\00A0'::text)),'{needs,1,value,purpose}','null') as vector_doc \gset
select weave.save_initiative(:'a',9,'04000000-0000-4000-8000-000000000040',:'vector_doc') as vector_saved \gset
select pg_temp.matching_ref(weave.matching_state(:'a'),'need',:'a_need') as vector_ref \gset
select weave.matching_preview(:'a',10,jsonb_build_array(:'vector_ref'::jsonb),null)->>'reviewId' as vector_review \gset
select weave.matching_change(:'a','share','04000000-0000-4000-8000-000000000041',:'vector_review',null) as vector_shared \gset
select pg_temp.matching_ref(:'vector_shared','need',:'a_need') as vector_shared_ref \gset
select :'vector_shared_ref'::jsonb->>'revision' as vector_revision,
  :'vector_shared_ref'::jsonb->>'shareVersion' as vector_share \gset
reset role;
set role weave_query_embedding_job;
select private.weave_matching_vector_pending(:'model',1) as pending \gset
select pg_temp.check_matching(:'pending'::jsonb= jsonb_build_array(
  :'vector_shared_ref'::jsonb||jsonb_build_object('initiativeId',:'a'::uuid,'text','Unmapped cartography')),
  'worker sees only the exact reviewed text and revision key');
select pg_temp.matching_reject('PT400',format('select private.weave_matching_vector_pending(%L,1)','wrong-model'));
select pg_temp.matching_reject('PT400',format('select private.weave_matching_vector_store(%L,%L,%L,%s,%s,%L,%L)',
  :'a','need',:'a_need',:'vector_revision',:'vector_share',:'model','[1,0]'));
select pg_temp.check_matching(private.weave_matching_vector_store(:'a','need',:'a_need',:'vector_revision',
  :'vector_share',:'model',:'unit_vector'),'worker stores a current reviewed vector');
select pg_temp.check_matching(private.weave_matching_vector_store(:'a','need',:'a_need',:'vector_revision',
  :'vector_share',:'model',:'unit_vector') and private.weave_matching_vector_pending(:'model',25)='[]'::jsonb,
  'retry is idempotent and the finished version is no longer pending');
reset role;

set role authenticated;
select pg_temp.matching_actor(1);
select pg_temp.check_matching(weave.matching_shortlist(:'a',null)#>'{groups,0,publicEvidence}'='[]'::jsonb
  and weave.matching_shortlist(:'a',null)#>>'{groups,0,publicModelVersion}' is null,
  'authenticated retrieval is lexical while the rollout gate is off');
reset role;
update private.weave_matching_retrieval_settings set hybrid_enabled=true;
set role authenticated;
select pg_temp.matching_actor(1);
select pg_temp.check_matching(weave.matching_shortlist(:'a',null)#>>'{groups,0,publicEvidence,0,projectUri}'=:'index_fixture'
  and weave.matching_shortlist(:'a',null)#>>'{groups,0,publicModelVersion}'=:'model',
  'the gated authenticated read consumes an exact current vector without exposing it');
select weave.matching_change(:'a','withdraw','04000000-0000-4000-8000-000000000042',null,
  jsonb_build_array(:'vector_shared_ref'::jsonb)) as vector_withdrawn \gset
select pg_temp.check_matching(weave.matching_shortlist(:'a',null)->'groups'='[]'::jsonb,
  'withdrawal removes the query from authenticated retrieval');
reset role;
select pg_temp.check_matching(not exists(select from private.weave_matching_query_vectors),
  'withdrawal prunes the stored vector');
set role weave_query_embedding_job;
select pg_temp.check_matching(not private.weave_matching_vector_store(:'a','need',:'a_need',:'vector_revision',
  :'vector_share',:'model',:'unit_vector'),'a worker cannot finish a withdrawn review');
reset role;

set role authenticated;
select pg_temp.matching_actor(1);
select pg_temp.matching_ref(:'vector_withdrawn','need',:'a_need') as vector_withdrawn_ref \gset
select weave.matching_preview(:'a',10,jsonb_build_array(:'vector_withdrawn_ref'::jsonb),null)->>'reviewId' as reshare_review \gset
select weave.matching_change(:'a','share','04000000-0000-4000-8000-000000000043',:'reshare_review',null) as reshared \gset
select pg_temp.matching_ref(:'reshared','need',:'a_need') as reshared_ref \gset
select :'reshared_ref'::jsonb->>'shareVersion' as reshare_version \gset
select pg_temp.check_matching(weave.matching_shortlist(:'a',null)#>'{groups,0,publicEvidence}'='[]'::jsonb,
  'resharing the same text does not reuse the earlier vector');
reset role;
set role weave_query_embedding_job;
select pg_temp.check_matching(not private.weave_matching_vector_store(:'a','need',:'a_need',:'vector_revision',
  :'vector_share',:'model',:'unit_vector'),'older share version cannot finish after resharing');
select pg_temp.check_matching(private.weave_matching_vector_store(:'a','need',:'a_need',:'vector_revision',
  :'reshare_version',:'model',:'unit_vector'),'new share version can store a separate vector');
reset role;

update weave.needs set matching_expires_at=now()-interval '1 second' where initiative_id=:'a' and id=:'a_need';
set role weave_query_embedding_job;
select pg_temp.check_matching(private.weave_matching_vector_pending(:'model',25)='[]'::jsonb
  and not private.weave_matching_vector_store(:'a','need',:'a_need',:'vector_revision',:'reshare_version',:'model',:'unit_vector'),
  'expired entries cannot be claimed or written');
reset role;
set role authenticated;
select pg_temp.matching_actor(1);
select pg_temp.check_matching(weave.matching_shortlist(:'a',null)->'groups'='[]'::jsonb,
  'expiry fences reads even if a vector row still exists');
select weave.save_initiative(:'a',10,'04000000-0000-4000-8000-000000000044',
  jsonb_set(:'vector_doc'::jsonb,'{needs,1,value,title}','"Edited cartography"')) as vector_edited \gset
reset role;
select pg_temp.check_matching(not exists(select from private.weave_matching_query_vectors),
  'an entry edit prunes the previous vector');
set role weave_query_embedding_job;
select pg_temp.check_matching(not private.weave_matching_vector_store(:'a','need',:'a_need',:'vector_revision',
  :'reshare_version',:'model',:'unit_vector'),'older content revision cannot finish after editing');
reset role;
\echo Reviewed entry vector PostgreSQL checks passed
