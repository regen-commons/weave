"""Local, reviewable program revisions. Canonical source inputs remain authoritative."""
import copy
import datetime
import hashlib
import json
import re
from pathlib import Path

INDEX = 'research/revisions/index.json'
SLUG = re.compile(r'[a-z0-9][a-z0-9-]{0,100}')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def read(root, path):
    return json.loads((root / path).read_text())


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode()


def at(document, keys):
    for key in keys:
        document = document[key]
    return document


def replace(document, keys, value):
    parent = at(document, keys[:-1])
    parent[keys[-1]] = copy.deepcopy(value)


def changed_paths(before, after, prefix=''):
    if isinstance(before, dict) and isinstance(after, dict):
        return [path for key in before.keys() | after.keys()
                for path in changed_paths(before.get(key), after.get(key), prefix + ('.' if prefix else '') + key)]
    return [prefix] if before != after else []


def covers(field, path):
    return path == field or path.startswith(field + '.')


def screening_paths(root, kind):
    if kind == 'conditions':
        return ['research/program-conditions.json']
    expanded = [p.relative_to(root).as_posix() for p in sorted((root / 'research').glob('expanded-eligibility-*.json'))
                if re.fullmatch(r'expanded-eligibility-\d+\.json', p.name)]
    return ['research/eligibility-rules.json'] + expanded


def load_history(root):
    index = read(root, INDEX) if (root / INDEX).exists() else {'version': 1, 'revisions': []}
    if index.get('version') != 1 or not isinstance(index.get('revisions'), list):
        raise ValueError('Invalid revision index')
    history, ids = [], set()
    for entry in index['revisions']:
        id = entry.get('id', '')
        if not SLUG.fullmatch(id) or id in ids or entry.get('path') != f'research/revisions/{id}.json':
            raise ValueError('Invalid or duplicate revision ID/path')
        ids.add(id)
        path = root / entry['path']
        if not path.resolve().is_relative_to((root / 'research/revisions').resolve()):
            raise ValueError('Revision archive escapes its directory')
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry.get('sha256'):
            raise ValueError('Revision archive checksum mismatch: ' + id)
        revision = json.loads(raw)
        if revision.get('version') != 1 or revision.get('id') != id:
            raise ValueError('Revision archive identity mismatch')
        before = revision['priorFundRecord']
        if before['id'] != revision['fundId'] or digest(before) != revision['expectedFundSha256']:
            raise ValueError('Prior full record checksum mismatch')
        if revision['afterProgram']['id'] != revision['programId']:
            raise ValueError('Revision cannot change program identity')
        previous = next((p for p in before['enrichment']['programs'] if p['id'] == revision['programId']), None)
        if not previous or previous != revision['beforeProgram']:
            raise ValueError('Prior program is not retained in the archived fund')
        if 'resultFundRecord' in revision:
            result = revision['resultFundRecord']
            program = next((p for p in result['enrichment']['programs'] if p['id'] == revision['programId']), None)
            if result['id'] != revision['fundId'] or program != revision['afterProgram']:
                raise ValueError('Result snapshot differs from the revised program')
        history.append(revision)
    return index, history


def validate_history(root, records):
    _, history = load_history(root)
    latest = {}
    for revision in history:
        latest[(revision['fundId'], revision['programId'])] = revision
    by_id = {r['sourceRecordId']: r for r in records}
    for (fund_id, program_id), revision in latest.items():
        record = by_id.get(fund_id)
        program = next((p for p in (record or {}).get('programs', []) if p['id'] == program_id), None)
        if program != revision['afterProgram']:
            raise ValueError('Canonical program differs from recorded revision: ' + revision['id'])
        # Earlier source versions remain first-class evidence, even at the same URL.
        for source in revision['retainedSources']:
            if source not in record['sources']:
                raise ValueError('A retained source revision was removed')
    # Application-only revisions retain screening; a later screening revision supersedes it.
    screening_latest = {}
    for revision in history:
        if 'screening' in revision:
            screening_latest[(revision['fundId'], revision['programId'])] = revision['screening']
    for target, expected in screening_latest.items():
        for kind in ['conditions', 'rules']:
            actual = [r for path in screening_paths(root, kind) for r in read(root,path)[kind]
                      if (r.get('fundId'), r.get('programId')) == target]
            if actual != expected[kind]:
                raise ValueError('Screening differs from recorded revision')


