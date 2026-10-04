import {spawnSync} from 'node:child_process';
const code=String.raw`
import pathlib, hashlib, json, zipfile
root=pathlib.Path.cwd(); out=root.parent/'header-map-output'; out.mkdir(exist_ok=True)
files=sorted(p for p in root.rglob('*') if p.is_file() and not any(part in {'node_modules','dist','.git','artifacts','__pycache__','generated'} for part in p.relative_to(root).parts) and p.suffix not in {'.log','.pyc'})
manifest={'project':'HeaderMap','version':'0.1.0','files':[{ 'path':p.relative_to(root).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(out/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
for name,items,prefix in [('header-map-source.zip',files,'header-map/'),('header-map-static.zip',sorted(p for p in (root/'dist').rglob('*') if p.is_file()),'')]:
    with zipfile.ZipFile(out/name,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in items:
            rel=p.relative_to(root if prefix else root/'dist').as_posix(); info=zipfile.ZipInfo(prefix+rel,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16;z.writestr(info,p.read_bytes())
    print(name, (out/name).stat().st_size, hashlib.sha256((out/name).read_bytes()).hexdigest())
print('Source files:',len(files))
`;
const result=spawnSync('python',['-c',code],{stdio:'inherit'});if(result.status)process.exit(result.status);
