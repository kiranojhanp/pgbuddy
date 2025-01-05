var y=(u,l,s)=>new Promise((t,e)=>{var n=r=>{try{i(s.next(r))}catch(o){e(o)}},c=r=>{try{i(s.throw(r))}catch(o){e(o)}},i=r=>r.done?t(r.value):Promise.resolve(r.value).then(n,c);i((s=s.apply(u,l)).next())});var d=class{constructor(l){this.sql=l}input(l){return y(this,null,function*(){let{table:s,data:t,returning:e=["*"],debug:n=!1}=l;if(!s||typeof s!="string"||!s.trim())throw new Error("Invalid or empty table name");if(!t||Array.isArray(t)&&t.length===0)throw new Error("Invalid data to insert");let c=Array.isArray(t)?Object.keys(t[0]):Object.keys(t),i=this.sql`
      INSERT INTO ${this.sql(s)} 
      ${this.sql(t,c)}
      RETURNING ${e.length===1&&e[0]==="*"?this.sql`*`:this.sql(e)}
    `;return n&&(yield i.describe()),yield i})}update(l){return y(this,null,function*(){let{table:s,data:t,conditions:e,returning:n=["*"],debug:c=!1}=l;if(!s||typeof s!="string"||!s.trim())throw new Error("Invalid or empty table name");if(!t||typeof t!="object"||Object.keys(t).length===0)throw new Error("Invalid or empty data to insert");if(!e||typeof e!="object"||Object.keys(e).length===0)throw new Error("Conditions are required for updates to prevent accidental table-wide updates");let i=this.sql`
        UPDATE ${this.sql(s)}
        SET ${this.sql(t,Object.keys(t))}
        WHERE ${Object.entries(e).reduce((r,[o,h],q)=>q===0?this.sql`${this.sql(o)} = ${h}`:this.sql`${r} AND ${this.sql(o)} = ${h}`,this.sql``)}
        RETURNING ${n.length===1&&n[0]==="*"?this.sql`*`:this.sql(n)}
    `;return c&&(yield i.describe()),yield i})}select(l){return y(this,null,function*(){let{debug:s=!1,table:t,columns:e=["*"],orderBy:n,page:c=1,pageSize:i=10,search:r}=l;if(!t||typeof t!="string"||!t.trim())throw new Error("Invalid or empty table name");if(!Array.isArray(e)||e.some(a=>!a||typeof a!="string"||!a.trim()))throw new Error("Invalid or empty column names");if(r&&(!Array.isArray(r.columns)||r.columns.some(a=>!a||typeof a!="string"||!a.trim())||!r.query))throw new Error("Invalid search parameters");let o=(c-1)*i,h=this.sql`
    SELECT ${e.length===1&&e[0]==="*"?this.sql`*`:this.sql(e)}
    FROM ${this.sql(t)}
    ${r&&r.query&&r.columns&&Array.isArray(r.columns)?this.sql`
            WHERE ${r.columns.map(a=>this.sql`${this.sql(a)} ILIKE ${"%"+r.query+"%"}`).reduce((a,m,g)=>g===0?m:this.sql`${a} OR ${m}`)}
          `:this.sql``}
    ${n?this.sql`ORDER BY ${this.sql`${n}`}`:this.sql``}
    LIMIT ${i} OFFSET ${o}
  `;return s&&(yield h.describe()),yield h})}};export{d as PgBuddy};
