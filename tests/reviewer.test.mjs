import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateProject, parseProject, parseStrictJSON, parseTSV, structure, associations, MAX_INPUT_BYTES } from '../src/core.mjs';
import { exportFragment, exportHTML, toJSON } from '../src/export.mjs';
import { createDOM } from './dom-stub.mjs';

const fixture=()=>({schema:'headermap.project.v1',id:'review',caption:'Independent / 日本語',rowHeaderLabel:'Entry',rowGroupLabel:'Set',columns:[{id:'cA',label:'Same'},{id:'cB',label:'Same'},{id:'cC',label:'Same'},{id:'cD',label:'Same'}],rows:[{id:'rA',label:'Same',values:['  keep  ','','<&"\'>','é / 😀']},{id:'rB',label:'Same',values:['=SUM(A1:A2)','</td><script>x</script>','&amp;',' ']},{id:'rC',label:'Same',values:['c:a','03','0','終']},{id:'rD',label:'Same',values:['d:a','d:b','d:c','d:d']}],columnGroups:[],rowGroups:[]});
function partitions(n){if(n===0)return [[]];return Array.from({length:n},(_,i)=>i+1).flatMap(k=>partitions(n-k).map(rest=>[k,...rest]));}
function groups(parts,axis){return parts.map((span,i)=>({id:`${axis}G${i}`,label:'Repeated / group',span}));}

// Independent fragment reader uses ElementTree, not the production compiler,
// association helper, DOM test double, or existing HTMLParser oracle.
const fragmentCheck=String.raw`
import json,sys,xml.etree.ElementTree as E
for item in json.load(sys.stdin):
 p,mode=item['project'],item['mode'];root=E.fromstring('<root>'+item['html']+'</root>')
 def membership(groups,entries):
  if not groups:return {e['id']:None for e in entries}
  names=[g['id'] for g in groups for _ in range(g['span'])]
  return {entry['id']:name for entry,name in zip(entries,names)}
 rg=membership(p['rowGroups'],p['rows']);cg=membership(p['columnGroups'],p['columns'])
 values={(r['id'],c['id']):r['values'][j] for r in p['rows'] for j,c in enumerate(p['columns'])}
 all_ids=[e.attrib['id'] for e in root.iter() if 'id' in e.attrib]
 assert len(all_ids)==len(set(all_ids)), 'duplicate IDs'
 seen=set()
 for table in root:
  heads={h.attrib['id']:h for h in table.iter('th') if 'id' in h.attrib}
  grid={};y=0
  for section in table:
   if section.tag not in ('thead','tbody'):continue
   rows=list(section);section_end=y+len(rows)
   for tr in rows:
    x=0
    for cell in tr:
     while (y,x) in grid:x+=1
     rs=int(cell.attrib.get('rowspan','1'));cs=int(cell.attrib.get('colspan','1'))
     assert rs>=1 and cs>=1 and y+rs<=section_end, 'cross-section span'
     for yy in range(y,y+rs):
      for xx in range(x,x+cs):
       assert (yy,xx) not in grid,'overlapping span';grid[yy,xx]=cell
     if cell.tag=='td':
      key=(cell.attrib['data-row'],cell.attrib['data-col']);assert key not in seen,'repeated coordinate';seen.add(key)
      assert ''.join(cell.itertext())==values[key], 'changed value'
      ids=cell.attrib['headers'].split();assert len(ids)==len(set(ids));assert all(k in heads for k in ids),'foreign/missing header'
      header_set={(heads[k].attrib['scope'],k.rsplit('-',1)[-1]) for k in ids}
      expected={('row',key[0]),('col',key[1])}
      if mode=='grouped':
       if rg[key[0]] is not None:expected.add(('rowgroup',rg[key[0]]))
       if cg[key[1]] is not None:expected.add(('colgroup',cg[key[1]]))
      assert header_set==expected,(header_set,expected)
     x+=cs
    y+=1
  width=max(x for _,x in grid)+1
  assert len(grid)==width*y,'grid hole'
  if mode=='split':
   caption=''.join(table.find('caption').itertext());assert caption.startswith(p['caption'])
 assert seen==set(values),'missing coordinates'
 assert len(root)==(1 if mode=='grouped' else max(1,len(p['rowGroups']))*max(1,len(p['columnGroups'])))
print('independent fragment checks passed')
`;

