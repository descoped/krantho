/**
 * What a CDN may keep of a response that is the same for every visitor and changes only
 * when content is published — the sitemap, robots.txt and llms.txt. An hour fresh, then a
 * day served stale while one request renews it, so crawlers never wait and the database is
 * read once an hour at most, not once per crawl.
 */
export const PUBLIC_MACHINE_READ_CACHE_CONTROL =
  'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
