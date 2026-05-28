import { sql } from 'drizzle-orm';
import type { MigrationScript } from '../../../utils/migrate-database/types';

export const up: MigrationScript['up'] = async (db) => {
  await db.run(sql`
    INSERT OR IGNORE INTO keywords (
      id,
      short_name,
      keyword,
      favicon_url,
      url,
      safe_for_autoreplace,
      input_encodings,
      suggest_url,
      prepopulate_id,
      sync_guid,
      alternate_urls
    )
    SELECT
      1,
      'Google',
      'google.com',
      'https://www.google.com/images/branding/product/ico/googleg_alldp.ico',
      'https://www.google.com/search?q={searchTerms}',
      1,
      'UTF-8',
      'https://www.google.com/complete/search?client=chrome&q={searchTerms}',
      1,
      '',
      '[]'
    WHERE NOT EXISTS (
      SELECT 1 FROM keywords WHERE keyword = 'google.com' OR prepopulate_id = 1
    )
  `);

  await db.run(sql`
    INSERT OR IGNORE INTO keywords (
      id,
      short_name,
      keyword,
      favicon_url,
      url,
      safe_for_autoreplace,
      input_encodings,
      suggest_url,
      prepopulate_id,
      sync_guid,
      alternate_urls
    )
    SELECT
      2,
      'Bing',
      'bing.com',
      'https://www.bing.com/sa/simg/bing_p_rr_teal_min.ico',
      'https://www.bing.com/search?q={searchTerms}',
      1,
      'UTF-8',
      'https://www.bing.com/osjson.aspx?query={searchTerms}',
      3,
      '',
      '[]'
    WHERE NOT EXISTS (
      SELECT 1 FROM keywords WHERE keyword = 'bing.com' OR prepopulate_id = 3
    )
  `);

  await db.run(sql`
    INSERT OR IGNORE INTO keywords (
      id,
      short_name,
      keyword,
      favicon_url,
      url,
      safe_for_autoreplace,
      input_encodings,
      suggest_url,
      prepopulate_id,
      sync_guid,
      alternate_urls
    )
    SELECT
      3,
      'DuckDuckGo',
      'duckduckgo.com',
      'https://duckduckgo.com/favicon.ico',
      'https://duckduckgo.com/?q={searchTerms}',
      1,
      'UTF-8',
      'https://duckduckgo.com/ac/?q={searchTerms}&type=list',
      92,
      '',
      '[]'
    WHERE NOT EXISTS (
      SELECT 1
      FROM keywords
      WHERE keyword = 'duckduckgo.com' OR prepopulate_id = 92
    )
  `);
};