test('review: exhaustive 162 four-by-four partition/mode fragments retain exact coordinates, scopes, spans and values',()=>{
 const cases=[];
 for(const rp of [[],...partitions(4)])for(const cp of [[],...partitions(4)])for(const mode of ['grouped','split']){
  const p=fixture();p.rowGroups=groups(rp,'r');p.columnGroups=groups(cp,'c');cases.push({project:p,mode,html:exportFragment(p,mode)});
 }
 assert.equal(cases.length,162);
 const run=spawnSync('python3',['-c',fragmentCheck],{input:JSON.stringify(cases),encoding:'utf8',timeout:10000,maxBuffer:1_000_000});
 assert.equal(run.status,0,run.stderr||run.error?.message);assert.match(run.stdout,/checks passed/);
});

function keyedValues(p){return new Map(p.rows.flatMap(r=>p.columns.map((c,i)=>[`${r.id}/${c.id}`,r.values[i]])));}

test('review: 240-step structural exercise preserves every surviving identity/value and input immutability',()=>{
 let p=fixture(),state=71321;
 const random=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
 for(let i=0;i<240;i++){
  const axis=i%2?'columns':'rows',original=p,before=structuredClone(p),old=keyedValues(p),kind=['move','add','remove','group','ungroup'][random(5)];
  let action={axis,type:kind};const len=p[axis].length;
  if(kind==='move'){if(len===1)continue;const index=random(len-1);action={...action,index,direction:1};}
  if(kind==='remove'){if(len===1)continue;action.index=random(len);}
  if(kind==='add'&&len===(axis==='rows'?30:12))continue;
  try{p=structure(p,action);}catch(e){assert.equal(kind,'group');assert.match(e.message,/one entry/);continue;}
  assert.deepEqual(original,before);
  for(const [key,v]of keyedValues(p))assert.equal(v,old.has(key)?old.get(key):'');
  assert.deepEqual(parseProject(toJSON(p)),p);
 }
});

test('review: group-boundary moves change only contextual group membership, never source identities',()=>{
 const p=fixture();p.rowGroups=groups([1,3],'r');p.columnGroups=groups([3,1],'c');
 const moved=structure(structure(p,{axis:'rows',type:'move',index:0,direction:1}),{axis:'columns',type:'move',index:2,direction:1});
 assert.deepEqual([...keyedValues(moved)].sort(),[...keyedValues(p)].sort());
 assert.deepEqual(associations(moved,'rA','cC').map(x=>x.id),['review-g-rg-rG1','review-g-r-rA','review-g-cg-cG1','review-g-c-cC']);
});

test('review: sparse axes and partition lists, malformed Unicode, duplicate decoded keys and prototype shapes reject',()=>{
 for(const mutate of [p=>delete p.columnGroups[0],p=>delete p.rows[0].values[0],p=>p.rows[0].label='e\u0301',p=>p.rows[0].values[0]='\udfff',p=>p.rowGroups[0].id=p.columns[0].id]){
  const p=fixture();p.columnGroups=groups([4],'c');p.rowGroups=groups([4],'r');mutate(p);assert.throws(()=>validateProject(p));
 }
 assert.throws(()=>parseStrictJSON('{"outer":{"id":"a","\\u0069d":"b"}}'));
 const p=Object.assign(Object.create({inherited:true}),fixture());assert.throws(()=>validateProject(p));
 const raw=parseStrictJSON('{"__proto__":{"polluted":true},"constructor":1}');assert.equal(Object.getPrototypeOf(raw),null);assert.equal({}.polluted,undefined);
});

