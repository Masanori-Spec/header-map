import {parseStrictJSON,ValidationError,MAX_INPUT_BYTES} from './json.mjs';
export {parseStrictJSON,ValidationError,MAX_INPUT_BYTES};
export const LIMITS=Object.freeze({rows:30,columns:12,value:240,label:80,caption:120});
const fail=m=>{throw new ValidationError(m);};
function object(v,n,fields){if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail(`${n}: expected object`);const keys=Object.keys(v);if(keys.length!==fields.length||!fields.every(k=>Object.hasOwn(v,k)))fail(`${n}: required fields ${fields.join(', ')}; unknown fields rejected`);}
function array(v,n,max){if(!Array.isArray(v)||v.length>max)fail(`${n}: at most ${max} items`);for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))fail(`${n}: sparse arrays rejected`);return v;}
function text(v,n,max,empty=false){if(typeof v!=='string'||v.length>max||(!empty&&!v.trim())||v!==v.normalize('NFC')||/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\ud800-\udfff\ufffe\uffff]/u.test(v))fail(`${n}: ${empty?'0':'1'}–${max} NFC characters, no control or bidi-control characters`);if(!empty&&v!==v.trim())fail(`${n}: no surrounding whitespace`);return v;}
export function validateProject(input){
 object(input,'project',['schema','id','caption','rowHeaderLabel','rowGroupLabel','columns','rows','columnGroups','rowGroups']);if(input.schema!=='headermap.project.v1')fail('schema: expected headermap.project.v1');
 const used=new Set();const ident=(v,n)=>{if(typeof v!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(v))fail(`${n}: ID must start with a letter, 1–24 ASCII letters/digits/_/-`);if(used.has(v))fail(`${n}: duplicate ID ${v}`);used.add(v);return v;};
 const id=ident(input.id,'project'),caption=text(input.caption,'caption',120),rowHeaderLabel=text(input.rowHeaderLabel,'rowHeaderLabel',80),rowGroupLabel=text(input.rowGroupLabel,'rowGroupLabel',80);
 const columns=array(input.columns,'columns',12).map((c,i)=>{object(c,`column ${i+1}`,['id','label']);return {id:ident(c.id,`column ${i+1}`),label:text(c.label,`column ${i+1} label`,80)};});if(!columns.length)fail('columns: at least one required');
 const rows=array(input.rows,'rows',30).map((r,i)=>{object(r,`row ${i+1}`,['id','label','values']);const values=array(r.values,`row ${i+1} values`,12);if(values.length!==columns.length)fail(`row ${i+1}: value count must match columns`);return{id:ident(r.id,`row ${i+1}`),label:text(r.label,`row ${i+1} label`,80),values:values.map((v,j)=>text(v,`cell ${i+1}/${j+1}`,240,true))};});if(!rows.length)fail('rows: at least one required');
 const groups=(list,n,total)=>{const out=array(list,n,total).map((g,i)=>{object(g,`${n} ${i+1}`,['id','label','span']);if(!Number.isInteger(g.span)||g.span<1||g.span>total)fail(`${n} ${i+1}: span must be a positive integer`);return{id:ident(g.id,`${n} ${i+1}`),label:text(g.label,`${n} ${i+1} label`,80),span:g.span};});if(out.length&&out.reduce((s,g)=>s+g.span,0)!==total)fail(`${n}: spans must sum to ${total}`);return out;};
 const columnGroups=groups(input.columnGroups,'columnGroups',columns.length),rowGroups=groups(input.rowGroups,'rowGroups',rows.length);
 return{schema:'headermap.project.v1',id,caption,rowHeaderLabel,rowGroupLabel,columns,rows,columnGroups,rowGroups};
}
export const parseProject=text=>validateProject(parseStrictJSON(text));
export function blocks(groups,total){let start=0;return groups.length?groups.map(g=>{const b={...g,start};start+=g.span;return b;}):[{id:null,label:'',span:total,start:0}];}
export function associations(input,rowId,colId,mode='grouped'){
 const p=validateProject(input),ri=p.rows.findIndex(r=>r.id===rowId),ci=p.columns.findIndex(c=>c.id===colId);if(ri<0||ci<0)fail('Unknown row or column ID');if(!['grouped','split'].includes(mode))fail('Unknown association mode');
 const rgs=blocks(p.rowGroups,p.rows.length),cgs=blocks(p.columnGroups,p.columns.length),rgi=rgs.findIndex(g=>ri>=g.start&&ri<g.start+g.span),cgi=cgs.findIndex(g=>ci>=g.start&&ci<g.start+g.span),rg=rgs[rgi],cg=cgs[cgi],prefix=mode==='grouped'?p.id+'-g':`${p.id}-s-${rgi}-${cgi}`;
 return[...(mode==='grouped'&&rg.id?[{id:`${prefix}-rg-${rg.id}`,label:rg.label,kind:'rowgroup'}]:[]),{id:`${prefix}-r-${rowId}`,label:p.rows[ri].label,kind:'row'},...(mode==='grouped'&&cg.id?[{id:`${prefix}-cg-${cg.id}`,label:cg.label,kind:'colgroup'}]:[]),{id:`${prefix}-c-${colId}`,label:p.columns[ci].label,kind:'column'}];
}
export function parseTSV(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_INPUT_BYTES)fail('TSV: maximum 1,000,000 bytes');let value=raw.replace(/^\ufeff/,'').replaceAll('\r\n','\n');if(value.endsWith('\n'))value=value.slice(0,-1);if(value.includes('\r'))fail('TSV: use LF or CRLF line endings');
 const lines=value.split('\n').map(line=>line.split('\t'));if(lines.length<2||lines.length>31)fail('TSV: one header row and 1–30 data rows required');const width=lines[0].length;if(width<2||width>13||lines.some(r=>r.length!==width))fail('TSV: rectangular data with 1–12 value columns required');
 return validateProject({schema:'headermap.project.v1',id:'imported',caption:'Imported table',rowHeaderLabel:lines[0][0],rowGroupLabel:'Group',columns:lines[0].slice(1).map((label,i)=>({id:`c${i+1}`,label})),rows:lines.slice(1).map((r,i)=>({id:`r${i+1}`,label:r[0],values:r.slice(1)})),columnGroups:[],rowGroups:[]});
}
export function nextId(p,prefix){const ids=new Set([p.id,...p.columns.map(x=>x.id),...p.rows.map(x=>x.id),...p.columnGroups.map(x=>x.id),...p.rowGroups.map(x=>x.id)]);let n=1;while(ids.has(prefix+n))n++;return prefix+n;}
export function structure(input,action){
 const p=validateProject(input);const axis=action.axis;if(!['rows','columns'].includes(axis))fail('Unknown axis');const entries=p[axis],groups=p[axis==='rows'?'rowGroups':'columnGroups'];const max=axis==='rows'?30:12;
 if(action.type==='add'){
  if(entries.length>=max)fail(`Maximum ${max} ${axis}`);const id=nextId(p,axis==='rows'?'r':'c');if(axis==='rows')entries.push({id,label:`Row ${entries.length+1}`,values:p.columns.map(()=> '')});else{entries.push({id,label:`Column ${entries.length+1}`});p.rows.forEach(r=>r.values.push(''));}if(groups.length)groups.at(-1).span++;
 }else if(action.type==='remove'){
  const i=action.index;if(!Number.isInteger(i)||i<0||i>=entries.length||entries.length<=1)fail('Cannot remove this entry');if(groups.length){const g=blocks(groups,entries.length).find(g=>i>=g.start&&i<g.start+g.span);const index=groups.findIndex(x=>x.id===g.id);groups[index].span--;if(groups[index].span===0)groups.splice(index,1);}entries.splice(i,1);if(axis==='columns')p.rows.forEach(r=>r.values.splice(i,1));
 }else if(action.type==='move'){
  const i=action.index,j=i+action.direction;if(!Number.isInteger(i)||![-1,1].includes(action.direction)||i<0||j<0||i>=entries.length||j>=entries.length)fail('Cannot move this entry');[entries[i],entries[j]]=[entries[j],entries[i]];if(axis==='columns')p.rows.forEach(r=>{[r.values[i],r.values[j]]=[r.values[j],r.values[i]];});
 }else if(action.type==='group'){
  if(!groups.length)groups.push({id:nextId(p,axis==='rows'?'rg':'cg'),label:'Group 1',span:entries.length});else{const g=[...groups].reverse().find(g=>g.span>1);if(!g)fail('Every group already has one entry');g.span--;const at=groups.indexOf(g);groups.splice(at+1,0,{id:nextId(p,axis==='rows'?'rg':'cg'),label:`Group ${groups.length+1}`,span:1});}
 }else if(action.type==='ungroup'){groups.splice(0);}else fail('Unknown structure action');return validateProject(p);
}
