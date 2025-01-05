"use strict";var u=Object.defineProperty;var f=Object.getOwnPropertyDescriptor;var p=Object.getOwnPropertyNames;var $=Object.prototype.hasOwnProperty;var w=(l,i)=>{for(var e in i)u(l,e,{get:i[e],enumerable:!0})},E=(l,i,e,t)=>{if(i&&typeof i=="object"||typeof i=="function")for(let r of p(i))!$.call(l,r)&&r!==e&&u(l,r,{get:()=>i[r],enumerable:!(t=f(i,r))||t.enumerable});return l};var I=l=>E(u({},"__esModule",{value:!0}),l);var q=(l,i,e)=>new Promise((t,r)=>{var o=s=>{try{a(e.next(s))}catch(c){r(c)}},h=s=>{try{a(e.throw(s))}catch(c){r(c)}},a=s=>s.done?t(s.value):Promise.resolve(s.value).then(o,h);a((e=e.apply(l,i)).next())});var R={};w(R,{PgBuddy:()=>m});module.exports=I(R);var m=class{constructor(i){this.sql=i}insert(i){return q(this,null,function*(){let{table:e,data:t,returning:r=["*"],debug:o=!1}=i;if(!e||typeof e!="string"||!e.trim())throw new Error("Invalid or empty table name");if(!t||Array.isArray(t)&&t.length===0)throw new Error("Invalid data to insert");let h=Array.isArray(t)?Object.keys(t[0]):Object.keys(t),a=this.sql`
      INSERT INTO ${this.sql(e)} 
      ${this.sql(t,h)}
      RETURNING ${r.length===1&&r[0]==="*"?this.sql`*`:this.sql(r)}
    `;return o&&(yield a.describe()),yield a})}update(i){return q(this,null,function*(){let{table:e,data:t,conditions:r,returning:o=["*"],debug:h=!1}=i;if(!e||typeof e!="string"||!e.trim())throw new Error("Invalid or empty table name");if(!t||typeof t!="object"||Object.keys(t).length===0)throw new Error("Invalid or empty data to insert");if(!r||typeof r!="object"||Object.keys(r).length===0)throw new Error("Conditions are required for updates to prevent accidental table-wide updates");let a=this.sql`
        UPDATE ${this.sql(e)}
        SET ${this.sql(t,Object.keys(t))}
        WHERE ${Object.entries(r).reduce((s,[c,y],d)=>d===0?this.sql`${this.sql(c)} = ${y}`:this.sql`${s} AND ${this.sql(c)} = ${y}`,this.sql``)}
        RETURNING ${o.length===1&&o[0]==="*"?this.sql`*`:this.sql(o)}
    `;return h&&(yield a.describe()),yield a})}select(i){return q(this,null,function*(){let{debug:e=!1,table:t,columns:r=["*"],orderBy:o,page:h=1,pageSize:a=10,search:s}=i;if(!t||typeof t!="string"||!t.trim())throw new Error("Invalid or empty table name");if(!Array.isArray(r)||r.some(n=>!n||typeof n!="string"||!n.trim()))throw new Error("Invalid or empty column names");if(s&&(!Array.isArray(s.columns)||s.columns.some(n=>!n||typeof n!="string"||!n.trim())||!s.query))throw new Error("Invalid search parameters");let c=(h-1)*a,y=this.sql`
    SELECT ${r.length===1&&r[0]==="*"?this.sql`*`:this.sql(r)}
    FROM ${this.sql(t)}
    ${s&&s.query&&s.columns&&Array.isArray(s.columns)?this.sql`
            WHERE ${s.columns.map(n=>this.sql`${this.sql(n)} ILIKE ${"%"+s.query+"%"}`).reduce((n,g,b)=>b===0?g:this.sql`${n} OR ${g}`)}
          `:this.sql``}
    ${o?this.sql`ORDER BY ${this.sql`${o}`}`:this.sql``}
    LIMIT ${a} OFFSET ${c}
  `;return e&&(yield y.describe()),yield y})}};0&&(module.exports={PgBuddy});
