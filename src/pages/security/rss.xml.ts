import type { APIRoute } from 'astro';
import rss from '@astrojs/rss';
import { securityList } from '@/lib/security';
import { withBase } from '@/lib/site-path';
export const GET:APIRoute=async ({site})=>{
  const items=securityList(new URLSearchParams(),50).items;
  const response=await rss({title:'HowieLog · 安全情报',description:'公开漏洞情报与修复信息；自动事实摘要，保留原始来源。',site:site!,items:items.map(item=>({title:`${item.id} · ${item.title}`,description:item.summary,link:withBase('/security/advisories/'+encodeURIComponent(item.id)),...(item.modified&&Number.isFinite(Date.parse(item.modified))?{pubDate:new Date(item.modified)}:{})}))});
  response.headers.set('Cache-Control','public, max-age=300');return response;
};
