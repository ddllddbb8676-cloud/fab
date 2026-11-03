import {createHash} from 'node:crypto';

// Version the entire local graph, including module workers. A query on main.js
// alone does not change the URLs of its relative imports in a browser cache.
export function moduleRevision(files,buildSource='') {
  const hash=createHash('sha256').update(buildSource.replaceAll('\r\n','\n'));
  for(const [name,source] of [...files].sort(([a],[b])=>a.localeCompare(b)))hash.update('\0'+name+'\0'+source.replaceAll('\r\n','\n'));
  return hash.digest('hex').slice(0,12);
}
export function versionLocalModules(source,revision) {
  if(!/^[a-f0-9]{12}$/.test(revision))throw new Error('Invalid module revision');
  return source.replace(/(['"])(\.{1,2}\/[^'"\r\n?]+\.js)\1/g,(_,quote,path)=>`${quote}${path}?v=${revision}${quote}`);
}
