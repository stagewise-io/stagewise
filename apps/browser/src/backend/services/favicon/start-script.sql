/* Chrome-compatible Favicons database schema */

CREATE TABLE IF NOT EXISTS meta(
    key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY,
    value LONGVARCHAR
);

CREATE TABLE IF NOT EXISTS favicons(
    id INTEGER PRIMARY KEY,
    url LONGVARCHAR NOT NULL,
    icon_type INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS favicon_bitmaps(
    id INTEGER PRIMARY KEY,
    icon_id INTEGER NOT NULL,
    last_updated INTEGER DEFAULT 0,
    image_data BLOB,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    last_requested INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS icon_mapping(
    id INTEGER PRIMARY KEY,
    page_url LONGVARCHAR NOT NULL,
    icon_id INTEGER,
    page_url_type INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS favicons_url ON favicons(url);
CREATE INDEX IF NOT EXISTS favicon_bitmaps_icon_id ON favicon_bitmaps(icon_id);
CREATE INDEX IF NOT EXISTS icon_mapping_page_url_idx ON icon_mapping(page_url);
CREATE INDEX IF NOT EXISTS icon_mapping_icon_id_idx ON icon_mapping(icon_id);
