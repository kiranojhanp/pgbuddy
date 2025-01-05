"use strict";var u=Object.defineProperty;var f=Object.getOwnPropertyDescriptor;var E=Object.getOwnPropertyNames;var $=Object.prototype.hasOwnProperty;var p=(c,i)=>{for(var s in i)u(c,s,{get:i[s],enumerable:!0})},w=(c,i,s,t)=>{if(i&&typeof i=="object"||typeof i=="function")for(let e of E(i))!$.call(c,e)&&e!==s&&u(c,e,{get:()=>i[e],enumerable:!(t=f(i,e))||t.enumerable});return c};var R=c=>w(u({},"__esModule",{value:!0}),c);var y=(c,i,s)=>new Promise((t,e)=>{var a=r=>{try{n(s.next(r))}catch(o){e(o)}},h=r=>{try{n(s.throw(r))}catch(o){e(o)}},n=r=>r.done?t(r.value):Promise.resolve(r.value).then(a,h);n((s=s.apply(c,i)).next())});var I={};p(I,{PgBuddy:()=>d});module.exports=R(I);var d=class{constructor(i){this.sql=i}insert(i){return y(this,null,function*(){let{table:s,data:t,returning:e=["*"],debug:a=!1}=i;if(!s||typeof s!="string"||!s.trim())throw new Error("Invalid or empty table name");if(!t||Array.isArray(t)&&t.length===0)throw new Error("Invalid data to insert");let h=Array.isArray(t)?Object.keys(t[0]):Object.keys(t),n=this.sql`
      INSERT INTO ${this.sql(s)} 
      ${this.sql(t,h)}
      RETURNING ${e.length===1&&e[0]==="*"?this.sql`*`:this.sql(e)}
    `;return a&&(yield n.describe()),yield n})}update(i){return y(this,null,function*(){let{table:s,data:t,conditions:e,returning:a=["*"],debug:h=!1}=i;if(!s||typeof s!="string"||!s.trim())throw new Error("Invalid or empty table name");if(!t||typeof t!="object"||Object.keys(t).length===0)throw new Error("Invalid or empty data to insert");if(!e||typeof e!="object"||Object.keys(e).length===0)throw new Error("Conditions are required for updates to prevent accidental table-wide updates");let n=this.sql`
        UPDATE ${this.sql(s)}
        SET ${this.sql(t,Object.keys(t))}
        WHERE ${Object.entries(e).reduce((r,[o,q],m)=>m===0?this.sql`${this.sql(o)} = ${q}`:this.sql`${r} AND ${this.sql(o)} = ${q}`,this.sql``)}
        RETURNING ${a.length===1&&a[0]==="*"?this.sql`*`:this.sql(a)}
    `;return h&&(yield n.describe()),yield n})}delete(i){return y(this,null,function*(){let{table:s,conditions:t,returning:e=["*"],debug:a=!1}=i;if(!s||typeof s!="string"||!s.trim())throw new Error("Invalid table name.");if(!t||typeof t!="object"||Object.keys(t).length===0)throw new Error("No conditions provided for the DELETE operation.");let h=this.sql`
      DELETE FROM ${this.sql(s)}
      WHERE ${Object.entries(t).reduce((n,[r,o],q)=>q===0?this.sql`${this.sql(r)} = ${o}`:this.sql`${n} AND ${this.sql(r)} = ${o}`,this.sql``)}
      RETURNING ${e.length===0||e.includes("*")?this.sql`*`:this.sql(e)}
    `;return a&&(yield h.describe()),yield h})}select(i){return y(this,null,function*(){let{debug:s=!1,table:t,columns:e=["*"],orderBy:a,page:h=1,pageSize:n=10,search:r}=i;if(!t||typeof t!="string"||!t.trim())throw new Error("Invalid or empty table name");if(!Array.isArray(e)||e.some(l=>!l||typeof l!="string"||!l.trim()))throw new Error("Invalid or empty column names");if(r&&(!Array.isArray(r.columns)||r.columns.some(l=>!l||typeof l!="string"||!l.trim())||!r.query))throw new Error("Invalid search parameters");let o=(h-1)*n,q=this.sql`
    SELECT ${e.length===1&&e[0]==="*"?this.sql`*`:this.sql(e)}
    FROM ${this.sql(t)}
    ${r&&r.query&&r.columns&&Array.isArray(r.columns)?this.sql`
            WHERE ${r.columns.map(l=>this.sql`${this.sql(l)} ILIKE ${"%"+r.query+"%"}`).reduce((l,g,b)=>b===0?g:this.sql`${l} OR ${g}`)}
          `:this.sql``}
    ${a?this.sql`ORDER BY ${this.sql`${a}`}`:this.sql``}
    LIMIT ${n} OFFSET ${o}
  `;return s&&(yield q.describe()),yield q})}};0&&(module.exports={PgBuddy});
