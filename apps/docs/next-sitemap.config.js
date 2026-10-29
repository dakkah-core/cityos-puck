/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: "https://puckeditor.com",
  generateIndexSitemap: false,
  ...(process.env.PUCK_DOCS_NEXT_DIST_DIR ? { sourceDir: process.env.PUCK_DOCS_NEXT_DIST_DIR } : {}),
};
