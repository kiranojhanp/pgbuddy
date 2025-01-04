var h=(q,l,t)=>new Promise((i,e)=>{var o=s=>{try{a(t.next(s))}catch(n){e(n)}},m=s=>{try{a(t.throw(s))}catch(n){e(n)}},a=s=>s.done?i(s.value):Promise.resolve(s.value).then(o,m);a((t=t.apply(q,l)).next())});var y=class{constructor(l){this.sql=l}select(l){return h(this,null,function*(){let{debug:t=!1,table:i,columns:e=["*"],orderBy:o,page:m=1,pageSize:a=10,search:s}=l;if(!i||typeof i!="string"||!i.trim())throw new Error("Invalid or empty table name");if(!Array.isArray(e)||e.some(r=>!r||typeof r!="string"||!r.trim()))throw new Error("Invalid or empty column names");if(s&&(!Array.isArray(s.columns)||s.columns.some(r=>!r||typeof r!="string"||!r.trim())||!s.query))throw new Error("Invalid search parameters");let n=(m-1)*a,u=this.sql`
    SELECT ${e.length===1&&e[0]==="*"?this.sql`*`:this.sql(e)}
    FROM ${this.sql(i)}
    ${s&&s.query&&s.columns&&Array.isArray(s.columns)?this.sql`
            WHERE ${s.columns.map(r=>this.sql`${this.sql(r)} ILIKE ${"%"+s.query+"%"}`).reduce((r,c,p)=>p===0?c:this.sql`${r} OR ${c}`)}
          `:this.sql``}
    ${o?this.sql`ORDER BY ${this.sql`${o}`}`:this.sql``}
    LIMIT ${a} OFFSET ${n}
  `;return t&&(yield u.describe()),yield u})}};export{y as PgBuddy};
