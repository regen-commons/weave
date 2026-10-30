"""Prepare an existing-program revision in a local checkout, never publish it."""
import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from revision_import import INDEX, digest, encoded, load_history, prepare, read


def validate(root, write_screening=False):
    subprocess.run(['node', str(root / 'scripts/validate-revision.mjs'), str(root)] + (['--write-screening'] if write_screening else []),
                   check=True, capture_output=True, text=True)


def check_base(root, base):
    if not re.fullmatch('[0-9a-f]{40}', base):
        raise ValueError('Base must be an exact Git commit SHA')
    paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', base, 'research/revisions'], cwd=root, text=True).splitlines()
    old = json.loads(subprocess.check_output(['git', 'show', f'{base}:{INDEX}'], cwd=root)) if INDEX in paths else {'version': 1, 'revisions': []}
    current, _ = load_history(root)
    if current['revisions'][:len(old['revisions'])] != old['revisions']:
        raise ValueError('Revision index must be append-only relative to base')
    for entry in old['revisions']:
        previous = subprocess.check_output(['git', 'show', base + ':' + entry['path']], cwd=root)
        if (root / entry['path']).read_bytes() != previous:
            raise ValueError('A previously committed revision archive was changed')
    additions = current['revisions'][len(old['revisions']):]
    if additions:
        baseline = json.loads(subprocess.check_output(['git','show',base+':dist/data/funders.json'],cwd=root))
        expected = {f['id']: f for f in baseline['funds']}
        changed = set()
        for entry in additions:
            revision = read(root, entry['path'])
            if expected.get(revision['fundId']) != revision['priorFundRecord']:
                raise ValueError('New revision does not retain the exact base/preceding full record')
            result = revision['resultFundRecord']
            if result['id'] != revision['fundId']:
                raise ValueError('Revision result changes funder identity')
            expected[revision['fundId']] = result
            changed.add(revision['fundId'])
        actual = {f['id']:f for f in read(root,'dist/data/funders.json')['funds']}
        if any(actual.get(id) != expected[id] for id in changed):
            raise ValueError('Catalog does not match the final revision result')


def stage(root, proposal, apply=False):
    validate(root)
    writes, archive = prepare(root, proposal)
    original = {p: (root / p).read_bytes() if (root / p).exists() else None for p in writes}
    with tempfile.TemporaryDirectory(prefix='funding-revision-') as directory:
        fixture = Path(directory)
        for path in ['research', 'scripts', 'dist']:
            shutil.copytree(root / path, fixture / path,
                            ignore=shutil.ignore_patterns('__pycache__', 'models', 'assets', 'fund-vectors.*'))
        for path, content in writes.items():
            (fixture / path).parent.mkdir(parents=True, exist_ok=True)
            (fixture / path).write_bytes(content)
        subprocess.run(['python3', 'scripts/import-data.py'], cwd=fixture,
                       check=True, capture_output=True, text=True)
        validate(fixture, write_screening=True)
        before = read(root, 'dist/data/funders.json')['funds']
        after = read(fixture, 'dist/data/funders.json')['funds']
        if [f['id'] for f in before] != [f['id'] for f in after]:
            raise ValueError('Revision cannot add or remove funder identities')
        for old, new in zip(before, after):
            if old['id'] != proposal['fundId'] and old != new:
                raise ValueError('Revision unexpectedly changes another full record: ' + old['id'])
        archive['resultFundRecord'] = next(f for f in after if f['id'] == proposal['fundId'])
        archive_path = f"research/revisions/{proposal['id']}.json"
        writes[archive_path] = encoded(archive)
        index = json.loads(writes[INDEX])
        index['revisions'][-1]['sha256'] = hashlib.sha256(writes[archive_path]).hexdigest()
        writes[INDEX] = encoded(index)
        (fixture / archive_path).write_bytes(writes[archive_path])
        (fixture / INDEX).write_bytes(writes[INDEX])
        validate(fixture)
        for path in (fixture / 'dist/data').glob('*.json'):
            relative = path.relative_to(fixture).as_posix()
            if path.read_bytes() != (root / relative).read_bytes():
                writes[relative] = path.read_bytes()
                original[relative] = (root / relative).read_bytes()
        if apply:
            # Detect edits made after preflight, including a second local process.
            for path, previous in original.items():
                current = (root / path).read_bytes() if (root / path).exists() else None
                if current != previous:
                    raise ValueError('Checkout changed during preparation; retry against current data')
            written = []
            try:
                for path, content in writes.items():
                    destination = root / path
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    temp = destination.with_suffix(destination.suffix + '.revision-tmp')
                    temp.write_bytes(content)
                    os.replace(temp, destination)
                    written.append(path)
            except OSError:
                for path in reversed(written):
                    if original[path] is None:
                        (root / path).unlink()
                    else:
                        (root / path).write_bytes(original[path])
                raise
            finally:
                for path in writes:
                    destination = root / path
                    destination.with_suffix(destination.suffix + '.revision-tmp').unlink(missing_ok=True)
    return {'id': proposal['id'], 'fundId': proposal['fundId'], 'programId': proposal['programId'],
            'changedFields': archive['changedFields'], 'files': sorted(writes),
            'appliedToLocalCheckout': apply, 'historyArchive': f"research/revisions/{proposal['id']}.json"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('proposal', nargs='?')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--apply', action='store_true', help='Stage locally; never merge or publish')
    parser.add_argument('--template', nargs=2, metavar=('FUND_ID', 'PROGRAM_ID'))
    parser.add_argument('--check-base', metavar='COMMIT_SHA')
    args = parser.parse_args()
    root = args.root.resolve()
    if args.check_base:
        check_base(root, args.check_base)
        print('Committed revision history is append-only')
        return
    if args.template:
        fund_id, program_id = args.template
        fund = next(f for f in read(root, 'dist/data/funders.json')['funds'] if f['id'] == fund_id)
        program = next(p for p in fund['enrichment']['programs'] if p['id'] == program_id)
        print(json.dumps({'version': 1, 'id': 'replace-with-unique-revision-id', 'fundId': fund_id,
                          'programId': program_id, 'expectedFundSha256': digest(fund),
                          'reviewedOn': 'YYYY-MM-DD', 'reason': '', 'afterProgram': program,
                          'sources': []}, ensure_ascii=False, indent=2))
        return
    if not args.proposal:
        parser.error('Supply a proposal, --template, or --check-base')
    if args.apply:
        branch = subprocess.check_output(['git','branch','--show-current'],cwd=root,text=True).strip()
        if not branch.startswith('codex/'):
            raise ValueError('Stage revisions on an isolated codex/ branch, never main or a detached checkout')
    proposal = json.loads(Path(args.proposal).read_text())
    lock_path = root / '.cache/revision-import.lock'
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        print(json.dumps(stage(root, proposal, args.apply)))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, StopIteration, OSError, subprocess.CalledProcessError) as error:
        detail = getattr(error, 'stderr', None) or str(error)
        raise SystemExit('Revision rejected: ' + detail)
