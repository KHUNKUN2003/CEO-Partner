import "dotenv/config";
import { neon } from "@neondatabase/serverless";

if (!process.env.NEON_DATABASE_URL) {
  throw new Error("NEON_DATABASE_URL is required");
}

const sql = neon(process.env.NEON_DATABASE_URL);
const rows = await sql.query(`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
  order by table_name
`);

console.log(rows.map((row) => row.table_name).join(", "));
