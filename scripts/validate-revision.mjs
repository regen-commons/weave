import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {validateSnapshot} from './research-validation.mjs';
import {loadScreening,validateScreening} from './screening-validation.mjs';
const root=pathToFileURL(process.argv[2].replace(/\/$/,'')+'/');
const data=validateSnapshot(root);
const {rules,conditions}=await loadScreening(root);
validateScreening(data,rules,conditions);
for(const [path,value] of [['dist/data/program-conditions.json',conditions],['dist/data/eligibility-rules.json',rules]]) {
  const file=new URL(path,root);
  if(process.argv[3]==='--write-screening') fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
  else if(!isDeepStrictEqual(JSON.parse(fs.readFileSync(file,'utf8')),value))
    throw Error('Generated screening is stale; run bun run build: '+path);
}
