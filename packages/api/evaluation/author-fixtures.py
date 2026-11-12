"""One-time synthetic benchmark authoring; run before tuning, never to repair scores.
Labels are agent-authored, not independent human judgments. Topic families stay in
one split. The checked-in JSON and its digest, not this script, identify a release.
"""
import hashlib, json
from pathlib import Path

# Query wording, evidence wording, independent near-neighbour distractor.
families = {
 'art': [
  ('mural painting', 'wall art', 'wall insulation'),
  ('ceramic firing', 'pottery kiln', 'pottery shipping'),
  ('audio recording', 'sound recording', 'sound insulation'),
  ('film editing', 'video post production', 'video streaming'),
  ('textile weaving', 'loom weaving', 'textile retail'),
  ('oral history', 'recorded life stories', 'life insurance'),
  ('printmaking', 'screen printing', 'screen repair'),
  ('sculpture casting', 'bronze casting', 'bronze cleaning'),
  ('dance teaching', 'dance instruction', 'dance ticketing'),
  ('art conservation', 'artwork restoration', 'artwork shipping'),
 ],
 'software': [
  ('mapmaking', 'cartography', 'geography trivia'),
  ('software testing', 'quality assurance', 'quality furniture'),
  ('screen reader support', 'web accessibility', 'web advertising'),
  ('data visualization', 'interactive charts', 'chart music'),
  ('application security', 'software security', 'security fencing'),
  ('language translation', 'language localization', 'language classification'),
  ('database administration', 'database maintenance', 'data entry'),
  ('offline synchronization', 'offline data sync', 'offline events'),
  ('version control', 'source code management', 'source water protection'),
  ('user research', 'usability studies', 'clinical studies'),
 ],
 'research': [
  ('statistical analysis', 'statistical modelling', 'fashion modelling'),
  ('DNA sequencing', 'genome sequencing', 'genome illustration'),
  ('water quality testing', 'water quality analysis', 'water delivery'),
  ('microscopy', 'microscope imaging', 'satellite imaging'),
  ('survey design', 'questionnaire design', 'furniture design'),
  ('systematic review', 'evidence synthesis', 'music synthesis'),
  ('species identification', 'taxonomic identification', 'identity documents'),
  ('soil analysis', 'soil testing', 'soil transport'),
  ('research data stewardship', 'research data curation', 'art curation'),
  ('air quality monitoring', 'air pollution measurement', 'air conditioning'),
 ],
 'place': [
  ('wetland restoration', 'marsh rehabilitation', 'hospital rehabilitation'),
  ('rainwater harvesting', 'rainwater collection', 'waste collection'),
  ('bicycle repair', 'bike maintenance', 'bike racing'),
  ('seed saving', 'seed conservation', 'seed finance'),
  ('food redistribution', 'surplus food distribution', 'food photography'),
  ('composting', 'organic waste composting', 'waste incineration'),
  ('community mediation', 'conflict resolution', 'conflict reporting'),
  ('solar installation', 'photovoltaic installation', 'solar astronomy'),
  ('river restoration', 'stream rehabilitation', 'video stream production'),
  ('tree planting', 'reforestation', 'forest tourism'),
 ],
}
queries, projects = [], []
for domain, rows in families.items():
 for i, (query, evidence, distractor) in enumerate(rows):
  split = 'development' if i % 2 == 0 else 'holdout'
  family = f'{domain}-{i:02}'
  for suffix, passage, relevant in [
   ('a', f'Our ongoing practice is {evidence}. We document completed activities and techniques.', True),
   ('b', f'The collective runs {query} sessions with a documented portfolio.', True),
   ('negative', f'We no longer do {evidence}.', False),
   ('request', f'We are seeking {evidence}.', False),
   ('near', f'Our current practice is {distractor}.', False),
  ]:
   projects.append({'id':f'{family}-{suffix}', 'family':family, 'split':split,
     'domain':domain, 'passage':passage, 'source':'synthetic', 'relevant':relevant})
  for kind in ['need', 'offer']:
   for variant, title in enumerate([query, f'{query} for a neighbourhood initiative']):
    queries.append({'id':f'{family}-{kind}-{variant}', 'family':family, 'split':split,
     'domain':domain, 'kind':kind, 'title':title,
     'relevant':[f'{family}-a',f'{family}-b'],
     'rationale':f'Documented {evidence} or {query}; availability and demand are unknown.'})
no_match = {
 'art': ['lacquer gilding', 'glass etching'],
 'software': ['quantum compilation', 'hardware soldering'],
 'research': ['cryogenic isotope separation', 'radiocarbon dating'],
 'place': ['snow avalanche control', 'coastal desalination'],
}
for domain in families:
 for split in ['development','holdout']:
  for kind in ['need','offer']:
   queries.append({'id':f'{domain}-{split}-{kind}-none','family':f'{domain}-{split}-none',
    'split':split,'domain':domain,'kind':kind,'title':no_match[domain][0 if split == 'development' else 1],
    'relevant':[], 'rationale':'No project in this collection documents this activity.'})
data = {'version':2,'annotationStatus':'synthetic-agent-authored-awaiting-human-review',
 'splitPolicy':'project/topic-family/query-disjoint; freeze before scoring holdout; no holdout tuning',
 'projects':projects, 'queries':queries}
target = Path(__file__).with_name('matching-v2.json')
target.write_text(json.dumps(data,indent=2)+'\n')
target.with_suffix('.sha256').write_text(hashlib.sha256(target.read_bytes()).hexdigest()+'\n')
