import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import theme from "../theme.config";
import { FooterActions } from "../components/FooterActions";
import "nextra-theme-docs/style.css";
import "../styles.css";

const title = "Puck - The open-source visual editor for React";
const description = "Puck empowers developers to build amazing visual editing experiences into their own React applications, powering the next generation of content tools.";

export const metadata: Metadata = {
  metadataBase: new URL("https://puckeditor.com"),
  title: { default: title, template: "%s - Puck" },
  description,
  openGraph: { title, description, siteName: title, images: ["/social.png"], type: "website", locale: "en" },
  twitter: { card: "summary_large_image", site: "@puckeditor", images: ["/social.png"] },
  icons: { icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/favicon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
};

export default async function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DATA_DOMAIN && (
          <script defer data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DATA_DOMAIN} src="https://plausible.io/js/plausible.js" />
        )}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "Puck", url: "https://puckeditor.com/" }) }} />
      </Head>
      <body>
        <Layout
          pageMap={await getPageMap()}
          docsRepositoryBase={theme.docsRepositoryBase}
          navbar={<Navbar logo={theme.logo} projectLink={theme.project.link} chatLink={theme.chat.link} chatIcon={theme.chat.icon}>{theme.navbar.extraContent()}</Navbar>}
          footer={<Footer><div>{theme.footer.content}<FooterActions /></div></Footer>}
          banner={theme.banner.content ? <Banner storageKey={theme.banner.key}>{theme.banner.content}</Banner> : undefined}
          toc={{ backToTop: "Back to top" }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
