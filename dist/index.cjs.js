"use strict";var u=Object.defineProperty;var $=Object.getOwnPropertyDescriptor;var f=Object.getOwnPropertyNames;var E=Object.prototype.hasOwnProperty;var b=(a,r)=>{for(var t in r)u(a,t,{get:r[t],enumerable:!0})},S=(a,r,t,l)=>{if(r&&typeof r=="object"||typeof r=="function")for(let e of f(r))!E.call(a,e)&&e!==t&&u(a,e,{get:()=>r[e],enumerable:!(l=$(r,e))||l.enumerable});return a};var w=a=>S(u({},"__esModule",{value:!0}),a);var p=(a,r,t)=>new Promise((l,e)=>{var m=s=>{try{n(t.next(s))}catch(o){e(o)}},q=s=>{try{n(t.throw(s))}catch(o){e(o)}},n=s=>s.done?l(s.value):Promise.resolve(s.value).then(m,q);n((t=t.apply(a,r)).next())});var I={};b(I,{PgBuddy:()=>c});module.exports=w(I);var c=class{constructor(r){this.sql=r}select(r){return p(this,null,function*(){let{debug:t=!1,table:l,columns:e=["*"],orderBy:m,page:q=1,pageSize:n=10,search:s}=r;if(!l||typeof l!="string"||!l.trim())throw new Error("Invalid or empty table name");if(!Array.isArray(e)||e.some(i=>!i||typeof i!="string"||!i.trim()))throw new Error("Invalid or empty column names");if(s&&(!Array.isArray(s.columns)||s.columns.some(i=>!i||typeof i!="string"||!i.trim())||!s.query))throw new Error("Invalid search parameters");let o=(q-1)*n,h=this.sql`
    SELECT ${e.length===1&&e[0]==="*"?this.sql`*`:this.sql(e)}
    FROM ${this.sql(l)}
    ${s&&s.query&&s.columns&&Array.isArray(s.columns)?this.sql`
            WHERE ${s.columns.map(i=>this.sql`${this.sql(i)} ILIKE ${"%"+s.query+"%"}`).reduce((i,y,g)=>g===0?y:this.sql`${i} OR ${y}`)}
          `:this.sql``}
    ${m?this.sql`ORDER BY ${this.sql`${m}`}`:this.sql``}
    LIMIT ${n} OFFSET ${o}
  `;return t&&(yield h.describe()),yield h})}};0&&(module.exports={PgBuddy});
