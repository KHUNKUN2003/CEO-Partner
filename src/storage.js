import { neon } from "@neondatabase/serverless";

export function createStorage(databaseUrl) {
  return createStorageWithQuery(neon(databaseUrl));
}

export function createStorageWithQuery(sql) {
  return {
    sql,

    async saveSnapshot(snapshot) {
      const rows = await sql`
        insert into meta_snapshots (report_date, page_id, ad_account_id, payload)
        values (${snapshot.reportDate}, ${snapshot.pageId ?? snapshot.page?.id ?? ""}, ${snapshot.adAccountId ?? ""}, ${JSON.stringify(snapshot)})
        returning id
      `;
      return rows[0]?.id;
    },

    async saveReport({ reportDate, reportText, snapshotId }) {
      const rows = await sql`
        insert into ai_reports (report_date, report_text, snapshot_id)
        values (${reportDate}, ${reportText}, ${snapshotId ?? null})
        returning id
      `;
      return rows[0]?.id;
    },

    async getLatestReport() {
      const rows = await sql`
        select report_text
        from ai_reports
        order by created_at desc
        limit 1
      `;
      return rows[0]?.report_text ?? "";
    },

    async getLatestSnapshot() {
      const rows = await sql`
        select payload
        from meta_snapshots
        order by created_at desc
        limit 1
      `;
      return rows[0]?.payload ?? null;
    },

    async saveLineSource(source) {
      return saveLineSource({ sql }, source);
    },

    async getDefaultLineTarget() {
      const rows = await sql`
        select source_id
        from line_users
        order by last_seen_at desc
        limit 1
      `;
      return rows[0]?.source_id ?? "";
    }
  };
}

export async function saveLineSource(storage, { sourceId, sourceType }) {
  await storage.sql`
    insert into line_users (source_id, source_type, last_seen_at)
    values (${sourceId}, ${sourceType}, now())
    on conflict (source_id)
    do update set source_type = excluded.source_type, last_seen_at = now()
  `;
}
