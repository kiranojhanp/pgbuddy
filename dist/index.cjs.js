"use strict";var m=Object.defineProperty;var b=Object.getOwnPropertyDescriptor;var d=Object.getOwnPropertyNames;var f=Object.prototype.hasOwnProperty;var $=(n,t)=>{for(var a in t)m(n,a,{get:t[a],enumerable:!0})},w=(n,t,a,e)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of d(t))!f.call(n,r)&&r!==a&&m(n,r,{get:()=>t[r],enumerable:!(e=b(t,r))||e.enumerable});return n};var E=n=>w(m({},"__esModule",{value:!0}),n);var u=(n,t,a)=>new Promise((e,r)=>{var o=s=>{try{l(a.next(s))}catch(c){r(c)}},y=s=>{try{l(a.throw(s))}catch(c){r(c)}},l=s=>s.done?e(s.value):Promise.resolve(s.value).then(o,y);l((a=a.apply(n,t)).next())});var I={};$(I,{PgBuddy:()=>h});module.exports=E(I);var h=class{constructor(t){this.sql=t}input(t){return u(this,null,function*(){let{table:a,data:e,returning:r=["*"],debug:o=!1}=t;if(!a||typeof a!="string"||!a.trim())throw new Error("Invalid or empty table name");if(!e||Array.isArray(e)&&e.length===0)throw new Error("Invalid data to insert");let y=Array.isArray(e)?Object.keys(e[0]):Object.keys(e),l=this.sql`
      INSERT INTO ${this.sql(a)} 
      ${this.sql(e,y)}
      RETURNING ${r.length===1&&r[0]==="*"?this.sql`*`:this.sql(r)}
    `;return o&&(yield l.describe()),yield l})}select(t){return u(this,null,function*(){let{debug:a=!1,table:e,columns:r=["*"],orderBy:o,page:y=1,pageSize:l=10,search:s}=t;if(!e||typeof e!="string"||!e.trim())throw new Error("Invalid or empty table name");if(!Array.isArray(r)||r.some(i=>!i||typeof i!="string"||!i.trim()))throw new Error("Invalid or empty column names");if(s&&(!Array.isArray(s.columns)||s.columns.some(i=>!i||typeof i!="string"||!i.trim())||!s.query))throw new Error("Invalid search parameters");let c=(y-1)*l,q=this.sql`
    SELECT ${r.length===1&&r[0]==="*"?this.sql`*`:this.sql(r)}
    FROM ${this.sql(e)}
    ${s&&s.query&&s.columns&&Array.isArray(s.columns)?this.sql`
            WHERE ${s.columns.map(i=>this.sql`${this.sql(i)} ILIKE ${"%"+s.query+"%"}`).reduce((i,g,p)=>p===0?g:this.sql`${i} OR ${g}`)}
          `:this.sql``}
    ${o?this.sql`ORDER BY ${this.sql`${o}`}`:this.sql``}
    LIMIT ${l} OFFSET ${c}
  `;return a&&(yield q.describe()),yield q})}};0&&(module.exports={PgBuddy});
