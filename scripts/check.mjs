import {readdir,readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
for(const dir of ['src','scripts','tests','tests/browser'])for(const file of await readdir(dir))if(file.endsWith('.mjs')){const r=spawnSync(process.execPath,['--check',`${dir}/${file}`],{encoding:'utf8'});if(r.status){process.stderr.write(r.stderr);process.exit(r.status);}}
for(const file of await readdir('src')){const text=await readFile(`src/${file}`,'utf8');if(/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(text))throw new Error(`Unexpected network call in ${file}`);}
console.log('Syntax and no-network-call guard passed.');
