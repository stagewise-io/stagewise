/* Manually managed SQL Script for schema creation since drizzle doesn't offer this. We should simply extend this file step by step with migration steps. */

-- Core History Tables
CREATE TABLE IF NOT EXISTS meta(key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY, value LONGVARCHAR);

CREATE TABLE IF NOT EXISTS urls(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url LONGVARCHAR,
    title LONGVARCHAR,
    visit_count INTEGER DEFAULT 0 NOT NULL,
    typed_count INTEGER DEFAULT 0 NOT NULL,
    last_visit_time INTEGER NOT NULL,
    hidden INTEGER DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS visits(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url INTEGER NOT NULL,
    visit_time INTEGER NOT NULL,
    from_visit INTEGER,
    external_referrer_url TEXT,
    transition INTEGER DEFAULT 0 NOT NULL,
    segment_id INTEGER,
    visit_duration INTEGER DEFAULT 0 NOT NULL,
    incremented_omnibox_typed_score BOOLEAN DEFAULT FALSE NOT NULL,
    opener_visit INTEGER,
    originator_cache_guid TEXT,
    originator_visit_id INTEGER,
    originator_from_visit INTEGER,
    originator_opener_visit INTEGER,
    is_known_to_sync BOOLEAN DEFAULT FALSE NOT NULL,
    consider_for_ntp_most_visited BOOLEAN DEFAULT FALSE NOT NULL,
    visited_link_id INTEGER DEFAULT 0 NOT NULL,
    app_id TEXT
);

CREATE TABLE IF NOT EXISTS visit_source(id INTEGER PRIMARY KEY, source INTEGER NOT NULL);

-- Indexes for Core Tables
CREATE INDEX IF NOT EXISTS urls_url_index ON urls (url);
CREATE INDEX IF NOT EXISTS visits_url_index ON visits (url);
CREATE INDEX IF NOT EXISTS visits_from_index ON visits (from_visit);
CREATE INDEX IF NOT EXISTS visits_time_index ON visits (visit_time);
CREATE INDEX IF NOT EXISTS visits_originator_id_index ON visits (originator_visit_id);

-- Search & Keywords
CREATE TABLE IF NOT EXISTS keyword_search_terms (
    keyword_id INTEGER NOT NULL,
    url_id INTEGER NOT NULL,
    term LONGVARCHAR NOT NULL,
    normalized_term LONGVARCHAR NOT NULL
);

CREATE INDEX IF NOT EXISTS keyword_search_terms_index1 ON keyword_search_terms (keyword_id, normalized_term);
CREATE INDEX IF NOT EXISTS keyword_search_terms_index2 ON keyword_search_terms (url_id);
CREATE INDEX IF NOT EXISTS keyword_search_terms_index3 ON keyword_search_terms (term);

-- Downloads
CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY,
    guid VARCHAR NOT NULL,
    current_path LONGVARCHAR NOT NULL,
    target_path LONGVARCHAR NOT NULL,
    start_time INTEGER NOT NULL,
    received_bytes INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL,
    state INTEGER NOT NULL,
    danger_type INTEGER NOT NULL,
    interrupt_reason INTEGER NOT NULL,
    hash BLOB NOT NULL,
    end_time INTEGER NOT NULL,
    opened INTEGER NOT NULL,
    last_access_time INTEGER NOT NULL,
    transient INTEGER NOT NULL,
    referrer VARCHAR NOT NULL,
    site_url VARCHAR NOT NULL,
    embedder_download_data VARCHAR NOT NULL,
    tab_url VARCHAR NOT NULL,
    tab_referrer_url VARCHAR NOT NULL,
    http_method VARCHAR NOT NULL,
    by_ext_id VARCHAR NOT NULL,
    by_ext_name VARCHAR NOT NULL,
    by_web_app_id VARCHAR NOT NULL,
    etag VARCHAR NOT NULL,
    last_modified VARCHAR NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    original_mime_type VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS downloads_url_chains (
    id INTEGER NOT NULL,
    chain_index INTEGER NOT NULL,
    url LONGVARCHAR NOT NULL, 
    PRIMARY KEY (id, chain_index) 
);

CREATE TABLE IF NOT EXISTS downloads_slices (
    download_id INTEGER NOT NULL,
    offset INTEGER NOT NULL,
    received_bytes INTEGER NOT NULL,
    finished INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (download_id, offset) 
);

-- Segments
CREATE TABLE IF NOT EXISTS segments (id INTEGER PRIMARY KEY, name VARCHAR, url_id INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS segments_name ON segments(name);
CREATE INDEX IF NOT EXISTS segments_url_id ON segments(url_id);

CREATE TABLE IF NOT EXISTS segment_usage (
    id INTEGER PRIMARY KEY,
    segment_id INTEGER NOT NULL,
    time_slot INTEGER NOT NULL,
    visit_count INTEGER DEFAULT 0 NOT NULL
);
CREATE INDEX IF NOT EXISTS segment_usage_time_slot_segment_id ON segment_usage(time_slot, segment_id);
CREATE INDEX IF NOT EXISTS segments_usage_seg_id ON segment_usage(segment_id);

-- Annotations & Clusters
CREATE TABLE IF NOT EXISTS content_annotations(
    visit_id INTEGER PRIMARY KEY,
    visibility_score NUMERIC,
    floc_protected_score NUMERIC,
    categories VARCHAR,
    page_topics_model_version INTEGER,
    annotation_flags INTEGER NOT NULL,
    entities VARCHAR,
    related_searches VARCHAR,
    search_normalized_url VARCHAR,
    search_terms LONGVARCHAR,
    alternative_title VARCHAR,
    page_language VARCHAR,
    password_state INTEGER DEFAULT 0 NOT NULL,
    has_url_keyed_image BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS context_annotations(
    visit_id INTEGER PRIMARY KEY,
    context_annotation_flags INTEGER NOT NULL,
    duration_since_last_visit INTEGER,
    page_end_reason INTEGER,
    total_foreground_duration INTEGER,
    browser_type INTEGER DEFAULT 0 NOT NULL,
    window_id INTEGER DEFAULT -1 NOT NULL,
    tab_id INTEGER DEFAULT -1 NOT NULL,
    task_id INTEGER DEFAULT -1 NOT NULL,
    root_task_id INTEGER DEFAULT -1 NOT NULL,
    parent_task_id INTEGER DEFAULT -1 NOT NULL,
    response_code INTEGER DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS clusters(
    cluster_id INTEGER PRIMARY KEY AUTOINCREMENT,
    should_show_on_prominent_ui_surfaces BOOLEAN NOT NULL,
    label VARCHAR NOT NULL,
    raw_label VARCHAR NOT NULL,
    triggerability_calculated BOOLEAN NOT NULL,
    originator_cache_guid TEXT NOT NULL,
    originator_cluster_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clusters_and_visits(
    cluster_id INTEGER NOT NULL,
    visit_id INTEGER NOT NULL,
    score NUMERIC DEFAULT 0 NOT NULL,
    engagement_score NUMERIC DEFAULT 0 NOT NULL,
    url_for_deduping LONGVARCHAR NOT NULL,
    normalized_url LONGVARCHAR NOT NULL,
    url_for_display LONGVARCHAR NOT NULL,
    interaction_state INTEGER DEFAULT 0 NOT NULL,
    PRIMARY KEY(cluster_id,visit_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS clusters_for_visit ON clusters_and_visits(visit_id);

CREATE TABLE IF NOT EXISTS cluster_keywords(
    cluster_id INTEGER NOT NULL,
    keyword VARCHAR NOT NULL,
    type INTEGER NOT NULL,
    score NUMERIC NOT NULL,
    collections VARCHAR NOT NULL
);
CREATE INDEX IF NOT EXISTS cluster_keywords_cluster_id_index ON cluster_keywords(cluster_id);

CREATE TABLE IF NOT EXISTS cluster_visit_duplicates(
    visit_id INTEGER NOT NULL,
    duplicate_visit_id INTEGER NOT NULL,
    PRIMARY KEY(visit_id,duplicate_visit_id)
) WITHOUT ROWID;

-- Visited Links & Sync Meta
CREATE TABLE IF NOT EXISTS visited_links(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_url_id INTEGER NOT NULL,
    top_level_url LONGVARCHAR NOT NULL,
    frame_url LONGVARCHAR NOT NULL,
    visit_count INTEGER DEFAULT 0 NOT NULL
);
CREATE INDEX IF NOT EXISTS visited_links_index ON visited_links (link_url_id, top_level_url, frame_url);

CREATE TABLE IF NOT EXISTS history_sync_metadata (storage_key INTEGER PRIMARY KEY NOT NULL, value BLOB);