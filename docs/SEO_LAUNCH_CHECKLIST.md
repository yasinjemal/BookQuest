# BookQuest SEO launch checklist

The application already generates crawlable marketing pages, public course and creator metadata, structured data, `robots.txt`, `sitemap.xml`, and a social-sharing image. The remaining launch steps depend on the production domain and search-engine accounts.

## Before deployment

1. Set `APP_URL` to the exact canonical HTTPS origin, without a path or trailing slash. Example: `https://bookquest.example`.
2. If the production host supplies `VERCEL_PROJECT_PRODUCTION_URL`, keep `APP_URL` set when a custom public domain should be canonical.
3. Add the Google Search Console HTML-tag token as `GOOGLE_SITE_VERIFICATION`. Use only the token value, not the full `<meta>` element.
4. Publish at least three substantial public courses before expecting course-list structured data to be useful. Thin, placeholder, private, or unreviewed courses should not be published for discovery.
5. Give every public course a specific title, useful description, meaningful category, reviewed lessons, and a public creator profile where appropriate.

## Verify the deployed output

Open these production URLs and confirm they return `200`:

- `/`
- `/robots.txt`
- `/sitemap.xml`
- `/opengraph-image`
- `/solutions/pdf-to-course`
- `/explore`

View the homepage source and confirm the main heading and solution links are present in the returned HTML before JavaScript executes. Confirm `/login` and a private application route return an `X-Robots-Tag` header containing `noindex`.

## Connect search engines

1. Create or open the production property in [Google Search Console](https://search.google.com/search-console/).
2. Complete verification, then submit `https://YOUR-DOMAIN/sitemap.xml`.
3. Inspect the homepage, one solution page, one public course, and one creator page with URL Inspection.
4. Test a public course and `/explore` with the [Google Rich Results Test](https://search.google.com/test/rich-results). Structured data describes the content but does not guarantee a rich result.
5. Add the site in [Bing Webmaster Tools](https://www.bing.com/webmasters/) and submit the same sitemap.

## Measure useful discovery

Review these monthly rather than chasing raw page count:

- non-brand search impressions and clicks;
- queries reaching each solution page;
- indexed public courses and creator pages;
- landing page to registration conversion;
- registration to first-course creation conversion;
- public course preview to enrolment conversion;
- pages excluded because of `noindex`, duplicate canonicals, or low quality;
- Core Web Vitals for the homepage, solution pages, explore page, and course previews.

Publish new pages only when they answer a distinct audience problem with real product detail, examples, and a useful next step. Do not buy links, stuff repeated keywords, invent testimonials, or mass-publish generated doorway pages.

