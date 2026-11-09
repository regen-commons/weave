-- Optional integration fixture: apply after the public project index candidate.
\set index_fixture 'at://did:plc:synthetic/org.hypercerts.collection/seedlings'
insert into private.weave_project_index_checkpoint(singleton,manifest_hash,completed_at,project_count)
  values(true,'fixture',now(),1);
insert into private.weave_project_index_source(project_uri,status,permission_until,cid,content_hash,
  extraction_version,checked_at,fetched_at)
  values(:'index_fixture','indexed',now()+interval '30 days','bafyfixture','fixture-hash','fixture',now(),now());
insert into private.weave_project_index_evidence(id,project_uri,evidence,lexical_text)
  values('fixture-evidence',:'index_fixture',jsonb_build_object('id','fixture-evidence','projectUri',:'index_fixture',
    'projectName','Synthetic seedlings project','sourceUri',:'index_fixture','sourceUrl','https://api.hypercerts.org/example',
    'cid','bafyfixture','contentHash','fixture-hash','fieldPath','description','kind','work',
    'passage','Volunteers plant seedlings with hand tools.','sourceCreatedAt',now(),'sourceIndexedAt',now(),
    'fetchedAt',now(),'extractionVersion','fixture'),'volunteers plant seedlings with hand tools');

select pg_temp.check_matching(private.weave_public_project_shortlist('séedlings',1)#>>'{0,projectUri}'=:'index_fixture',
  'public lexical shortlist uses the same common accent folding as indexed passages');

-- Real pgvector execution with a synthetic unit vector, never used as quality evidence.
\set model 'mxbai-xsmall:b0561d9a97e6b298da39f0ef3e7d3cf153b1b29a:q8:mean:unit:passage-v1'
update private.weave_project_index_source set embedding_model=:'model' where project_uri=:'index_fixture';
update private.weave_project_index_evidence
  set embedding=(array[1::real]||array_fill(0::real,array[255]))::extensions.vector,embedding_model=:'model'
  where project_uri=:'index_fixture';
select pg_temp.check_matching(private.weave_public_project_hybrid_shortlist('no-match-token',1,
  (array[1::real]||array_fill(0::real,array[255]))::extensions.vector,:'model')#>>'{0,projectUri}'=:'index_fixture',
  'actual pgvector retrieves a semantic-only project with the exact model contract');
select pg_temp.check_matching(private.weave_public_project_hybrid_shortlist('no-match-token',1,
  (array[1::real]||array_fill(0::real,array[255]))::extensions.vector,'wrong-model')='[]'::jsonb,
  'an incomparable model falls back to lexical retrieval');