test('review: maximum grouped project round-trips below the byte cap and empty/padded/astral values remain exact',()=>{
 const p=fixture();p.caption='界'.repeat(120);p.rowHeaderLabel=p.rowGroupLabel='界'.repeat(80);
 p.columns=Array.from({length:12},(_,i)=>({id:`c${i}`,label:'界'.repeat(80)}));
 p.rows=Array.from({length:30},(_,i)=>({id:`r${i}`,label:'界'.repeat(80),values:Array(12).fill('界'.repeat(240))}));
 p.columnGroups=groups(Array(12).fill(1),'c');p.rowGroups=groups(Array(30).fill(1),'r');
 const json=toJSON(p);assert.ok(Buffer.byteLength(json)<MAX_INPUT_BYTES);assert.deepEqual(parseProject(json),p);
 assert.equal((exportFragment(p,'split').match(/<table /g)||[]).length,360);
 const q=fixture();assert.deepEqual(parseProject(toJSON(q)).rows,q.rows);assert.ok(!exportHTML(q).includes('<script>'));
});

test('review: TSV whitespace and formula-like values remain literal without CSV-style interpretation',()=>{
 const p=parseTSV('Entry\tValue\r\nOne\t  =1+1  \r\nTwo\t"quoted"\r\nThree\t\r\n');
 assert.deepEqual(p.rows.map(r=>r.values[0]),['  =1+1  ','"quoted"','']);assert.match(exportFragment(p),/  =1\+1  /);assert.match(exportFragment(p),/&quot;quoted&quot;/);
});

let serial=0;
async function ui(){const dom=createDOM();globalThis.document=dom.document;globalThis.window=dom.window;await import(`../src/app.mjs?independentReview=${serial++}`);const $=id=>dom.document.getElementById(id),find=q=>dom.document.querySelector(q);const input=async(id,v)=>{$(id).value=v;await $(id).emit('input');};return {...dom,$,find,input};}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};

test('review: malformed UTF-8 file bytes reject without altering the prepared import or applied values',async()=>{
 const app=await ui();await app.input('import-text','preserve this draft');
 const valid=Buffer.from(toJSON(fixture())),needle=Buffer.from('  keep  '),at=valid.indexOf(needle);assert.ok(at>=0);valid[at]=0xff;
 const blob=new Blob([valid]);app.$('file').files=[{name:'malformed.json',size:blob.size,text:()=>blob.text(),arrayBuffer:()=>blob.arrayBuffer()}];
 await app.$('file').emit('change');
 assert.equal(app.$('notice').getAttribute('role'),'alert');assert.equal(app.$('import-text').value,'preserve this draft');
});

test('review: valid replacement-character text is distinct from malformed UTF-8 and remains importable',async()=>{
 const app=await ui(),p=fixture();p.rows[0].values[0]='valid � text';const blob=new Blob([toJSON(p)]);
 app.$('file').files=[{name:'valid.json',size:blob.size,text:()=>blob.text(),arrayBuffer:()=>blob.arrayBuffer()}];await app.$('file').emit('change');
 assert.equal(parseProject(app.$('import-text').value).rows[0].values[0],'valid � text');
});

test('review: a pending import cannot replace a newer dirty draft or superseding oversized selection',async()=>{
 const app=await ui(),old=deferred();await app.input('import-text','kept');
 app.$('file').files=[{name:'old.json',size:50,text:()=>old.promise,arrayBuffer:async()=>new TextEncoder().encode(await old.promise).buffer}];const pending=app.$('file').emit('change');
 app.$('file').files=[{name:'huge.json',size:MAX_INPUT_BYTES+1,text:()=>{throw Error('must not read');},arrayBuffer:()=>{throw Error('must not read');}}];await app.$('file').emit('change');old.resolve(toJSON(fixture()));await pending;
 assert.equal(app.$('import-text').value,'kept');assert.equal(app.$('notice').getAttribute('role'),'alert');
});

test('review: history cap retains 50 applied snapshots and a pending draft does not consume one',async()=>{
 const app=await ui();
 for(let i=1;i<=55;i++){await app.input('cell-value',`revision-${i}`);await app.find('[data-apply]').click();}
 await app.input('cell-value','pending');await app.$('undo').click();assert.equal(app.$('cell-value').value,'revision-55');
 for(let i=0;i<50;i++)await app.$('undo').click();assert.equal(app.$('cell-value').value,'revision-5');assert.equal(app.$('undo').disabled,true);
 for(let i=0;i<50;i++)await app.$('redo').click();assert.equal(app.$('cell-value').value,'revision-55');assert.equal(app.$('redo').disabled,true);
});