def locate(root, fund_id, program_id):
    paths = sorted((root / 'research').glob('pilot-*.json')) + sorted((root / 'research').glob('expanded-[0-9].json'))
    documents, matches, source_location = {}, [], None
    for path in paths:
        relative = path.relative_to(root).as_posix()
        documents[relative] = json.loads(path.read_text())
        for i, record in enumerate(documents[relative]):
            if record['sourceRecordId'] == fund_id:
                source_location = (relative, [i, 'sources'])
                matches += [(relative, [i, 'programs', j]) for j, p in enumerate(record['programs']) if p['id'] == program_id]
    path = 'research/supplemental-funders.json'
    documents[path] = read(root, path)
    for i, row in enumerate(documents[path]['funds']):
        if row['fund']['id'] == fund_id:
            source_location = (path, ['funds', i, 'enrichment', 'sources'])
            matches += [(path, ['funds', i, 'enrichment', 'programs', j]) for j, p in enumerate(row['enrichment']['programs']) if p['id'] == program_id]
    for i, row in enumerate(documents[path].get('programAdditions', [])):
        if row['sourceRecordId'] == fund_id and row['program']['id'] == program_id:
            matches.append((path, ['programAdditions', i, 'program']))
    if len(matches) != 1 or source_location is None:
        raise ValueError('Revision requires one existing funder/program target')
    return documents, matches[0], source_location


