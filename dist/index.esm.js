var c=(m,n,e)=>new Promise((s,t)=>{var l=r=>{try{i(e.next(r))}catch(y){t(y)}},o=r=>{try{i(e.throw(r))}catch(y){t(y)}},i=r=>r.done?s(r.value):Promise.resolve(r.value).then(l,o);i((e=e.apply(m,n)).next())});var q=class{constructor(n){this.sql=n}input(n){return c(this,null,function*(){let{table:e,data:s,returning:t=["*"],debug:l=!1}=n;if(!e||typeof e!="string"||!e.trim())throw new Error("Invalid or empty table name");if(!s||Array.isArray(s)&&s.length===0)throw new Error("Invalid data to insert");let o=Array.isArray(s)?Object.keys(s[0]):Object.keys(s),i=this.sql`
      INSERT INTO ${this.sql(e)} 
      ${this.sql(s,o)}
      RETURNING ${t.length===1&&t[0]==="*"?this.sql`*`:this.sql(t)}
    `;return l&&(yield i.describe()),yield i})}select(n){return c(this,null,function*(){let{debug:e=!1,table:s,columns:t=["*"],orderBy:l,page:o=1,pageSize:i=10,search:r}=n;if(!s||typeof s!="string"||!s.trim())throw new Error("Invalid or empty table name");if(!Array.isArray(t)||t.some(a=>!a||typeof a!="string"||!a.trim()))throw new Error("Invalid or empty column names");if(r&&(!Array.isArray(r.columns)||r.columns.some(a=>!a||typeof a!="string"||!a.trim())||!r.query))throw new Error("Invalid search parameters");let y=(o-1)*i,u=this.sql`
    SELECT ${t.length===1&&t[0]==="*"?this.sql`*`:this.sql(t)}
    FROM ${this.sql(s)}
    ${r&&r.query&&r.columns&&Array.isArray(r.columns)?this.sql`
            WHERE ${r.columns.map(a=>this.sql`${this.sql(a)} ILIKE ${"%"+r.query+"%"}`).reduce((a,h,g)=>g===0?h:this.sql`${a} OR ${h}`)}
          `:this.sql``}
    ${l?this.sql`ORDER BY ${this.sql`${l}`}`:this.sql``}
    LIMIT ${i} OFFSET ${y}
  `;return e&&(yield u.describe()),yield u})}};export{q as PgBuddy};
