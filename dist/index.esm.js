var q=(y,a,s)=>new Promise((t,r)=>{var n=e=>{try{i(s.next(e))}catch(o){r(o)}},c=e=>{try{i(s.throw(e))}catch(o){r(o)}},i=e=>e.done?t(e.value):Promise.resolve(e.value).then(n,c);i((s=s.apply(y,a)).next())});var m=class{constructor(a){this.sql=a}insert(a){return q(this,null,function*(){let{table:s,data:t,returning:r=["*"],debug:n=!1}=a;if(!s||typeof s!="string"||!s.trim())throw new Error("Invalid or empty table name");if(!t||Array.isArray(t)&&t.length===0)throw new Error("Invalid data to insert");let c=Array.isArray(t)?Object.keys(t[0]):Object.keys(t),i=this.sql`
      INSERT INTO ${this.sql(s)} 
      ${this.sql(t,c)}
      RETURNING ${r.length===1&&r[0]==="*"?this.sql`*`:this.sql(r)}
    `;return n&&(yield i.describe()),yield i})}update(a){return q(this,null,function*(){let{table:s,data:t,conditions:r,returning:n=["*"],debug:c=!1}=a;if(!s||typeof s!="string"||!s.trim())throw new Error("Invalid or empty table name");if(!t||typeof t!="object"||Object.keys(t).length===0)throw new Error("Invalid or empty data to insert");if(!r||typeof r!="object"||Object.keys(r).length===0)throw new Error("Conditions are required for updates to prevent accidental table-wide updates");let i=this.sql`
        UPDATE ${this.sql(s)}
        SET ${this.sql(t,Object.keys(t))}
        WHERE ${Object.entries(r).reduce((e,[o,h],u)=>u===0?this.sql`${this.sql(o)} = ${h}`:this.sql`${e} AND ${this.sql(o)} = ${h}`,this.sql``)}
        RETURNING ${n.length===1&&n[0]==="*"?this.sql`*`:this.sql(n)}
    `;return c&&(yield i.describe()),yield i})}delete(a){return q(this,null,function*(){let{table:s,conditions:t,returning:r=["*"],debug:n=!1}=a;if(!s||typeof s!="string"||!s.trim())throw new Error("Invalid table name.");if(!t||typeof t!="object"||Object.keys(t).length===0)throw new Error("No conditions provided for the DELETE operation.");let c=this.sql`
      DELETE FROM ${this.sql(s)}
      WHERE ${Object.entries(t).reduce((i,[e,o],h)=>h===0?this.sql`${this.sql(e)} = ${o}`:this.sql`${i} AND ${this.sql(e)} = ${o}`,this.sql``)}
      RETURNING ${r.length===0||r.includes("*")?this.sql`*`:this.sql(r)}
    `;return n&&(yield c.describe()),yield c})}select(a){return q(this,null,function*(){let{debug:s=!1,table:t,columns:r=["*"],orderBy:n,page:c=1,pageSize:i=10,search:e}=a;if(!t||typeof t!="string"||!t.trim())throw new Error("Invalid or empty table name");if(!Array.isArray(r)||r.some(l=>!l||typeof l!="string"||!l.trim()))throw new Error("Invalid or empty column names");if(e&&(!Array.isArray(e.columns)||e.columns.some(l=>!l||typeof l!="string"||!l.trim())||!e.query))throw new Error("Invalid search parameters");let o=(c-1)*i,h=this.sql`
    SELECT ${r.length===1&&r[0]==="*"?this.sql`*`:this.sql(r)}
    FROM ${this.sql(t)}
    ${e&&e.query&&e.columns&&Array.isArray(e.columns)?this.sql`
            WHERE ${e.columns.map(l=>this.sql`${this.sql(l)} ILIKE ${"%"+e.query+"%"}`).reduce((l,d,g)=>g===0?d:this.sql`${l} OR ${d}`)}
          `:this.sql``}
    ${n?this.sql`ORDER BY ${this.sql`${n}`}`:this.sql``}
    LIMIT ${i} OFFSET ${o}
  `;return s&&(yield h.describe()),yield h})}};export{m as PgBuddy};