def prepare(root, proposal):
    required = {'version', 'id', 'fundId', 'programId', 'expectedFundSha256', 'reviewedOn', 'reason', 'afterProgram', 'sources'}
    if not isinstance(proposal, dict) or not required.issubset(proposal) or set(proposal) - required - {'screening'}:
        raise ValueError('Invalid revision proposal fields')
    if type(proposal['version']) is not int or proposal['version'] != 1 or not isinstance(proposal['id'], str) or not SLUG.fullmatch(proposal['id']):
        raise ValueError('Invalid revision identity')
    if not isinstance(proposal['reviewedOn'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', proposal['reviewedOn']):
        raise ValueError('Review date must be YYYY-MM-DD')
    datetime.date.fromisoformat(proposal['reviewedOn'])
    if not isinstance(proposal['reason'], str) or not proposal['reason'].strip():
        raise ValueError('Revision reason is required')
    index, history = load_history(root)
    if any(r['id'] == proposal['id'] for r in history):
        raise ValueError('Duplicate revision; already staged IDs cannot be replayed')
    snapshot = read(root, 'dist/data/funders.json')
    fund = next((f for f in snapshot['funds'] if f['id'] == proposal['fundId']), None)
    if fund is None or digest(fund) != proposal['expectedFundSha256']:
        raise ValueError('Stale full record; refresh the proposal against the current catalog')
    documents, program_location, source_location = locate(root, proposal['fundId'], proposal['programId'])
    before = at(documents[program_location[0]], program_location[1])
    prior_program = next((p for p in fund['enrichment']['programs'] if p['id'] == proposal['programId']), None)
    if before != prior_program:
        raise ValueError('Generated catalog is stale relative to its source program')
    after = proposal['afterProgram']
    if not isinstance(after, dict) or after.get('id') != before['id'] or set(after) != set(before):
        raise ValueError('Revision must retain program identity and complete field structure')
    if not isinstance(after.get('evidence'), list) or any(
            not isinstance(e, dict) or not isinstance(e.get('fields'), list)
            or any(not isinstance(field,str) for field in e['fields']) for e in after['evidence']):
        raise ValueError('Program evidence must be an array of field-evidence objects')
    changed = [key for key in before if before[key] != after[key]]
    if not changed:
        raise ValueError('No-op revision')
    field_paths = sorted(p for p in changed_paths(before, after) if p != 'evidence')
    for path in field_paths:
        if not any(e.get('checkedOn') == proposal['reviewedOn'] and any(covers(field,path) for field in e.get('fields', [])) for e in after.get('evidence', [])):
            raise ValueError('Changed field needs dated evidence: ' + path)
        # Early research used record-relative paths inside each program's own
        # evidence list. Preserve those dates when checking newer scoped reviews.
        prior_dates = [e['checkedOn'] for e in before['evidence']
                       if any(covers(re.sub(r'^programs\.\d+\.', '', field), path) for field in e['fields'])]
        if prior_dates and proposal['reviewedOn'] < max(prior_dates):
            raise ValueError('Changed field review predates its previous verification: ' + path)
    if not isinstance(proposal['sources'], list) or not proposal['sources'] or any(not isinstance(s,dict) for s in proposal['sources']):
        raise ValueError('New reviewed source versions are required')
    if any(s.get('checkedOn') != proposal['reviewedOn'] for s in proposal['sources']):
        raise ValueError('New source versions need the scoped review date')
    if any(not any(e.get('url') == s.get('url') and e.get('checkedOn') == proposal['reviewedOn'] for e in after.get('evidence', [])) for s in proposal['sources']):
        raise ValueError('New source versions must support dated program evidence')
    if set(changed) - {'application', 'unknowns', 'evidence'} and 'screening' not in proposal:
        raise ValueError('Changed terms require explicit replacement screening conditions and rules')
    edits = []

    def edit(path, keys, value):
        previous = copy.deepcopy(at(documents[path], keys))
        if previous != value:
            edits.append({'path': path, 'keys': keys, 'before': previous, 'after': copy.deepcopy(value)})
            replace(documents[path], keys, value)

    edit(*program_location, after)
    sources = copy.deepcopy(fund['enrichment']['sources'])
    for source in proposal['sources']:
        if source not in sources:
            sources.append(source)
    edit(*source_location, sources)
    if 'screening' in proposal:
        screening = proposal['screening']
        if not isinstance(screening, dict) or set(screening) != {'conditions', 'rules'}:
            raise ValueError('Screening requires explicit conditions and rules arrays')
        for kind in ['conditions', 'rules']:
            rows = screening[kind]
            if not isinstance(rows, list) or any(not isinstance(r,dict) or r.get('fundId') != fund['id'] or r.get('programId') != before['id'] or r.get('checkedOn') != proposal['reviewedOn'] for r in rows):
                raise ValueError('Screening replacement must target this program and use its review date')
            paths = screening_paths(root, kind)
            if kind == 'conditions':
                previous_rows = read(root, paths[0])[kind]
                for new in rows:
                    old = next((r for r in previous_rows if (r.get('fundId'), r.get('programId'), r.get('id')) == (fund['id'], before['id'], new.get('id'))), None)
                    if old and old != new and old['checkedOn'] == new['checkedOn']:
                        raise ValueError('Same-day condition changes require a new ID to invalidate saved answers')
            for i, path in enumerate(paths):
                documents[path] = read(root, path)
                retained = [r for r in documents[path][kind] if (r.get('fundId'), r.get('programId')) != (fund['id'], before['id'])]
                edit(path, [kind], retained + (rows if i == 0 else []))
    file_paths = sorted({e['path'] for e in edits})
    archive = {**proposal, 'beforeProgram': copy.deepcopy(before), 'priorFundRecord': fund,
               'retainedSources': copy.deepcopy(fund['enrichment']['sources']) + proposal['sources'],
               'changedFields': changed, 'changedPaths': field_paths, 'edits': edits,
               'beforeFileSha256': {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in file_paths}}
    # `before` was a reference into the source tree; edit() replaces it, never mutates it.
    path = f"research/revisions/{proposal['id']}.json"
    if (root / path).exists():
        raise ValueError('Revision archive path already exists; it cannot be overwritten')
    archive_bytes = encoded(archive)
    index['revisions'].append({'id': proposal['id'], 'path': path, 'sha256': hashlib.sha256(archive_bytes).hexdigest()})
    writes = {p: encoded(documents[p]) for p in file_paths}
    writes[path], writes[INDEX] = archive_bytes, encoded(index)
    return writes, archive


if __name__ == '__main__':
    import sys
    root = Path(sys.argv[1]).resolve()
    snapshot = read(root, 'dist/data/funders.json')
    validate_history(root, [f['enrichment'] for f in snapshot['funds']])
