// Read account/DNS status using the existing Wrangler login. Never print the token.
import { execFileSync } from 'node:child_process';
const cli = process.argv[2] || 'node_modules/wrangler/bin/wrangler.js';
let auth;
try { auth = JSON.parse(execFileSync(process.execPath,[cli,'auth','token','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})); }
catch { console.log(JSON.stringify({authenticated:false})); process.exit(1); }
const token = auth.token;
if (!token) { console.log(JSON.stringify({authenticated:false,fields:Object.keys(auth)})); process.exit(1); }
const account = '2e7685e9fc3ab45142bb39eaa78a16a6';
for(const endpoint of [`accounts/${account}/subscriptions`,'zones?name=semitoon.com',`accounts/${account}/workers/domains`]) {
  const response=await fetch(`https://api.cloudflare.com/client/v4/${endpoint}`,{headers:{Authorization:`Bearer ${token}`}});
  const data=await response.json();
  const result=Array.isArray(data.result)?data.result.map(r=>endpoint.endsWith('subscriptions')?{id:r.id,rate_plan:r.rate_plan,state:r.state,price:r.price}:endpoint.startsWith('zones')?{id:r.id,name:r.name,status:r.status,plan:r.plan?.name}:{hostname:r.hostname,service:r.service,zone_id:r.zone_id}):null;
  console.log(JSON.stringify({endpoint,status:response.status,success:data.success,result,errors:data.errors?.map(e=>e.message)}));
}
