/* Chrome-compatible Web Data database schema */

CREATE TABLE IF NOT EXISTS meta(
  key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY,
  value LONGVARCHAR
);

CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY,
  short_name VARCHAR NOT NULL,
  keyword VARCHAR NOT NULL,
  favicon_url VARCHAR NOT NULL,
  url VARCHAR NOT NULL,
  safe_for_autoreplace INTEGER,
  originating_url VARCHAR,
  date_created INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  input_encodings VARCHAR,
  suggest_url VARCHAR,
  prepopulate_id INTEGER DEFAULT 0,
  created_by_policy INTEGER DEFAULT 0,
  last_modified INTEGER DEFAULT 0,
  sync_guid VARCHAR,
  alternate_urls VARCHAR,
  image_url VARCHAR,
  search_url_post_params VARCHAR,
  suggest_url_post_params VARCHAR,
  image_url_post_params VARCHAR,
  new_tab_url VARCHAR,
  last_visited INTEGER DEFAULT 0,
  created_from_play_api INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 0,
  starter_pack_id INTEGER DEFAULT 0,
  enforced_by_policy INTEGER DEFAULT 0,
  featured_by_policy INTEGER DEFAULT 0,
  url_hash BLOB
);

CREATE INDEX IF NOT EXISTS keywords_keyword_index ON keywords(keyword);

/* Seed default search engines (matching Chrome's prepopulate_id values) */
INSERT OR IGNORE INTO keywords (id, short_name, keyword, favicon_url, url, safe_for_autoreplace, input_encodings, suggest_url, prepopulate_id, sync_guid, alternate_urls) VALUES
  (1, 'Google', 'google.com', 'https://www.google.com/images/branding/product/ico/googleg_alldp.ico', 'https://www.google.com/search?q={searchTerms}', 1, 'UTF-8', 'https://www.google.com/complete/search?client=chrome&q={searchTerms}', 1, '', '[]');

INSERT OR IGNORE INTO keywords (id, short_name, keyword, favicon_url, url, safe_for_autoreplace, input_encodings, suggest_url, prepopulate_id, sync_guid, alternate_urls) VALUES
  (2, 'Bing', 'bing.com', 'https://www.bing.com/sa/simg/bing_p_rr_teal_min.ico', 'https://www.bing.com/search?q={searchTerms}', 1, 'UTF-8', 'https://www.bing.com/osjson.aspx?query={searchTerms}', 3, '', '[]');

INSERT OR IGNORE INTO keywords (id, short_name, keyword, favicon_url, url, safe_for_autoreplace, input_encodings, suggest_url, prepopulate_id, sync_guid, alternate_urls) VALUES
  (3, 'DuckDuckGo', 'duckduckgo.com', 'https://duckduckgo.com/favicon.ico', 'https://duckduckgo.com/?q={searchTerms}', 1, 'UTF-8', 'https://duckduckgo.com/ac/?q={searchTerms}&type=list', 92, '', '[]');
